import { toEventSignature, toFunctionSignature, type Abi } from "viem";
import { describe, expect, it } from "vitest";

import { factoryAbi, forwarderAbi } from "../abi";
import { loadArtifact } from "../artifacts";

function signatures(abi: Abi): string[] {
  return abi.flatMap((item) => {
    if (item.type === "function") {
      const outputs = item.outputs.map((output) => output.type).join(",");
      return [`${toFunctionSignature(item)} ${item.stateMutability} returns (${outputs})`];
    }
    if (item.type === "event") {
      const indexed = item.inputs.map((input) => (input.indexed ? "1" : "0")).join("");
      return [`${toEventSignature(item)} indexed ${indexed}`];
    }
    if (item.type === "error") {
      return [`error ${item.name}(${item.inputs.map((input) => input.type).join(",")})`];
    }
    return [];
  });
}

describe("hand-written ABIs", () => {
  it.each([
    ["DepositForwarderFactory", factoryAbi],
    ["DepositForwarder", forwarderAbi],
  ] as const)("%s entries exist unchanged in the compiled contract", (contract, abi) => {
    const compiled = new Set(signatures(loadArtifact(contract).abi));
    for (const signature of signatures(abi)) expect(compiled).toContain(signature);
  });
});
