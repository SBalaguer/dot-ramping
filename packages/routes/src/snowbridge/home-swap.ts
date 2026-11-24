import { HYDRATION_ASSET, HYDRATION_USDT_SB_POOL } from "@onramp/chains";
import { Enum } from "polkadot-api";

import type { HomeSwap } from "../home/swap-home";

const { usdtSb, aUsdt, usdt } = HYDRATION_ASSET;

/**
 * Bridged USDT to USDT at about par: into aUSDT through the stableswap pool the two share, then out of the
 * money market. Hydration stores no route for this pair, so the top-up's transaction names the pools.
 */
export const usdtSbHomeSwap: HomeSwap = {
  assetIn: usdtSb,
  route: [
    { pool: Enum("Stableswap", HYDRATION_USDT_SB_POOL), asset_in: usdtSb, asset_out: aUsdt },
    { pool: Enum("Aave"), asset_in: aUsdt, asset_out: usdt },
  ],
};
