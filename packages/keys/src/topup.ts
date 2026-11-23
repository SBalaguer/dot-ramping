import { randomBytes, randomUUID } from "node:crypto";

import { sr25519CreateDerive } from "@polkadot-labs/hdkd";
import { blake2b256, ss58Address } from "@polkadot-labs/hdkd-helpers";
import type { PolkadotSigner } from "polkadot-api";
import { getPolkadotSigner } from "polkadot-api/signer";
import { concatBytes, hexToBytes, keccak256, stringToBytes, toHex, type Hex } from "viem";
import { privateKeyToAccount, type PrivateKeyAccount } from "viem/accounts";

const SEED_DOMAIN = stringToBytes("dep-poc/seed");
const EVM_DOMAIN = stringToBytes("dep-poc/evm");
const POLKADOT_SS58_PREFIX = 0;

/** The only secret material of a top-up; everything else is derived from it. */
export interface TopUpSecrets {
  id: Hex;
  entropy: Hex;
}

export interface Beneficiary {
  /** AccountId32 that receives the USDT on Asset Hub and the bridged asset on Hydration. */
  accountId: Hex;
  address: string;
  signer: PolkadotSigner;
}

function bytes32(value: Hex, name: string): Uint8Array {
  const bytes = hexToBytes(value);
  if (bytes.length !== 32) throw new RangeError(`${name} must be 32 bytes, got ${bytes.length}`);
  return bytes;
}

export function newTopUpSecrets(): TopUpSecrets {
  return { id: keccak256(stringToBytes(randomUUID())), entropy: toHex(randomBytes(32)) };
}

export function deriveSeed({ id, entropy }: TopUpSecrets): Uint8Array {
  return blake2b256(concatBytes([SEED_DOMAIN, bytes32(id, "id"), bytes32(entropy, "entropy")]));
}

/** The per-top-up sr25519 account, keyed directly by the derived seed as its mini-secret. */
export function deriveBeneficiary(secrets: TopUpSecrets): Beneficiary {
  const keyPair = sr25519CreateDerive(deriveSeed(secrets))("");
  return {
    accountId: toHex(keyPair.publicKey),
    address: ss58Address(keyPair.publicKey, POLKADOT_SS58_PREFIX),
    signer: getPolkadotSigner(keyPair.publicKey, "Sr25519", keyPair.sign),
  };
}

/**
 * The per-top-up EVM account that refunds are paid to and that may trigger its own refund. Its key is a
 * hash of the seed, so handing it to the user reveals neither the seed nor the Asset Hub key.
 */
export function deriveRefundAccount(secrets: TopUpSecrets): PrivateKeyAccount {
  return privateKeyToAccount(toHex(blake2b256(concatBytes([EVM_DOMAIN, deriveSeed(secrets)]))));
}
