import { HYDRATION_ASSET } from "@onramp/chains";
import { ensureFeeCurrency, swapAndSendHome, usdtOnAssetHub, type HomeSwap } from "@onramp/routes";

import type { Context } from "../context";
import type { Outcome, StepDefinition } from "../pipeline";
import { accountOf } from "../secrets";

/** The Polkadot leg, the same for every route up to the asset the bridge paid out on Hydration. */
export function homeSteps(swap: HomeSwap): StepDefinition<Context>[] {
  return [
    {
      name: "FEE_ASSET_SET",
      chain: "hydration",
      async run({ hydration }, topUp) {
        await ensureFeeCurrency(hydration, accountOf(topUp), swap.assetIn);
        return { done: { feeAsset: String(swap.assetIn) } };
      },
    },
    {
      name: "SWAPPED_AND_SENT",
      chain: "hydration",
      async run({ hydration }, topUp): Promise<Outcome> {
        const account = accountOf(topUp);
        const held = await hydration.apis.CurrenciesApi.free_balance(swap.assetIn, account.address, { at: "best" });
        if (held === 0n) return { done: { note: `nothing of asset ${swap.assetIn} left to swap` } };

        const home = await swapAndSendHome(hydration, account, swap);
        return {
          done: {
            tx: home.txHash,
            block: String(home.blockNumber),
            blockHash: home.blockHash,
            fee: home.fee.toString(),
            sold: home.sold.toString(),
            bought: home.bought.toString(),
            sentHome: home.sentHome.toString(),
            assetIn: String(swap.assetIn),
            assetOut: String(HYDRATION_ASSET.usdt),
          },
        };
      },
    },
    {
      name: "COMPLETED",
      chain: "asset-hub",
      async run({ assetHub }, topUp) {
        const received = await usdtOnAssetHub(assetHub, topUp.beneficiary.ss58);
        if (received === 0n) return { waiting: "the transfer has not reached Asset Hub yet" };
        return { done: { received: received.toString() } };
      },
    },
  ];
}
