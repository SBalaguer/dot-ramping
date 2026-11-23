import { endpoints } from "@onramp/chains";
import { configs, type ChainSpec } from "@whm/chopsticks";

export interface ForkSpec extends ChainSpec {
  /** Mainnet block the fork is pinned to, so runs are reproducible. */
  block: number;
}

export const hydration: ForkSpec = {
  ...configs.hydration,
  block: Number(process.env.HYDRATION_FORK_BLOCK || 17_352_800),
};

/** chopsticks serves Hydration's eth JSON-RPC on the same port as the Substrate RPC. */
export const hydrationEvmRpc = `http://127.0.0.1:${hydration.port}`;

export const assetHub: ForkSpec = {
  key: "assetHub",
  name: "Asset Hub",
  endpoint: ["wss://polkadot-asset-hub-rpc.polkadot.io", "wss://asset-hub-polkadot-rpc.n.dwellir.com"],
  port: 8062,
  paraId: 1000,
  block: Number(process.env.AH_FORK_BLOCK || 23_509_300),
};

export interface EthereumForkSpec {
  /** Archive-capable Ethereum mainnet RPC the fork reads from. */
  sourceRpc: string | undefined;
  block: number;
  /** URL anvil serves; its port is the port anvil listens on. */
  url: string;
}

export const ethereum: EthereumForkSpec = {
  sourceRpc: endpoints.ethMainnetRpc,
  block: Number(process.env.ETH_FORK_BLOCK || 26_478_800),
  url: endpoints.ethForkRpc,
};
