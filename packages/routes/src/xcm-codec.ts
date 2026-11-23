import { hub, XcmV5Junctions, XcmVersionedLocation, XcmVersionedXcm } from "@galacticcouncil/descriptors";
import { Binary, getTypedCodecs } from "polkadot-api";
import { size, slice, type Hex } from "viem";

export type VersionedXcm = ReturnType<typeof XcmVersionedXcm.V5>;
export type XcmLocation = Parameters<typeof XcmVersionedLocation.V5>[0];

export interface XcmCodec {
  /** SCALE `VersionedXcm`, as Snowbridge's `v2_sendMessage` expects its `xcm` argument. */
  xcm: (message: VersionedXcm) => Hex;
  /** SCALE XCM v5 `Location` without a version prefix, as Snowbridge expects its `claimer` argument. */
  location: (location: XcmLocation) => Hex;
}

const HERE = XcmVersionedLocation.V5({ parents: 0, interior: XcmV5Junctions.Here() });
const EMPTY_XCM = XcmVersionedXcm.V5([]);
/** `05 00 00`: version, no parents, `Here`. */
const HERE_SIZE = 3;
/** `05 00`: version, zero instructions. */
const EMPTY_XCM_SIZE = 2;
const VERSION_SIZE = 1;

/** Encodes with the argument codec of Asset Hub's `PolkadotXcm.send(dest, message)`, the runtime's own XCM types. */
export async function xcmCodec(): Promise<XcmCodec> {
  const { send } = (await getTypedCodecs(hub)).tx.PolkadotXcm;
  const encode = (dest: typeof HERE, message: VersionedXcm): Hex => Binary.toHex(send.enc({ dest, message })) as Hex;

  return {
    xcm: (message) => slice(encode(HERE, message), HERE_SIZE),
    location: (location) => {
      const encoded = encode(XcmVersionedLocation.V5(location), EMPTY_XCM);
      return slice(encoded, VERSION_SIZE, size(encoded) - EMPTY_XCM_SIZE);
    },
  };
}
