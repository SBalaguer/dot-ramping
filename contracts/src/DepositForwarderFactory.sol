// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Clones} from "@openzeppelin/contracts/proxy/Clones.sol";

import {DepositForwarder} from "./DepositForwarder.sol";
import {Params, Route} from "./ForwarderTypes.sol";
import {IRouteRegistry} from "./interfaces/IRouteRegistry.sol";
import {BeneficiaryTemplate, BoundTemplate} from "./lib/BeneficiaryTemplate.sol";

/// @title DepositForwarderFactory
/// @notice Deploys one `DepositForwarder` clone per top-up at an address fixed by the top-up's `Params`, and is
///         the only caller those forwarders obey. The owner configures each route once; the relayer triggers.
contract DepositForwarderFactory is IRouteRegistry, Ownable {
    using BeneficiaryTemplate for BoundTemplate;

    struct RouteConfig {
        address bridge;
        address token;
    }

    address public immutable implementation;
    address public relayer;

    mapping(Route route => RouteConfig) private _routes;
    BoundTemplate private _snowbridgeXcm;
    BoundTemplate private _snowbridgeClaimer;

    event ForwarderDeployed(address indexed forwarder, bytes32 indexed id, bytes32 indexed beneficiary);
    event RouteConfigured(Route indexed route, address bridge, address token);
    event RelayerChanged(address indexed relayer);

    error OnlyRelayer();
    error OnlyRelayerOrRefundAddress();
    error RouteAlreadyConfigured(Route route);
    error ZeroAddress();

    modifier onlyRelayer() {
        if (msg.sender != relayer) revert OnlyRelayer();
        _;
    }

    /// @dev `owner_` is an argument because the factory is deployed through a CREATE2 deployer.
    constructor(address owner_) Ownable(owner_) {
        implementation = address(new DepositForwarder());
        relayer = owner_;
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

    /// @notice Returns the forwarder's balance of `token` (`address(0)` for ether) to `params.refund`.
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
        if (relayer_ == address(0)) revert ZeroAddress();
        relayer = relayer_;
        emit RelayerChanged(relayer_);
    }

    function configureBasejump(address emitter, address token) external onlyOwner {
        _configure(Route.Basejump, emitter, token);
    }

    function configurePsm(address vault, address token) external onlyOwner {
        _configure(Route.Psm, vault, token);
    }

    /// @param xcm SCALE VersionedXcm appended to Bridge Hub's prefix, with placeholder beneficiary slots.
    /// @param claimer SCALE XCM location of the account that may reclaim trapped assets, same placeholder.
    function configureSnowbridge(
        address gateway,
        address token,
        BoundTemplate calldata xcm,
        BoundTemplate calldata claimer
    ) external onlyOwner {
        _configure(Route.Snowbridge, gateway, token);
        xcm.validate();
        claimer.validate();
        _snowbridgeXcm = xcm;
        _snowbridgeClaimer = claimer;
    }

    function routeConfig(Route route) external view returns (address bridge, address token) {
        RouteConfig storage config = _routes[route];
        return (config.bridge, config.token);
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

    /// @dev A route's bridge and token are fixed for the factory's lifetime once set.
    function _configure(Route route, address bridge, address token) private {
        if (bridge == address(0) || token == address(0)) revert ZeroAddress();
        if (_routes[route].bridge != address(0)) revert RouteAlreadyConfigured(route);
        _routes[route] = RouteConfig(bridge, token);
        emit RouteConfigured(route, bridge, token);
    }
}
