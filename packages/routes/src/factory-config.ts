import {
  BASE_SEPOLIA_USDC,
  MAINNET_USDT,
  SEPOLIA_USDC,
  factoryOwner,
  readDeployment,
  relayerAccount,
  snowbridgeGateway,
} from "@onramp/chains";
import { chainRoutes, type FactoryConfig } from "@onramp/contracts";
import type { Address } from "viem";
import { baseSepolia, mainnet, sepolia } from "viem/chains";

import { snowbridgeTemplates, type SnowbridgeTemplates } from "./snowbridge/xcm";
import { xcmCodec } from "./xcm-codec";

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
export function factoryConfig(
  owner: Address,
  relayer: Address,
  bridges: RouteBridges,
  snowbridge: SnowbridgeTemplates,
): FactoryConfig {
  return {
    owner,
    relayer,
    chains: [
      chainRoutes(sepolia.id, { basejump: { bridge: bridges.basejumpEmitter, token: SEPOLIA_USDC } }),
      chainRoutes(baseSepolia.id, { psm: { bridge: bridges.psmVault, token: BASE_SEPOLIA_USDC } }),
      chainRoutes(mainnet.id, {
        snowbridge: { bridge: snowbridgeGateway(), token: MAINNET_USDT },
        snowbridgeXcm: snowbridge.xcm,
        snowbridgeClaimer: snowbridge.claimer,
      }),
    ],
  };
}

/** The factory configuration over the bridges recorded in `deployments/`, for the accounts in the environment. */
export async function recordedFactoryConfig(): Promise<FactoryConfig> {
  const bridges = {
    basejumpEmitter: readDeployment("sepolia").basejumpEmitter,
    psmVault: readDeployment("base-sepolia").psmVault,
  };
  return factoryConfig(factoryOwner(), relayerAccount().address, bridges, snowbridgeTemplates(await xcmCodec()));
}
