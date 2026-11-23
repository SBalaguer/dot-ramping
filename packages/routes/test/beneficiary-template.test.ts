import {
  XcmV5AssetFilter,
  XcmV5Instruction,
  XcmV5Junction,
  XcmV5Junctions,
  XcmV5WildAsset,
  XcmVersionedXcm,
} from "@galacticcouncil/descriptors";
import { concatHex, keccak256, type Hex } from "viem";
import { beforeAll, describe, expect, it } from "vitest";

import { BENEFICIARY_PLACEHOLDER, bindTemplate, fillTemplate } from "../src/beneficiary-template";
import { xcmCodec, type XcmCodec, type XcmLocation } from "../src/xcm-codec";

const BENEFICIARY: Hex = "0xd43593c715fdd31c61141abd04a99fd6822c8558854ccde39a5684e7a56da27d";
const FIXTURE = "../../../contracts/test/fixtures/snowbridge-template.json";

const account = (id: Hex): XcmLocation => ({
  parents: 0,
  interior: XcmV5Junctions.X1(XcmV5Junction.AccountId32({ network: undefined, id })),
});

/** Refunds surplus fees and deposits everything to one account, naming it twice. */
const depositAll = (id: Hex) =>
  XcmVersionedXcm.V5([
    XcmV5Instruction.DepositAsset({
      assets: XcmV5AssetFilter.Wild(XcmV5WildAsset.AllCounted(1)),
      beneficiary: account(id),
    }),
    XcmV5Instruction.RefundSurplus(),
    XcmV5Instruction.DepositAsset({ assets: XcmV5AssetFilter.Wild(XcmV5WildAsset.All()), beneficiary: account(id) }),
  ]);

let codec: XcmCodec;
beforeAll(async () => {
  codec = await xcmCodec();
});

describe("bindTemplate", () => {
  it("finds every beneficiary slot of a runtime-encoded XCM and claimer", async () => {
    const xcm = bindTemplate((id) => codec.xcm(depositAll(id)));
    const claimer = bindTemplate((id) => codec.location(account(id)));

    expect(xcm.offsets).toHaveLength(2);
    expect(claimer).toEqual({ data: concatHex(["0x00010100", BENEFICIARY_PLACEHOLDER]), offsets: [4n] });
    expect(fillTemplate(xcm, BENEFICIARY)).toBe(codec.xcm(depositAll(BENEFICIARY)));
    expect(fillTemplate(claimer, BENEFICIARY)).toBe(codec.location(account(BENEFICIARY)));

    const fixture = {
      beneficiary: BENEFICIARY,
      xcmTemplate: xcm.data,
      xcmOffsets: xcm.offsets.map(Number),
      xcmFilled: codec.xcm(depositAll(BENEFICIARY)),
      claimerTemplate: claimer.data,
      claimerOffsets: claimer.offsets.map(Number),
      claimerFilled: codec.location(account(BENEFICIARY)),
    };
    await expect(`${JSON.stringify(fixture, null, 2)}\n`).toMatchFileSnapshot(FIXTURE);
  });

  it("rejects an encoding that does not carry the beneficiary", () => {
    expect(() => bindTemplate(() => "0x0500")).toThrow(/does not contain/);
  });

  it("rejects an encoding whose other bytes depend on the beneficiary", () => {
    const withChecksum = (id: Hex): Hex => concatHex([id, keccak256(id)]);
    expect(() => bindTemplate(withChecksum)).toThrow(/outside its 32-byte slots/);
  });
});

describe("fillTemplate", () => {
  it("rejects a beneficiary that is not 32 bytes", () => {
    const template = { data: BENEFICIARY_PLACEHOLDER, offsets: [0n] };
    expect(() => fillTemplate(template, "0x1234")).toThrow(RangeError);
  });
});
