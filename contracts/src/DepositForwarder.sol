// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Address} from "@openzeppelin/contracts/utils/Address.sol";
import {SafeCast} from "@openzeppelin/contracts/utils/math/SafeCast.sol";
import {IBasejumpEmitter} from "whm/basejump/interfaces/IBasejumpEmitter.sol";

import {Params, Route} from "./ForwarderTypes.sol";
import {IHollarPsmVault} from "./interfaces/IHollarPsmVault.sol";
import {IRouteRegistry} from "./interfaces/IRouteRegistry.sol";
import {ISnowbridgeGatewayV2} from "./interfaces/ISnowbridgeGatewayV2.sol";
import {BeneficiaryTemplate, BoundTemplate} from "./lib/BeneficiaryTemplate.sol";

/// @title DepositForwarder
/// @notice Per-top-up deposit address. It can only bridge its balance to the beneficiary, or refund it to the
///         refund address, that its CREATE2 salt commits to. The factory triggers it; nobody chooses a destination.
contract DepositForwarder {
    using SafeERC20 for IERC20;
    using BeneficiaryTemplate for BoundTemplate;

    /// @dev Kind tag of an ERC-20 entry in Snowbridge's `assets` array.
    uint8 private constant SNOWBRIDGE_ASSET_ERC20 = 0;

    /// @dev Set by the implementation's constructor and shared by every clone through its bytecode.
    IRouteRegistry public immutable FACTORY;

    /// @notice `keccak256(abi.encode(params))`, equal to the CREATE2 salt this forwarder was deployed with.
    bytes32 public paramsHash;

    event Forwarded(Route indexed route, address indexed token, uint256 amount);
    event Refunded(address indexed token, address indexed to, uint256 amount);

    error OnlyFactory();
    error AlreadyInitialized();
    error ParamsMismatch();
    error RouteNotAllowed(Route route);
    error RouteNotConfigured(Route route);
    error NothingToForward();
    error FeesExceedValue(uint256 fees, uint256 value);

    modifier onlyFactory() {
        if (msg.sender != address(FACTORY)) revert OnlyFactory();
        _;
    }

    modifier bound(Params calldata params) {
        if (keccak256(abi.encode(params)) != paramsHash) revert ParamsMismatch();
        _;
    }

    constructor() {
        FACTORY = IRouteRegistry(msg.sender);
    }

    /// @dev Bridges may return unused fee ether to their caller.
    receive() external payable {}

    function initialize(bytes32 paramsHash_) external onlyFactory {
        if (paramsHash != bytes32(0)) revert AlreadyInitialized();
        paramsHash = paramsHash_;
    }

    /// @notice Bridges the whole balance of the route's token to `params.beneficiary`.
    /// @param routeArgs Snowbridge: `abi.encode(uint128 executionFee, uint128 relayerFee)`. Empty otherwise.
    /// @param feePayer Receives whatever part of `msg.value` the bridge hands back.
    function forward(Params calldata params, Route route, bytes calldata routeArgs, address feePayer)
        external
        payable
        onlyFactory
        bound(params)
    {
        if (params.routeMask & (1 << uint8(route)) == 0) revert RouteNotAllowed(route);
        (address bridge, address token) = FACTORY.routeConfig(route);
        if (bridge == address(0)) revert RouteNotConfigured(route);

        uint256 amount = IERC20(token).balanceOf(address(this));
        if (amount == 0) revert NothingToForward();
        uint256 etherHeld = address(this).balance - msg.value;

        emit Forwarded(route, token, amount);
        IERC20(token).forceApprove(bridge, amount);
        if (route == Route.Basejump) {
            IBasejumpEmitter(bridge).bridgeViaWormhole{value: msg.value}(token, amount, params.beneficiary, "");
        } else if (route == Route.Psm) {
            IHollarPsmVault(bridge).deposit{value: msg.value}(amount, _evmRecipient(params.beneficiary));
        } else {
            _sendViaSnowbridge(bridge, token, amount, params.beneficiary, routeArgs);
        }

        uint256 returnedFees = address(this).balance - etherHeld;
        if (returnedFees > 0) Address.sendValue(payable(feePayer), returnedFees);
    }

    /// @notice Sends the whole balance of `token` to `params.refund`; `address(0)` refunds ether.
    function refund(Params calldata params, address token) external onlyFactory bound(params) {
        bool isEther = token == address(0);
        uint256 amount = isEther ? address(this).balance : IERC20(token).balanceOf(address(this));
        emit Refunded(token, params.refund, amount);
        if (isEther) {
            Address.sendValue(payable(params.refund), amount);
        } else {
            IERC20(token).safeTransfer(params.refund, amount);
        }
    }

    function _sendViaSnowbridge(
        address gateway,
        address token,
        uint256 amount,
        bytes32 beneficiary,
        bytes calldata routeArgs
    ) private {
        (uint128 executionFee, uint128 relayerFee) = abi.decode(routeArgs, (uint128, uint128));
        uint256 fees = uint256(executionFee) + relayerFee;
        if (fees > msg.value) revert FeesExceedValue(fees, msg.value);

        (BoundTemplate memory xcm, BoundTemplate memory claimer) = FACTORY.snowbridgeTemplates();
        bytes[] memory assets = new bytes[](1);
        assets[0] = abi.encode(SNOWBRIDGE_ASSET_ERC20, token, SafeCast.toUint128(amount));

        ISnowbridgeGatewayV2(gateway).v2_sendMessage{value: msg.value}(
            xcm.fill(beneficiary), assets, claimer.fill(beneficiary), executionFee, relayerFee
        );
    }

    /// @dev The HOLLAR PSM pays an H160; Hydration binds an account to the first 20 bytes of its AccountId32.
    function _evmRecipient(bytes32 beneficiary) private pure returns (bytes32) {
        // forge-lint: disable-next-line(unsafe-typecast)
        return bytes32(uint256(uint160(bytes20(beneficiary))));
    }
}
