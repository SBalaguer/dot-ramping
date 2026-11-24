import { Route, isRouteAllowed } from "@onramp/keys";

/**
 * Large deposits go through Snowbridge, small ones through a Wormhole route (stables count as one dollar).
 * A deposit can only take a route its forwarder was created with, so a large one falls back to Wormhole
 * where Snowbridge is not bound into the address. Small deposits never take Snowbridge: its fee is flat.
 */
export function chooseRoute(amount: bigint, decimals: number, routeMask: number, thresholdUsd: number): Route {
  const large = amount >= BigInt(thresholdUsd) * 10n ** BigInt(decimals);
  const wormhole = [Route.Basejump, Route.Psm];
  const route = (large ? [Route.Snowbridge, ...wormhole] : wormhole).find((candidate) =>
    isRouteAllowed(routeMask, candidate),
  );
  if (route === undefined) throw new Error(`route mask ${routeMask} allows no route for this deposit`);
  return route;
}
