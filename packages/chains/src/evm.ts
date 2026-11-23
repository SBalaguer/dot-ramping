import { createPublicClient, http, type Address, type PublicClient } from "viem";
import { baseSepolia, mainnet, sepolia } from "viem/chains";

import { endpoints } from "./endpoints";

/** Arachnid's deterministic deployment proxy; gives our factory one address on every chain. */
export const CREATE2_DEPLOYER: Address = "0x4e59b44847b379578588920cA78FbF26c0B4956C";

export const MAINNET_USDT: Address = "0xdAC17F958D2ee523a2206206994597C13D831ec7";

export type EvmChainKey = "sepolia" | "baseSepolia" | "ethereumFork";

const CHAINS = {
  sepolia: { chain: sepolia, rpc: endpoints.sepoliaRpc },
  baseSepolia: { chain: baseSepolia, rpc: endpoints.baseSepoliaRpc },
  ethereumFork: { chain: mainnet, rpc: endpoints.ethForkRpc },
} as const;

export function publicClient(key: EvmChainKey): PublicClient {
  const { chain, rpc } = CHAINS[key];
  return createPublicClient({ chain, transport: http(rpc) }) as PublicClient;
}
