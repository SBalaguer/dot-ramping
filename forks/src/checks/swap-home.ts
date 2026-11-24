import { hub, hydration } from "@galacticcouncil/descriptors";
import { HYDRATION_ASSET } from "@onramp/chains";
import { deriveBeneficiary, newTopUpSecrets } from "@onramp/keys";
import { swapAndSendHome, usdtOnAssetHub, usdtToAssetHub } from "@onramp/routes";

import { devAccount } from "../dev-accounts";
import type { PolkadotForks } from "../polkadot";
import { waitFor } from "./wait";

const HDX = 10n ** 12n;
const USDC = 10n ** 6n;
const PAYOUT = 10n * USDC;

/**
 * A new top-up account that is paid Wormhole USDC, as Basejump pays it, turns all of it into USDT on Asset
 * Hub with one transaction of its own: no HDX, no fee-currency setup, nothing left on Hydration. If the
 * transfer half of the batch cannot go through, the swap is undone too and the USDC stays in the account.
 */
export async function checkSwapHome(forks: PolkadotForks): Promise<string> {
  const hydrationApi = forks.hydration.client.getTypedApi(hydration);
  const assetHubApi = forks.assetHub.client.getTypedApi(hub);
  const payer = devAccount("//Alice");
  const account = deriveBeneficiary(newTopUpSecrets());
  const held = (asset: number) => hydrationApi.apis.CurrenciesApi.free_balance(asset, account.address, { at: "best" });
  const { wormholeUsdc, usdt } = HYDRATION_ASSET;

  await forks.hydration.setStorage({
    System: { Account: [[[payer.address], { providers: 1, data: { free: 1000n * HDX } }]] },
    Tokens: { Accounts: [[[payer.address, wormholeUsdc], { free: 100n * USDC }]] },
  });
  const paid = await hydrationApi.tx.Tokens.transfer({
    dest: account.address,
    currency_id: wormholeUsdc,
    amount: PAYOUT,
  }).signAndSubmit(payer.signer);
  if (!paid.ok) throw new Error(`USDC payout failed in Hydration block ${paid.block.hash}`);

  const unaffordable = PAYOUT * 2n;
  const failed = await hydrationApi.tx.Utility.batch_all({
    calls: [
      hydrationApi.tx.Router.sell_all({ asset_in: wormholeUsdc, asset_out: usdt, min_amount_out: 1n, route: [] })
        .decodedCall,
      usdtToAssetHub(hydrationApi, account.accountId, unaffordable).decodedCall,
    ],
  }).signAndSubmit(account.signer);
  const afterFailure = await held(wormholeUsdc);
  if (failed.ok) throw new Error("a batch sending more USDT than the swap buys went through");
  if ((await held(usdt)) !== 0n) throw new Error("the failed batch left swapped USDT on Hydration");
  if (afterFailure >= PAYOUT || afterFailure < PAYOUT - USDC / 100n) {
    throw new Error(`the failed batch left ${afterFailure} USDC of ${PAYOUT}`);
  }
  if ((await usdtOnAssetHub(assetHubApi, account.address)) !== 0n)
    throw new Error("the failed batch reached Asset Hub");

  const home = await swapAndSendHome(hydrationApi, account, { assetIn: wormholeUsdc, route: [] });
  const credited = await waitFor("USDT on Asset Hub", async () => {
    const balance = await usdtOnAssetHub(assetHubApi, account.address);
    return balance > 0n ? balance : undefined;
  });

  const left = await Promise.all([held(wormholeUsdc), held(usdt)]);
  if (home.fee + home.sold !== afterFailure)
    throw new Error(`fee ${home.fee} + sold ${home.sold} is not ${afterFailure}`);
  if (left.some((balance) => balance >= USDC / 100n))
    throw new Error(`left on Hydration: ${left.join(" USDC, ")} USDT`);
  if (credited > home.sentHome) throw new Error(`Asset Hub credited ${credited} for ${home.sentHome} sent`);

  return `a failing batch cost ${PAYOUT - afterFailure} USDC in fees and moved nothing; the retry paid ${home.fee} USDC, sold ${home.sold} for ${home.bought} USDT, sent ${home.sentHome}; Asset Hub credited ${credited}`;
}
