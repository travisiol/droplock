// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ICondition} from "./conditions/ICondition.sol";

/// @title Droplock — a dead drop for tokens.
///
/// @notice A sender locks ETH or an ERC-20 in a box and shares a link. The
/// box is not addressed to a wallet: it is opened by whoever can produce a
/// signature from the box's claim key — a throwaway key the sender's browser
/// derived from the link's secret and an optional code, and never sent to
/// anyone. The chain sees the key's *address* and, later, one signature; it
/// never sees the secret or the code.
///
/// Each box may also carry a date (nothing opens before `unlockAt`), an
/// expiry (the claim window closes at `expiresAt`, and from then the sender
/// may take the tokens back) and a condition (an `ICondition` contract the
/// claim must satisfy — "the recipient holds token X", "a cosigner released
/// it"…). The three locks combine.
///
/// The claim signature binds the recipient, so a transaction seen in the
/// mempool cannot be replayed to a different address. The transaction may be
/// sent by anyone — the recipient, or a relayer paying gas for them.
///
/// No owner, no fee, no upgrade path: what is dropped can only go to the
/// signature holder or back to the sender.
contract Droplock is EIP712, ReentrancyGuard {
    using SafeERC20 for IERC20;

    /// @dev The life of a box as the front end shows it.
    enum State {
        Locked, // sealed, before unlockAt
        Open, // sealed, claimable now
        Claimed,
        Expired, // sealed, claim window closed — the sender may reclaim
        Reclaimed
    }

    struct Box {
        address sender;
        address token; // address(0) = native ETH
        uint256 amount;
        address key; // address whose signature opens the box
        uint64 unlockAt; // claimable from this time (0 = immediately)
        uint64 expiresAt; // claim window closes, sender may reclaim from then (0 = never)
        uint64 createdAt;
        uint8 status; // 0 sealed, 1 claimed, 2 reclaimed
        address condition; // ICondition, or address(0)
        bytes conditionArgs; // what the condition needs (abi-encoded, condition-specific)
    }

    bytes32 public constant CLAIM_TYPEHASH = keccak256("Claim(uint256 boxId,address recipient)");

    uint8 private constant SEALED = 0;
    uint8 private constant CLAIMED = 1;
    uint8 private constant RECLAIMED = 2;

    /// @notice Number of boxes ever dropped; box ids run from 0 to count - 1.
    uint256 public count;

    mapping(uint256 => Box) private _boxes;
    mapping(address => uint256[]) private _boxesOf;

    event Dropped(
        uint256 indexed id,
        address indexed sender,
        address indexed token,
        uint256 amount,
        address key,
        uint64 unlockAt,
        uint64 expiresAt,
        address condition
    );
    event Claimed(uint256 indexed id, address indexed recipient, address indexed caller);
    event Reclaimed(uint256 indexed id, address indexed sender);

    error ZeroAmount();
    error ZeroKey();
    error ZeroRecipient();
    error BadWindow();
    error BadValue();
    error NoSuchBox();
    error NotSealed();
    error NotYet();
    error WindowClosed();
    error NotExpired();
    error NotSender();
    error BadSignature();
    error BadCondition();
    error ConditionFailed();
    error NativeSendFailed();

    constructor() EIP712("DROPLOCK", "1") {}

    // ───────────────────────────── drop ─────────────────────────────

    /// @notice Lock `amount` of `token` (address(0) for ETH, sent as msg.value)
    /// behind `key`, and optionally a date, an expiry and a condition.
    /// @param key The address derived from the link secret (+ code). Never the sender's own wallet.
    /// @param unlockAt Unix time the box opens, or 0 for now.
    /// @param expiresAt Unix time the claim window closes, or 0 for never. Must be after `unlockAt`.
    /// @param condition An ICondition contract, or address(0).
    /// @param conditionArgs Passed to the condition; ignored when there is none.
    /// @return id The box id — the link is built from it.
    function drop(
        address token,
        uint256 amount,
        address key,
        uint64 unlockAt,
        uint64 expiresAt,
        address condition,
        bytes calldata conditionArgs
    ) external payable nonReentrant returns (uint256 id) {
        if (key == address(0)) revert ZeroKey();
        if (expiresAt != 0 && (expiresAt <= block.timestamp || expiresAt <= unlockAt)) revert BadWindow();

        uint256 received;
        if (token == address(0)) {
            if (msg.value == 0 || amount != msg.value) revert BadValue();
            received = msg.value;
        } else {
            if (msg.value != 0) revert BadValue();
            if (amount == 0) revert ZeroAmount();
            // Fee-on-transfer tokens: the box holds what actually arrived.
            uint256 before = IERC20(token).balanceOf(address(this));
            IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
            received = IERC20(token).balanceOf(address(this)) - before;
            if (received == 0) revert ZeroAmount();
        }

        if (condition != address(0)) {
            if (condition.code.length == 0 || !ICondition(condition).validate(conditionArgs)) revert BadCondition();
        }

        id = count++;
        Box storage box = _boxes[id];
        box.sender = msg.sender;
        box.token = token;
        box.amount = received;
        box.key = key;
        box.unlockAt = unlockAt;
        box.expiresAt = expiresAt;
        box.createdAt = uint64(block.timestamp);
        box.condition = condition;
        if (condition != address(0)) box.conditionArgs = conditionArgs;
        _boxesOf[msg.sender].push(id);

        emit Dropped(id, msg.sender, token, received, key, unlockAt, expiresAt, condition);
    }

    // ───────────────────────────── claim ─────────────────────────────

    /// @notice Open box `id` and send its contents to `recipient`.
    /// @param signature The claim key's EIP-712 signature over Claim(boxId, recipient).
    /// @param proof Forwarded to the box's condition, if any.
    function claim(uint256 id, address recipient, bytes calldata signature, bytes calldata proof) external nonReentrant {
        if (recipient == address(0)) revert ZeroRecipient();
        Box storage box = _box(id);
        if (box.status != SEALED) revert NotSealed();
        if (block.timestamp < box.unlockAt) revert NotYet();
        if (box.expiresAt != 0 && block.timestamp >= box.expiresAt) revert WindowClosed();

        (address signer, ECDSA.RecoverError err, ) = ECDSA.tryRecover(claimDigest(id, recipient), signature);
        if (err != ECDSA.RecoverError.NoError || signer != box.key) revert BadSignature();

        if (box.condition != address(0)) {
            if (!ICondition(box.condition).check(id, recipient, box.conditionArgs, proof)) revert ConditionFailed();
        }

        box.status = CLAIMED;
        _send(box.token, recipient, box.amount);
        emit Claimed(id, recipient, msg.sender);
    }

    /// @notice After the claim window has closed, the sender takes the contents back.
    function reclaim(uint256 id) external nonReentrant {
        Box storage box = _box(id);
        if (msg.sender != box.sender) revert NotSender();
        if (box.status != SEALED) revert NotSealed();
        if (box.expiresAt == 0 || block.timestamp < box.expiresAt) revert NotExpired();

        box.status = RECLAIMED;
        _send(box.token, box.sender, box.amount);
        emit Reclaimed(id, box.sender);
    }

    // ───────────────────────────── views ─────────────────────────────

    function getBox(uint256 id) external view returns (Box memory) {
        return _box(id);
    }

    /// @notice Ids of every box `sender` has dropped, oldest first.
    function boxesOf(address sender) external view returns (uint256[] memory) {
        return _boxesOf[sender];
    }

    function stateOf(uint256 id) external view returns (State) {
        Box storage box = _box(id);
        if (box.status == CLAIMED) return State.Claimed;
        if (box.status == RECLAIMED) return State.Reclaimed;
        if (box.expiresAt != 0 && block.timestamp >= box.expiresAt) return State.Expired;
        if (block.timestamp < box.unlockAt) return State.Locked;
        return State.Open;
    }

    /// @notice What the claim key must sign for box `id` to open towards `recipient`.
    function claimDigest(uint256 id, address recipient) public view returns (bytes32) {
        return _hashTypedDataV4(keccak256(abi.encode(CLAIM_TYPEHASH, id, recipient)));
    }

    /// @notice Whether `signature` is the claim key's signature for (id, recipient). Off-chain preflight.
    function isClaimSignature(uint256 id, address recipient, bytes calldata signature) external view returns (bool) {
        (address signer, ECDSA.RecoverError err, ) = ECDSA.tryRecover(claimDigest(id, recipient), signature);
        return err == ECDSA.RecoverError.NoError && signer == _box(id).key;
    }

    /// @notice Whether the box's condition (if any) currently holds for `recipient`.
    function conditionMet(uint256 id, address recipient, bytes calldata proof) external view returns (bool) {
        Box storage box = _box(id);
        if (box.condition == address(0)) return true;
        return ICondition(box.condition).check(id, recipient, box.conditionArgs, proof);
    }

    // ───────────────────────────── internals ─────────────────────────────

    function _box(uint256 id) private view returns (Box storage box) {
        if (id >= count) revert NoSuchBox();
        box = _boxes[id];
    }

    function _send(address token, address to, uint256 amount) private {
        if (token == address(0)) {
            (bool ok, ) = to.call{value: amount}("");
            if (!ok) revert NativeSendFailed();
        } else {
            IERC20(token).safeTransfer(to, amount);
        }
    }
}
