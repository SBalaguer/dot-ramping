import {
  hub,
  hydration,
  XcmV3MultiassetFungibility,
  XcmV3WeightLimit,
  XcmV5AssetFilter,
  XcmV5Instruction,
  XcmV5Junction,
  XcmV5Junctions,
  XcmV5WildAsset,
  XcmVersionedAssetId,
  XcmVersionedAssets,
  XcmVersionedLocation,
  XcmVersionedXcm,
} from "@galacticcouncil/descriptors";
import { Binary, Enum } from "polkadot-api";

import { devAccount } from "../dev-accounts";
import type { PolkadotForks } from "../polkadot";
import { waitFor } from "./wait";

const HYDRATION_USDT = 10;
const ASSET_HUB_USDT = 1984;
const ASSETS_PALLET = 50;
const HDX = 10n ** 12n;
const USDT = 10n ** 6n;
const AMOUNT = 25n * USDT;

async function usdtOnAssetHub(forks: PolkadotForks, address: string): Promise<bigint> {
  const api = forks.assetHub.client.getTypedApi(hub);
  const account = await api.query.Assets.Account.getValue(ASSET_HUB_USDT, address, { at: "best" });
  return account?.balance ?? 0n;
}

function usdtTransferToAssetHub(forks: PolkadotForks, beneficiary: Uint8Array) {
  const assetHubParachain = XcmV5Junction.Parachain(forks.assetHub.spec.paraId);
  const usdt = {
    parents: 1,
    interior: XcmV5Junctions.X3([
      assetHubParachain,
      XcmV5Junction.PalletInstance(ASSETS_PALLET),
      XcmV5Junction.GeneralIndex(BigInt(ASSET_HUB_USDT)),
    ]),
  };
  return forks.hydration.client.getTypedApi(hydration).tx.PolkadotXcm.transfer_assets_using_type_and_then({
    dest: XcmVersionedLocation.V5({ parents: 1, interior: XcmV5Junctions.X1(assetHubParachain) }),
    assets: XcmVersionedAssets.V5([{ id: usdt, fun: XcmV3MultiassetFungibility.Fungible(AMOUNT) }]),
    assets_transfer_type: Enum("DestinationReserve"),
    remote_fees_id: XcmVersionedAssetId.V5(usdt),
    fees_transfer_type: Enum("DestinationReserve"),
    custom_xcm_on_dest: XcmVersionedXcm.V5([
      XcmV5Instruction.DepositAsset({
        assets: XcmV5AssetFilter.Wild(XcmV5WildAsset.AllCounted(1)),
        beneficiary: {
          parents: 0,
          interior: XcmV5Junctions.X1(
            XcmV5Junction.AccountId32({ network: undefined, id: Binary.toHex(beneficiary) }),
          ),
        },
      }),
    ]),
    weight_limit: XcmV3WeightLimit.Unlimited(),
  });
}

/** A signed USDT transfer submitted to Hydration arrives on Asset Hub with no fork-side help. */
export async function checkHrmpTransfer(forks: PolkadotForks): Promise<string> {
  const alice = devAccount("//Alice");
  const bob = devAccount("//Bob");

  await forks.hydration.setStorage({
    System: { Account: [[[alice.address], { providers: 1, data: { free: 1000n * HDX } }]] },
    Tokens: { Accounts: [[[alice.address, HYDRATION_USDT], { free: 100n * USDT }]] },
  });

  const before = await usdtOnAssetHub(forks, bob.address);
  const sent = await usdtTransferToAssetHub(forks, bob.publicKey).signAndSubmit(alice.signer);
  if (!sent.ok) throw new Error(`USDT transfer failed in Hydration block ${sent.block.hash}`);

  const credited = await waitFor("USDT on Asset Hub", async () => {
    const delta = (await usdtOnAssetHub(forks, bob.address)) - before;
    return delta > 0n ? delta : undefined;
  });
  if (credited > AMOUNT) throw new Error(`Asset Hub credited ${credited} for ${AMOUNT} sent`);

  return `Hydration #${sent.block.number} sent ${AMOUNT} of asset ${HYDRATION_USDT}; Asset Hub credited ${credited} of asset ${ASSET_HUB_USDT} (XCM fee ${AMOUNT - credited})`;
}
