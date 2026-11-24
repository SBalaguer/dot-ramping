import { BASE_SEPOLIA_USDC, SEPOLIA_USDC } from "@onramp/chains";
import { chainRoutes, type FactoryConfig } from "@onramp/contracts";
import type { Address } from "viem";
import { baseSepolia, sepolia } from "viem/chains";

export interface RouteBridges {
  /** Our Basejump emitter on Sepolia. */
  basejumpEmitter: Address;
  /** Our HOLLAR PSM vault on Base Sepolia. */
  psmVault: Address;
}

/**
 * Constructor arguments of the current factory. Every chain deploys it with these same arguments, so the
 * factory and each deposit address are the same everywhere; changing anything here moves them all.
 */
export function factoryConfig(owner: Address, relayer: Address, bridges: RouteBridges): FactoryConfig {
  return {
    owner,
    relayer,
    chains: [
      chainRoutes(sepolia.id, { basejump: { bridge: bridges.basejumpEmitter, token: SEPOLIA_USDC } }),
      chainRoutes(baseSepolia.id, { psm: { bridge: bridges.psmVault, token: BASE_SEPOLIA_USDC } }),
    ],
  };
}
