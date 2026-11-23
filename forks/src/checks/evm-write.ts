import { publicClient, walletClient } from "@onramp/chains";
import type { Hex } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

import type { PolkadotForks } from "../polkadot";
import { fundEvmDeployer } from "../setup/evm-account";

/** Init code of a contract whose runtime returns the 32-byte word 42. */
const ANSWER_INIT_CODE: Hex = "0x600a600c600039600a6000f3602a60005260206000f3";

/** A viem wallet with no access to the fork process deploys a contract with default gas and fee estimation. */
export async function checkEvmWrite(forks: PolkadotForks): Promise<string> {
  const account = privateKeyToAccount(generatePrivateKey());
  await fundEvmDeployer(forks.hydration, account.address);
  const reader = publicClient("hydrationFork");

  const hash = await walletClient("hydrationFork", account).sendTransaction({ data: ANSWER_INIT_CODE });
  const receipt = await reader.waitForTransactionReceipt({ hash, timeout: 240_000 });
  if (receipt.status !== "success" || !receipt.contractAddress) {
    throw new Error(`deployment ${hash} ended as ${receipt.status}`);
  }
  const { data } = await reader.call({ to: receipt.contractAddress });
  if (BigInt(data ?? "0x0") !== 42n) throw new Error(`deployed contract returned ${data}`);

  return `eth_sendRawTransaction ${hash} deployed ${receipt.contractAddress} in block #${receipt.blockNumber}`;
}
