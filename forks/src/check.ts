import { checkEvmWrite } from "./checks/evm-write";
import { checkHollarHome } from "./checks/hollar-home";
import { checkHrmpTransfer } from "./checks/hrmp";
import { checkSnowbridge } from "./checks/snowbridge";
import { checkSwapHome } from "./checks/swap-home";
import { checkWormholeCore } from "./checks/wormhole-core";
import { spawnEthereumFork } from "./ethereum";
import { spawnPolkadotForks, teardownPolkadotForks, type PolkadotForks } from "./polkadot";

const CHECKS: [string, (forks: PolkadotForks) => Promise<string>][] = [
  ["HRMP transfer Hydration -> Asset Hub", checkHrmpTransfer],
  ["Swap and send home from a fresh account", checkSwapHome],
  ["HOLLAR minted to an unbound account goes home", checkHollarHome],
  ["EVM write through the Hydration fork RPC", checkEvmWrite],
  ["Wormhole core accepting testnet VAAs", checkWormholeCore],
  ["Snowbridge deposit from the Ethereum fork goes home", checkSnowbridge],
];

/** `pnpm check:forks snowbridge` runs only the checks whose name contains the word. */
const only = process.argv[2]?.toLowerCase();
const selected = CHECKS.filter(([name]) => !only || name.toLowerCase().includes(only));

const ethereum = await spawnEthereumFork();
const forks = await spawnPolkadotForks().catch(async (err) => {
  await ethereum.close();
  throw err;
});
let failed = false;
try {
  for (const [name, check] of selected) {
    try {
      console.log(`ok    ${name}: ${await check(forks)}`);
    } catch (err) {
      failed = true;
      console.log(`FAIL  ${name}: ${(err as Error).message}`);
    }
  }
} finally {
  await teardownPolkadotForks(forks);
  await ethereum.close();
}
process.exit(failed ? 1 : 0);
