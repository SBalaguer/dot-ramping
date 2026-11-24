import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { MAX_ATTEMPTS, advance, type StepDefinition } from "../src/pipeline";
import { applyRequest, refusal } from "../src/requests";
import { pipelineOf } from "../src/routes";
import { Store } from "../src/store";
import type { Step, StepName, TopUp } from "../src/topup";
import { createTopUp } from "../src/topups";
import { serveRequests } from "../src/worker";

const FACTORY = "0x74EEFEb03Dc729323573010d5C1c9267fCCe422C";
const deposited = (): Promise<boolean> => Promise.resolve(true);
const empty = (): Promise<boolean> => Promise.resolve(false);

const done = (name: StepName, refs: Step["refs"] = {}): Step => ({
  name,
  chain: "test",
  status: "done",
  attempts: 0,
  startedAt: 0,
  finishedAt: 0,
  refs,
});

function topUpAt(...steps: Step[]): TopUp {
  const topUp = createTopUp({ factory: FACTORY, routeMask: 2 }, 0);
  return { ...topUp, steps, state: steps.at(-1)?.name ?? "CREATED" };
}

describe("refund requests", () => {
  it("are refused once the deposit has been forwarded, whatever sits at the address", async () => {
    const inFlight = topUpAt(done("DEPOSIT_DETECTED", { route: "basejump" }), done("SOURCE_SUBMITTED"));
    expect(await refusal(inFlight, "refund", deposited)).toMatch(/already been forwarded/);
  });

  it("are refused when nothing is at the deposit address", async () => {
    expect(await refusal(topUpAt(), "refund", empty)).toMatch(/nothing is at the deposit address/);
  });

  it("replace the route's pipeline with the refund alone", async () => {
    const topUp = topUpAt(done("DEPOSIT_DETECTED", { route: "basejump" }));
    expect(await refusal(topUp, "refund", deposited)).toBeUndefined();
    expect(pipelineOf(topUp).map(({ name }) => name)).toContain("SOURCE_SUBMITTED");

    applyRequest(topUp, "refund", 1);

    expect(pipelineOf(topUp).map(({ name }) => name)).toEqual(["REFUNDED"]);
  });

  it("run the refund again when asked again after a later deposit", () => {
    const topUp = topUpAt(done("REFUNDED"));
    applyRequest(topUp, "refund", 1);

    expect(topUp.steps).toEqual([]);
    expect(topUp.state).toBe("CREATED");
  });
});

describe("retry requests", () => {
  const failing: StepDefinition<null> = {
    name: "SOURCE_SUBMITTED",
    chain: "test",
    run: () => Promise.reject(new Error("bridge paused")),
  };

  it("are refused unless a step has failed for good", async () => {
    expect(await refusal(topUpAt(done("DEPOSIT_DETECTED")), "retry", empty)).toMatch(/no failed step/);
  });

  it("give a failed step a fresh set of attempts from where the top-up stopped", async () => {
    const topUp = topUpAt(done("DEPOSIT_DETECTED"));
    let clock = 0;
    const runner = { context: null, pipelineOf: () => [failing], save: () => undefined, now: () => clock };
    for (let round = 0; round < MAX_ATTEMPTS; round++) {
      clock += 60 * 60_000;
      await advance(runner, topUp);
    }
    expect(topUp.state).toBe("FAILED");

    expect(await refusal(topUp, "retry", empty)).toBeUndefined();
    applyRequest(topUp, "retry", clock);

    expect(topUp.state).toBe("DEPOSIT_DETECTED");
    expect(topUp.steps[1]).toMatchObject({ status: "retrying", attempts: 0 });
  });
});

describe("the request queue", () => {
  let directory: string;
  let store: Store;

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), "relayer-"));
    store = new Store(join(directory, "relayer.sqlite"));
  });
  afterEach(() => {
    store.close();
    rmSync(directory, { recursive: true });
  });

  it("drops a queued refund if the deposit was forwarded before the worker got to it", async () => {
    const topUp = topUpAt(done("DEPOSIT_DETECTED", { route: "basejump" }));
    store.save(topUp);
    store.request(topUp.id, "refund");
    store.save({ ...topUp, steps: [...topUp.steps, done("SOURCE_SUBMITTED")], state: "SOURCE_SUBMITTED" });

    const runner = { context: null, pipelineOf: () => [], save: (changed: TopUp) => store.save(changed) };
    await serveRequests(store, runner, deposited);

    expect(store.requests()).toEqual([]);
    expect(store.get(topUp.id)).not.toHaveProperty("refundRequestedAt");
  });

  it("stops working on top-ups that are refunded or failed", () => {
    const refunded = topUpAt(done("REFUNDED"));
    const failed: TopUp = { ...topUpAt(done("DEPOSIT_DETECTED")), state: "FAILED" };
    const waiting = topUpAt();
    for (const topUp of [refunded, failed, waiting]) store.save(topUp);

    expect(store.open().map(({ id }) => id)).toEqual([waiting.id]);
  });
});
