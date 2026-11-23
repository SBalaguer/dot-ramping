// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @dev The enum value is the route's bit index in `Params.routeMask`.
enum Route {
    Snowbridge,
    Basejump,
    Psm
}

/// @dev Hashed into the forwarder's CREATE2 salt, so a deposit address commits to every field.
struct Params {
    bytes32 id;
    bytes32 entropy;
    /// AccountId32 on Asset Hub and Hydration.
    bytes32 beneficiary;
    /// Source-chain address that refunds are paid to.
    address refund;
    uint8 routeMask;
}
