// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IBasejumpEmitter} from "whm/basejump/interfaces/IBasejumpEmitter.sol";

/// @dev Pulls the asset like the real emitter and records what it was asked to bridge.
contract MockBasejumpEmitter is IBasejumpEmitter {
    address public lastAsset;
    uint256 public lastAmount;
    bytes32 public lastRecipient;
    bytes public lastData;
    uint256 public lastValue;
    uint64 public sequence;

    function bridgeViaWormhole(address asset, uint256 amount, bytes32 recipient, bytes memory data)
        external
        payable
        returns (uint64 transferSequence, uint64 messageSequence)
    {
        IERC20(asset).transferFrom(msg.sender, address(this), amount);
        (lastAsset, lastAmount, lastRecipient, lastData, lastValue) = (asset, amount, recipient, data, msg.value);
        sequence += 1;
        return (sequence, sequence);
    }

    function quoteFee(address) external pure returns (uint256) {
        return 0;
    }
}
