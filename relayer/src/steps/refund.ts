import { factoryAbi, send } from "@onramp/contracts";
import { erc20Abi } from "viem";

import type { Context, SourceChain } from "../context";
import type { StepDefinition } from "../pipeline";
import { paramsOf } from "../secrets";
import type { Refs, TopUp } from "../topup";

type Sources = Context["sources"];

/** What the top-up's deposit address holds of each source chain's stablecoin. */
async function depositsHeld(sources: Sources, topUp: TopUp): Promise<[SourceChain, bigint][]> {
  const held = await Promise.all(
    (Object.entries(sources) as [SourceChain, Sources[SourceChain]][]).map(async ([chain, source]) => {
      const amount = await source.by.reader.readContract({
        address: source.token,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [topUp.forwarder],
      });
      return [chain, amount] as [SourceChain, bigint];
    }),
  );
  return held.filter(([, amount]) => amount > 0n);
}

export async function hasDeposit(sources: Sources, topUp: TopUp): Promise<boolean> {
  return (await depositsHeld(sources, topUp)).length > 0;
}

/**
 * Sends whatever is at the deposit address back to the refund address its salt commits to; the relayer only
 * pays the gas. Safe to repeat: a chain already emptied is skipped.
 */
export const refunded: StepDefinition<Context> = {
  name: "REFUNDED",
  chain: "source",
  async run({ sources, factory }, topUp) {
    const refs: Refs = { to: topUp.refund };
    for (const [chain, amount] of await depositsHeld(sources, topUp)) {
      const { by, token } = sources[chain];
      const receipt = await send(by, {
        address: factory,
        abi: factoryAbi,
        functionName: "refund",
        args: [paramsOf(topUp), token],
      });
      refs[`${chain}Tx`] = receipt.transactionHash;
      refs[`${chain}Amount`] = amount.toString();
    }
    return { done: refs };
  },
};
