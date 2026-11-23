// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ISnowbridgeGatewayV2} from "../../src/interfaces/ISnowbridgeGatewayV2.sol";

interface ITransferFrom {
    function transferFrom(address from, address to, uint256 amount) external;
}

/// @dev Pulls the ERC-20 named in `assets` like the real Gateway and records the message it was given.
contract MockGateway is ISnowbridgeGatewayV2 {
    bytes public lastXcm;
    bytes public lastClaimer;
    address public lastToken;
    uint128 public lastAmount;
    uint128 public lastExecutionFee;
    uint128 public lastRelayerFee;
    uint256 public lastValue;
    uint64 public nonce;

    error InsufficientValue();
    error UnsupportedAsset();

    function v2_sendMessage(
        bytes calldata xcm,
        bytes[] calldata assets,
        bytes calldata claimer,
        uint128 executionFee,
        uint128 relayerFee
    ) external payable {
        if (msg.value < uint256(executionFee) + relayerFee) revert InsufficientValue();
        if (assets.length != 1) revert UnsupportedAsset();
        (uint8 kind, address token, uint128 amount) = abi.decode(assets[0], (uint8, address, uint128));
        if (kind != 0) revert UnsupportedAsset();

        ITransferFrom(token).transferFrom(msg.sender, address(this), amount);
        (lastXcm, lastClaimer, lastToken, lastAmount) = (xcm, claimer, token, amount);
        (lastExecutionFee, lastRelayerFee, lastValue) = (executionFee, relayerFee, msg.value);
        nonce += 1;
    }
}
