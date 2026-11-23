// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice The part of Snowbridge's `IGatewayV2` (contracts/src/v2/IGateway.sol) the forwarder calls.
interface ISnowbridgeGatewayV2 {
    /// @param xcm SCALE-encoded VersionedXcm, executed on Asset Hub after Bridge Hub's prefix.
    /// @param assets ERC-20 entries encoded as `abi.encode(uint8(0), token, uint128 amount)`.
    /// @param claimer SCALE-encoded XCM location that may reclaim trapped assets on Asset Hub.
    /// @param executionFee Ether paying for execution on Asset Hub.
    /// @param relayerFee Ether rewarding the relayer.
    function v2_sendMessage(
        bytes calldata xcm,
        bytes[] calldata assets,
        bytes calldata claimer,
        uint128 executionFee,
        uint128 relayerFee
    ) external payable;
}
