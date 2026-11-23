import { parseAbi, type Address } from "viem";

import { endpoints } from "./endpoints";
import type { EvmChainKey } from "./evm";

export interface WormholeDeployment {
  /** Wormhole's own chain id, not the EVM chain id. */
  chainId: number;
  core: Address;
}

export const WORMHOLE_TESTNET: Record<Exclude<EvmChainKey, "ethereumFork">, WormholeDeployment> = {
  sepolia: { chainId: 10002, core: "0x4a8bc80Ed5a4067f1CCf107057b8270E0cC11A78" },
  baseSepolia: { chainId: 10004, core: "0x79A1027a6A159502049F10906D333EC57E95F083" },
};

export const HYDRATION_WORMHOLE_CHAIN_ID = 73;

export const wormholeCoreAbi = parseAbi([
  "struct GuardianSet { address[] keys; uint32 expirationTime; }",
  "function chainId() view returns (uint16)",
  "function messageFee() view returns (uint256)",
  "function getCurrentGuardianSetIndex() view returns (uint32)",
  "function getGuardianSet(uint32 index) view returns (GuardianSet)",
]);

export interface SignedVaaSummary {
  id: string;
  timestamp: Date;
  guardianSetIndex: number;
}

/** Most recent guardian-signed VAA emitted from `chainId`, as indexed by Wormholescan. */
export async function latestSignedVaa(chainId: number): Promise<SignedVaaSummary | undefined> {
  const response = await fetch(`${endpoints.wormholescanApi}/api/v1/vaas/${chainId}?pageSize=1`);
  if (!response.ok) throw new Error(`Wormholescan responded ${response.status}`);
  const body = (await response.json()) as {
    data?: { id: string; timestamp: string; guardianSetIndex: number }[];
  };
  const vaa = body.data?.[0];
  return vaa && { id: vaa.id, timestamp: new Date(vaa.timestamp), guardianSetIndex: vaa.guardianSetIndex };
}
