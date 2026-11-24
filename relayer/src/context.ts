import {
  BASE_SEPOLIA_USDC,
  SEPOLIA_USDC,
  connectAssetHub,
  connectHydration,
  readDeployment,
  relayerAccount,
  type AssetHubApi,
  type Deployments,
  type HydrationApi,
} from "@onramp/chains";
import { actor, factoryAbi, type Actor } from "@onramp/contracts";
import { Route, routeMask } from "@onramp/keys";
import { isAddressEqual, zeroAddress, type Address } from "viem";

export type SourceChain = "sepolia" | "baseSepolia";

/** A chain deposits arrive on: the relayer's account there, the stablecoin watched and the routes the factory has. */
export interface Source {
  by: Actor;
  token: Address;
  decimals: number;
  routes: number;
}

/** Everything a step may touch. */
export interface Context {
  sources: Record<SourceChain, Source>;
  /** The forwarder factory, at the same address on every source chain. */
  factory: Address;
  hydrationEvm: Actor;
  hydration: HydrationApi;
  assetHub: AssetHubApi;
  deployed: Deployments["hydration-fork"];
  thresholdUsd: number;
}

const USDC_DECIMALS = 6;

/** The routes the factory was deployed with on one chain; a deposit there can take no other. */
async function configuredRoutes(by: Actor, factory: Address): Promise<number> {
  const configured = await Promise.all(
    Object.values(Route).map(async (route) => {
      const [bridge] = await by.reader.readContract({
        address: factory,
        abi: factoryAbi,
        functionName: "routeConfig",
        args: [route],
      });
      return bridge === zeroAddress ? [] : [route];
    }),
  );
  return routeMask(...configured.flat());
}

export async function connect(thresholdUsd: number): Promise<{ context: Context; disconnect: () => void }> {
  const relayer = relayerAccount();
  const { factory } = readDeployment("sepolia");
  if (!isAddressEqual(factory, readDeployment("base-sepolia").factory)) {
    throw new Error("the factory address differs between Sepolia and Base Sepolia; deposit addresses would too");
  }
  const sepolia = actor("sepolia", relayer);
  const baseSepolia = actor("baseSepolia", relayer);
  const hydration = connectHydration();
  const assetHub = connectAssetHub();

  return {
    context: {
      sources: {
        sepolia: {
          by: sepolia,
          token: SEPOLIA_USDC,
          decimals: USDC_DECIMALS,
          routes: await configuredRoutes(sepolia, factory),
        },
        baseSepolia: {
          by: baseSepolia,
          token: BASE_SEPOLIA_USDC,
          decimals: USDC_DECIMALS,
          routes: await configuredRoutes(baseSepolia, factory),
        },
      },
      factory,
      hydrationEvm: actor("hydrationFork", relayer),
      hydration: hydration.api,
      assetHub: assetHub.api,
      deployed: readDeployment("hydration-fork"),
      thresholdUsd,
    },
    disconnect: () => {
      hydration.client.destroy();
      assetHub.client.destroy();
    },
  };
}
