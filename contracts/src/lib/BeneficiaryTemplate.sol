// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @dev SCALE-encoded bytes with a 32-byte placeholder wherever the beneficiary account belongs.
struct BoundTemplate {
    bytes data;
    uint256[] offsets;
}

/// @title BeneficiaryTemplate
/// @notice Binds a forwarder's beneficiary into pre-encoded XCM, so the relayer never supplies XCM bytes.
library BeneficiaryTemplate {
    bytes32 internal constant PLACEHOLDER = 0xbebebebebebebebebebebebebebebebebebebebebebebebebebebebebebebebe;

    error NoBeneficiarySlot();
    error SlotOutOfBounds(uint256 offset);
    error SlotNotPlaceholder(uint256 offset);
    error UnlistedPlaceholder(uint256 offset);

    /// @dev A valid template names at least one slot, and its slots are exactly the placeholder's occurrences.
    function validate(BoundTemplate memory template) internal pure {
        uint256 slots = template.offsets.length;
        if (slots == 0) revert NoBeneficiarySlot();

        uint256 length = template.data.length;
        for (uint256 i; i < slots; ++i) {
            uint256 offset = template.offsets[i];
            if (offset + 32 > length) revert SlotOutOfBounds(offset);
            if (_wordAt(template.data, offset) != PLACEHOLDER) revert SlotNotPlaceholder(offset);
        }

        for (uint256 offset = 0; offset + 32 <= length; ++offset) {
            if (_wordAt(template.data, offset) == PLACEHOLDER && !_contains(template.offsets, offset)) {
                revert UnlistedPlaceholder(offset);
            }
        }
    }

    /// @dev Expects a validated template; returns a copy with `beneficiary` written into every slot.
    function fill(BoundTemplate memory template, bytes32 beneficiary) internal pure returns (bytes memory filled) {
        filled = bytes.concat(template.data);
        uint256 slots = template.offsets.length;
        for (uint256 i; i < slots; ++i) {
            uint256 offset = template.offsets[i];
            assembly ("memory-safe") {
                mstore(add(add(filled, 32), offset), beneficiary)
            }
        }
    }

    function _wordAt(bytes memory data, uint256 offset) private pure returns (bytes32 word) {
        assembly ("memory-safe") {
            word := mload(add(add(data, 32), offset))
        }
    }

    function _contains(uint256[] memory values, uint256 value) private pure returns (bool) {
        for (uint256 i; i < values.length; ++i) {
            if (values[i] == value) return true;
        }
        return false;
    }
}
