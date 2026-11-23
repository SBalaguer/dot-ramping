import { rmSync, writeFileSync } from "node:fs";

import { spawnPolkadotForks, teardownPolkadotForks } from "./polkadot";
import { PID_FILE } from "./pidfile";

const forks = await spawnPolkadotForks();
writeFileSync(PID_FILE, String(process.pid));

for (const net of Object.values(forks)) {
  console.log(`${net.spec.name.padEnd(10)} ${net.url}  (forked at #${net.chain.head.number})`);
}
console.log("Forks ready. Ctrl-C or `pnpm forks:down` to stop.");

await new Promise<void>((stop) => {
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
});

rmSync(PID_FILE, { force: true });
await teardownPolkadotForks(forks);
process.exit(0);
