import {
  createPublicClient,
  createWalletClient,
  http,
  type Account,
  type Address,
  type Chain,
  type PublicClient,
  type Transport,
  type WalletClient,
} from "viem";
import { baseSepolia, mainnet, sepolia } from "viem/chains";

import { endpoints, hydrationForkEvmRpc } from "./endpoints";
import { hydration } from "./hydration";

/** Arachnid's deterministic deployment proxy; gives our factory one address on every chain. */
export const CREATE2_DEPLOYER: Address = "0x4e59b44847b379578588920cA78FbF26c0B4956C";

export type EvmChainKey = "sepolia" | "baseSepolia" | "ethereumFork" | "hydrationFork";

const CHAINS = {
  sepolia: { chain: sepolia, rpc: endpoints.sepoliaRpc },
  baseSepolia: { chain: baseSepolia, rpc: endpoints.baseSepoliaRpc },
  ethereumFork: { chain: mainnet, rpc: endpoints.ethForkRpc },
  hydrationFork: { chain: hydration, rpc: hydrationForkEvmRpc },
} as const;

export function publicClient(key: EvmChainKey): PublicClient {
  const { chain, rpc } = CHAINS[key];
  return createPublicClient({ chain, transport: http(rpc) }) as PublicClient;
}

export function walletClient(key: EvmChainKey, account: Account): WalletClient<Transport, Chain, Account> {
  const { chain, rpc } = CHAINS[key];
  return createWalletClient({ account, chain, transport: http(rpc) });
}
