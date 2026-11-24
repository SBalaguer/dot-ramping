import type { AssetHubApi } from "@onramp/chains";
import { AccountId } from "polkadot-api";
import { parseEther, type Address, type Hex } from "viem";

import type { XcmCodec, XcmLocation } from "../xcm-codec";
import { rehearseOnAssetHub } from "./asset-hub";
import { bridgeHubXcm, type GatewayMessage } from "./relay";
import { claimer, ether, transferToHydration } from "./xcm";

export interface SnowbridgeFees {
  /** Ether Asset Hub may spend executing the message and delivering it on to Hydration. */
  executionFee: bigint;
  /** Ether rewarding whoever relays the message from Ethereum to Bridge Hub. */
  relayerFee: bigint;
}

/** More than any execution costs, so the rehearsal measures the spend instead of running out. */
const PROBE_EXECUTION_FEE = parseEther("0.01");
const EXECUTION_HEADROOM_PERCENT = 150n;
/** Snowbridge's own estimate of a relayer's cost to submit one message to Bridge Hub (0.25 DOT), padded as they pad it. */
const RELAYER_COST_DOT = 2_500_000_000n;
const RELAYER_HEADROOM_PERCENT = 130n;

const dot: XcmLocation = { parents: 1, interior: { type: "Here", value: undefined } };
const ss58 = AccountId(0);

/** The fields that decide what a message costs; the rest of the Gateway's event does not matter for a quote. */
export interface SnowbridgeTransfer {
  gateway: Address;
  /** The forwarder that will call the Gateway. */
  origin: Address;
  token: Address;
  amount: bigint;
  beneficiary: Hex;
}

/**
 * Quotes the two ether fees of a transfer against current Asset Hub state. The execution fee is measured:
 * the message is rehearsed with a large fee and what Asset Hub would hand back tells what it spent. Asset
 * Hub's minimum ether balance is added on top, because the unspent part is deposited to the beneficiary and
 * a deposit below the minimum fails.
 */
export async function quoteSnowbridgeFees(
  api: AssetHubApi,
  codec: XcmCodec,
  transfer: SnowbridgeTransfer,
): Promise<SnowbridgeFees> {
  const draft: GatewayMessage = {
    gateway: transfer.gateway,
    nonce: 0n,
    origin: transfer.origin,
    token: transfer.token,
    amount: transfer.amount,
    xcm: codec.xcm(transferToHydration(transfer.beneficiary)),
    claimer: codec.location(claimer(transfer.beneficiary)),
    value: 0n,
    executionFee: PROBE_EXECUTION_FEE,
    relayerFee: 0n,
  };
  const beneficiary = ss58.dec(transfer.beneficiary);
  const [events, etherAsset, relayerCost] = await Promise.all([
    rehearseOnAssetHub(api, bridgeHubXcm(codec, draft)),
    api.query.ForeignAssets.Asset.getValue(ether, { at: "best" }),
    api.apis.AssetConversionApi.quote_price_tokens_for_exact_tokens(ether, dot, RELAYER_COST_DOT, true, {
      at: "best",
    }),
  ]);
  if (!etherAsset) throw new Error("ether is not an asset on Asset Hub");
  if (relayerCost === undefined) throw new Error("Asset Hub has no ether pool to price the relayer fee with");

  const handedBack = events.reduce((sum, event) => {
    if (event.type !== "ForeignAssets" || event.value.type !== "Deposited") return sum;
    const { asset_id: asset, who, amount } = event.value.value;
    const isEther = asset.parents === ether.parents && asset.interior.type === "X1";
    return isEther && who === beneficiary ? sum + amount : sum;
  }, 0n);
  const spent = PROBE_EXECUTION_FEE - handedBack;
  if (handedBack === 0n || spent <= 0n) throw new Error("the rehearsal did not show what Asset Hub spends");

  return {
    executionFee: (spent * EXECUTION_HEADROOM_PERCENT) / 100n + etherAsset.min_balance,
    relayerFee: (relayerCost * RELAYER_HEADROOM_PERCENT) / 100n,
  };
}
