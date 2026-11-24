import { wormholeCoreAbi } from "@onramp/chains";
import { basejumpLandingAbi, basejumpReceiverAbi, send, type Actor } from "@onramp/contracts";
import { parseEventLogs, type Address, type Hash, type Hex } from "viem";

export interface BasejumpPayout {
  /** Absent when the VAA had already been delivered, by us earlier or by anyone else. */
  txHash?: Hash;
  blockNumber?: bigint;
  /** Paid to the recipient by this delivery, in the payout asset's units. */
  paid?: bigint;
}

/**
 * Delivers the fast-path VAA to our receiver on Hydration, which makes the landing pay the recipient named
 * in the VAA. Anyone may deliver; the receiver accepts each VAA once.
 */
export async function completeBasejumpTransfer(by: Actor, receiver: Address, vaa: Hex): Promise<BasejumpPayout> {
  const contract = { address: receiver, abi: basejumpReceiverAbi } as const;
  const core = await by.reader.readContract({ ...contract, functionName: "wormhole" });
  const [message, valid, reason] = await by.reader.readContract({
    address: core,
    abi: wormholeCoreAbi,
    functionName: "parseAndVerifyVM",
    args: [vaa],
  });
  if (!valid) throw new Error(`the Wormhole core on Hydration rejects the VAA: ${reason}`);
  if (await by.reader.readContract({ ...contract, functionName: "processedVaas", args: [message.hash] })) return {};

  const receipt = await send(by, { ...contract, functionName: "completeTransfer", args: [vaa] });
  const delivery = { txHash: receipt.transactionHash, blockNumber: receipt.blockNumber };

  const [queued] = parseEventLogs({ abi: basejumpLandingAbi, eventName: "TransferQueued", logs: receipt.logs });
  if (queued)
    throw new Error(`the landing is short of liquidity; payout queued as #${queued.args.id} in ${delivery.txHash}`);
  const [executed] = parseEventLogs({ abi: basejumpLandingAbi, eventName: "TransferExecuted", logs: receipt.logs });
  if (!executed) throw new Error(`${delivery.txHash} delivered the VAA but paid nothing`);
  return { ...delivery, paid: executed.args.amount };
}
