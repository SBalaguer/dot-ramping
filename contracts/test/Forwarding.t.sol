// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Errors} from "@openzeppelin/contracts/utils/Errors.sol";

import {DepositForwarder} from "../src/DepositForwarder.sol";
import {Params, Route} from "../src/ForwarderTypes.sol";
import {ForwarderFixture} from "./ForwarderFixture.sol";

contract ForwardingTest is ForwarderFixture {
    uint256 private constant DEPOSIT = 120e6;

    function test_basejump_bridgesWholeDepositToBeneficiary() public {
        Params memory params = defaultParams();
        address deposit = factory.predict(params);
        usdc.mint(deposit, DEPOSIT);
        assertEq(deposit.code.length, 0, "deposit address is counterfactual");

        vm.prank(relayer);
        address forwarder = factory.deployAndForward{value: 0.01 ether}(params, Route.Basejump, "");

        assertEq(forwarder, deposit);
        assertEq(DepositForwarder(payable(forwarder)).paramsHash(), factory.saltOf(params));
        assertEq(emitter.lastAsset(), address(usdc));
        assertEq(emitter.lastAmount(), DEPOSIT);
        assertEq(emitter.lastRecipient(), params.beneficiary);
        assertEq(emitter.lastData(), "");
        assertEq(emitter.lastValue(), 0.01 ether);
        assertEq(usdc.balanceOf(forwarder), 0);
        assertEq(usdc.allowance(forwarder, address(emitter)), 0);
    }

    function test_psm_creditsTheFirst20BytesOfTheBeneficiary() public {
        Params memory params = defaultParams();
        usdc.mint(factory.predict(params), DEPOSIT);

        vm.prank(relayer);
        factory.deployAndForward{value: PSM_MESSAGE_FEE}(params, Route.Psm, "");

        assertEq(vault.lastAmount(), DEPOSIT);
        assertEq(vault.lastRecipient(), bytes32(uint256(0x00d43593c715fdd31c61141abd04a99fd6822c8558)));
    }

    function test_psm_returnsUnusedFeeToTheRelayerButKeepsStrayEther() public {
        Params memory params = defaultParams();
        address deposit = factory.predict(params);
        usdc.mint(deposit, DEPOSIT);
        vm.deal(deposit, 0.3 ether);
        uint256 relayerBefore = relayer.balance;

        vm.prank(relayer);
        factory.deployAndForward{value: 1 ether}(params, Route.Psm, "");

        assertEq(relayer.balance, relayerBefore - PSM_MESSAGE_FEE, "relayer pays only the message fee");
        assertEq(deposit.balance, 0.3 ether, "ether sent to the deposit address stays refundable");
    }

    function test_snowbridge_sendsBeneficiaryBoundXcmAndClaimer() public {
        Params memory params = defaultParams();
        address deposit = factory.predict(params);
        usdt.mint(deposit, 5_000e6);

        vm.prank(relayer);
        factory.deployAndForward{value: 0.05 ether}(
            params, Route.Snowbridge, abi.encode(uint128(0.03 ether), uint128(0.01 ether))
        );

        assertEq(gateway.lastXcm(), bytes.concat(hex"05040d010000010100", params.beneficiary));
        assertEq(gateway.lastClaimer(), bytes.concat(hex"00010100", params.beneficiary));
        assertEq(gateway.lastToken(), address(usdt));
        assertEq(gateway.lastAmount(), 5_000e6);
        assertEq(gateway.lastExecutionFee(), 0.03 ether);
        assertEq(gateway.lastRelayerFee(), 0.01 ether);
        assertEq(gateway.lastValue(), 0.05 ether, "surplus ether travels with the message");
        assertEq(usdt.balanceOf(deposit), 0);
    }

    function test_snowbridge_revertsWhenFeesExceedValue() public {
        Params memory params = defaultParams();
        usdt.mint(factory.predict(params), 5_000e6);

        vm.expectRevert(abi.encodeWithSelector(DepositForwarder.FeesExceedValue.selector, 0.04 ether, 0.03 ether));
        vm.prank(relayer);
        factory.deployAndForward{value: 0.03 ether}(
            params, Route.Snowbridge, abi.encode(uint128(0.03 ether), uint128(0.01 ether))
        );
    }

    /// @dev USDT only accepts a new allowance from zero; a repeat deposit must still go through.
    function test_forward_handlesLaterDepositsToADeployedForwarder() public {
        Params memory params = defaultParams();
        address deposit = factory.predict(params);
        bytes memory fees = abi.encode(uint128(0.03 ether), uint128(0.01 ether));

        usdt.mint(deposit, 300e6);
        vm.prank(relayer);
        factory.deployAndForward{value: 0.04 ether}(params, Route.Snowbridge, fees);

        usdt.mint(deposit, 700e6);
        vm.prank(relayer);
        factory.forward{value: 0.04 ether}(params, Route.Snowbridge, fees);

        assertEq(gateway.lastAmount(), 700e6);
        assertEq(gateway.nonce(), 2);
        assertEq(usdt.balanceOf(deposit), 0);
    }

    function test_deployAndForward_revertsOnceDeployed() public {
        Params memory params = defaultParams();
        usdc.mint(factory.predict(params), DEPOSIT);
        vm.prank(relayer);
        factory.deployAndForward(params, Route.Basejump, "");

        usdc.mint(factory.predict(params), DEPOSIT);
        vm.expectRevert(Errors.FailedDeployment.selector);
        vm.prank(relayer);
        factory.deployAndForward(params, Route.Basejump, "");
    }

    function test_forward_revertsBeforeDeployment() public {
        Params memory params = defaultParams();
        usdc.mint(factory.predict(params), DEPOSIT);

        vm.expectRevert();
        vm.prank(relayer);
        factory.forward(params, Route.Basejump, "");
    }

    function test_forward_revertsWithoutADeposit() public {
        vm.expectRevert(DepositForwarder.NothingToForward.selector);
        vm.prank(relayer);
        factory.deployAndForward(defaultParams(), Route.Basejump, "");
    }
}
