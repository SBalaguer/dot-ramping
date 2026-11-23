import type { BoundTemplate } from "@onramp/contracts";
import { size, type Hex } from "viem";

/** Stand-in for the beneficiary account in template bytes; must match `BeneficiaryTemplate.PLACEHOLDER`. */
export const BENEFICIARY_PLACEHOLDER: Hex = `0x${"be".repeat(32)}`;

const PROBE: Hex = `0x${"5a".repeat(32)}`;
const WORD = 32;

/** Position of byte `offset` in a 0x-prefixed hex string. */
const hexIndex = (offset: number): number => 2 + 2 * offset;

export function fillTemplate(template: BoundTemplate, beneficiary: Hex): Hex {
  if (size(beneficiary) !== WORD) throw new RangeError("beneficiary must be 32 bytes");
  return template.offsets.reduce<Hex>((data, offset) => {
    const at = Number(offset);
    return `${data.slice(0, hexIndex(at))}${beneficiary.slice(2)}${data.slice(hexIndex(at + WORD))}` as Hex;
  }, template.data);
}

/**
 * Turns an encoder into a template the forwarder can fill on-chain. The encoding must depend on the
 * beneficiary only through verbatim 32-byte copies, which a second encoding with a probe value confirms.
 */
export function bindTemplate(encode: (beneficiary: Hex) => Hex): BoundTemplate {
  const data = encode(BENEFICIARY_PLACEHOLDER);
  const placeholder = BENEFICIARY_PLACEHOLDER.slice(2);
  const offsets: bigint[] = [];
  for (let at = 0; at + WORD <= size(data); at++) {
    if (data.slice(hexIndex(at), hexIndex(at + WORD)) === placeholder) offsets.push(BigInt(at));
  }
  if (offsets.length === 0) throw new Error("encoding does not contain the beneficiary");

  const template = { data, offsets };
  if (fillTemplate(template, PROBE) !== encode(PROBE)) {
    throw new Error("encoding depends on the beneficiary outside its 32-byte slots");
  }
  return template;
}
