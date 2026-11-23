import { AccountId } from "polkadot-api";
import { concat, createPublicClient, createWalletClient, http, pad, toHex, type Address, type Hex } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

import type { PolkadotForks } from "../polkadot";
import { hydrationEvmRpc } from "../specs";

const HYDRATION_SS58_PREFIX = 63;
const WETH = 20;
/** Init code of a contract whose runtime returns the 32-byte word 42. */
const ANSWER_INIT_CODE: Hex = "0x600a600c600039600a6000f3602a60005260206000f3";

/** Hydration maps an unbound H160 to `"ETH\0" ++ h160 ++ [0; 8]`. */
function truncatedAccount(address: Address): string {
  return AccountId(HYDRATION_SS58_PREFIX).dec(concat([toHex("ETH\0"), address, pad("0x", { size: 8 })]));
}

/** A viem wallet with no access to the fork process deploys a contract through the fork's eth RPC. */
export async function checkEvmWrite(forks: PolkadotForks): Promise<string> {
  const account = privateKeyToAccount(generatePrivateKey());
  const substrateAccount = truncatedAccount(account.address);
  await forks.hydration.setStorage({
    System: { Account: [[[substrateAccount], { providers: 1, data: { free: 10n ** 15n } }]] },
    Tokens: { Accounts: [[[substrateAccount, WETH], { free: 10n ** 18n }]] },
    EVMAccounts: { ContractDeployer: [[[account.address], true]] },
  });

  const transport = http(hydrationEvmRpc);
  const wallet = createWalletClient({ account, transport });
  const reader = createPublicClient({ transport });

  const hash = await wallet.sendTransaction({
    chain: null,
    data: ANSWER_INIT_CODE,
    gas: 1_000_000n,
    maxFeePerGas: 4n * (await reader.getGasPrice()),
    maxPriorityFeePerGas: 0n,
  });
  const receipt = await reader.waitForTransactionReceipt({ hash, pollingInterval: 500, timeout: 240_000 });
  if (receipt.status !== "success" || !receipt.contractAddress) {
    throw new Error(`deployment ${hash} ended as ${receipt.status}`);
  }
  const { data } = await reader.call({ to: receipt.contractAddress });
  if (BigInt(data ?? "0x0") !== 42n) throw new Error(`deployed contract returned ${data}`);

  return `eth_sendRawTransaction ${hash} deployed ${receipt.contractAddress} in block #${receipt.blockNumber}`;
}
