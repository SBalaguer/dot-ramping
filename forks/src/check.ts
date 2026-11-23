import { checkEvmWrite } from "./checks/evm-write";
import { checkHrmpTransfer } from "./checks/hrmp";
import { checkWormholeCore } from "./checks/wormhole-core";
import { spawnPolkadotForks, teardownPolkadotForks, type PolkadotForks } from "./polkadot";

const CHECKS: [string, (forks: PolkadotForks) => Promise<string>][] = [
  ["HRMP transfer Hydration -> Asset Hub", checkHrmpTransfer],
  ["EVM write through the Hydration fork RPC", checkEvmWrite],
  ["Wormhole core accepting testnet VAAs", checkWormholeCore],
];

const forks = await spawnPolkadotForks();
let failed = false;
try {
  for (const [name, check] of CHECKS) {
    try {
      console.log(`ok    ${name}: ${await check(forks)}`);
    } catch (err) {
      failed = true;
      console.log(`FAIL  ${name}: ${(err as Error).message}`);
    }
  }
} finally {
  await teardownPolkadotForks(forks);
}
process.exit(failed ? 1 : 0);
