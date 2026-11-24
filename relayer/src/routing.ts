import { Route, isRouteAllowed } from "@onramp/keys";

/**
 * Large deposits go through Snowbridge, small ones through a Wormhole route (stables count as one dollar).
 * A deposit can only take a route its forwarder was created with and its chain has, so each size falls back
 * to the other kind rather than leave a deposit without a route. Snowbridge's fee is flat, which makes it
 * the last choice for a small deposit.
 */
export function chooseRoute(amount: bigint, decimals: number, routeMask: number, thresholdUsd: number): Route {
  const large = amount >= BigInt(thresholdUsd) * 10n ** BigInt(decimals);
  const wormhole = [Route.Basejump, Route.Psm];
  const preference = large ? [Route.Snowbridge, ...wormhole] : [...wormhole, Route.Snowbridge];
  const route = preference.find((candidate) => isRouteAllowed(routeMask, candidate));
  if (route === undefined) throw new Error(`route mask ${routeMask} allows no route for this deposit`);
  return route;
}
