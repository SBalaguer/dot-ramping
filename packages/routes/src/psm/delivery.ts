import { psmFacilitatorAbi, type Actor } from "@onramp/contracts";
import { parseEventLogs, type Address, type Hash, type Hex } from "viem";

import { deliverVaa } from "../vaa-delivery";

export interface PsmMint {
  txHash: Hash;
  blockNumber: bigint;
  /** HOLLAR minted to the recipient named in the VAA (18 decimals). */
  minted: bigint;
}

const QUEUE_REASONS = ["minting is paused", "the mint bucket is full", "the inbound rate limit is used up"];

/** Delivers the vault's mint message to our facilitator, which mints HOLLAR one-to-one for the USDC deposited. */
export async function completePsmMint(by: Actor, facilitator: Address, vaa: Hex): Promise<PsmMint | undefined> {
  const receipt = await deliverVaa(by, facilitator, "receiveMessage", vaa);
  if (!receipt) return undefined;
  const { transactionHash: txHash, blockNumber, logs } = receipt;

  const [queued] = parseEventLogs({ abi: psmFacilitatorAbi, eventName: "MintQueued", logs });
  if (queued) {
    throw new Error(
      `mint queued as #${queued.args.id} in ${txHash}: ${QUEUE_REASONS[queued.args.reason] ?? "unknown reason"}`,
    );
  }
  const [minted] = parseEventLogs({ abi: psmFacilitatorAbi, eventName: "Minted", logs });
  if (!minted) throw new Error(`${txHash} delivered the VAA but minted nothing`);
  return { txHash, blockNumber, minted: minted.args.hollarAmount };
}
