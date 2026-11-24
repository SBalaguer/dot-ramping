import { HYDRATION_ASSET } from "@onramp/chains";
import { Route, isRouteAllowed } from "@onramp/keys";
import { usdtOnAssetHub } from "@onramp/routes";
import { erc20Abi, parseUnits } from "viem";

import type { Balance, ConfigView, RouteName, RoutePreview, SourceChain } from "./api-types";
import type { Context } from "./context";
import { chooseRoute } from "./routing";
import type { TopUp } from "./topup";

export const ROUTE_NAMES: Record<Route, RouteName> = {
  [Route.Snowbridge]: "snowbridge",
  [Route.Basejump]: "basejump",
  [Route.Psm]: "psm",
};

type SourceEntry = [SourceChain, Context["sources"][SourceChain]];
const sourcesOf = ({ sources }: Context): SourceEntry[] => Object.entries(sources) as SourceEntry[];

const HYDRATION_HOLDINGS = [
  { id: HYDRATION_ASSET.wormholeUsdc, asset: "USDC (Wormhole)", decimals: 6 },
  { id: HYDRATION_ASSET.hollar, asset: "HOLLAR", decimals: 18 },
  { id: HYDRATION_ASSET.usdtSb, asset: "USDT (Snowbridge)", decimals: 6 },
  { id: HYDRATION_ASSET.usdt, asset: "USDT", decimals: 6 },
] as const;

export function configOf(context: Context, demoDeposits: boolean): ConfigView {
  return {
    relayer: context.hydrationEvm.wallet.account.address,
    factory: context.factory,
    thresholdUsd: context.thresholdUsd,
    sources: sourcesOf(context).map(([chain, { name, token, symbol, decimals, routes }]) => ({
      chain,
      name,
      token,
      symbol,
      decimals,
      routes: Object.values(Route)
        .filter((route) => isRouteAllowed(routes, route))
        .map((route) => ROUTE_NAMES[route]),
    })),
    demoDeposits,
  };
}

/** Uses the relayer's own routing rule, so what a client shows is what a deposit will get. */
export function previewRoutes(context: Context, amount: string): RoutePreview {
  const preview = {} as RoutePreview;
  for (const [chain, { decimals, routes }] of sourcesOf(context)) {
    try {
      preview[chain] = ROUTE_NAMES[chooseRoute(parseUnits(amount, decimals), decimals, routes, context.thresholdUsd)];
    } catch {
      preview[chain] = null;
    }
  }
  return preview;
}

/** Where a top-up's money is right now: at its deposit address, in its account on Hydration, or home. */
export async function balancesOf(context: Context, topUp: TopUp): Promise<Balance[]> {
  const account = topUp.beneficiary.ss58;
  const [atSources, onHydration, home] = await Promise.all([
    Promise.all(
      sourcesOf(context).map(async ([chain, { by, token, symbol, decimals }]): Promise<Balance> => {
        const amount = await by.reader.readContract({
          address: token,
          abi: erc20Abi,
          functionName: "balanceOf",
          args: [topUp.forwarder],
        });
        return { chain, holder: "deposit address", asset: symbol, decimals, amount: amount.toString() };
      }),
    ),
    Promise.all(
      HYDRATION_HOLDINGS.map(async ({ id, asset, decimals }): Promise<Balance> => {
        const amount = await context.hydration.apis.CurrenciesApi.free_balance(id, account, { at: "best" });
        return { chain: "hydration", holder: "top-up account", asset, decimals, amount: amount.toString() };
      }),
    ),
    usdtOnAssetHub(context.assetHub, account),
  ]);
  return [
    ...atSources,
    ...onHydration,
    { chain: "asset-hub", holder: "top-up account", asset: "USDT", decimals: 6, amount: home.toString() },
  ];
}
