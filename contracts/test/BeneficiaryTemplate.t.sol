// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";

import {BeneficiaryTemplate, BoundTemplate} from "../src/lib/BeneficiaryTemplate.sol";

contract TemplateHarness {
    function validate(BoundTemplate memory template) external pure {
        BeneficiaryTemplate.validate(template);
    }

    function fill(BoundTemplate memory template, bytes32 beneficiary) external pure returns (bytes memory) {
        return BeneficiaryTemplate.fill(template, beneficiary);
    }
}

contract BeneficiaryTemplateTest is Test {
    bytes32 private constant PLACEHOLDER = BeneficiaryTemplate.PLACEHOLDER;

    TemplateHarness private harness = new TemplateHarness();

    /// @dev The fixture is SCALE produced by Asset Hub's runtime codec in `packages/routes`.
    function test_fill_reproducesRuntimeEncodedXcm() public view {
        string memory json = vm.readFile("test/fixtures/snowbridge-template.json");
        bytes32 beneficiary = vm.parseJsonBytes32(json, ".beneficiary");

        BoundTemplate memory xcm =
            BoundTemplate(vm.parseJsonBytes(json, ".xcmTemplate"), vm.parseJsonUintArray(json, ".xcmOffsets"));
        BoundTemplate memory claimer =
            BoundTemplate(vm.parseJsonBytes(json, ".claimerTemplate"), vm.parseJsonUintArray(json, ".claimerOffsets"));

        harness.validate(xcm);
        harness.validate(claimer);
        assertEq(harness.fill(xcm, beneficiary), vm.parseJsonBytes(json, ".xcmFilled"));
        assertEq(harness.fill(claimer, beneficiary), vm.parseJsonBytes(json, ".claimerFilled"));
    }

    function testFuzz_fill_changesOnlyTheSlots(bytes memory head, bytes memory middle, bytes memory tail, bytes32 who)
        public
        view
    {
        vm.assume(who != PLACEHOLDER);
        BoundTemplate memory template;
        template.data = bytes.concat(head, PLACEHOLDER, middle, PLACEHOLDER, tail);
        template.offsets = new uint256[](2);
        template.offsets[0] = head.length;
        template.offsets[1] = head.length + 32 + middle.length;

        assertEq(harness.fill(template, who), bytes.concat(head, who, middle, who, tail));
    }

    function test_fill_slotAtTheVeryEnd() public view {
        BoundTemplate memory template = _single(bytes.concat(hex"0102", PLACEHOLDER), 2);
        harness.validate(template);
        assertEq(harness.fill(template, bytes32(uint256(7))), bytes.concat(hex"0102", bytes32(uint256(7))));
    }

    function test_validate_rejectsTemplateWithoutSlots() public {
        BoundTemplate memory template;
        template.data = hex"05040d01";
        vm.expectRevert(BeneficiaryTemplate.NoBeneficiarySlot.selector);
        harness.validate(template);
    }

    function test_validate_rejectsSlotPastTheEnd() public {
        BoundTemplate memory template = _single(bytes.concat(hex"00", PLACEHOLDER), 2);
        vm.expectRevert(abi.encodeWithSelector(BeneficiaryTemplate.SlotOutOfBounds.selector, 2));
        harness.validate(template);
    }

    function test_validate_rejectsSlotThatIsNotThePlaceholder() public {
        BoundTemplate memory template = _single(bytes.concat(hex"0000", PLACEHOLDER), 1);
        vm.expectRevert(abi.encodeWithSelector(BeneficiaryTemplate.SlotNotPlaceholder.selector, 1));
        harness.validate(template);
    }

    /// @dev A placeholder left out of `offsets` would reach the bridge unfilled and strand the funds.
    function test_validate_rejectsPlaceholderMissingFromOffsets() public {
        BoundTemplate memory template = _single(bytes.concat(PLACEHOLDER, hex"ff", PLACEHOLDER), 0);
        vm.expectRevert(abi.encodeWithSelector(BeneficiaryTemplate.UnlistedPlaceholder.selector, 33));
        harness.validate(template);
    }

    function _single(bytes memory data, uint256 offset) private pure returns (BoundTemplate memory template) {
        template.data = data;
        template.offsets = new uint256[](1);
        template.offsets[0] = offset;
    }
}
