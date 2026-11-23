// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {BoundTemplate} from "./lib/BeneficiaryTemplate.sol";

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

/// @dev A route is available when `bridge` is set; `token` is the only asset it forwards.
struct RouteConfig {
    address bridge;
    address token;
}

/// @dev Every route of one chain. The factory is constructed with the list for all chains and keeps the entry
///      matching `block.chainid`, so the same creation code, and thus the same address, serves every chain.
struct ChainRoutes {
    uint256 chainId;
    RouteConfig basejump;
    RouteConfig psm;
    RouteConfig snowbridge;
    /// SCALE VersionedXcm appended to Bridge Hub's prefix, with placeholder beneficiary slots.
    BoundTemplate snowbridgeXcm;
    /// SCALE XCM location of the account that may reclaim trapped assets, same placeholder.
    BoundTemplate snowbridgeClaimer;
}
