// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";

import {DepositForwarderFactory} from "../src/DepositForwarderFactory.sol";
import {Params} from "../src/ForwarderTypes.sol";

/// @dev The vectors are written by `packages/keys/test/forwarder.test.ts`; both languages must agree on them.
contract DerivationTest is Test {
    /// Deployer whose first CREATE lands on the fixture's factory address.
    address private constant FIXTURE_DEPLOYER = 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266;

    function test_factoryMatchesTypeScriptDerivation() public {
        string memory json = vm.readFile("test/fixtures/derivation.json");

        vm.prank(FIXTURE_DEPLOYER);
        DepositForwarderFactory factory = new DepositForwarderFactory(address(this));
        assertEq(address(factory), vm.parseJsonAddress(json, ".factory"), "fixture factory address");
        assertEq(factory.implementation(), vm.parseJsonAddress(json, ".implementation"), "implementation");

        bytes32[] memory ids = vm.parseJsonBytes32Array(json, ".ids");
        bytes32[] memory entropies = vm.parseJsonBytes32Array(json, ".entropies");
        bytes32[] memory beneficiaries = vm.parseJsonBytes32Array(json, ".beneficiaries");
        address[] memory refunds = vm.parseJsonAddressArray(json, ".refunds");
        uint256[] memory routeMasks = vm.parseJsonUintArray(json, ".routeMasks");
        bytes32[] memory salts = vm.parseJsonBytes32Array(json, ".salts");
        address[] memory forwarders = vm.parseJsonAddressArray(json, ".forwarders");

        assertGt(ids.length, 0, "fixture has vectors");
        for (uint256 i; i < ids.length; ++i) {
            Params memory params = Params({
                id: ids[i],
                entropy: entropies[i],
                beneficiary: beneficiaries[i],
                refund: refunds[i],
                routeMask: uint8(routeMasks[i])
            });
            assertEq(factory.saltOf(params), salts[i], "salt");
            assertEq(factory.predict(params), forwarders[i], "forwarder address");
        }
    }
}
