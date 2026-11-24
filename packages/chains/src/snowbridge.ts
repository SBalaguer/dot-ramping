import { bridgeInfoFor } from "@snowbridge/registry";
import { getAddress, parseAbi, type Address } from "viem";
import { mainnet } from "viem/chains";

export const BRIDGE_HUB_PARA_ID = 1002;

/** Bridge Hub's inbound queue V2 pallet, the origin Asset Hub sees on every message from Ethereum. */
export const SNOWBRIDGE_INBOUND_QUEUE_PALLET = 91;

export const SNOWBRIDGE_ETHEREUM_CHAIN_ID = BigInt(mainnet.id);

export function snowbridgeGateway(): Address {
  return getAddress(bridgeInfoFor("polkadot_mainnet").environment.gatewayContract);
}

export const gatewayAbi = parseAbi([
  "struct Asset { uint8 kind; bytes data; }",
  "struct Xcm { uint8 kind; bytes data; }",
  "struct Payload { address origin; Asset[] assets; Xcm xcm; bytes claimer; uint128 value; uint128 executionFee; uint128 relayerFee; }",
  "event OutboundMessageAccepted(uint64 nonce, Payload payload)",
  "function operatingMode() view returns (uint8)",
  "function v2_outboundNonce() view returns (uint64)",
  "function isTokenRegistered(address token) view returns (bool)",
]);

/** `OperatingMode.Normal` in Snowbridge's `Types.sol`; any other value rejects outbound messages. */
export const GATEWAY_MODE_NORMAL = 0;
