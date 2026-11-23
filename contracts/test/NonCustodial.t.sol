// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

import {DepositForwarder} from "../src/DepositForwarder.sol";
import {DepositForwarderFactory} from "../src/DepositForwarderFactory.sol";
import {Params, Route} from "../src/ForwarderTypes.sol";
import {BeneficiaryTemplate, BoundTemplate} from "../src/lib/BeneficiaryTemplate.sol";
import {ForwarderFixture} from "./ForwarderFixture.sol";

/// @notice Whatever the relayer, the owner's configured bridges aside, or a stranger does, a deposit can only
///         leave towards the beneficiary or the refund address its deposit address commits to.
contract NonCustodialTest is ForwarderFixture {
    uint256 private constant DEPOSIT = 120e6;

    Params private params;
    address private deposit;

    function setUp() public override {
        super.setUp();
        params = defaultParams();
        deposit = factory.predict(params);
        usdc.mint(deposit, DEPOSIT);
    }

    // ─── The relayer cannot redirect ─────────────────────────────

    function testFuzz_relayerCannotBridgeToAnotherBeneficiary(bytes32 other) public {
        vm.assume(other != params.beneficiary);
        Params memory tampered = params;
        tampered.beneficiary = other;

        vm.expectRevert(DepositForwarder.NothingToForward.selector);
        vm.prank(relayer);
        factory.deployAndForward(tampered, Route.Basejump, "");

        assertEq(usdc.balanceOf(deposit), DEPOSIT);
    }

    function testFuzz_relayerCannotRefundToAnotherAddress(address other) public {
        vm.assume(other != params.refund && other != address(0) && other != deposit);
        Params memory tampered = params;
        tampered.refund = other;

        vm.prank(relayer);
        factory.refund(tampered, address(usdc));

        assertEq(usdc.balanceOf(other), 0);
        assertEq(usdc.balanceOf(deposit), DEPOSIT);
    }

    function testFuzz_forwardAlwaysNamesTheBoundBeneficiary(bytes32 id, bytes32 entropy, bytes32 who, uint96 amount)
        public
    {
        vm.assume(amount > 0);
        Params memory fuzzed =
            Params({id: id, entropy: entropy, beneficiary: who, refund: refundAddress, routeMask: ALL_ROUTES});
        usdc.mint(factory.predict(fuzzed), amount);

        vm.prank(relayer);
        factory.deployAndForward(fuzzed, Route.Basejump, "");

        assertEq(emitter.lastRecipient(), who);
        assertEq(emitter.lastAmount(), amount);
    }

    function test_relayerCannotUseARouteOutsideTheMask() public {
        Params memory basejumpOnly = params;
        basejumpOnly.routeMask = uint8(1 << uint8(Route.Basejump));
        usdc.mint(factory.predict(basejumpOnly), DEPOSIT);

        vm.expectRevert(abi.encodeWithSelector(DepositForwarder.RouteNotAllowed.selector, Route.Psm));
        vm.prank(relayer);
        factory.deployAndForward{value: PSM_MESSAGE_FEE}(basejumpOnly, Route.Psm, "");
    }

    // ─── The forwarder obeys only its factory, with its own params ─

    function test_forwarderRejectsDirectCalls() public {
        vm.prank(relayer);
        factory.refund(params, address(0));
        DepositForwarder forwarder = DepositForwarder(payable(deposit));

        address[3] memory callers = [stranger, relayer, owner];
        for (uint256 i; i < callers.length; ++i) {
            vm.startPrank(callers[i]);
            vm.expectRevert(DepositForwarder.OnlyFactory.selector);
            forwarder.forward(params, Route.Basejump, "", callers[i]);
            vm.expectRevert(DepositForwarder.OnlyFactory.selector);
            forwarder.refund(params, address(usdc));
            vm.expectRevert(DepositForwarder.OnlyFactory.selector);
            forwarder.initialize(bytes32(uint256(1)));
            vm.stopPrank();
        }
    }

    function test_forwarderRejectsParamsItWasNotDeployedWith() public {
        vm.prank(relayer);
        factory.refund(params, address(0));
        DepositForwarder forwarder = DepositForwarder(payable(deposit));
        Params memory tampered = params;
        tampered.beneficiary = keccak256("attacker");
        bytes32 tamperedHash = factory.saltOf(tampered);

        vm.startPrank(address(factory));
        vm.expectRevert(DepositForwarder.ParamsMismatch.selector);
        forwarder.forward(tampered, Route.Basejump, "", relayer);
        vm.expectRevert(DepositForwarder.ParamsMismatch.selector);
        forwarder.refund(tampered, address(usdc));
        vm.expectRevert(DepositForwarder.AlreadyInitialized.selector);
        forwarder.initialize(tamperedHash);
        vm.stopPrank();
    }

    function test_implementationHoldsNoUsableBinding() public {
        DepositForwarder implementation = DepositForwarder(payable(factory.implementation()));
        usdc.mint(address(implementation), DEPOSIT);

        vm.expectRevert(DepositForwarder.ParamsMismatch.selector);
        vm.prank(address(factory));
        implementation.refund(params, address(usdc));
    }

    // ─── Refunds ─────────────────────────────────────────────────

    function test_refund_beforeAnyForwardReturnsDepositToRefundAddress() public {
        assertEq(deposit.code.length, 0);

        vm.prank(relayer);
        factory.refund(params, address(usdc));

        assertEq(usdc.balanceOf(refundAddress), DEPOSIT);
        assertEq(usdc.balanceOf(deposit), 0);
    }

    function test_refund_refundAddressNeedsNoRelayer() public {
        vm.deal(deposit, 0.2 ether);

        vm.startPrank(refundAddress);
        factory.refund(params, address(usdc));
        factory.refund(params, address(0));
        vm.stopPrank();

        assertEq(usdc.balanceOf(refundAddress), DEPOSIT);
        assertEq(refundAddress.balance, 0.2 ether);
    }

    function test_refund_strangerCannotTriggerIt() public {
        vm.expectRevert(DepositForwarderFactory.OnlyRelayerOrRefundAddress.selector);
        vm.prank(stranger);
        factory.refund(params, address(usdc));
    }

    // ─── Triggering and configuration ────────────────────────────

    function test_onlyTheRelayerTriggersForwarding() public {
        address[2] memory callers = [stranger, owner];
        for (uint256 i; i < callers.length; ++i) {
            vm.startPrank(callers[i]);
            vm.expectRevert(DepositForwarderFactory.OnlyRelayer.selector);
            factory.deployAndForward(params, Route.Basejump, "");
            vm.expectRevert(DepositForwarderFactory.OnlyRelayer.selector);
            factory.forward(params, Route.Basejump, "");
            vm.stopPrank();
        }
    }

    function test_routeConfigIsFixedOnceSet() public {
        vm.startPrank(owner);
        vm.expectRevert(abi.encodeWithSelector(DepositForwarderFactory.RouteAlreadyConfigured.selector, Route.Basejump));
        factory.configureBasejump(stranger, address(usdc));
        vm.expectRevert(abi.encodeWithSelector(DepositForwarderFactory.RouteAlreadyConfigured.selector, Route.Psm));
        factory.configurePsm(stranger, address(usdc));
        vm.expectRevert(
            abi.encodeWithSelector(DepositForwarderFactory.RouteAlreadyConfigured.selector, Route.Snowbridge)
        );
        factory.configureSnowbridge(stranger, address(usdt), xcmTemplate(), claimerTemplate());
        vm.stopPrank();

        (address bridge,) = factory.routeConfig(Route.Basejump);
        assertEq(bridge, address(emitter));
    }

    function test_onlyTheOwnerConfigures() public {
        DepositForwarderFactory fresh = new DepositForwarderFactory(owner);

        vm.startPrank(relayer);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, relayer));
        fresh.configureBasejump(address(emitter), address(usdc));
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, relayer));
        fresh.configureSnowbridge(address(gateway), address(usdt), xcmTemplate(), claimerTemplate());
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, relayer));
        fresh.setRelayer(relayer);
        vm.stopPrank();
    }

    function test_unconfiguredRouteCannotForward() public {
        DepositForwarderFactory fresh = new DepositForwarderFactory(relayer);
        usdc.mint(fresh.predict(params), DEPOSIT);

        vm.expectRevert(abi.encodeWithSelector(DepositForwarder.RouteNotConfigured.selector, Route.Basejump));
        vm.prank(relayer);
        fresh.deployAndForward(params, Route.Basejump, "");
    }

    /// @dev A Snowbridge template that never names the beneficiary would send every deposit to a fixed account.
    function test_snowbridgeTemplateMustCarryTheBeneficiary() public {
        DepositForwarderFactory fresh = new DepositForwarderFactory(owner);
        BoundTemplate memory unbound;
        unbound.data = hex"05040d010000010100";

        vm.expectRevert(BeneficiaryTemplate.NoBeneficiarySlot.selector);
        vm.prank(owner);
        fresh.configureSnowbridge(address(gateway), address(usdt), unbound, claimerTemplate());

        vm.expectRevert(BeneficiaryTemplate.NoBeneficiarySlot.selector);
        vm.prank(owner);
        fresh.configureSnowbridge(address(gateway), address(usdt), xcmTemplate(), unbound);
    }
}
