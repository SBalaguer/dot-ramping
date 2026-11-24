import { getContractAddress, type Address } from "viem";

/**
 * The operator's nonce when it creates each fork-side contract. Its nonce is 0 at the pinned block and every
 * setup transaction, creation or not, uses one, so the setup sequence fixes every address; the testnet side
 * can then point at the fork's contracts before a fork runs. Setup steps may only be appended: inserting one
 * moves every later address, and `setUpHydrationFork` refuses to finish when an address is not the planned one.
 */
const CREATION_NONCE = {
  wormholeCore: 2,
  basejumpLanding: 4,
  basejumpReceiver: 6,
  psmFacilitator: 12,
} as const;

export type ForkContract = keyof typeof CREATION_NONCE;

export function forkContracts(operator: Address): Record<ForkContract, Address> {
  const entries = Object.entries(CREATION_NONCE).map(([name, nonce]) => [
    name,
    getContractAddress({ from: operator, nonce: BigInt(nonce) }),
  ]);
  return Object.fromEntries(entries) as Record<ForkContract, Address>;
}
