import { devUserAccount, endpoints, relayerAccount } from "@onramp/chains";
import { createPublicClient, createWalletClient, formatEther, http, parseEther } from "viem";
import { baseSepolia, sepolia } from "viem/chains";
import { getL2TransactionHashes, publicActionsL2, walletActionsL1 } from "viem/op-stack";

const ACCOUNTS = { relayer: relayerAccount, "dev-user": devUserAccount };
const L2_TIMEOUT_MS = 15 * 60_000;

const [who, ether] = process.argv.slice(2);
if (!who || !(who in ACCOUNTS) || !ether) {
  throw new Error("usage: pnpm bridge:base-sepolia <relayer|dev-user> <ether>");
}
const account = ACCOUNTS[who as keyof typeof ACCOUNTS]();
const amount = parseEther(ether);

/**
 * Moves the account's own Sepolia ETH to the same address on Base Sepolia through Base's native bridge (the
 * OptimismPortal on Sepolia), for when a Base Sepolia faucet is out of reach.
 */
const l1 = createWalletClient({ account, chain: sepolia, transport: http(endpoints.sepoliaRpc) }).extend(
  walletActionsL1(),
);
const l1Reader = createPublicClient({ chain: sepolia, transport: http(endpoints.sepoliaRpc) });
const l2 = createPublicClient({ chain: baseSepolia, transport: http(endpoints.baseSepoliaRpc) }).extend(
  publicActionsL2(),
);
const before = await l2.getBalance({ address: account.address });

const request = await l2.buildDepositTransaction({ account, mint: amount, to: account.address });
const deposit = await l1.depositTransaction(request);
console.log(`Sepolia deposit of ${formatEther(amount)} ETH from ${account.address}: ${deposit}`);

const receipt = await l1Reader.waitForTransactionReceipt({ hash: deposit });
if (receipt.status !== "success") throw new Error(`deposit ${deposit} reverted`);
const [credit] = getL2TransactionHashes(receipt);
if (!credit) throw new Error(`deposit ${deposit} carries no ${baseSepolia.name} transaction`);

await l2.waitForTransactionReceipt({ hash: credit, timeout: L2_TIMEOUT_MS });
const after = await l2.getBalance({ address: account.address });
console.log(`Base Sepolia credit ${credit}: balance ${formatEther(before)} -> ${formatEther(after)} ETH`);
