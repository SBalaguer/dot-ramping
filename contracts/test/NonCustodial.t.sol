// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

import {DepositForwarder} from "../src/DepositForwarder.sol";
import {DepositForwarderFactory} from "../src/DepositForwarderFactory.sol";
import {ChainRoutes, Params, Route} from "../src/ForwarderTypes.sol";
import {BeneficiaryTemplate, BoundTemplate} from "../src/lib/BeneficiaryTemplate.sol";
import {ForwarderFixture} from "./ForwarderFixture.sol";
import {MockERC20} from "./mocks/MockERC20.sol";

/// @notice Whatever the relayer, the owner or a stranger does, a deposit can only leave towards the beneficiary
///         or the refund address its deposit address commits to, over a route fixed when the factory was built.
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

    function test_refund_coversAnyTokenNotOnlyTheRouteToken() public {
        MockERC20 stray = new MockERC20("DAI");
        stray.mint(deposit, 7e6);
        usdt.mint(deposit, 9e6);

        vm.startPrank(relayer);
        factory.refund(params, address(stray));
        factory.refund(params, address(usdt));
        vm.stopPrank();

        assertEq(stray.balanceOf(refundAddress), 7e6);
        assertEq(usdt.balanceOf(refundAddress), 9e6);
        assertEq(usdc.balanceOf(deposit), DEPOSIT, "other balances stay put");
    }

    function test_refund_stillWorksAfterAForward() public {
        vm.prank(relayer);
        factory.deployAndForward(params, Route.Basejump, "");
        usdc.mint(deposit, 3e6);
        vm.deal(deposit, 0.1 ether);

        vm.startPrank(relayer);
        factory.refund(params, address(usdc));
        factory.refund(params, address(0));
        vm.stopPrank();

        assertEq(usdc.balanceOf(refundAddress), 3e6);
        assertEq(refundAddress.balance, 0.1 ether);
    }

    // ─── The owner cannot redirect ───────────────────────────────

    /// @dev The owner's whole reach over a pending deposit: every route setter this contract ever had is gone,
    ///      and replacing the relayer only changes who may trigger the same bound forwarding.
    function test_ownerCannotRedirectPendingDeposits() public {
        bytes[3] memory removedSetters = [
            abi.encodeWithSignature("configureBasejump(address,address)", stranger, address(usdc)),
            abi.encodeWithSignature("configurePsm(address,address)", stranger, address(usdc)),
            abi.encodeWithSignature(
                "configureSnowbridge(address,address,(bytes,uint256[]),(bytes,uint256[]))",
                stranger,
                address(usdc),
                xcmTemplate(),
                claimerTemplate()
            )
        ];
        vm.startPrank(owner);
        for (uint256 i; i < removedSetters.length; ++i) {
            (bool ok,) = address(factory).call(removedSetters[i]);
            assertFalse(ok, "factory has no route setter");
        }
        factory.setRelayer(owner);
        factory.deployAndForward(params, Route.Basejump, "");
        vm.stopPrank();

        assertEq(emitter.lastRecipient(), params.beneficiary);
        assertEq(usdc.balanceOf(address(emitter)), DEPOSIT);
        _assertRoute(Route.Basejump, address(emitter), address(usdc));
        _assertRoute(Route.Psm, address(vault), address(usdc));
        _assertRoute(Route.Snowbridge, address(gateway), address(usdt));
    }

    function test_ownerRotatesTheRelayerWithoutMovingDepositAddresses() public {
        address replacement = makeAddr("replacement relayer");

        vm.prank(owner);
        factory.setRelayer(replacement);

        assertEq(factory.predict(params), deposit);
        vm.expectRevert(DepositForwarderFactory.OnlyRelayer.selector);
        vm.prank(relayer);
        factory.deployAndForward(params, Route.Basejump, "");

        vm.prank(replacement);
        factory.deployAndForward(params, Route.Basejump, "");
        assertEq(emitter.lastRecipient(), params.beneficiary);
    }

    function test_onlyTheOwnerRotatesTheRelayer() public {
        address[2] memory callers = [relayer, stranger];
        for (uint256 i; i < callers.length; ++i) {
            vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, callers[i]));
            vm.prank(callers[i]);
            factory.setRelayer(callers[i]);
        }
    }

    // ─── Triggering and construction ─────────────────────────────

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

    function test_factoryKeepsOnlyItsOwnChainsRoutes() public {
        ChainRoutes[] memory chains = allChains();
        vm.chainId(OTHER_CHAIN);
        DepositForwarderFactory elsewhere = new DepositForwarderFactory(owner, relayer, chains);

        (address bridge, address token) = elsewhere.routeConfig(Route.Basejump);
        assertEq(bridge, otherChainBridge);
        assertEq(token, address(usdc));
        (bridge,) = elsewhere.routeConfig(Route.Snowbridge);
        assertEq(bridge, address(0));
        _assertRoute(Route.Basejump, address(emitter), address(usdc));
    }

    function test_routeWithoutConfigCannotForward() public {
        DepositForwarderFactory bare = new DepositForwarderFactory(owner, relayer, new ChainRoutes[](0));
        usdc.mint(bare.predict(params), DEPOSIT);

        vm.expectRevert(abi.encodeWithSelector(DepositForwarder.RouteNotConfigured.selector, Route.Basejump));
        vm.prank(relayer);
        bare.deployAndForward(params, Route.Basejump, "");

        vm.prank(relayer);
        bare.refund(params, address(usdc));
        assertEq(usdc.balanceOf(refundAddress), DEPOSIT, "refund needs no route");
    }

    function test_constructor_rejectsAmbiguousOrIncompleteRoutes() public {
        ChainRoutes[] memory duplicated = new ChainRoutes[](2);
        duplicated[0] = thisChain();
        duplicated[1] = thisChain();
        vm.expectRevert(abi.encodeWithSelector(DepositForwarderFactory.DuplicateChain.selector, block.chainid));
        new DepositForwarderFactory(owner, relayer, duplicated);

        ChainRoutes[] memory tokenless = new ChainRoutes[](1);
        tokenless[0] = thisChain();
        tokenless[0].psm.token = address(0);
        vm.expectRevert(abi.encodeWithSelector(DepositForwarderFactory.IncompleteRoute.selector, Route.Psm));
        new DepositForwarderFactory(owner, relayer, tokenless);

        vm.expectRevert(DepositForwarderFactory.ZeroAddress.selector);
        new DepositForwarderFactory(owner, address(0), allChains());
    }

    /// @dev A Snowbridge template that never names the beneficiary would send every deposit to a fixed account.
    function test_constructor_rejectsSnowbridgeTemplateWithoutTheBeneficiary() public {
        BoundTemplate memory unbound;
        unbound.data = hex"05040d010000010100";

        ChainRoutes[] memory chains = new ChainRoutes[](1);
        chains[0] = thisChain();
        chains[0].snowbridgeXcm = unbound;
        vm.expectRevert(BeneficiaryTemplate.NoBeneficiarySlot.selector);
        new DepositForwarderFactory(owner, relayer, chains);

        chains[0] = thisChain();
        chains[0].snowbridgeClaimer = unbound;
        vm.expectRevert(BeneficiaryTemplate.NoBeneficiarySlot.selector);
        new DepositForwarderFactory(owner, relayer, chains);
    }

    function _assertRoute(Route route, address bridge, address token) private view {
        (address actualBridge, address actualToken) = factory.routeConfig(route);
        assertEq(actualBridge, bridge);
        assertEq(actualToken, token);
    }
}
