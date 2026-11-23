import { zeroAddress, type Address, type Hex } from "viem";

/** Mirrors the Solidity `BoundTemplate` struct. */
export interface BoundTemplate {
  data: Hex;
  offsets: bigint[];
}

/** Mirrors the Solidity `RouteConfig` struct; a zero bridge means the route does not exist on that chain. */
export interface RouteConfig {
  bridge: Address;
  token: Address;
}

/** Mirrors the Solidity `ChainRoutes` struct. */
export interface ChainRoutes {
  chainId: bigint;
  basejump: RouteConfig;
  psm: RouteConfig;
  snowbridge: RouteConfig;
  snowbridgeXcm: BoundTemplate;
  snowbridgeClaimer: BoundTemplate;
}

/** Constructor arguments of the factory; together with its creation code they determine its address. */
export interface FactoryConfig {
  owner: Address;
  relayer: Address;
  chains: ChainRoutes[];
}

const NO_ROUTE: RouteConfig = { bridge: zeroAddress, token: zeroAddress };
const NO_TEMPLATE: BoundTemplate = { data: "0x", offsets: [] };

export function chainRoutes(chainId: number, routes: Partial<Omit<ChainRoutes, "chainId">>): ChainRoutes {
  return {
    chainId: BigInt(chainId),
    basejump: NO_ROUTE,
    psm: NO_ROUTE,
    snowbridge: NO_ROUTE,
    snowbridgeXcm: NO_TEMPLATE,
    snowbridgeClaimer: NO_TEMPLATE,
    ...routes,
  };
}
