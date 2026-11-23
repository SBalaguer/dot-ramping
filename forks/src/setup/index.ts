import type { Account, Address } from "viem";

import type { PolkadotForks } from "../polkadot";
import { fundEvmDeployer } from "./evm-account";
import { deployTestnetWormholeCore } from "./wormhole-core";

export interface HydrationForkSetup {
  wormholeCore: Address;
}

/** Everything the Hydration fork needs beyond mainnet state, deployed by `operator` with real transactions. */
export async function setUpHydrationFork(forks: PolkadotForks, operator: Account): Promise<HydrationForkSetup> {
  await fundEvmDeployer(forks.hydration, operator.address);
  return { wormholeCore: await deployTestnetWormholeCore(operator) };
}
