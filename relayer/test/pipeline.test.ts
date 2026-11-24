import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { advance, type Outcome, type StepDefinition } from "../src/pipeline";
import { Store } from "../src/store";
import type { StepName } from "../src/topup";
import { createTopUp } from "../src/topups";

const FACTORY = "0x74EEFEb03Dc729323573010d5C1c9267fCCe422C";
const newTopUp = () => createTopUp({ sourceChain: "sepolia", factory: FACTORY, routeMask: 2 }, 0);

/** A pipeline whose steps replay scripted outcomes and record every call. */
function scripted(script: Partial<Record<StepName, (Outcome | Error)[]>>) {
  const calls: StepName[] = [];
  const names: StepName[] = ["DEPOSIT_DETECTED", "SOURCE_SUBMITTED", "VAA_SIGNED"];
  const steps = names.map((name): StepDefinition<null> => ({
    name,
    chain: "test",
    run: () => {
      calls.push(name);
      const next = script[name]?.shift() ?? { done: { by: name } };
      return next instanceof Error ? Promise.reject(next) : Promise.resolve(next);
    },
  }));
  return { calls, steps };
}

describe("advance", () => {
  let directory: string;
  let store: Store;
  let clock = 0;
  const runner = (steps: StepDefinition<null>[]) => ({
    context: null,
    pipelineOf: () => steps,
    save: (topUp: Parameters<Store["save"]>[0]) => store.save(topUp),
    now: () => clock,
  });

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), "relayer-"));
    store = new Store(join(directory, "relayer.sqlite"));
    clock = 0;
  });
  afterEach(() => {
    store.close();
    rmSync(directory, { recursive: true });
  });

  it("runs the steps in order and persists each result", async () => {
    const { calls, steps } = scripted({});
    const topUp = newTopUp();
    await advance(runner(steps), topUp);

    expect(calls).toEqual(["DEPOSIT_DETECTED", "SOURCE_SUBMITTED", "VAA_SIGNED"]);
    const stored = store.get(topUp.id)!;
    expect(stored.state).toBe("VAA_SIGNED");
    expect(stored.steps.map(({ status, refs }) => [status, refs.by])).toEqual([
      ["done", "DEPOSIT_DETECTED"],
      ["done", "SOURCE_SUBMITTED"],
      ["done", "VAA_SIGNED"],
    ]);
  });

  it("stops at a step that has to wait and never runs past it", async () => {
    const { calls, steps } = scripted({ SOURCE_SUBMITTED: [{ waiting: "not yet" }, { waiting: "not yet" }] });
    const topUp = newTopUp();
    await advance(runner(steps), topUp);
    await advance(runner(steps), topUp);

    expect(calls).toEqual(["DEPOSIT_DETECTED", "SOURCE_SUBMITTED", "SOURCE_SUBMITTED"]);
    expect(topUp.state).toBe("DEPOSIT_DETECTED");
    expect(topUp.steps[1]).toMatchObject({ status: "waiting", detail: "not yet", attempts: 0 });
  });

  it("records a failure, backs off, and retries the same step without repeating finished ones", async () => {
    const { calls, steps } = scripted({ SOURCE_SUBMITTED: [new Error("rpc down"), new Error("rpc down")] });
    const topUp = newTopUp();

    await advance(runner(steps), topUp);
    expect(topUp.steps[1]).toMatchObject({ status: "retrying", detail: "rpc down", attempts: 1, retryAt: 5_000 });

    clock = 4_999;
    await advance(runner(steps), topUp);
    expect(calls).toEqual(["DEPOSIT_DETECTED", "SOURCE_SUBMITTED"]);

    clock = 5_000;
    await advance(runner(steps), topUp);
    expect(topUp.steps[1]).toMatchObject({ attempts: 2, retryAt: 15_000 });

    clock = 15_000;
    await advance(runner(steps), topUp);
    expect(calls).toEqual([
      "DEPOSIT_DETECTED",
      "SOURCE_SUBMITTED",
      "SOURCE_SUBMITTED",
      "SOURCE_SUBMITTED",
      "VAA_SIGNED",
    ]);
    expect(topUp.state).toBe("VAA_SIGNED");
  });

  it("resumes after a restart from what was stored, not from the beginning", async () => {
    const first = scripted({ VAA_SIGNED: [{ waiting: "guardians" }] });
    const topUp = newTopUp();
    await advance(runner(first.steps), topUp);
    store.close();

    store = new Store(join(directory, "relayer.sqlite"));
    const [reloaded] = store.open();
    const second = scripted({});
    await advance(runner(second.steps), reloaded!);

    expect(second.calls).toEqual(["VAA_SIGNED"]);
    expect(store.open()).toHaveLength(1);
    expect(store.get(topUp.id)!.state).toBe("VAA_SIGNED");
  });
});
