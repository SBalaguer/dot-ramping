import { advance, type Runner } from "./pipeline";
import { applyRequest, refusal, type HasDeposit } from "./requests";
import type { Store } from "./store";

export interface Worker {
  stop: () => Promise<void>;
}

/** Carries out the operator requests queued since the last round, re-checking each against current state. */
export async function serveRequests<Context>(
  store: Store,
  runner: Runner<Context>,
  hasDeposit: HasDeposit,
): Promise<void> {
  for (const { sequence, topUpId, kind } of store.requests()) {
    const topUp = store.get(topUpId);
    const refused = topUp ? await refusal(topUp, kind, hasDeposit) : "no such top-up";
    console.log(`${topUpId.slice(0, 10)} ${kind} request ${refused ? `dropped: ${refused}` : "accepted"}`);
    if (topUp && !refused) {
      applyRequest(topUp, kind, (runner.now ?? Date.now)());
      runner.save(topUp);
    }
    store.settle(sequence);
  }
}

/**
 * Serves queued requests, advances every open top-up, one at a time, then sleeps. One at a time keeps the
 * relayer's transactions in nonce order without a nonce manager, and means a request is never applied
 * while a step of the same top-up is running.
 */
export function startWorker<Context>(
  store: Store,
  runner: Runner<Context>,
  hasDeposit: HasDeposit,
  intervalMs: number,
): Worker {
  let running = true;
  let wake: (() => void) | undefined;

  const loop = (async () => {
    while (running) {
      await serveRequests(store, runner, hasDeposit).catch((error: unknown) => console.error("requests:", error));
      for (const topUp of store.open()) {
        if (!running) break;
        await advance(runner, topUp).catch((error: unknown) => console.error(`top-up ${topUp.id}:`, error));
      }
      await new Promise<void>((resolve) => {
        wake = resolve;
        setTimeout(resolve, intervalMs);
      });
    }
  })();

  return {
    async stop() {
      running = false;
      wake?.();
      await loop;
    },
  };
}
