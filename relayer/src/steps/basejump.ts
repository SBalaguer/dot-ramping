import { WORMHOLE_TESTNET } from "@onramp/chains";
import { completeBasejumpTransfer, forwardViaBasejump } from "@onramp/routes";
import type { Hex } from "viem";

import type { Context } from "../context";
import type { Outcome, StepDefinition } from "../pipeline";
import { paramsOf } from "../secrets";
import { refsOf } from "../topup";

export const basejumpSubmitted: StepDefinition<Context> = {
  name: "SOURCE_SUBMITTED",
  chain: "sepolia",
  async run({ sources, factory }, topUp) {
    const since = BigInt(refsOf(topUp, "DEPOSIT_DETECTED").block!);
    const sent = await forwardViaBasejump(sources.sepolia.by, factory, paramsOf(topUp), since);
    return {
      done: {
        tx: sent.txHash,
        block: sent.blockNumber.toString(),
        wormholeChain: String(WORMHOLE_TESTNET.sepolia.chainId),
        emitter: sent.emitter,
        amount: sent.amount.toString(),
        bridgeFee: sent.fee.toString(),
        messageSequence: sent.messageSequence.toString(),
        settlementSequence: sent.transferSequence.toString(),
      },
    };
  },
};

export const basejumpDelivered: StepDefinition<Context> = {
  name: "DELIVERED",
  chain: "hydration",
  async run({ hydrationEvm, deployed }, topUp): Promise<Outcome> {
    const { vaa } = refsOf(topUp, "VAA_SIGNED");
    const payout = await completeBasejumpTransfer(hydrationEvm, deployed.basejumpReceiver, vaa as Hex);
    if (!payout) return { done: { note: "the VAA had already been delivered" } };
    return { done: { tx: payout.txHash, block: payout.blockNumber.toString(), paid: payout.paid.toString() } };
  },
};
