import { signedVaa } from "@onramp/chains";
import type { Address } from "viem";

import type { Context } from "../context";
import type { StepDefinition } from "../pipeline";
import { refsOf } from "../topup";

/** Waits for the guardians to sign the message the source step published. */
export const vaaSigned: StepDefinition<Context> = {
  name: "VAA_SIGNED",
  chain: "wormhole",
  async run(_context, topUp) {
    const { wormholeChain, emitter, messageSequence } = refsOf(topUp, "SOURCE_SUBMITTED");
    const vaa = await signedVaa(Number(wormholeChain), emitter as Address, BigInt(messageSequence!));
    if (!vaa) return { waiting: "the guardians have not signed the message yet" };
    const vaaId = `${wormholeChain}/${emitter!.slice(2).toLowerCase().padStart(64, "0")}/${messageSequence}`;
    return { done: { vaaId, vaa } };
  },
};
