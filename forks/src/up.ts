import { rmSync, writeFileSync } from "node:fs";

import type { Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";

import { spawnEthereumFork } from "./ethereum";
import { PID_FILE } from "./pidfile";
import { spawnPolkadotForks, teardownPolkadotForks } from "./polkadot";
import { setUpHydrationFork } from "./setup";
import { assetHub, hydration } from "./specs";

const relayerKey = process.env.RELAYER_EVM_PK;
if (!relayerKey) throw new Error("RELAYER_EVM_PK is not set; the relayer key deploys the fork-side contracts (.env)");

const ethereum = await spawnEthereumFork();
const polkadot = await spawnPolkadotForks().catch(async (err) => {
  await ethereum.close();
  throw err;
});
writeFileSync(PID_FILE, String(process.pid));

const stop = async (): Promise<void> => {
  rmSync(PID_FILE, { force: true });
  await teardownPolkadotForks(polkadot);
  await ethereum.close();
};

try {
  const setup = await setUpHydrationFork(polkadot, privateKeyToAccount(relayerKey as Hex));
  console.log(`${"Ethereum".padEnd(10)} ${ethereum.url}  (forked at #${ethereum.spec.block})`);
  for (const spec of [hydration, assetHub]) {
    console.log(`${spec.name.padEnd(10)} ws://127.0.0.1:${spec.port}  (forked at #${spec.block})`);
  }
  console.log(`Wormhole core (testnet guardians) on Hydration: ${setup.wormholeCore}`);
  console.log("Forks ready. Ctrl-C or `pnpm forks:down` to stop.");
} catch (err) {
  await stop();
  throw err;
}

await new Promise<void>((resolve) => {
  process.once("SIGINT", resolve);
  process.once("SIGTERM", resolve);
});
await stop();
process.exit(0);
