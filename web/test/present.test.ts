import type { Step, StepName, TopUpView } from "@onramp/relayer/api";
import { describe, expect, it } from "vitest";

import { formatDuration, formatUnits, referencesOf, summarize, timelineOf } from "../src/present";

const TX = `0x${"ab".repeat(32)}`;
const ADDRESS = `0x${"12".repeat(20)}`;

const step = (name: StepName, refs: Step["refs"] = {}, at = 0, chain = "hydration"): Step => ({
  name,
  chain,
  status: "done",
  attempts: 0,
  startedAt: at,
  finishedAt: at,
  refs,
});

const topUp = (state: TopUpView["state"], steps: Step[], plan: StepName[] = []): TopUpView => ({
  id: "0x01",
  beneficiary: { ss58: "1abc", accountId: "0x02" },
  forwarder: "0x0000000000000000000000000000000000000003",
  refund: "0x0000000000000000000000000000000000000004",
  routeMask: 7,
  state,
  steps,
  plan,
  createdAt: 0,
  updatedAt: 0,
});

describe("formatUnits", () => {
  it("groups thousands, trims trailing zeros and keeps the sign", () => {
    expect(formatUnits("10000963084", 6)).toBe("10,000.963084");
    expect(formatUnits("5000000", 6)).toBe("5");
    expect(formatUnits("-60478", 6)).toBe("-0.060478");
    expect(formatUnits("5000000000000000000", 18)).toBe("5");
    expect(formatUnits("1234567890123456789", 18)).toBe("1.234567");
  });
});

describe("formatDuration", () => {
  it("picks the unit that fits", () => {
    expect(formatDuration(850)).toBe("850 ms");
    expect(formatDuration(30_400)).toBe("30 s");
    expect(formatDuration(65_000)).toBe("1 m 05 s");
    expect(formatDuration(3_725_000)).toBe("1 h 02 m");
  });
});

describe("summarize", () => {
  const detection = step(
    "DEPOSIT_DETECTED",
    { chain: "ethereumFork", route: "snowbridge", amount: "300000000" },
    1_000,
  );

  it("knows nothing about a top-up before its deposit", () => {
    expect(summarize(topUp("CREATED", []), 9_000)).toEqual({ outcome: "awaiting deposit" });
  });

  it("measures a moving top-up against the clock", () => {
    const moving = summarize(topUp("SOURCE_SUBMITTED", [detection, step("SOURCE_SUBMITTED", {}, 4_000)]), 9_000);
    expect(moving).toMatchObject({
      outcome: "in progress",
      route: "snowbridge",
      deposited: 300_000_000n,
      elapsedMs: 8_000,
    });
    expect(moving.cost).toBeUndefined();
  });

  it("reports a negative cost when more arrives than was deposited", () => {
    const done = topUp("COMPLETED", [detection, step("COMPLETED", { received: "300060478" }, 31_000)]);
    expect(summarize(done, 999_000)).toMatchObject({
      outcome: "completed",
      received: 300_060_478n,
      cost: -60_478n,
      elapsedMs: 30_000,
    });
  });
});

describe("timelineOf", () => {
  it("lists the steps taken, then what the route still has ahead", () => {
    const plan: StepName[] = ["DEPOSIT_DETECTED", "SOURCE_SUBMITTED", "COMPLETED"];
    const entries = timelineOf(topUp("DEPOSIT_DETECTED", [step("DEPOSIT_DETECTED")], plan));
    expect(entries.map(({ name, status }) => [name, status])).toEqual([
      ["DEPOSIT_DETECTED", "done"],
      ["SOURCE_SUBMITTED", "running"],
      ["COMPLETED", "pending"],
    ]);
  });

  it("shows nothing as running while a step is waiting, retrying or failed", () => {
    const plan: StepName[] = ["DEPOSIT_DETECTED", "SOURCE_SUBMITTED", "COMPLETED"];
    const retrying: Step = { ...step("SOURCE_SUBMITTED"), status: "retrying" };
    const entries = timelineOf(topUp("DEPOSIT_DETECTED", [step("DEPOSIT_DETECTED"), retrying], plan));
    expect(entries.map(({ status }) => status)).toEqual(["done", "retrying", "pending"]);
  });

  it("keeps the steps taken before a refund replaced the route", () => {
    const entries = timelineOf(topUp("REFUNDED", [step("DEPOSIT_DETECTED"), step("REFUNDED")], ["REFUNDED"]));
    expect(entries.map(({ name }) => name)).toEqual(["DEPOSIT_DETECTED", "REFUNDED"]);
  });
});

describe("referencesOf", () => {
  const hrefs = (references: ReturnType<typeof referencesOf>) =>
    Object.fromEntries(references.map(({ key, href }) => [key, href]));

  it("links testnet transactions and addresses to their explorer", () => {
    const sent = step("SOURCE_SUBMITTED", { tx: TX, emitter: ADDRESS, amount: "5000000" }, 0, "baseSepolia");
    expect(hrefs(referencesOf(sent))).toEqual({
      tx: `https://sepolia.basescan.org/tx/${TX}`,
      emitter: `https://sepolia.basescan.org/address/${ADDRESS}`,
      amount: undefined,
    });
  });

  it("links nothing on a fork, which no explorer can show", () => {
    for (const chain of ["ethereumFork", "hydration", "asset-hub"]) {
      expect(hrefs(referencesOf(step("SOURCE_SUBMITTED", { tx: TX, gateway: ADDRESS }, 0, chain)))).toEqual({
        tx: undefined,
        gateway: undefined,
      });
    }
  });

  it("takes the chain of a deposit or a refund from the reference itself", () => {
    const deposit = step("DEPOSIT_DETECTED", { chain: "sepolia", token: ADDRESS }, 0, "source");
    const refund = step("REFUNDED", { sepoliaTx: TX, ethereumForkTx: TX }, 0, "source");
    expect(hrefs(referencesOf(deposit)).token).toBe(`https://sepolia.etherscan.io/address/${ADDRESS}`);
    expect(hrefs(referencesOf(refund))).toEqual({
      sepoliaTx: `https://sepolia.etherscan.io/tx/${TX}`,
      ethereumForkTx: undefined,
    });
  });

  it("links a Wormhole message and shows whole messages by size", () => {
    const signed = step("VAA_SIGNED", { vaaId: "10002/00ab/4", vaa: "0x010203" }, 0, "wormhole");
    const [id, vaa] = referencesOf(signed);
    expect(id!.href).toBe("https://wormholescan.io/#/tx/10002/00ab/4?network=Testnet");
    expect(vaa!.text).toBe("3 bytes");
    expect(vaa!.href).toBeUndefined();
  });
});
