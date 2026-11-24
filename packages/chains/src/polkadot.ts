import { hub, hydration } from "@galacticcouncil/descriptors";
import { createClient, type PolkadotClient, type TypedApi } from "polkadot-api";
import { getWsProvider } from "polkadot-api/ws";

import { endpoints } from "./endpoints";

export type HydrationApi = TypedApi<typeof hydration>;
export type AssetHubApi = TypedApi<typeof hub>;

export const ASSET_HUB_PARA_ID = 1000;
export const ASSET_HUB_ASSETS_PALLET = 50;
export const ASSET_HUB_USDT = 1984;

export interface PolkadotChain<Api> {
  client: PolkadotClient;
  api: Api;
}

export function connectHydration(url: string = endpoints.hydrationForkWs): PolkadotChain<HydrationApi> {
  const client = createClient(getWsProvider(url));
  return { client, api: client.getTypedApi(hydration) };
}

export function connectAssetHub(url: string = endpoints.assetHubForkWs): PolkadotChain<AssetHubApi> {
  const client = createClient(getWsProvider(url));
  return { client, api: client.getTypedApi(hub) };
}
