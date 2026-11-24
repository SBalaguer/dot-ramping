import { hub, hydration } from "@galacticcouncil/descriptors";
import { HYDRATION_ASSET } from "@onramp/chains";
import { usdtOnAssetHub, usdtToAssetHub } from "@onramp/routes";
import { toHex } from "viem";

import { devAccount } from "../dev-accounts";
import type { PolkadotForks } from "../polkadot";
import { waitFor } from "./wait";

const HDX = 10n ** 12n;
const USDT = 10n ** 6n;
const AMOUNT = 25n * USDT;

/** A signed USDT transfer submitted to Hydration arrives on Asset Hub with no fork-side help. */
export async function checkHrmpTransfer(forks: PolkadotForks): Promise<string> {
  const alice = devAccount("//Alice");
  const bob = devAccount("//Bob");

  await forks.hydration.setStorage({
    System: { Account: [[[alice.address], { providers: 1, data: { free: 1000n * HDX } }]] },
    Tokens: { Accounts: [[[alice.address, HYDRATION_ASSET.usdt], { free: 100n * USDT }]] },
  });

  const assetHub = forks.assetHub.client.getTypedApi(hub);
  const transfer = usdtToAssetHub(forks.hydration.client.getTypedApi(hydration), toHex(bob.publicKey), AMOUNT);

  const before = await usdtOnAssetHub(assetHub, bob.address);
  const sent = await transfer.signAndSubmit(alice.signer);
  if (!sent.ok) throw new Error(`USDT transfer failed in Hydration block ${sent.block.hash}`);

  const credited = await waitFor("USDT on Asset Hub", async () => {
    const delta = (await usdtOnAssetHub(assetHub, bob.address)) - before;
    return delta > 0n ? delta : undefined;
  });
  if (credited > AMOUNT) throw new Error(`Asset Hub credited ${credited} for ${AMOUNT} sent`);

  return `Hydration #${sent.block.number} sent ${AMOUNT} USDT; Asset Hub credited ${credited} (XCM fee ${AMOUNT - credited})`;
}
