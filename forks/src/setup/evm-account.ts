import type { Network } from "@whm/chopsticks";
import { AccountId } from "polkadot-api";
import { concat, pad, parseEther, toHex, type Address } from "viem";

const HYDRATION_SS58_PREFIX = 63;
const WETH = 20;
const HDX = 10n ** 12n;

/** Hydration maps an unbound H160 to `"ETH\0" ++ h160 ++ [0; 8]`. */
export function truncatedAccount(address: Address): string {
  return AccountId(HYDRATION_SS58_PREFIX).dec(concat([toHex("ETH\0"), address, pad("0x", { size: 8 })]));
}

/** Gives an EVM key what it needs to deploy on the Hydration fork: gas (WETH), existence (HDX), CREATE rights. */
export async function fundEvmDeployer(hydration: Network, address: Address): Promise<void> {
  const account = truncatedAccount(address);
  await hydration.setStorage({
    System: { Account: [[[account], { providers: 1, data: { free: 1000n * HDX } }]] },
    Tokens: { Accounts: [[[account, WETH], { free: parseEther("10") }]] },
    EVMAccounts: { ContractDeployer: [[[address], true]] },
  });
}
