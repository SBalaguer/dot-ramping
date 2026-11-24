import { writeDeployment, type Deployments } from "@onramp/chains";
import { actor } from "@onramp/contracts";
import { isAddressEqual, type Account } from "viem";

import type { PolkadotForks } from "../polkadot";
import { forkContracts } from "./addresses";
import { deployBasejumpDestination } from "./basejump";
import { fundEvmDeployer } from "./evm-account";
import { deployTestnetWormholeCore } from "./wormhole-core";

export { forkContracts } from "./addresses";

/**
 * Everything the Hydration fork needs beyond mainnet state, deployed by `operator` with real transactions and
 * recorded in `deployments/hydration-fork.json`.
 */
export async function setUpHydrationFork(
  forks: PolkadotForks,
  operator: Account,
): Promise<Deployments["hydration-fork"]> {
  const by = actor("hydrationFork", operator);
  if ((await by.reader.getTransactionCount({ address: operator.address })) !== 0) {
    throw new Error(
      `${operator.address} has already transacted on Hydration; fork addresses would not be the planned ones`,
    );
  }
  await fundEvmDeployer(forks.hydration, operator.address);

  const wormholeCore = await deployTestnetWormholeCore(operator);
  const { landing, receiver } = await deployBasejumpDestination(forks.hydration, by, wormholeCore);
  const deployment = { wormholeCore, basejumpLanding: landing, basejumpReceiver: receiver };

  const planned = forkContracts(operator.address);
  for (const [name, address] of Object.entries(deployment) as [keyof typeof deployment, `0x${string}`][]) {
    if (!isAddressEqual(address, planned[name]))
      throw new Error(`${name} landed at ${address}, planned ${planned[name]}`);
  }
  writeDeployment("hydration-fork", deployment);
  return deployment;
}
