import { spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";

import { ethereum, type EthereumForkSpec } from "./specs";

export interface EthereumFork {
  spec: EthereumForkSpec;
  url: string;
  close: () => Promise<void>;
}

const READY_TIMEOUT_MS = 60_000;

async function isServing(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_chainId", params: [] }),
    });
    return response.ok;
  } catch {
    return false;
  }
}

async function waitUntilServing(url: string, anvil: ChildProcess): Promise<void> {
  const deadline = Date.now() + READY_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (anvil.exitCode !== null) throw new Error(`anvil exited with code ${anvil.exitCode}`);
    if (await isServing(url)) return;
    await new Promise((retry) => setTimeout(retry, 250));
  }
  throw new Error(`anvil did not serve ${url} within ${READY_TIMEOUT_MS / 1000}s`);
}

/** Forks Ethereum mainnet at the pinned block with anvil, so real mainnet contracts run locally. */
export async function spawnEthereumFork(spec: EthereumForkSpec = ethereum): Promise<EthereumFork> {
  if (await isServing(spec.url)) throw new Error(`${spec.url} is already in use`);

  const anvil = spawn(
    "anvil",
    ["--fork-url", spec.sourceRpc, "--fork-block-number", String(spec.block), "--port", new URL(spec.url).port],
    { stdio: ["ignore", "ignore", "inherit"] },
  );
  const close = async (): Promise<void> => {
    if (anvil.exitCode !== null) return;
    anvil.kill("SIGTERM");
    await once(anvil, "exit");
  };

  try {
    await waitUntilServing(spec.url, anvil);
  } catch (err) {
    await close();
    throw err;
  }
  return { spec, url: spec.url, close };
}
