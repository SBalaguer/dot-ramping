import { concatHex, keccak256, type Hex } from "viem";
import { beforeAll, describe, expect, it } from "vitest";

import { BENEFICIARY_PLACEHOLDER, bindTemplate, fillTemplate } from "../src/beneficiary-template";
import { claimer, snowbridgeTemplates, transferToHydration } from "../src/snowbridge/xcm";
import { xcmCodec, type XcmCodec } from "../src/xcm-codec";

const BENEFICIARY: Hex = "0xd43593c715fdd31c61141abd04a99fd6822c8558854ccde39a5684e7a56da27d";
const FIXTURE = "../../../contracts/test/fixtures/snowbridge-template.json";
/** No parents, one junction, `AccountId32`, network `Some(Polkadot)`. */
const CLAIMER_PREFIX: Hex = "0x0001010102";

let codec: XcmCodec;
beforeAll(async () => {
  codec = await xcmCodec();
});

describe("bindTemplate", () => {
  it("finds every beneficiary slot of the Snowbridge XCM and claimer as the runtime encodes them", async () => {
    const templates = snowbridgeTemplates(codec);
    const xcmFilled = codec.xcm(transferToHydration(BENEFICIARY));
    const claimerFilled = codec.location(claimer(BENEFICIARY));

    expect(templates.xcm.offsets).toHaveLength(2);
    expect(templates.claimer).toEqual({ data: concatHex([CLAIMER_PREFIX, BENEFICIARY_PLACEHOLDER]), offsets: [5n] });
    expect(fillTemplate(templates.xcm, BENEFICIARY)).toBe(xcmFilled);
    expect(fillTemplate(templates.claimer, BENEFICIARY)).toBe(claimerFilled);

    const fixture = {
      beneficiary: BENEFICIARY,
      xcmTemplate: templates.xcm.data,
      xcmOffsets: templates.xcm.offsets.map(Number),
      xcmFilled,
      claimerTemplate: templates.claimer.data,
      claimerOffsets: templates.claimer.offsets.map(Number),
      claimerFilled,
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
