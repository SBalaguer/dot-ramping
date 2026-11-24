import { HYDRATION_ASSET } from "@onramp/chains";
import type { Network } from "@whm/chopsticks";
import { AccountId } from "polkadot-api";
import { concat, pad, parseEther, toHex, type Address } from "viem";

const HYDRATION_SS58_PREFIX = 63;
const HDX = 10n ** 12n;
const USDT = 10n ** 6n;

/** Hydration maps an unbound H160 to `"ETH\0" ++ h160 ++ [0; 8]`. */
export function truncatedAccount(address: Address): string {
  return AccountId(HYDRATION_SS58_PREFIX).dec(concat([toHex("ETH\0"), address, pad("0x", { size: 8 })]));
}

/**
 * Gives an EVM key what an operator needs on the Hydration fork: gas (WETH), existence (HDX), CREATE rights,
 * and USDT to front fee floats from.
 */
export async function fundEvmDeployer(hydration: Network, address: Address): Promise<void> {
  const account = truncatedAccount(address);
  await hydration.setStorage({
    System: { Account: [[[account], { providers: 1, data: { free: 1000n * HDX } }]] },
    Tokens: {
      Accounts: [
        [[account, HYDRATION_ASSET.weth], { free: parseEther("10") }],
        [[account, HYDRATION_ASSET.usdt], { free: 1000n * USDT }],
      ],
    },
    EVMAccounts: { ContractDeployer: [[[address], true]] },
  });
}
