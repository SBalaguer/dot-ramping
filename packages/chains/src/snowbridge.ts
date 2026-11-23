import { bridgeInfoFor } from "@snowbridge/registry";
import { getAddress, parseAbi, type Address } from "viem";

export function snowbridgeGateway(): Address {
  return getAddress(bridgeInfoFor("polkadot_mainnet").environment.gatewayContract);
}

export const gatewayAbi = parseAbi([
  "function operatingMode() view returns (uint8)",
  "function v2_outboundNonce() view returns (uint64)",
  "function isTokenRegistered(address token) view returns (bool)",
]);

/** `OperatingMode.Normal` in Snowbridge's `Types.sol`; any other value rejects outbound messages. */
export const GATEWAY_MODE_NORMAL = 0;
