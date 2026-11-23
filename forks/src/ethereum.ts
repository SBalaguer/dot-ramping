import { startAnvil } from "@onramp/chains";

import { ethereum, type EthereumForkSpec } from "./specs";

export interface EthereumFork {
  spec: EthereumForkSpec;
  url: string;
  close: () => Promise<void>;
}

/** Forks Ethereum mainnet at the pinned block with anvil, so real mainnet contracts run locally. */
export async function spawnEthereumFork(spec: EthereumForkSpec = ethereum): Promise<EthereumFork> {
  if (!spec.sourceRpc) throw new Error("ETH_MAINNET_RPC is not set; it must be an archive endpoint (.env)");
  const anvil = await startAnvil({
    port: Number(new URL(spec.url).port),
    fork: { url: spec.sourceRpc, block: spec.block },
  });
  return { spec, url: anvil.url, close: anvil.stop };
}
