// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice The deposit entry point of whm's `HollarBaseVault`, whose own interface declares no functions.
interface IHollarPsmVault {
    /// @param recipient The H160 credited with HOLLAR on Hydration, left-padded to 32 bytes.
    function deposit(uint256 amount, bytes32 recipient) external payable returns (uint64 sequence);
}
