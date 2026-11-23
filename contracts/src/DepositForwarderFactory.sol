// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Clones} from "@openzeppelin/contracts/proxy/Clones.sol";

import {DepositForwarder} from "./DepositForwarder.sol";
import {ChainRoutes, Params, Route, RouteConfig} from "./ForwarderTypes.sol";
import {IRouteRegistry} from "./interfaces/IRouteRegistry.sol";
import {BeneficiaryTemplate, BoundTemplate} from "./lib/BeneficiaryTemplate.sol";

/// @title DepositForwarderFactory
/// @notice Deploys one `DepositForwarder` clone per top-up at an address fixed by the top-up's `Params`, and is
///         the only caller those forwarders obey. Routes are fixed at construction: no function changes where
///         a route leads, so a deposit address commits to its routes through the factory's own address. The
///         owner's only power is to replace the relayer, which triggers forwarding but never picks a destination.
contract DepositForwarderFactory is IRouteRegistry, Ownable {
    using BeneficiaryTemplate for BoundTemplate;

    address public immutable implementation;
    address public relayer;

    address private immutable _BASEJUMP_BRIDGE;
    address private immutable _BASEJUMP_TOKEN;
    address private immutable _PSM_BRIDGE;
    address private immutable _PSM_TOKEN;
    address private immutable _SNOWBRIDGE_BRIDGE;
    address private immutable _SNOWBRIDGE_TOKEN;
    /// @dev Written by the constructor only.
    BoundTemplate private _snowbridgeXcm;
    BoundTemplate private _snowbridgeClaimer;

    event ForwarderDeployed(address indexed forwarder, bytes32 indexed id, bytes32 indexed beneficiary);
    event RouteConfigured(Route indexed route, address bridge, address token);
    event RelayerChanged(address indexed relayer);

    error OnlyRelayer();
    error OnlyRelayerOrRefundAddress();
    error ZeroAddress();
    error DuplicateChain(uint256 chainId);
    error IncompleteRoute(Route route);

    modifier onlyRelayer() {
        if (msg.sender != relayer) revert OnlyRelayer();
        _;
    }

    /// @param owner_ An argument because the factory is deployed through a CREATE2 deployer.
    /// @param chains Routes of every chain this creation code is deployed on; this chain's entry is kept.
    constructor(address owner_, address relayer_, ChainRoutes[] memory chains) Ownable(owner_) {
        implementation = address(new DepositForwarder());
        _setRelayer(relayer_);

        ChainRoutes memory routes = _routesOfThisChain(chains);
        (_BASEJUMP_BRIDGE, _BASEJUMP_TOKEN) = _checked(Route.Basejump, routes.basejump);
        (_PSM_BRIDGE, _PSM_TOKEN) = _checked(Route.Psm, routes.psm);
        (_SNOWBRIDGE_BRIDGE, _SNOWBRIDGE_TOKEN) = _checked(Route.Snowbridge, routes.snowbridge);
        if (routes.snowbridge.bridge != address(0)) {
            routes.snowbridgeXcm.validate();
            routes.snowbridgeClaimer.validate();
            _snowbridgeXcm = routes.snowbridgeXcm;
            _snowbridgeClaimer = routes.snowbridgeClaimer;
        }
    }

    // ─── Forwarding ──────────────────────────────────────────────

    /// @notice Deploys the forwarder for `params` and bridges its balance over `route`, in one transaction.
    function deployAndForward(Params calldata params, Route route, bytes calldata routeArgs)
        external
        payable
        onlyRelayer
        returns (address forwarder)
    {
        forwarder = _deploy(params);
        DepositForwarder(payable(forwarder)).forward{value: msg.value}(params, route, routeArgs, msg.sender);
    }

    /// @notice Bridges a later deposit that reached an already deployed forwarder.
    function forward(Params calldata params, Route route, bytes calldata routeArgs) external payable onlyRelayer {
        DepositForwarder(payable(predict(params))).forward{value: msg.value}(params, route, routeArgs, msg.sender);
    }

    /// @notice Returns the forwarder's balance of any ERC-20 `token` (`address(0)` for ether) to `params.refund`.
    /// @dev The refund address may always pull its own funds back, so they never depend on the relayer.
    function refund(Params calldata params, address token) external {
        if (msg.sender != relayer && msg.sender != params.refund) revert OnlyRelayerOrRefundAddress();
        address forwarder = predict(params);
        if (forwarder.code.length == 0) _deploy(params);
        DepositForwarder(payable(forwarder)).refund(params, token);
    }

    // ─── Addressing ──────────────────────────────────────────────

    function saltOf(Params calldata params) public pure returns (bytes32) {
        return keccak256(abi.encode(params));
    }

    function predict(Params calldata params) public view returns (address) {
        return Clones.predictDeterministicAddress(implementation, saltOf(params));
    }

    // ─── Configuration ───────────────────────────────────────────

    function setRelayer(address relayer_) external onlyOwner {
        _setRelayer(relayer_);
    }

    function routeConfig(Route route) external view returns (address bridge, address token) {
        if (route == Route.Basejump) return (_BASEJUMP_BRIDGE, _BASEJUMP_TOKEN);
        if (route == Route.Psm) return (_PSM_BRIDGE, _PSM_TOKEN);
        return (_SNOWBRIDGE_BRIDGE, _SNOWBRIDGE_TOKEN);
    }

    function snowbridgeTemplates() external view returns (BoundTemplate memory xcm, BoundTemplate memory claimer) {
        return (_snowbridgeXcm, _snowbridgeClaimer);
    }

    // ─── Internals ───────────────────────────────────────────────

    function _deploy(Params calldata params) private returns (address forwarder) {
        bytes32 salt = saltOf(params);
        forwarder = Clones.cloneDeterministic(implementation, salt);
        emit ForwarderDeployed(forwarder, params.id, params.beneficiary);
        DepositForwarder(payable(forwarder)).initialize(salt);
    }

    function _setRelayer(address relayer_) private {
        if (relayer_ == address(0)) revert ZeroAddress();
        relayer = relayer_;
        emit RelayerChanged(relayer_);
    }

    /// @dev A chain without an entry gets no routes; its forwarders can only refund.
    function _routesOfThisChain(ChainRoutes[] memory chains) private view returns (ChainRoutes memory routes) {
        for (uint256 i = 0; i < chains.length; ++i) {
            for (uint256 j = i + 1; j < chains.length; ++j) {
                if (chains[i].chainId == chains[j].chainId) revert DuplicateChain(chains[i].chainId);
            }
            if (chains[i].chainId == block.chainid) routes = chains[i];
        }
    }

    function _checked(Route route, RouteConfig memory config) private returns (address bridge, address token) {
        if ((config.bridge == address(0)) != (config.token == address(0))) revert IncompleteRoute(route);
        if (config.bridge != address(0)) emit RouteConfigured(route, config.bridge, config.token);
        return (config.bridge, config.token);
    }
}
