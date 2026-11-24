import { XcmV5Junction, XcmV5Junctions, XcmVersionedAssetId } from "@galacticcouncil/descriptors";
import { HYDRATION_ASSET, type HydrationApi } from "@onramp/chains";
import type { Beneficiary } from "@onramp/keys";
import { Enum } from "polkadot-api";

import { feeCurrency } from "./fee-float";
import { usdtToAssetHub } from "./usdt-transfer";

export type TradeRoute = Parameters<HydrationApi["tx"]["Router"]["sell_all"]>[0]["route"];
type Call = Parameters<HydrationApi["apis"]["DryRunApi"]["dry_run_call"]>[1];

export interface HomeSwap {
  /** The Hydration asset the bridge paid out. */
  assetIn: number;
  /** Pools to trade through, in order; empty means the route Hydration stores on-chain for the pair. */
  route: TradeRoute;
}

export interface HomeReceipt {
  blockHash: string;
  blockNumber: number;
  txHash: string;
  /** The asset the transaction fee was paid in: `assetIn`, or USDT when the relayer fronted a fee float. */
  feeAsset: number;
  fee: bigint;
  sold: bigint;
  bought: bigint;
  /** USDT sent to Asset Hub: the quoted swap output plus USDT the account already held. */
  sentHome: bigint;
}

const XCM_VERSION = 5;
const HDX = XcmVersionedAssetId.V5({ parents: 0, interior: XcmV5Junctions.X1(XcmV5Junction.GeneralIndex(0n)) });
const REFERENCE_WEIGHT = { ref_time: 10n ** 12n, proof_size: 0n };
/** The fee price is refreshed from an oracle every block, so the next block may charge slightly more. */
const FEE_HEADROOM_PERCENT = 105n;

const describe = (value: unknown): string =>
  JSON.stringify(value, (_key, item: unknown) => (typeof item === "bigint" ? item.toString() : item));

interface Trade {
  amount_in: bigint;
  amount_out: bigint;
}

/** Trades the router executed, read from a block's or a dry-run's events. */
function tradesIn(events: { type: string; value: unknown }[]): Trade[] {
  return events.flatMap((event) => {
    const routed = event.value as { type: string; value: Trade };
    return event.type === "Router" && routed.type === "Executed" ? [routed.value] : [];
  });
}

async function dryRun(api: HydrationApi, account: string, transaction: { decodedCall: unknown }) {
  const origin = Enum("system", Enum("Signed", account));
  // PAPI types a built call loosely; it is the same value the runtime API takes.
  const call = transaction.decodedCall as Call;
  const result = await api.apis.DryRunApi.dry_run_call(origin, call, XCM_VERSION, { at: "best" });
  if (!result.success) throw new Error(`Hydration refused the dry-run: ${result.value.type}`);
  if (!result.value.execution_result.success) {
    throw new Error(`Hydration dry-run fails: ${describe(result.value.execution_result.value.error)}`);
  }
  return result.value;
}

/**
 * What a transaction fee of `nativeFee` HDX costs when paid in `asset`, with headroom. Hydration prices
 * XCM weight in any fee asset at the same oracle price it charges transaction fees at, which gives the rate.
 */
async function feeCeiling(api: HydrationApi, asset: number, nativeFee: bigint): Promise<bigint> {
  const location = await api.query.AssetRegistry.AssetLocations.getValue(asset, { at: "best" });
  if (!location) throw new Error(`asset ${asset} has no XCM location on Hydration`);
  const [inAsset, inHdx] = await Promise.all(
    [XcmVersionedAssetId.V5(location), HDX].map((id) =>
      api.apis.XcmPaymentApi.query_weight_to_asset_fee(REFERENCE_WEIGHT, id, { at: "best" }),
    ),
  );
  if (!inAsset?.success || !inHdx?.success) throw new Error(`asset ${asset} cannot pay fees on Hydration`);
  return (nativeFee * inAsset.value * FEE_HEADROOM_PERCENT) / (inHdx.value * 100n) + 1n;
}

/**
 * One transaction signed by the top-up's own key: sell everything it holds of `assetIn` for USDT and send
 * the USDT to the same account on Asset Hub. The two calls are batched all-or-nothing, and the amount sent
 * is the swap's minimum output, quoted against current state, plus any USDT the account already held. So
 * nothing is left behind unless the pools move in the account's favour before inclusion.
 */
export async function swapAndSendHome(api: HydrationApi, account: Beneficiary, swap: HomeSwap): Promise<HomeReceipt> {
  const { usdt } = HYDRATION_ASSET;
  const trade = { asset_in: swap.assetIn, asset_out: usdt, route: swap.route };
  const held = (asset: number, at: string = "best") =>
    api.apis.CurrenciesApi.free_balance(asset, account.address, { at });
  const batch = (minimumOut: bigint, home: bigint) =>
    api.tx.Utility.batch_all({
      calls: [
        api.tx.Router.sell_all({ ...trade, min_amount_out: minimumOut }).decodedCall,
        usdtToAssetHub(api, account.accountId, home).decodedCall,
      ],
    });

  const [balance, usdtHeld, feeAsset] = await Promise.all([
    held(swap.assetIn),
    held(usdt),
    feeCurrency(api, account.address),
  ]);
  if (feeAsset !== swap.assetIn && feeAsset !== usdt) {
    throw new Error(`the account pays fees in asset ${feeAsset}; it must be asset ${swap.assetIn} or USDT`);
  }
  // The fee leaves one of the two balances before the batch runs: either less is sold or less is carried.
  const reserve = await feeCeiling(api, feeAsset, await batch(balance, balance).getEstimatedFees(account.address));
  const sellable = feeAsset === swap.assetIn ? balance - reserve : balance;
  const carried = feeAsset === usdt ? usdtHeld - reserve : usdtHeld;
  if (sellable <= 0n || carried < 0n)
    throw new Error(`the account cannot cover a fee of ${reserve} of asset ${feeAsset}`);

  const sell = api.tx.Router.sell({ ...trade, amount_in: sellable, min_amount_out: 1n });
  const quote = tradesIn((await dryRun(api, account.address, sell)).emitted_events).at(-1);
  if (!quote) throw new Error("Hydration quoted no trade");
  const sentHome = quote.amount_out + carried;

  const transaction = batch(quote.amount_out, sentHome);
  const rehearsal = await dryRun(api, account.address, transaction);
  if (rehearsal.forwarded_xcms.every(([, messages]) => messages.length === 0)) {
    throw new Error("the batch would not send anything to Asset Hub");
  }

  const sent = await transaction.signAndSubmit(account.signer);
  if (!sent.ok) throw new Error(`swap and send failed in block ${sent.block.hash}: ${describe(sent.dispatchError)}`);
  const executed = tradesIn(sent.events)[0];
  if (!executed) throw new Error(`no trade in block ${sent.block.hash}`);
  const fee =
    feeAsset === swap.assetIn
      ? balance - executed.amount_in
      : usdtHeld + executed.amount_out - sentHome - (await held(usdt, sent.block.hash));

  return {
    blockHash: sent.block.hash,
    blockNumber: sent.block.number,
    txHash: sent.txHash,
    feeAsset,
    fee,
    sold: executed.amount_in,
    bought: executed.amount_out,
    sentHome,
  };
}
