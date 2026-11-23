import { parseAbi } from "viem";

const structs = [
  "struct Params { bytes32 id; bytes32 entropy; bytes32 beneficiary; address refund; uint8 routeMask; }",
  "struct BoundTemplate { bytes data; uint256[] offsets; }",
] as const;

export const factoryAbi = parseAbi([
  ...structs,
  "constructor(address owner_)",
  "function implementation() view returns (address)",
  "function relayer() view returns (address)",
  "function saltOf(Params params) pure returns (bytes32)",
  "function predict(Params params) view returns (address)",
  "function routeConfig(uint8 route) view returns (address bridge, address token)",
  "function deployAndForward(Params params, uint8 route, bytes routeArgs) payable returns (address forwarder)",
  "function forward(Params params, uint8 route, bytes routeArgs) payable",
  "function refund(Params params, address token)",
  "function setRelayer(address relayer_)",
  "function configureBasejump(address emitter, address token)",
  "function configurePsm(address vault, address token)",
  "function configureSnowbridge(address gateway, address token, BoundTemplate xcm, BoundTemplate claimer)",
  "event ForwarderDeployed(address indexed forwarder, bytes32 indexed id, bytes32 indexed beneficiary)",
  "event RouteConfigured(uint8 indexed route, address bridge, address token)",
  "error OnlyRelayer()",
  "error OnlyRelayerOrRefundAddress()",
  "error RouteAlreadyConfigured(uint8 route)",
]);

export const forwarderAbi = parseAbi([
  "function paramsHash() view returns (bytes32)",
  "error ParamsMismatch()",
  "error RouteNotAllowed(uint8 route)",
  "error RouteNotConfigured(uint8 route)",
  "error NothingToForward()",
  "error FeesExceedValue(uint256 fees, uint256 value)",
  "event Forwarded(uint8 indexed route, address indexed token, uint256 amount)",
  "event Refunded(address indexed token, address indexed to, uint256 amount)",
]);
