import {
  XcmV2MultiassetWildFungibility,
  XcmV3MultiassetFungibility,
  XcmV5AssetFilter,
  XcmV5Instruction,
  XcmV5Junction,
  XcmV5Junctions,
  XcmV5NetworkId,
  XcmV5WildAsset,
  XcmVersionedXcm,
} from "@galacticcouncil/descriptors";
import { HYDRATION_PARA_ID, MAINNET_USDT, SNOWBRIDGE_ETHEREUM_CHAIN_ID } from "@onramp/chains";
import type { BoundTemplate } from "@onramp/contracts";
import { Enum } from "polkadot-api";
import type { Address, Hex } from "viem";

import { bindTemplate } from "../beneficiary-template";
import type { VersionedXcm, XcmCodec, XcmLocation } from "../xcm-codec";

const UNIT = 10n ** 6n;

/**
 * USDT.sb set aside for execution on Hydration. It is fixed in the forwarder's XCM template, so it carries
 * wide headroom over the measured cost (0.0006); Hydration returns what it does not use to the beneficiary.
 */
export const HYDRATION_EXECUTION_FEE = UNIT / 10n;

export const ethereum = XcmV5Junction.GlobalConsensus(
  XcmV5NetworkId.Ethereum({ chain_id: SNOWBRIDGE_ETHEREUM_CHAIN_ID }),
);

/** Ether, as Asset Hub and Hydration identify it. */
export const ether: XcmLocation = { parents: 2, interior: XcmV5Junctions.X1(ethereum) };

/** An Ethereum ERC-20, as Asset Hub and Hydration identify it. */
export const bridgedToken = (token: Address): XcmLocation => ({
  parents: 2,
  interior: XcmV5Junctions.X2([ethereum, XcmV5Junction.AccountKey20({ network: undefined, key: token.toLowerCase() })]),
});

const hydration: XcmLocation = {
  parents: 1,
  interior: XcmV5Junctions.X1(XcmV5Junction.Parachain(HYDRATION_PARA_ID)),
};

const account = (id: Hex, network?: ReturnType<typeof XcmV5NetworkId.Polkadot>): XcmLocation => ({
  parents: 0,
  interior: XcmV5Junctions.X1(XcmV5Junction.AccountId32({ network, id })),
});

const allOf = (id: XcmLocation) =>
  XcmV5AssetFilter.Wild(XcmV5WildAsset.AllOf({ id, fun: XcmV2MultiassetWildFungibility.Fungible() }));

/**
 * What a forwarder asks Asset Hub to do with a deposit, run after Bridge Hub's prefix: move every bridged
 * USDT to the beneficiary's account on Hydration, paying Hydration out of the USDT itself, then hand the
 * unspent ether fee to the beneficiary on Asset Hub. Nothing in it depends on the amount.
 */
export function transferToHydration(beneficiary: Hex): VersionedXcm {
  const usdt = bridgedToken(MAINNET_USDT);
  return XcmVersionedXcm.V5([
    XcmV5Instruction.InitiateTransfer({
      destination: hydration,
      remote_fees: Enum(
        "ReserveDeposit",
        XcmV5AssetFilter.Definite([{ id: usdt, fun: XcmV3MultiassetFungibility.Fungible(HYDRATION_EXECUTION_FEE) }]),
      ),
      preserve_origin: false,
      assets: [Enum("ReserveDeposit", allOf(usdt))],
      remote_xcm: [
        XcmV5Instruction.RefundSurplus(),
        XcmV5Instruction.DepositAsset({
          assets: XcmV5AssetFilter.Wild(XcmV5WildAsset.AllCounted(1)),
          beneficiary: account(beneficiary),
        }),
      ],
    }),
    XcmV5Instruction.RefundSurplus(),
    XcmV5Instruction.DepositAsset({ assets: allOf(ether), beneficiary: account(beneficiary) }),
  ]);
}

/**
 * Who may reclaim assets Asset Hub traps if the message fails there. The network is named as Snowbridge's
 * own client names it: a trap is filed under this exact location, and a signed claim carries the network.
 */
export const claimer = (beneficiary: Hex): XcmLocation => account(beneficiary, XcmV5NetworkId.Polkadot());

export interface SnowbridgeTemplates {
  xcm: BoundTemplate;
  claimer: BoundTemplate;
}

/** The two byte strings a forwarder fills with its beneficiary and passes to the Gateway. */
export function snowbridgeTemplates(codec: XcmCodec): SnowbridgeTemplates {
  return {
    xcm: bindTemplate((beneficiary) => codec.xcm(transferToHydration(beneficiary))),
    claimer: bindTemplate((beneficiary) => codec.location(claimer(beneficiary))),
  };
}
