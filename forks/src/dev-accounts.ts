import { sr25519CreateDerive } from "@polkadot-labs/hdkd";
import { DEV_PHRASE, entropyToMiniSecret, mnemonicToEntropy, ss58Address } from "@polkadot-labs/hdkd-helpers";
import type { PolkadotSigner } from "polkadot-api";
import { getPolkadotSigner } from "polkadot-api/signer";

export interface DevAccount {
  publicKey: Uint8Array;
  address: string;
  signer: PolkadotSigner;
}

const derive = sr25519CreateDerive(entropyToMiniSecret(mnemonicToEntropy(DEV_PHRASE)));

/** Well-known Substrate dev account (e.g. `//Alice`); only ever funded on forks. */
export function devAccount(path: string): DevAccount {
  const pair = derive(path);
  return {
    publicKey: pair.publicKey,
    address: ss58Address(pair.publicKey, 0),
    signer: getPolkadotSigner(pair.publicKey, "Sr25519", pair.sign),
  };
}
