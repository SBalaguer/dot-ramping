import { rmSync, writeFileSync } from "node:fs";

import { spawnEthereumFork } from "./ethereum";
import { PID_FILE } from "./pidfile";
import { spawnPolkadotForks, teardownPolkadotForks } from "./polkadot";

const ethereum = await spawnEthereumFork();
const polkadot = await spawnPolkadotForks().catch(async (err) => {
  await ethereum.close();
  throw err;
});
writeFileSync(PID_FILE, String(process.pid));

console.log(`${"Ethereum".padEnd(10)} ${ethereum.url}  (forked at #${ethereum.spec.block})`);
for (const net of Object.values(polkadot)) {
  console.log(`${net.spec.name.padEnd(10)} ws://127.0.0.1:${net.spec.port}  (forked at #${net.chain.head.number})`);
}
console.log("Forks ready. Ctrl-C or `pnpm forks:down` to stop.");

await new Promise<void>((stop) => {
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
});

rmSync(PID_FILE, { force: true });
await teardownPolkadotForks(polkadot);
await ethereum.close();
process.exit(0);
