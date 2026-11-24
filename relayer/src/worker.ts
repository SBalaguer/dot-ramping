import { advance, type Runner } from "./pipeline";
import type { Store } from "./store";

export interface Worker {
  stop: () => Promise<void>;
}

/**
 * Advances every open top-up, one at a time, then sleeps. One at a time keeps the relayer's transactions
 * in nonce order without a nonce manager.
 */
export function startWorker<Context>(store: Store, runner: Runner<Context>, intervalMs: number): Worker {
  let running = true;
  let wake: (() => void) | undefined;

  const loop = (async () => {
    while (running) {
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
