import { hub, hydration } from "@galacticcouncil/descriptors";
import { HYDRATION_ASSET } from "@onramp/chains";
import { deriveBeneficiary, newTopUpSecrets } from "@onramp/keys";
import { swapAndSendHome, usdtOnAssetHub } from "@onramp/routes";

import { devAccount } from "../dev-accounts";
import type { PolkadotForks } from "../polkadot";
import { waitFor } from "./wait";

const HDX = 10n ** 12n;
const USDC = 10n ** 6n;
const PAYOUT = 10n * USDC;

/**
 * A new top-up account that is paid Wormhole USDC, as Basejump pays it, turns all of it into USDT on Asset
 * Hub with one transaction of its own: no HDX, no fee-currency setup, nothing left on Hydration.
 */
export async function checkSwapHome(forks: PolkadotForks): Promise<string> {
  const hydrationApi = forks.hydration.client.getTypedApi(hydration);
  const assetHubApi = forks.assetHub.client.getTypedApi(hub);
  const payer = devAccount("//Alice");
  const account = deriveBeneficiary(newTopUpSecrets());

  await forks.hydration.setStorage({
    System: { Account: [[[payer.address], { providers: 1, data: { free: 1000n * HDX } }]] },
    Tokens: { Accounts: [[[payer.address, HYDRATION_ASSET.wormholeUsdc], { free: 100n * USDC }]] },
  });
  const paid = await hydrationApi.tx.Tokens.transfer({
    dest: account.address,
    currency_id: HYDRATION_ASSET.wormholeUsdc,
    amount: PAYOUT,
  }).signAndSubmit(payer.signer);
  if (!paid.ok) throw new Error(`USDC payout failed in Hydration block ${paid.block.hash}`);

  const home = await swapAndSendHome(hydrationApi, account, { assetIn: HYDRATION_ASSET.wormholeUsdc, route: [] });
  const credited = await waitFor("USDT on Asset Hub", async () => {
    const balance = await usdtOnAssetHub(assetHubApi, account.address);
    return balance > 0n ? balance : undefined;
  });

  const left = await Promise.all(
    [HYDRATION_ASSET.wormholeUsdc, HYDRATION_ASSET.usdt].map((asset) =>
      hydrationApi.apis.CurrenciesApi.free_balance(asset, account.address, { at: "best" }),
    ),
  );
  if (home.fee + home.sold !== PAYOUT)
    throw new Error(`fee ${home.fee} + sold ${home.sold} is not the ${PAYOUT} paid out`);
  if (left.some((balance) => balance >= USDC / 100n))
    throw new Error(`left on Hydration: ${left.join(" USDC, ")} USDT`);
  if (credited > home.sentHome) throw new Error(`Asset Hub credited ${credited} for ${home.sentHome} sent`);

  return `${PAYOUT} USDC paid out; fee ${home.fee} USDC, sold ${home.sold} for ${home.bought} USDT, sent ${home.sentHome}; Asset Hub credited ${credited} (left on Hydration: ${left.join(" USDC, ")} USDT)`;
}
