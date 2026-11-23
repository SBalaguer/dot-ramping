import { configs, type ChainSpec } from "@whm/chopsticks";

export interface ForkSpec extends ChainSpec {
  /** Mainnet block the fork is pinned to, so runs are reproducible. */
  block: number;
}

export const hydration: ForkSpec = {
  ...configs.hydration,
  block: Number(process.env.HYDRATION_FORK_BLOCK ?? 17_352_800),
};

export const assetHub: ForkSpec = {
  key: "assetHub",
  name: "Asset Hub",
  endpoint: ["wss://polkadot-asset-hub-rpc.polkadot.io", "wss://asset-hub-polkadot-rpc.n.dwellir.com"],
  port: 8062,
  paraId: 1000,
  block: Number(process.env.AH_FORK_BLOCK ?? 23_509_300),
};
