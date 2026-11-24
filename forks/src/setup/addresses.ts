import { getContractAddress, type Address } from "viem";

/**
 * Contracts the operator creates on a fresh Hydration fork, in order. Its nonce starts at 0 at the pinned
 * block, so the order fixes every address, and the Sepolia side can point at the landing before a fork runs.
 * Append only: inserting an entry moves every address after it.
 */
const CREATION_ORDER = [
  "wormholeImplementation",
  "wormholeSetup",
  "wormholeCore",
  "basejumpLandingImplementation",
  "basejumpLanding",
  "basejumpReceiverImplementation",
  "basejumpReceiver",
] as const;

export type ForkContract = (typeof CREATION_ORDER)[number];

export function forkContracts(operator: Address): Record<ForkContract, Address> {
  const entries = CREATION_ORDER.map((name, nonce) => [
    name,
    getContractAddress({ from: operator, nonce: BigInt(nonce) }),
  ]);
  return Object.fromEntries(entries) as Record<ForkContract, Address>;
}
