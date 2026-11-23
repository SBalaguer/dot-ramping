import type { Address } from "viem";
import { describe, expect, it } from "vitest";

import { forwarderAddress, implementationOf, saltOf, topUpParams, type ForwarderParams } from "../src/forwarder";
import { Route, isRouteAllowed, routeMask } from "../src/routes";
import { deriveBeneficiary, deriveRefundAccount } from "../src/topup";

const FACTORY: Address = "0x5FbDB2315678afecb367f032d93F642f64180aa3";
const FIXTURE = "../../../contracts/test/fixtures/derivation.json";

const secrets = { id: `0x${"11".repeat(32)}`, entropy: `0x${"22".repeat(32)}` } as const;
const base = topUpParams(secrets, routeMask(Route.Snowbridge, Route.Basejump));

describe("topUpParams", () => {
  it("takes both destinations from the top-up's own secrets", () => {
    expect(base).toEqual({
      ...secrets,
      beneficiary: deriveBeneficiary(secrets).accountId,
      refund: deriveRefundAccount(secrets).address,
      routeMask: 0b011,
    });
  });
});

describe("forwarderAddress", () => {
  it("commits to every field of the params", () => {
    const variants: ForwarderParams[] = [
      { ...base, id: `0x${"12".repeat(32)}` },
      { ...base, entropy: `0x${"23".repeat(32)}` },
      { ...base, beneficiary: `0x${"aa".repeat(32)}` },
      { ...base, refund: "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC" },
      { ...base, routeMask: routeMask(Route.Psm) },
    ];
    const addresses = [base, ...variants].map((params) => forwarderAddress(FACTORY, params));
    expect(new Set(addresses).size).toBe(variants.length + 1);
  });

  it("depends on the factory", () => {
    const other: Address = "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512";
    expect(forwarderAddress(other, base)).not.toBe(forwarderAddress(FACTORY, base));
  });

  it("matches the vectors the Solidity factory is tested against", async () => {
    const vectors: ForwarderParams[] = [
      base,
      { ...base, routeMask: 0 },
      { ...base, routeMask: 255 },
      { ...base, refund: "0x0000000000000000000000000000000000000000" },
      { ...base, id: `0x${"00".repeat(32)}`, entropy: `0x${"ff".repeat(32)}` },
    ];
    const fixture = {
      factory: FACTORY,
      implementation: implementationOf(FACTORY),
      ids: vectors.map((v) => v.id),
      entropies: vectors.map((v) => v.entropy),
      beneficiaries: vectors.map((v) => v.beneficiary),
      refunds: vectors.map((v) => v.refund),
      routeMasks: vectors.map((v) => v.routeMask),
      salts: vectors.map(saltOf),
      forwarders: vectors.map((v) => forwarderAddress(FACTORY, v)),
    };
    await expect(`${JSON.stringify(fixture, null, 2)}\n`).toMatchFileSnapshot(FIXTURE);
  });
});

describe("routeMask", () => {
  it("sets exactly the bit of each route", () => {
    expect(routeMask()).toBe(0);
    expect(routeMask(Route.Snowbridge)).toBe(0b001);
    expect(routeMask(Route.Basejump, Route.Psm)).toBe(0b110);
    expect(isRouteAllowed(routeMask(Route.Basejump), Route.Basejump)).toBe(true);
    expect(isRouteAllowed(routeMask(Route.Basejump), Route.Psm)).toBe(false);
  });
});
