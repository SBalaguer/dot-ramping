import {
  BASE_SEPOLIA_USDC,
  MAINNET_USDT,
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
import { xcmCodec, type XcmCodec } from "@onramp/routes";
import type { PolkadotClient } from "polkadot-api";
import { isAddressEqual, zeroAddress, type Account, type Address } from "viem";

import type { SourceChain } from "./api-types";

export type { SourceChain } from "./api-types";

/** A chain deposits arrive on: the relayer's account there, the stablecoin watched and the routes the factory has. */
export interface Source {
  by: Actor;
  /** For display. */
  name: string;
  token: Address;
  symbol: string;
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
  /** Raw access to the Asset Hub fork, for the simulated relay hop. */
  assetHubClient: PolkadotClient;
  codec: XcmCodec;
  deployed: Deployments["hydration-fork"];
  thresholdUsd: number;
}

const STABLECOIN_DECIMALS = 6;
const SOURCES: Record<SourceChain, Pick<Source, "name" | "token" | "symbol">> = {
  sepolia: { name: "Sepolia", token: SEPOLIA_USDC, symbol: "USDC" },
  baseSepolia: { name: "Base Sepolia", token: BASE_SEPOLIA_USDC, symbol: "USDC" },
  ethereumFork: { name: "Ethereum (mainnet fork)", token: MAINNET_USDT, symbol: "USDT" },
};

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

async function source(chain: SourceChain, relayer: Account, factory: Address): Promise<Source> {
  const by = actor(chain, relayer);
  if (!(await by.reader.getCode({ address: factory }))) throw new Error(`no factory at ${factory} on ${chain}`);
  return { by, ...SOURCES[chain], decimals: STABLECOIN_DECIMALS, routes: await configuredRoutes(by, factory) };
}

export async function connect(thresholdUsd: number): Promise<{ context: Context; disconnect: () => void }> {
  const relayer = relayerAccount();
  const { factory } = readDeployment("sepolia");
  if (!isAddressEqual(factory, readDeployment("base-sepolia").factory)) {
    throw new Error("the factory address differs between Sepolia and Base Sepolia; deposit addresses would too");
  }
  const hydration = connectHydration();
  const assetHub = connectAssetHub();
  const [sepolia, baseSepolia, ethereumFork, codec] = await Promise.all([
    source("sepolia", relayer, factory),
    source("baseSepolia", relayer, factory),
    source("ethereumFork", relayer, factory),
    xcmCodec(),
  ]);

  return {
    context: {
      sources: { sepolia, baseSepolia, ethereumFork },
      factory,
      hydrationEvm: actor("hydrationFork", relayer),
      hydration: hydration.api,
      assetHub: assetHub.api,
      assetHubClient: assetHub.client,
      codec,
      deployed: readDeployment("hydration-fork"),
      thresholdUsd,
    },
    disconnect: () => {
      hydration.client.destroy();
      assetHub.client.destroy();
    },
  };
}
