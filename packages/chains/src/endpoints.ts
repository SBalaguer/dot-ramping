const env = (key: string, fallback: string): string => process.env[key] || fallback;

export const endpoints = {
  sepoliaRpc: env("SEPOLIA_RPC", "https://ethereum-sepolia-rpc.publicnode.com"),
  baseSepoliaRpc: env("BASE_SEPOLIA_RPC", "https://sepolia.base.org"),
  /** Fork source; must serve archive state at the pinned fork block, so there is no public default. */
  ethMainnetRpc: process.env.ETH_MAINNET_RPC || undefined,
  ethForkRpc: env("ETH_FORK_RPC", "http://127.0.0.1:8545"),
  wormholescanApi: env("WORMHOLESCAN_API", "https://api.testnet.wormholescan.io"),
} as const;
