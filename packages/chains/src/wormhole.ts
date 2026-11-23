import { parseAbi, toHex, type Address, type Hex } from "viem";

import { endpoints } from "./endpoints";
import type { EvmChainKey } from "./evm";

export interface WormholeDeployment {
  /** Wormhole's own chain id, not the EVM chain id. */
  chainId: number;
  core: Address;
}

export const WORMHOLE_TESTNET: Record<Extract<EvmChainKey, "sepolia" | "baseSepolia">, WormholeDeployment> = {
  sepolia: { chainId: 10002, core: "0x4a8bc80Ed5a4067f1CCf107057b8270E0cC11A78" },
  baseSepolia: { chainId: 10004, core: "0x79A1027a6A159502049F10906D333EC57E95F083" },
};

export const HYDRATION_WORMHOLE_CHAIN_ID = 73;

export const wormholeCoreAbi = parseAbi([
  "struct GuardianSet { address[] keys; uint32 expirationTime; }",
  "struct Signature { bytes32 r; bytes32 s; uint8 v; uint8 guardianIndex; }",
  "struct VM { uint8 version; uint32 timestamp; uint32 nonce; uint16 emitterChainId; bytes32 emitterAddress; uint64 sequence; uint8 consistencyLevel; bytes payload; uint32 guardianSetIndex; Signature[] signatures; bytes32 hash; }",
  "function chainId() view returns (uint16)",
  "function evmChainId() view returns (uint256)",
  "function governanceChainId() view returns (uint16)",
  "function governanceContract() view returns (bytes32)",
  "function messageFee() view returns (uint256)",
  "function getCurrentGuardianSetIndex() view returns (uint32)",
  "function getGuardianSet(uint32 index) view returns (GuardianSet)",
  "function parseAndVerifyVM(bytes encodedVM) view returns (VM vm, bool valid, string reason)",
]);

/** `Setup.setup`, the initializer the core proxy is constructed with. */
export const wormholeSetupAbi = parseAbi([
  "function setup(address implementation, address[] initialGuardians, uint16 chainId, uint16 governanceChainId, bytes32 governanceContract, uint256 evmChainId)",
]);

export interface SignedVaa {
  id: string;
  timestamp: Date;
  guardianSetIndex: number;
  bytes: Hex;
}

/** Most recent guardian-signed VAA emitted from `chainId`, as indexed by Wormholescan. */
export async function latestSignedVaa(chainId: number): Promise<SignedVaa | undefined> {
  const response = await fetch(`${endpoints.wormholescanApi}/api/v1/vaas/${chainId}?pageSize=1`);
  if (!response.ok) throw new Error(`Wormholescan responded ${response.status}`);
  const body = (await response.json()) as {
    data?: { id: string; timestamp: string; guardianSetIndex: number; vaa: string }[];
  };
  const vaa = body.data?.[0];
  return (
    vaa && {
      id: vaa.id,
      timestamp: new Date(vaa.timestamp),
      guardianSetIndex: vaa.guardianSetIndex,
      bytes: toHex(Buffer.from(vaa.vaa, "base64")),
    }
  );
}
