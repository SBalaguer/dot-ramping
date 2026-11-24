import { SEPOLIA_USDC } from "@onramp/chains";
import { Route } from "@onramp/keys";
import { erc20Abi } from "viem";

import type { Context } from "../context";
import type { StepDefinition } from "../pipeline";
import { chooseRoute } from "../routing";

const USDC_DECIMALS = 6;
const ROUTE_NAMES: Record<Route, string> = {
  [Route.Snowbridge]: "snowbridge",
  [Route.Basejump]: "basejump",
  [Route.Psm]: "psm",
};

/** The deposit is whatever USDC sits at the forwarder address; its size picks the route. */
export const depositDetected: StepDefinition<Context> = {
  name: "DEPOSIT_DETECTED",
  chain: "sepolia",
  async run({ sepolia, thresholdUsd }, topUp) {
    const amount = await sepolia.reader.readContract({
      address: SEPOLIA_USDC,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [topUp.forwarder],
    });
    if (amount === 0n) return { waiting: "no deposit at the forwarder address yet" };
    const route = chooseRoute(amount, USDC_DECIMALS, topUp.routeMask, thresholdUsd);
    return { done: { token: SEPOLIA_USDC, amount: amount.toString(), route: ROUTE_NAMES[route] } };
  },
};
