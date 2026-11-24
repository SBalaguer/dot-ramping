import {
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
import {
  ASSET_HUB_ASSETS_PALLET,
  ASSET_HUB_PARA_ID,
  ASSET_HUB_USDT,
  type AssetHubApi,
  type HydrationApi,
} from "@onramp/chains";
import { Enum } from "polkadot-api";
import type { Hex } from "viem";

const assetHub = XcmV5Junction.Parachain(ASSET_HUB_PARA_ID);
const usdt = {
  parents: 1,
  interior: XcmV5Junctions.X3([
    assetHub,
    XcmV5Junction.PalletInstance(ASSET_HUB_ASSETS_PALLET),
    XcmV5Junction.GeneralIndex(BigInt(ASSET_HUB_USDT)),
  ]),
};

/** Sends USDT from Hydration back to its reserve, Asset Hub; the XCM fee there is paid out of `amount`. */
export function usdtToAssetHub(api: HydrationApi, beneficiary: Hex, amount: bigint) {
  return api.tx.PolkadotXcm.transfer_assets_using_type_and_then({
    dest: XcmVersionedLocation.V5({ parents: 1, interior: XcmV5Junctions.X1(assetHub) }),
    assets: XcmVersionedAssets.V5([{ id: usdt, fun: XcmV3MultiassetFungibility.Fungible(amount) }]),
    assets_transfer_type: Enum("DestinationReserve"),
    remote_fees_id: XcmVersionedAssetId.V5(usdt),
    fees_transfer_type: Enum("DestinationReserve"),
    custom_xcm_on_dest: XcmVersionedXcm.V5([
      XcmV5Instruction.DepositAsset({
        assets: XcmV5AssetFilter.Wild(XcmV5WildAsset.AllCounted(1)),
        beneficiary: {
          parents: 0,
          interior: XcmV5Junctions.X1(XcmV5Junction.AccountId32({ network: undefined, id: beneficiary })),
        },
      }),
    ]),
    weight_limit: XcmV3WeightLimit.Unlimited(),
  });
}

export async function usdtOnAssetHub(api: AssetHubApi, address: string): Promise<bigint> {
  const account = await api.query.Assets.Account.getValue(ASSET_HUB_USDT, address, { at: "best" });
  return account?.balance ?? 0n;
}
