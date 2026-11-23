import { parseAbi } from "viem";

const structs = [
  "struct Params { bytes32 id; bytes32 entropy; bytes32 beneficiary; address refund; uint8 routeMask; }",
  "struct BoundTemplate { bytes data; uint256[] offsets; }",
  "struct RouteConfig { address bridge; address token; }",
  "struct ChainRoutes { uint256 chainId; RouteConfig basejump; RouteConfig psm; RouteConfig snowbridge; BoundTemplate snowbridgeXcm; BoundTemplate snowbridgeClaimer; }",
] as const;

export const factoryAbi = parseAbi([
  ...structs,
  "constructor(address owner_, address relayer_, ChainRoutes[] chains)",
  "function implementation() view returns (address)",
  "function owner() view returns (address)",
  "function relayer() view returns (address)",
  "function saltOf(Params params) pure returns (bytes32)",
  "function predict(Params params) view returns (address)",
  "function routeConfig(uint8 route) view returns (address bridge, address token)",
  "function snowbridgeTemplates() view returns (BoundTemplate xcm, BoundTemplate claimer)",
  "function deployAndForward(Params params, uint8 route, bytes routeArgs) payable returns (address forwarder)",
  "function forward(Params params, uint8 route, bytes routeArgs) payable",
  "function refund(Params params, address token)",
  "function setRelayer(address relayer_)",
  "event ForwarderDeployed(address indexed forwarder, bytes32 indexed id, bytes32 indexed beneficiary)",
  "event RouteConfigured(uint8 indexed route, address bridge, address token)",
  "event RelayerChanged(address indexed relayer)",
  "error OnlyRelayer()",
  "error OnlyRelayerOrRefundAddress()",
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
