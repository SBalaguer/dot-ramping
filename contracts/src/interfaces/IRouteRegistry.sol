// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Route} from "../ForwarderTypes.sol";
import {BoundTemplate} from "../lib/BeneficiaryTemplate.sol";

/// @notice Route configuration a forwarder reads from its factory.
interface IRouteRegistry {
    /// @return bridge The bridge entry point for `route`, or zero while the route is not configured.
    /// @return token The only token `route` forwards.
    function routeConfig(Route route) external view returns (address bridge, address token);

    function snowbridgeTemplates() external view returns (BoundTemplate memory xcm, BoundTemplate memory claimer);
}
