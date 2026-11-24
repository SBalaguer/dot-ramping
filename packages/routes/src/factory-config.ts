import { SEPOLIA_USDC } from "@onramp/chains";
import { chainRoutes, type FactoryConfig } from "@onramp/contracts";
import type { Address } from "viem";
import { sepolia } from "viem/chains";

export interface RouteBridges {
  /** Our Basejump emitter on Sepolia. */
  basejumpEmitter: Address;
}

/**
 * Constructor arguments of the current factory. Every chain deploys it with these same arguments, so the
 * factory and each deposit address are the same everywhere; changing anything here moves them all.
 */
export function factoryConfig(owner: Address, relayer: Address, bridges: RouteBridges): FactoryConfig {
  return {
    owner,
    relayer,
    chains: [chainRoutes(sepolia.id, { basejump: { bridge: bridges.basejumpEmitter, token: SEPOLIA_USDC } })],
  };
}
