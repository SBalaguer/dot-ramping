const env = (key: string, fallback: string): string => process.env[key] || fallback;

export const endpoints = {
  sepoliaRpc: env("SEPOLIA_RPC", "https://ethereum-sepolia-rpc.publicnode.com"),
  baseSepoliaRpc: env("BASE_SEPOLIA_RPC", "https://sepolia.base.org"),
  /** Fork source; must serve archive state at the pinned fork block, so there is no public default. */
  ethMainnetRpc: process.env.ETH_MAINNET_RPC || undefined,
  ethForkRpc: env("ETH_FORK_RPC", "http://127.0.0.1:8545"),
  hydrationForkWs: env("HYDRATION_FORK_WS", "ws://127.0.0.1:8061"),
  assetHubForkWs: env("AH_FORK_WS", "ws://127.0.0.1:8062"),
  wormholescanApi: env("WORMHOLESCAN_API", "https://api.testnet.wormholescan.io"),
} as const;

/** Hydration nodes, and chopsticks, serve the eth JSON-RPC on the same endpoint as the Substrate RPC. */
export const hydrationForkEvmRpc = endpoints.hydrationForkWs.replace(/^ws/, "http");
