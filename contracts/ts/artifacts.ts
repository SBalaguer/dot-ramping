import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import type { Abi, Address, Hex } from "viem";

const BUILDS = {
  onramp: "../out",
  whm: "../../third_party/whm/contracts/out",
  ntt: "../../third_party/ntt/evm/out",
} as const;

export type Build = keyof typeof BUILDS;

export interface Artifact {
  abi: Abi;
  bytecode: Hex;
}

interface ForgeArtifact {
  abi: Abi;
  bytecode: { object: Hex; linkReferences: Record<string, Record<string, { start: number; length: number }[]>> };
}

/** Forge names an artifact `<contract>.<profile>.json` when a project compiles the contract under several profiles. */
function read(contract: string, build: Build): ForgeArtifact {
  const directory = new URL(`${BUILDS[build]}/${contract}.sol/`, import.meta.url);
  const file = [`${contract}.json`, `${contract}.default.json`]
    .map((name) => fileURLToPath(new URL(name, directory)))
    .find((path) => existsSync(path));
  if (!file) throw new Error(`${contract} is not built in ${fileURLToPath(directory)}; run pnpm bootstrap`);
  return JSON.parse(readFileSync(file, "utf8")) as ForgeArtifact;
}

export function loadAbi(contract: string, build: Build = "onramp"): Abi {
  return read(contract, build).abi;
}

/**
 * Reads a contract compiled by `forge build`, ours or a third party's (`pnpm bootstrap` builds all three), and
 * writes `libraries` into the creation code where the compiler left link placeholders.
 */
export function loadArtifact(
  contract: string,
  build: Build = "onramp",
  libraries: Record<string, Address> = {},
): Artifact {
  const { abi, bytecode } = read(contract, build);

  let code = bytecode.object.slice(2);
  for (const [library, positions] of Object.values(bytecode.linkReferences).flatMap(Object.entries)) {
    const address = libraries[library];
    if (!address) throw new Error(`${contract} links ${library}; pass its address`);
    for (const { start, length } of positions) {
      code = code.slice(0, start * 2) + address.slice(2).toLowerCase() + code.slice((start + length) * 2);
    }
  }
  return { abi, bytecode: `0x${code}` };
}
