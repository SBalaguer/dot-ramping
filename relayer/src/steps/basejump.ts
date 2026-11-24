import { WORMHOLE_TESTNET, signedVaa } from "@onramp/chains";
import { completeBasejumpTransfer, forwardViaBasejump } from "@onramp/routes";
import type { Address, Hex } from "viem";

import type { Context } from "../context";
import type { Outcome, StepDefinition } from "../pipeline";
import { paramsOf } from "../secrets";
import { refsOf } from "../topup";

export const sourceSubmitted: StepDefinition<Context> = {
  name: "SOURCE_SUBMITTED",
  chain: "sepolia",
  async run({ sepolia, deployed }, topUp) {
    const sent = await forwardViaBasejump(sepolia, deployed.sepolia.factory, paramsOf(topUp));
    return {
      done: {
        tx: sent.txHash,
        block: sent.blockNumber.toString(),
        emitter: sent.emitter,
        amount: sent.amount.toString(),
        bridgeFee: sent.fee.toString(),
        messageSequence: sent.messageSequence.toString(),
        settlementSequence: sent.transferSequence.toString(),
      },
    };
  },
};

export const vaaSigned: StepDefinition<Context> = {
  name: "VAA_SIGNED",
  chain: "wormhole",
  async run(_context, topUp) {
    const { emitter, messageSequence } = refsOf(topUp, "SOURCE_SUBMITTED");
    const { chainId } = WORMHOLE_TESTNET.sepolia;
    const vaa = await signedVaa(chainId, emitter as Address, BigInt(messageSequence!));
    if (!vaa) return { waiting: "the guardians have not signed the message yet" };
    return {
      done: { vaaId: `${chainId}/${emitter!.slice(2).toLowerCase().padStart(64, "0")}/${messageSequence}`, vaa },
    };
  },
};

export const delivered: StepDefinition<Context> = {
  name: "DELIVERED",
  chain: "hydration",
  async run({ hydrationEvm, deployed }, topUp): Promise<Outcome> {
    const { vaa } = refsOf(topUp, "VAA_SIGNED");
    const payout = await completeBasejumpTransfer(hydrationEvm, deployed.hydration.basejumpReceiver, vaa as Hex);
    if (!payout.txHash) return { done: { note: "the VAA had already been delivered" } };
    return { done: { tx: payout.txHash, block: String(payout.blockNumber), paid: String(payout.paid) } };
  },
};
