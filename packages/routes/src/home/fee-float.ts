import { HYDRATION_ASSET, type HydrationApi } from "@onramp/chains";
import { confirmed, type Actor } from "@onramp/contracts";
import { toHex, type Address, type Hash } from "viem";

/** Hydration's precompile that dispatches a SCALE-encoded runtime call as the calling EVM account. */
const DISPATCH: Address = "0x0000000000000000000000000000000000000401";

/**
 * The precompile reserves gas for the dispatched call's declared weight and refunds what it does not use, so
 * the limit has to exceed the 54k the transfer ends up costing; an estimate reports only the latter.
 */
const DISPATCH_GAS = 200_000n;

/** Twice USDT's existential deposit: enough for the account's one transaction, and it survives paying for it. */
export const FEE_FLOAT = 20_000n;

/** The asset an account pays Hydration fees in, or nothing if it cannot transact yet. */
export function feeCurrency(api: HydrationApi, address: string): Promise<number | undefined> {
  return api.query.MultiTransactionPayment.AccountCurrencyMap.getValue(address, { at: "best" });
}

/**
 * Gives a new top-up account a few cents of USDT from the relayer so it can pay for its own transaction.
 * HOLLAR lives in an ERC-20 contract, and an account holding nothing else does not exist for Hydration's
 * fee payment. A plain token like USDT creates the account and becomes its fee currency. Whatever the fee
 * leaves over goes home with the top-up.
 */
export async function frontFeeFloat(by: Actor, api: HydrationApi, address: string): Promise<Hash | undefined> {
  if ((await feeCurrency(api, address)) !== undefined) return undefined;
  const transfer = api.tx.Currencies.transfer({ dest: address, currency_id: HYDRATION_ASSET.usdt, amount: FEE_FLOAT });
  const data = toHex(await transfer.getEncodedData());
  const hash = await by.wallet.sendTransaction({ to: DISPATCH, data, gas: DISPATCH_GAS });
  await confirmed(by, hash);
  if ((await feeCurrency(api, address)) !== HYDRATION_ASSET.usdt) {
    throw new Error(`${hash} did not leave ${address} paying fees in USDT`);
  }
  return hash;
}
