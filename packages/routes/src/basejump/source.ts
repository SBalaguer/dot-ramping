import { HYDRATION_WORMHOLE_CHAIN_ID, wormholeCoreAbi } from "@onramp/chains";
import { basejumpEmitterAbi, factoryAbi, nttManagerAbi, type Actor } from "@onramp/contracts";
import { Route, type ForwarderParams } from "@onramp/keys";
import { parseEventLogs, type Address, type Hash, type PublicClient } from "viem";

import { triggerForwarder } from "../forwarder";

/** NTT's encoding of "no transceiver instructions"; an empty byte string is rejected. */
const NO_INSTRUCTIONS = "0x00";

export interface BasejumpDispatch {
  txHash: Hash;
  blockNumber: bigint;
  emitter: Address;
  /** Deposit forwarded, in token units. */
  amount: bigint;
  /** Kept by Basejump; the fast path pays out `amount - fee`. */
  fee: bigint;
  /** Wormhole sequence of the fast-path message, the VAA to deliver on Hydration. */
  messageSequence: bigint;
  /** Wormhole sequence of the NTT settlement that refills the landing. */
  transferSequence: bigint;
}

/** Ether the emitter spends per transfer: NTT delivery of the settlement plus the fast-path message fee. */
export async function basejumpEtherFee(reader: PublicClient, emitter: Address, token: Address): Promise<bigint> {
  const [core, manager] = await Promise.all([
    reader.readContract({ address: emitter, abi: basejumpEmitterAbi, functionName: "wormhole" }),
    reader.readContract({ address: emitter, abi: basejumpEmitterAbi, functionName: "nttManagerFor", args: [token] }),
  ]);
  const [[, settlement], message] = await Promise.all([
    reader.readContract({
      address: manager,
      abi: nttManagerAbi,
      functionName: "quoteDeliveryPrice",
      args: [HYDRATION_WORMHOLE_CHAIN_ID, NO_INSTRUCTIONS],
    }),
    reader.readContract({ address: core, abi: wormholeCoreAbi, functionName: "messageFee" }),
  ]);
  return settlement + message;
}

/** Sends a top-up's deposit through its forwarder into Basejump and reports what the emitter announced. */
export async function forwardViaBasejump(
  by: Actor,
  factory: Address,
  params: ForwarderParams,
): Promise<BasejumpDispatch> {
  const [emitter, token] = await by.reader.readContract({
    address: factory,
    abi: factoryAbi,
    functionName: "routeConfig",
    args: [Route.Basejump],
  });
  const value = await basejumpEtherFee(by.reader, emitter, token);
  const receipt = await triggerForwarder(by, { factory, params, route: Route.Basejump, value });

  const [initiated] = parseEventLogs({ abi: basejumpEmitterAbi, eventName: "BridgeInitiated", logs: receipt.logs });
  if (!initiated) throw new Error(`${receipt.transactionHash} forwarded without a Basejump message`);
  const { amount, fee, messageSequence, transferSequence } = initiated.args;
  return {
    txHash: receipt.transactionHash,
    blockNumber: receipt.blockNumber,
    emitter,
    amount,
    fee,
    messageSequence,
    transferSequence,
  };
}
