import { basejumpLandingAbi, type Actor } from "@onramp/contracts";
import { parseEventLogs, type Address, type Hash, type Hex } from "viem";

import { deliverVaa } from "../vaa-delivery";

export interface BasejumpPayout {
  txHash: Hash;
  blockNumber: bigint;
  /** Paid to the recipient named in the VAA, in the payout asset's units. */
  paid: bigint;
}

/** Delivers the fast-path VAA to our receiver, which makes the landing pay the recipient named in it. */
export async function completeBasejumpTransfer(
  by: Actor,
  receiver: Address,
  vaa: Hex,
): Promise<BasejumpPayout | undefined> {
  const receipt = await deliverVaa(by, receiver, "completeTransfer", vaa);
  if (!receipt) return undefined;
  const { transactionHash: txHash, blockNumber, logs } = receipt;

  const [queued] = parseEventLogs({ abi: basejumpLandingAbi, eventName: "TransferQueued", logs });
  if (queued) throw new Error(`the landing is short of liquidity; payout queued as #${queued.args.id} in ${txHash}`);
  const [executed] = parseEventLogs({ abi: basejumpLandingAbi, eventName: "TransferExecuted", logs });
  if (!executed) throw new Error(`${txHash} delivered the VAA but paid nothing`);
  return { txHash, blockNumber, paid: executed.args.amount };
}
