import { progressOf, type TopUp } from "./topup";

/** What an operator can ask for through the API. The worker carries requests out between steps. */
export type RequestKind = "refund" | "retry";

export const REQUEST_KINDS: readonly RequestKind[] = ["refund", "retry"];

/** Whether anything sits at the top-up's deposit address on a source chain; answered from chain state. */
export type HasDeposit = (topUp: TopUp) => Promise<boolean>;

/**
 * Why a request cannot be honoured, if it cannot. A refund needs the deposit to still be at the deposit
 * address: once it has been forwarded it is on its way to the beneficiary and only that account holds it.
 */
export async function refusal(topUp: TopUp, kind: RequestKind, hasDeposit: HasDeposit): Promise<string | undefined> {
  if (kind === "retry") return topUp.state === "FAILED" ? undefined : "the top-up has no failed step";

  const forwarded = topUp.steps.some(({ name, status }) => name === "SOURCE_SUBMITTED" && status === "done");
  if (forwarded) return "the deposit has already been forwarded";
  return (await hasDeposit(topUp)) ? undefined : "nothing is at the deposit address";
}

/** Applies a request that `refusal` let through. */
export function applyRequest(topUp: TopUp, kind: RequestKind, now: number): void {
  if (kind === "retry") {
    for (const step of topUp.steps) {
      if (step.status !== "failed") continue;
      step.status = "retrying";
      step.attempts = 0;
    }
  } else {
    // A refund asked for again, after a later deposit, runs again.
    topUp.steps = topUp.steps.filter(({ name }) => name !== "REFUNDED");
    topUp.refundRequestedAt = now;
  }
  topUp.state = progressOf(topUp);
  topUp.updatedAt = now;
}
