import { rmSync, writeFileSync } from "node:fs";

import { devUserAccount, readDeployment, relayerAccount } from "@onramp/chains";
import { isAddressEqual } from "viem";

import { spawnEthereumFork } from "./ethereum";
import { PID_FILE } from "./pidfile";
import { spawnPolkadotForks, teardownPolkadotForks } from "./polkadot";
import { setUpEthereumFork, setUpHydrationFork } from "./setup";
import { assetHub, hydration } from "./specs";

const operator = relayerAccount();

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
  const deployed = await setUpHydrationFork(polkadot, operator);
  const factory = await setUpEthereumFork(operator, devUserAccount().address);
  const onTestnets = readDeployment("sepolia").factory;
  if (!isAddressEqual(factory, onTestnets)) {
    throw new Error(
      `the factory is ${factory} on the Ethereum fork but ${onTestnets} on the testnets; run pnpm deploy:testnets`,
    );
  }
  console.log(`${"Ethereum".padEnd(10)} ${ethereum.url}  (forked at #${ethereum.spec.block})`);
  for (const spec of [hydration, assetHub]) {
    console.log(`${spec.name.padEnd(10)} ws://127.0.0.1:${spec.port}  (forked at #${spec.block})`);
  }
  for (const [name, address] of Object.entries(deployed)) console.log(`${name.padEnd(18)} ${address}  (Hydration)`);
  console.log(`${"factory".padEnd(18)} ${factory}  (Ethereum, same as the testnets)`);
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
