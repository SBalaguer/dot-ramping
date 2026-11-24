import { WORMHOLE_TESTNET } from "@onramp/chains";
import { FEE_FLOAT, completePsmMint, forwardViaPsm, frontFeeFloat } from "@onramp/routes";
import type { Hex } from "viem";

import type { Context } from "../context";
import type { Outcome, StepDefinition } from "../pipeline";
import { paramsOf } from "../secrets";
import { refsOf } from "../topup";

/** Before HOLLAR is minted to it, the top-up account needs a plain token to exist and pay fees with. */
export const accountFunded: StepDefinition<Context> = {
  name: "ACCOUNT_FUNDED",
  chain: "hydration",
  async run({ hydrationEvm, hydration }, topUp): Promise<Outcome> {
    const tx = await frontFeeFloat(hydrationEvm, hydration, topUp.beneficiary.ss58);
    return { done: tx ? { tx, feeFloat: FEE_FLOAT.toString() } : { note: "the account can already pay fees" } };
  },
};

export const psmSubmitted: StepDefinition<Context> = {
  name: "SOURCE_SUBMITTED",
  chain: "baseSepolia",
  async run({ sources, factory }, topUp) {
    const since = BigInt(refsOf(topUp, "DEPOSIT_DETECTED").block!);
    const sent = await forwardViaPsm(sources.baseSepolia.by, factory, paramsOf(topUp), since);
    return {
      done: {
        tx: sent.txHash,
        block: sent.blockNumber.toString(),
        wormholeChain: String(WORMHOLE_TESTNET.baseSepolia.chainId),
        emitter: sent.vault,
        amount: sent.amount.toString(),
        messageSequence: sent.messageSequence.toString(),
      },
    };
  },
};

export const psmDelivered: StepDefinition<Context> = {
  name: "DELIVERED",
  chain: "hydration",
  async run({ hydrationEvm, deployed }, topUp): Promise<Outcome> {
    const { vaa } = refsOf(topUp, "VAA_SIGNED");
    const mint = await completePsmMint(hydrationEvm, deployed.psmFacilitator, vaa as Hex);
    if (!mint) return { done: { note: "the VAA had already been delivered" } };
    return { done: { tx: mint.txHash, block: mint.blockNumber.toString(), minted: mint.minted.toString() } };
  },
};
