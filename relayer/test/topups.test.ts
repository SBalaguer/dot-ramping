import { Route, deriveBeneficiary, forwarderAddress, routeMask, topUpParams } from "@onramp/keys";
import { describe, expect, it } from "vitest";

import { chooseRoute } from "../src/routing";
import { viewOf } from "../src/topup";
import { createTopUp } from "../src/topups";

const FACTORY = "0x74EEFEb03Dc729323573010d5C1c9267fCCe422C";
const USDC = 10n ** 6n;

describe("createTopUp", () => {
  const request = { factory: FACTORY, routeMask: routeMask(Route.Basejump, Route.Psm) } as const;

  it("derives the account, refund key and deposit address from the top-up's secrets alone", () => {
    const topUp = createTopUp(request);
    const params = topUpParams({ id: topUp.id, entropy: topUp.entropy }, topUp.routeMask);

    expect(topUp.beneficiary.accountId).toBe(deriveBeneficiary(topUp).accountId);
    expect(topUp.beneficiary.accountId).toBe(params.beneficiary);
    expect(topUp.refund).toBe(params.refund);
    expect(topUp.forwarder).toBe(forwarderAddress(FACTORY, params));
  });

  it("gives every top-up its own account and deposit address", () => {
    const [a, b] = [createTopUp(request), createTopUp(request)];
    expect(a.forwarder).not.toBe(b.forwarder);
    expect(a.beneficiary.accountId).not.toBe(b.beneficiary.accountId);
  });

  it("keeps the entropy out of what the API returns", () => {
    const topUp = createTopUp(request);
    expect(JSON.stringify(viewOf(topUp))).not.toContain(topUp.entropy.slice(2));
  });
});

describe("chooseRoute", () => {
  const all = routeMask(Route.Snowbridge, Route.Basejump);

  it("sends deposits below the threshold through Wormhole and the rest through Snowbridge", () => {
    expect(chooseRoute(250n * USDC - 1n, 6, all, 250)).toBe(Route.Basejump);
    expect(chooseRoute(250n * USDC, 6, all, 250)).toBe(Route.Snowbridge);
  });

  it("only picks a route bound into the deposit address", () => {
    expect(chooseRoute(1000n * USDC, 6, routeMask(Route.Basejump), 250)).toBe(Route.Basejump);
    expect(chooseRoute(1000n * USDC, 6, routeMask(Route.Psm), 250)).toBe(Route.Psm);
    expect(chooseRoute(10n * USDC, 6, routeMask(Route.Snowbridge), 250)).toBe(Route.Snowbridge);
    expect(() => chooseRoute(10n * USDC, 6, 0, 250)).toThrow(/allows no route/);
  });
});
