// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {IHollarPsmVault} from "../../src/interfaces/IHollarPsmVault.sol";

/// @dev Mirrors the real vault's observable behaviour: rejects a recipient that is not a left-padded H160,
///      charges a message fee and returns the rest of `msg.value` to its caller.
contract MockPsmVault is IHollarPsmVault {
    IERC20 public immutable usdc;
    uint256 public immutable messageFee;

    uint256 public lastAmount;
    bytes32 public lastRecipient;
    uint64 public sequence;

    error NotAnEvmAddress(bytes32 recipient);
    error InsufficientMessageFee(uint256 value, uint256 fee);

    constructor(IERC20 usdc_, uint256 messageFee_) {
        usdc = usdc_;
        messageFee = messageFee_;
    }

    function deposit(uint256 amount, bytes32 recipient) external payable returns (uint64) {
        if (uint256(recipient) >> 160 != 0) revert NotAnEvmAddress(recipient);
        if (msg.value < messageFee) revert InsufficientMessageFee(msg.value, messageFee);
        usdc.transferFrom(msg.sender, address(this), amount);
        (lastAmount, lastRecipient) = (amount, recipient);
        if (msg.value > messageFee) {
            (bool ok,) = msg.sender.call{value: msg.value - messageFee}("");
            require(ok, "refund failed");
        }
        return ++sequence;
    }
}
