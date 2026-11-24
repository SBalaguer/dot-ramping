import { defineChain, getAddress, pad, toHex, type Address } from "viem";
import { getGasPrice } from "viem/actions";

import { hydrationForkEvmRpc } from "./endpoints";

export const HYDRATION_EVM_CHAIN_ID = 222_222;

export const HYDRATION_ASSET = { usdt: 10, weth: 20, wormholeUsdc: 21 } as const;

/** Hydration's mainnet NTT manager for USDC, the settlement counterpart of Ethereum's locking manager. */
export const HYDRATION_USDC_NTT_MANAGER: Address = "0xEcEab64542A875C4472671D9Ed1E690cdD4e28fC";

/** Every Hydration asset is also an ERC-20 at a precompile whose address ends in the asset id. */
export function hydrationAssetAddress(assetId: number): Address {
  return getAddress(pad(toHex((1n << 32n) | BigInt(assetId)), { size: 20 }));
}

/**
 * Hydration's EVM. The runtime recomputes its base fee at the start of every block, so a transaction
 * priced at the previous block's `eth_gasPrice` is rejected; the fee cap needs headroom over it. There
 * is no priority fee market.
 */
export const hydration = defineChain({
  id: HYDRATION_EVM_CHAIN_ID,
  name: "Hydration",
  nativeCurrency: { name: "Wrapped Ether", symbol: "WETH", decimals: 18 },
  rpcUrls: { default: { http: [hydrationForkEvmRpc] } },
  fees: {
    async estimateFeesPerGas({ client, multiply, type }) {
      const feeCap = multiply(await getGasPrice(client));
      return type === "legacy" ? { gasPrice: feeCap } : { maxFeePerGas: feeCap, maxPriorityFeePerGas: 0n };
    },
  },
});
