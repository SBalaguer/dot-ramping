import {
  connectAssetHub,
  connectHydration,
  readDeployment,
  relayerAccount,
  type AssetHubApi,
  type Deployments,
  type HydrationApi,
} from "@onramp/chains";
import { actor, type Actor } from "@onramp/contracts";

/** Everything a step may touch: the relayer's account on each EVM chain and the two Polkadot chains. */
export interface Context {
  sepolia: Actor;
  hydrationEvm: Actor;
  hydration: HydrationApi;
  assetHub: AssetHubApi;
  deployed: { sepolia: Deployments["sepolia"]; hydration: Deployments["hydration-fork"] };
  thresholdUsd: number;
}

export function connect(thresholdUsd: number): { context: Context; disconnect: () => void } {
  const relayer = relayerAccount();
  const hydration = connectHydration();
  const assetHub = connectAssetHub();
  return {
    context: {
      sepolia: actor("sepolia", relayer),
      hydrationEvm: actor("hydrationFork", relayer),
      hydration: hydration.api,
      assetHub: assetHub.api,
      deployed: { sepolia: readDeployment("sepolia"), hydration: readDeployment("hydration-fork") },
      thresholdUsd,
    },
    disconnect: () => {
      hydration.client.destroy();
      assetHub.client.destroy();
    },
  };
}
