import { hub, XcmV5Junctions, XcmVersionedLocation, XcmVersionedXcm } from "@galacticcouncil/descriptors";
import { Binary, getTypedCodecs } from "polkadot-api";
import { concatHex, size, slice, type Hex } from "viem";

export type VersionedXcm = ReturnType<typeof XcmVersionedXcm.V5>;
export type XcmInstruction = VersionedXcm["value"][number];
export type XcmLocation = Parameters<typeof XcmVersionedLocation.V5>[0];

export interface XcmCodec {
  /** SCALE `VersionedXcm`, as Snowbridge's `v2_sendMessage` expects its `xcm` argument. */
  xcm: (message: VersionedXcm) => Hex;
  /** SCALE XCM v5 `Location` without a version prefix, as Snowbridge expects its `claimer` argument. */
  location: (location: XcmLocation) => Hex;
  /** Both decoders accept XCM v5 only, the version every message of ours is written in. */
  decodeXcm: (encoded: Hex) => VersionedXcm;
  decodeLocation: (encoded: Hex) => XcmLocation;
}

const HERE = XcmVersionedLocation.V5({ parents: 0, interior: XcmV5Junctions.Here() });
const EMPTY_XCM = XcmVersionedXcm.V5([]);
/** `05 00 00`: version, no parents, `Here`. */
const ENCODED_HERE: Hex = "0x050000";
/** `05 00`: version, zero instructions. */
const ENCODED_EMPTY_XCM: Hex = "0x0500";
const VERSION: Hex = "0x05";

/** Encodes with the argument codec of Asset Hub's `PolkadotXcm.send(dest, message)`, the runtime's own XCM types. */
export async function xcmCodec(): Promise<XcmCodec> {
  const { send } = (await getTypedCodecs(hub)).tx.PolkadotXcm;
  const encode = (dest: typeof HERE, message: VersionedXcm): Hex => Binary.toHex(send.enc({ dest, message })) as Hex;

  return {
    xcm: (message) => slice(encode(HERE, message), size(ENCODED_HERE)),
    location: (location) => {
      const encoded = encode(XcmVersionedLocation.V5(location), EMPTY_XCM);
      return slice(encoded, size(VERSION), size(encoded) - size(ENCODED_EMPTY_XCM));
    },
    decodeXcm: (encoded) => {
      const { message } = send.dec(concatHex([ENCODED_HERE, encoded]));
      if (message.type !== "V5") throw new Error(`expected XCM v5, got ${message.type}`);
      return message;
    },
    decodeLocation: (encoded) => {
      const { dest } = send.dec(concatHex([VERSION, encoded, ENCODED_EMPTY_XCM]));
      if (dest.type !== "V5") throw new Error(`expected an XCM v5 location, got ${dest.type}`);
      return dest.value;
    },
  };
}
