// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ICondition} from "./ICondition.sol";

/// @title Cosign — the box opens only once a named third party has released it.
/// @notice args = abi.encode(address cosigner). The cosigner calls `release(boxId)`
/// from their own wallet — an on-chain, visible "go" — and the claim can go
/// through from then on. An escrow without an escrow agent holding anything:
/// the cosigner can only say yes, never take the tokens.
///
/// Bound to one Droplock: releases are keyed by box id, and box ids are only
/// meaningful inside the Droplock that asked. `check` refuses any other caller.
contract Cosign is ICondition {
    address public immutable droplock;

    /// @notice released[boxId][cosigner]
    mapping(uint256 => mapping(address => bool)) public released;

    event Released(uint256 indexed boxId, address indexed cosigner);

    error NotDroplock();

    constructor(address droplock_) {
        droplock = droplock_;
    }

    /// @notice Say yes for box `boxId`. Only counts if the box named msg.sender as its cosigner.
    function release(uint256 boxId) external {
        released[boxId][msg.sender] = true;
        emit Released(boxId, msg.sender);
    }

    function validate(bytes calldata args) external pure returns (bool) {
        if (args.length != 32) return false;
        return abi.decode(args, (address)) != address(0);
    }

    function check(uint256 boxId, address, bytes calldata args, bytes calldata) external view returns (bool) {
        if (msg.sender != droplock) revert NotDroplock();
        address cosigner = abi.decode(args, (address));
        return released[boxId][cosigner];
    }
}
