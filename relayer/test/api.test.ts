import { mkdtempSync, rmSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { Hash } from "viem";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createApi, type Api, type ApiOptions } from "../src/api";
import { Store } from "../src/store";
import type { TopUp } from "../src/topup";
import { createTopUp } from "../src/topups";

const FACTORY = "0x74EEFEb03Dc729323573010d5C1c9267fCCe422C";
const TX: Hash = `0x${"ab".repeat(32)}`;
const newTopUp = (): TopUp => createTopUp({ factory: FACTORY, routeMask: 2 }, 0);

describe("the relayer API", () => {
  let directory: string;
  let store: Store;
  let api: Api | undefined;

  async function serve(overrides: Partial<ApiOptions> = {}) {
    api = createApi({
      store,
      create: newTopUp,
      hasDeposit: () => Promise.resolve(true),
      planOf: () => ["DEPOSIT_DETECTED"],
      config: () => ({ relayer: FACTORY, factory: FACTORY, thresholdUsd: 250, sources: [], demoDeposits: false }),
      previewRoutes: () => ({ sepolia: "basejump", baseSepolia: "psm", ethereumFork: "snowbridge" }),
      balancesOf: () => Promise.resolve([]),
      ...overrides,
    });
    const { server } = api;
    await new Promise<void>((listening) => server.listen(0, "127.0.0.1", listening));
    const { port } = server.address() as AddressInfo;
    return async (method: string, path: string, body?: unknown) => {
      const response = await fetch(`http://127.0.0.1:${port}${path}`, {
        method,
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      return { status: response.status, text: await response.text() };
    };
  }

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), "relayer-"));
    store = new Store(join(directory, "relayer.sqlite"));
  });
  afterEach(async () => {
    await new Promise((closed) => api?.server.close(closed));
    store.close();
    rmSync(directory, { recursive: true });
  });

  it("never returns a top-up's entropy", async () => {
    const call = await serve();
    const created = await call("POST", "/topups");
    const [stored] = store.all();
    const entropy = stored!.entropy.slice(2);

    expect(created.status).toBe(201);
    expect(JSON.parse(created.text)).toMatchObject({ id: stored!.id, plan: ["DEPOSIT_DETECTED"] });
    for (const path of ["/topups", `/topups/${stored!.id}`]) {
      expect((await call("GET", path)).text).not.toContain(entropy);
    }
    expect(created.text).not.toContain(entropy);
  });

  it("queues an operator request instead of writing the top-up", async () => {
    const call = await serve();
    const topUp = newTopUp();
    store.save(topUp);

    expect((await call("POST", `/topups/${topUp.id}/refund`)).status).toBe(202);
    expect((await call("POST", `/topups/${topUp.id}/retry`)).status).toBe(409);
    expect((await call("POST", `/topups/${topUp.id}/sweep`)).status).toBe(404);

    expect(store.get(topUp.id)).toEqual(topUp);
    expect(store.requests()).toMatchObject([{ topUpId: topUp.id, kind: "refund" }]);
  });

  it("has no deposit endpoint without a dev wallet", async () => {
    const call = await serve();
    const topUp = newTopUp();
    store.save(topUp);

    expect((await call("POST", `/topups/${topUp.id}/deposit`, { chain: "sepolia", amount: "5" })).status).toBe(404);
  });

  it("passes a demo deposit to the dev wallet and reports why one could not be made", async () => {
    const deposits: string[] = [];
    const call = await serve({
      demoDeposit: (topUp, chain, amount) => {
        deposits.push(`${topUp.forwarder} ${chain} ${amount}`);
        return chain === "sepolia" ? Promise.resolve(TX) : Promise.reject(new Error("the dev wallet holds 0 USDC"));
      },
    });
    const topUp = newTopUp();
    store.save(topUp);
    const deposit = (body: unknown) => call("POST", `/topups/${topUp.id}/deposit`, body);

    expect(await deposit({ chain: "sepolia", amount: "5.5" })).toEqual({
      status: 201,
      text: JSON.stringify({ tx: TX }),
    });
    expect((await deposit({ chain: "sepolia", amount: "-1" })).status).toBe(400);
    expect((await deposit({ chain: "sepolia" })).status).toBe(400);
    const failed = await deposit({ chain: "baseSepolia", amount: "5" });
    expect(failed).toEqual({ status: 422, text: JSON.stringify({ error: "the dev wallet holds 0 USDC" }) });
    expect(deposits).toEqual([`${topUp.forwarder} sepolia 5.5`, `${topUp.forwarder} baseSepolia 5`]);
  });

  it("rejects a route preview without a decimal amount", async () => {
    const call = await serve();
    expect((await call("GET", "/routes?amount=300")).status).toBe(200);
    expect((await call("GET", "/routes?amount=lots")).status).toBe(400);
    expect((await call("GET", "/routes")).status).toBe(400);
  });
});
