import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { connectParachains } from "@galacticcouncil/chopsticks";
import { spawn, type Network } from "@whm/chopsticks";

import { assetHub, hydration, type ForkSpec } from "./specs";

const CACHE_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "../.cache");

export type PolkadotForks = Record<"hydration" | "assetHub", Network>;

/**
 * whm's `spawn` takes the pinned block and state cache from the environment, read at call time.
 * Instant mode seals a block per submitted transaction or inbound HRMP message, so external clients
 * see the fork behave like a live chain.
 */
async function spawnPinned(spec: ForkSpec): Promise<Network> {
  mkdirSync(CACHE_DIR, { recursive: true });
  process.env.CHOPSTICKS_BLOCK = String(spec.block);
  process.env.CHOPSTICKS_DB = resolve(CACHE_DIR, `${spec.key}-${spec.block}.sqlite`);
  const net = await spawn(spec);
  await net.client._request("dev_setBlockBuildMode", ["Instant"]);
  return net;
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
    forks.hydration = await spawnPinned(hydration);
    forks.assetHub = await spawnPinned(assetHub);
    await connectParachains([forks.hydration.chain, forks.assetHub.chain]);
    return forks as PolkadotForks;
  } catch (err) {
    await teardownPolkadotForks(forks);
    throw err;
  }
}
