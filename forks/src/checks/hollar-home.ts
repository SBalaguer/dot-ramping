import { hub, hydration } from "@galacticcouncil/descriptors";
import { HOLLAR_TOKEN, HYDRATION_ASSET } from "@onramp/chains";
import { actor, confirmed } from "@onramp/contracts";
import { deriveBeneficiary, newTopUpSecrets } from "@onramp/keys";
import { FEE_FLOAT, frontFeeFloat, swapAndSendHome, usdtOnAssetHub } from "@onramp/routes";
import { erc20Abi, slice } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

import { devAccount } from "../dev-accounts";
import type { PolkadotForks } from "../polkadot";
import { fundEvmDeployer, truncatedAccount } from "../setup/evm-account";
import { waitFor } from "./wait";

const HDX = 10n ** 12n;
const USDT = 10n ** 6n;
const HOLLAR = 10n ** 18n;
const MINTED = 10n * HOLLAR;

/**
 * What the PSM route relies on: HOLLAR credited to the first 20 bytes of a new sr25519 account, the way the
 * facilitator mints it, is that account's to spend without binding an EVM address, once the relayer has
 * fronted it a USDT fee float. The account then turns everything into USDT on Asset Hub in one transaction.
 */
export async function checkHollarHome(forks: PolkadotForks): Promise<string> {
  const hydrationApi = forks.hydration.client.getTypedApi(hydration);
  const assetHubApi = forks.assetHub.client.getTypedApi(hub);
  const { hollar, usdt } = HYDRATION_ASSET;
  const trader = devAccount("//Alice");
  const operator = actor("hydrationFork", privateKeyToAccount(generatePrivateKey()));
  const account = deriveBeneficiary(newTopUpSecrets());
  const held = (asset: number) => hydrationApi.apis.CurrenciesApi.free_balance(asset, account.address, { at: "best" });

  await fundEvmDeployer(forks.hydration, operator.wallet.account.address);
  await forks.hydration.setStorage({
    System: { Account: [[[trader.address], { providers: 1, data: { free: 1000n * HDX } }]] },
    Tokens: { Accounts: [[[trader.address, usdt], { free: 100n * USDT }]] },
  });
  // The operator obtains real HOLLAR from the pools; its ERC-20 transfer below stands in for the facilitator's mint.
  const bought = await hydrationApi.tx.Utility.batch_all({
    calls: [
      hydrationApi.tx.Router.buy({
        asset_in: usdt,
        asset_out: hollar,
        amount_out: MINTED,
        max_amount_in: 50n * USDT,
        route: [],
      }).decodedCall,
      hydrationApi.tx.Currencies.transfer({
        dest: truncatedAccount(operator.wallet.account.address),
        currency_id: hollar,
        amount: MINTED,
      }).decodedCall,
    ],
  }).signAndSubmit(trader.signer);
  if (!bought.ok) throw new Error(`could not obtain HOLLAR in Hydration block ${bought.block.hash}`);

  if (!(await frontFeeFloat(operator, hydrationApi, account.address)))
    throw new Error("a new account already pays fees");
  const mint = await operator.wallet.writeContract({
    address: HOLLAR_TOKEN,
    abi: erc20Abi,
    functionName: "transfer",
    args: [slice(account.accountId, 0, 20), MINTED],
  });
  await confirmed(operator, mint);
  if ((await held(hollar)) !== MINTED)
    throw new Error(`the account sees ${await held(hollar)} HOLLAR of ${MINTED} minted`);

  const home = await swapAndSendHome(hydrationApi, account, { assetIn: hollar, route: [] });
  const credited = await waitFor("USDT on Asset Hub", async () => {
    const balance = await usdtOnAssetHub(assetHubApi, account.address);
    return balance > 0n ? balance : undefined;
  });

  const left = await Promise.all([held(hollar), held(usdt)]);
  if (home.feeAsset !== usdt || home.sold !== MINTED)
    throw new Error(`sold ${home.sold} HOLLAR, fee in asset ${home.feeAsset}`);
  if (home.sentHome !== home.bought + FEE_FLOAT - home.fee - left[1]) throw new Error("the float is not accounted for");
  if (left[0] !== 0n || left[1] >= USDT / 100n)
    throw new Error(`left on Hydration: ${left[0]} HOLLAR, ${left[1]} USDT`);
  if (credited > home.sentHome) throw new Error(`Asset Hub credited ${credited} for ${home.sentHome} sent`);

  return `${MINTED / HOLLAR} HOLLAR sold for ${home.bought} USDT; fee ${home.fee} USDT out of a ${FEE_FLOAT} float; sent ${home.sentHome}; Asset Hub credited ${credited}`;
}
