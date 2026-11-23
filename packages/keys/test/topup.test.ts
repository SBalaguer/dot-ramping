import { DEV_MINI_SECRET } from "@polkadot-labs/hdkd-helpers";
import { sr25519CreateDerive } from "@polkadot-labs/hdkd";
import { toHex } from "viem";
import { describe, expect, it } from "vitest";

import { deriveBeneficiary, deriveSeed, newTopUpSecrets } from "../src/topup";

const ID = `0x${"11".repeat(32)}` as const;
const ENTROPY = `0x${"22".repeat(32)}` as const;

describe("deriveSeed", () => {
  it("is blake2b-256 over the domain tag, id and entropy", () => {
    // Computed independently with Python's hashlib.blake2b(digest_size=32).
    expect(toHex(deriveSeed({ id: ID, entropy: ENTROPY }))).toBe(
      "0x52c7a306a354221fb16b38cc37a2b7a5a6289c0a42f3255c659dff5126e90156",
    );
  });

  it("rejects ids and entropy that are not 32 bytes", () => {
    expect(() => deriveSeed({ id: "0x1234", entropy: ENTROPY })).toThrow(RangeError);
    expect(() => deriveSeed({ id: ID, entropy: `0x${"22".repeat(33)}` })).toThrow(RangeError);
  });

  it("does not let id and entropy be swapped for the same seed", () => {
    expect(deriveSeed({ id: ID, entropy: ENTROPY })).not.toEqual(deriveSeed({ id: ENTROPY, entropy: ID }));
  });
});

describe("deriveBeneficiary", () => {
  it("relies on a derivation that maps a mini-secret to its root sr25519 key", () => {
    // The Substrate dev phrase has mini-secret 0xfac7…479e and root account 5DfhGyQd…EqRzV.
    const root = sr25519CreateDerive(DEV_MINI_SECRET)("");
    expect(toHex(root.publicKey)).toBe("0x46ebddef8cd9bb167dc30878d7113b7e168e6f0646beffd77d69d39bad76b47a");
  });

  it("is deterministic and yields a Polkadot-prefixed address for the account id", () => {
    const first = deriveBeneficiary({ id: ID, entropy: ENTROPY });
    const again = deriveBeneficiary({ id: ID, entropy: ENTROPY });
    expect(again.accountId).toBe(first.accountId);
    expect(first.address).toMatch(/^1[1-9A-HJ-NP-Za-km-z]{46,47}$/);
    expect(toHex(first.signer.publicKey)).toBe(first.accountId);
  });

  it("gives every top-up its own account, even when only the entropy differs", () => {
    const a = deriveBeneficiary({ id: ID, entropy: ENTROPY });
    const b = deriveBeneficiary({ id: ID, entropy: `0x${"23".repeat(32)}` });
    expect(a.accountId).not.toBe(b.accountId);
  });
});

describe("newTopUpSecrets", () => {
  it("never repeats ids or entropy", () => {
    const secrets = Array.from({ length: 64 }, newTopUpSecrets);
    expect(new Set(secrets.map((s) => s.id)).size).toBe(64);
    expect(new Set(secrets.map((s) => s.entropy)).size).toBe(64);
  });
});
