// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";

import {DepositForwarderFactory} from "../src/DepositForwarderFactory.sol";
import {Params, Route} from "../src/ForwarderTypes.sol";
import {BeneficiaryTemplate, BoundTemplate} from "../src/lib/BeneficiaryTemplate.sol";
import {MockBasejumpEmitter} from "./mocks/MockBasejumpEmitter.sol";
import {MockERC20} from "./mocks/MockERC20.sol";
import {MockGateway} from "./mocks/MockGateway.sol";
import {MockPsmVault} from "./mocks/MockPsmVault.sol";
import {MockTether} from "./mocks/MockTether.sol";

/// @dev A factory with all three routes configured against mock bridges, shared by the test suites.
abstract contract ForwarderFixture is Test {
    uint8 internal constant ALL_ROUTES = 7;
    uint256 internal constant PSM_MESSAGE_FEE = 0.001 ether;
    bytes32 internal constant BENEFICIARY = 0xd43593c715fdd31c61141abd04a99fd6822c8558854ccde39a5684e7a56da27d;

    address internal owner = makeAddr("owner");
    address internal relayer = makeAddr("relayer");
    address internal refundAddress = makeAddr("refund");
    address internal stranger = makeAddr("stranger");

    DepositForwarderFactory internal factory;
    MockERC20 internal usdc;
    MockTether internal usdt;
    MockBasejumpEmitter internal emitter;
    MockPsmVault internal vault;
    MockGateway internal gateway;

    function setUp() public virtual {
        factory = new DepositForwarderFactory(owner);
        usdc = new MockERC20("USDC");
        usdt = new MockTether();
        emitter = new MockBasejumpEmitter();
        vault = new MockPsmVault(usdc, PSM_MESSAGE_FEE);
        gateway = new MockGateway();

        vm.startPrank(owner);
        factory.setRelayer(relayer);
        factory.configureBasejump(address(emitter), address(usdc));
        factory.configurePsm(address(vault), address(usdc));
        factory.configureSnowbridge(address(gateway), address(usdt), xcmTemplate(), claimerTemplate());
        vm.stopPrank();

        vm.deal(relayer, 10 ether);
    }

    function defaultParams() internal view returns (Params memory) {
        return Params({
            id: keccak256("top-up"),
            entropy: keccak256("entropy"),
            beneficiary: BENEFICIARY,
            refund: refundAddress,
            routeMask: ALL_ROUTES
        });
    }

    /// @dev `05 04 0d 01 00 00 01 01 00 <account>`: XCM v5 `[DepositAsset { Wild(All), AccountId32 }]`.
    function xcmTemplate() internal pure returns (BoundTemplate memory) {
        return _template(bytes.concat(hex"05040d010000010100", BeneficiaryTemplate.PLACEHOLDER), 9);
    }

    /// @dev `00 01 01 00 <account>`: XCM v5 location `{ parents: 0, X1(AccountId32) }`.
    function claimerTemplate() internal pure returns (BoundTemplate memory) {
        return _template(bytes.concat(hex"00010100", BeneficiaryTemplate.PLACEHOLDER), 4);
    }

    function _template(bytes memory data, uint256 offset) private pure returns (BoundTemplate memory template) {
        template.data = data;
        template.offsets = new uint256[](1);
        template.offsets[0] = offset;
    }
}
