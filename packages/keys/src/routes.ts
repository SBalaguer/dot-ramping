/** Bridges a forwarder may use; the numeric value is the route's bit index in `routeMask` and its Solidity enum value. */
export const Route = { Snowbridge: 0, Basejump: 1, Psm: 2 } as const;
export type Route = (typeof Route)[keyof typeof Route];

export function routeMask(...routes: Route[]): number {
  return routes.reduce<number>((mask, route) => mask | (1 << route), 0);
}

export function isRouteAllowed(mask: number, route: Route): boolean {
  return (mask & (1 << route)) !== 0;
}
