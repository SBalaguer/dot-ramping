import { defineChain } from "viem";
import { getGasPrice } from "viem/actions";

import { hydrationForkEvmRpc } from "./endpoints";

export const HYDRATION_EVM_CHAIN_ID = 222_222;

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
