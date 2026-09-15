// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @title ICondition — a pluggable rule a box can require before it opens.
/// @notice Droplock calls `validate` once, when the box is dropped, so a rule
/// that could never be met is refused up front; and `check` at claim time,
/// with whatever `proof` the claimer supplies. Both are views: a condition
/// reads the chain, it never moves anything.
interface ICondition {
    /// @dev Refuse arguments the condition could never satisfy (bad token, zero cosigner…).
    function validate(bytes calldata args) external view returns (bool);

    /// @param boxId    The box being opened.
    /// @param recipient The address the tokens will go to.
    /// @param args     What the sender encoded when dropping the box.
    /// @param proof    Free-form data from the claimer (unused by the built-ins).
    function check(uint256 boxId, address recipient, bytes calldata args, bytes calldata proof) external view returns (bool);
}
