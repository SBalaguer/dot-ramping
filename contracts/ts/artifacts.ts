import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import type { Abi, Hex } from "viem";

export interface Artifact {
  abi: Abi;
  bytecode: Hex;
}

/** Reads a contract compiled by `forge build`; run `pnpm -F contracts build` first. */
export function loadArtifact(contract: string): Artifact {
  const path = fileURLToPath(new URL(`../out/${contract}.sol/${contract}.json`, import.meta.url));
  const { abi, bytecode } = JSON.parse(readFileSync(path, "utf8")) as { abi: Abi; bytecode: { object: Hex } };
  return { abi, bytecode: bytecode.object };
}
