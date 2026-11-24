import type { Refs, Step, StepName, TopUp } from "./topup";

export type Outcome = { done: Refs } | { waiting: string };

/** One state of a route. `run` must be safe to repeat: it checks chain state before acting. */
export interface StepDefinition<Context> {
  name: StepName;
  chain: string;
  run: (context: Context, topUp: TopUp) => Promise<Outcome>;
}

export interface Runner<Context> {
  context: Context;
  pipelineOf: (topUp: TopUp) => StepDefinition<Context>[];
  save: (topUp: TopUp) => void;
  now?: () => number;
}

const FIRST_RETRY_MS = 5_000;
const MAX_RETRY_MS = 5 * 60_000;
/** About ten minutes of backoff; after that a person has to look. */
export const MAX_ATTEMPTS = 8;

function currentStep(topUp: TopUp, definition: { name: StepName; chain: string }, now: number): Step {
  const existing = topUp.steps.find(({ name }) => name === definition.name);
  if (existing) return existing;
  const step: Step = { ...definition, status: "waiting", attempts: 0, startedAt: now, refs: {} };
  topUp.steps.push(step);
  return step;
}

/**
 * Runs a top-up's remaining steps in order until one has to wait or fails, saving after each change.
 * A failure is recorded on the step and retried later with exponential backoff; it never skips ahead.
 * After `MAX_ATTEMPTS` failures the step and the top-up are marked failed and left alone.
 */
export async function advance<Context>(runner: Runner<Context>, topUp: TopUp): Promise<void> {
  const now = runner.now ?? Date.now;
  for (const definition of runner.pipelineOf(topUp)) {
    const step = currentStep(topUp, definition, now());
    if (step.status === "done") continue;
    if (step.status === "failed") return;
    if (step.retryAt !== undefined && now() < step.retryAt) return;

    let outcome: Outcome;
    try {
      outcome = await definition.run(runner.context, topUp);
    } catch (error) {
      step.attempts += 1;
      step.detail = error instanceof Error ? error.message : String(error);
      if (step.attempts >= MAX_ATTEMPTS) {
        step.status = "failed";
        delete step.retryAt;
        topUp.state = "FAILED";
      } else {
        step.status = "retrying";
        step.retryAt = now() + Math.min(FIRST_RETRY_MS * 2 ** (step.attempts - 1), MAX_RETRY_MS);
      }
      topUp.updatedAt = now();
      runner.save(topUp);
      return;
    }

    delete step.retryAt;
    topUp.updatedAt = now();
    if ("waiting" in outcome) {
      const changed = step.status !== "waiting" || step.detail !== outcome.waiting;
      step.status = "waiting";
      step.detail = outcome.waiting;
      if (changed) runner.save(topUp);
      return;
    }
    delete step.detail;
    step.status = "done";
    step.refs = outcome.done;
    step.finishedAt = now();
    topUp.state = step.name;
    runner.save(topUp);
  }
}
