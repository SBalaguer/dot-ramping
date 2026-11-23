import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { BuildBlockMode, connectParachains, setupWithServer } from "@galacticcouncil/chopsticks";
import type { Network } from "@whm/chopsticks";
import { createClient } from "polkadot-api";
import { getWsProvider } from "polkadot-api/ws";

import { assetHub, hydration, type ForkSpec } from "./specs";

const CACHE_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "../.cache");

export interface PolkadotForks {
  hydration: Network;
  assetHub: Network;
}

/** Manual block mode: every block is built explicitly, so reads at the returned hash never race a sealer. */
async function spawnFork(spec: ForkSpec): Promise<Network> {
  mkdirSync(CACHE_DIR, { recursive: true });
  const { chain, addr, close } = await setupWithServer({
    endpoint: spec.endpoint,
    port: spec.port,
    block: spec.block,
    db: resolve(CACHE_DIR, `${spec.key}-${spec.block}.sqlite`),
    "mock-signature-host": true,
    "build-block-mode": BuildBlockMode.Manual,
    "runtime-log-level": Number(process.env.RUNTIME_LOG_LEVEL ?? 0),
  });

  const url = `ws://127.0.0.1:${addr.split(":").pop()}`;
  const client = createClient(getWsProvider(url));
  const newBlock = (transactions?: string[]): Promise<string> =>
    client._request("dev_newBlock", [transactions ? { transactions } : {}]);
  const setStorage = (values: unknown): Promise<unknown> =>
    client._request("dev_setStorage", [
      JSON.parse(JSON.stringify(values, (_key, v) => (typeof v === "bigint" ? v.toString() : v))),
    ]);

  return { spec, chain, client, url, newBlock, setStorage, close };
}

export async function teardownPolkadotForks(forks: Partial<PolkadotForks>): Promise<void> {
  for (const net of Object.values(forks)) {
    net.client.destroy();
    await net.close();
  }
}

/** Forks Hydration and Polkadot Asset Hub at their pinned blocks and wires HRMP between them. */
export async function spawnPolkadotForks(): Promise<PolkadotForks> {
  const forks: Partial<PolkadotForks> = {};
  try {
    forks.hydration = await spawnFork(hydration);
    forks.assetHub = await spawnFork(assetHub);
    await connectParachains([forks.hydration.chain, forks.assetHub.chain]);
    return forks as PolkadotForks;
  } catch (err) {
    await teardownPolkadotForks(forks);
    throw err;
  }
}
