import { Route } from "@onramp/keys";
import { erc20Abi } from "viem";

import type { Context, SourceChain } from "../context";
import type { StepDefinition } from "../pipeline";
import { chooseRoute } from "../routing";

export const ROUTE_NAMES = {
  [Route.Snowbridge]: "snowbridge",
  [Route.Basejump]: "basejump",
  [Route.Psm]: "psm",
} as const;

/**
 * The deposit is whatever stablecoin sits at the forwarder address on any source chain. The chain it arrived
 * on and its size pick the route, among those bound into the address and present on that chain.
 */
export const depositDetected: StepDefinition<Context> = {
  name: "DEPOSIT_DETECTED",
  chain: "source",
  async run({ sources, thresholdUsd }, topUp) {
    for (const [chain, source] of Object.entries(sources) as [SourceChain, Context["sources"][SourceChain]][]) {
      const amount = await source.by.reader.readContract({
        address: source.token,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [topUp.forwarder],
      });
      if (amount === 0n) continue;
      const route = chooseRoute(amount, source.decimals, topUp.routeMask & source.routes, thresholdUsd);
      return { done: { chain, token: source.token, amount: amount.toString(), route: ROUTE_NAMES[route] } };
    }
    return { waiting: "no deposit at the forwarder address yet" };
  },
};
