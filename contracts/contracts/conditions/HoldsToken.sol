// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ICondition} from "./ICondition.sol";

/// @title HoldsToken — the box opens only for a holder.
/// @notice args = abi.encode(address token, uint256 minBalance). Satisfied when
/// `token.balanceOf(recipient) >= minBalance`. `balanceOf(address)` is the
/// same selector on ERC-20 and ERC-721, so "holds at least one of this NFT"
/// works too. Stateless: one instance serves every box on the chain.
contract HoldsToken is ICondition {
    function validate(bytes calldata args) external view returns (bool) {
        if (args.length != 64) return false;
        (address token, uint256 minBalance) = abi.decode(args, (address, uint256));
        if (minBalance == 0 || token.code.length == 0) return false;
        // The token must answer balanceOf at all, or no box could ever open.
        (bool ok, bytes memory data) = token.staticcall(abi.encodeWithSignature("balanceOf(address)", address(this)));
        return ok && data.length >= 32;
    }

    function check(uint256, address recipient, bytes calldata args, bytes calldata) external view returns (bool) {
        (address token, uint256 minBalance) = abi.decode(args, (address, uint256));
        (bool ok, bytes memory data) = token.staticcall(abi.encodeWithSignature("balanceOf(address)", recipient));
        if (!ok || data.length < 32) return false;
        return abi.decode(data, (uint256)) >= minBalance;
    }
}
