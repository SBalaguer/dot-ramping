import {
  BASE_SEPOLIA_AAVE_FAUCET,
  BASE_SEPOLIA_USDC,
  SEPOLIA_USDC,
  devUserAccount,
  type EvmChainKey,
} from "@onramp/chains";
import { actor, confirmed, send, type Actor } from "@onramp/contracts";
import { erc20Abi, formatUnits, parseAbi, parseUnits, type Address } from "viem";

import type { TopUpView } from "../relayer/src/topup";

interface Demo {
  chain: Extract<EvmChainKey, "sepolia" | "baseSepolia">;
  chainName: string;
  usdc: Address;
  /** Tops the dev wallet up when the chain has a faucet anyone can call. */
  obtain?: (user: Actor, amount: bigint) => Promise<void>;
}

const faucetAbi = parseAbi(["function mint(address token, address to, uint256 amount) returns (uint256)"]);

const DEMOS: Record<string, Demo> = {
  "w-eth": { chain: "sepolia", chainName: "Sepolia", usdc: SEPOLIA_USDC },
  "w-base": {
    chain: "baseSepolia",
    chainName: "Base Sepolia",
    usdc: BASE_SEPOLIA_USDC,
    obtain: async (user, amount) => {
      const args = [BASE_SEPOLIA_USDC, user.wallet.account.address, amount] as const;
      await send(user, { address: BASE_SEPOLIA_AAVE_FAUCET, abi: faucetAbi, functionName: "mint", args });
    },
  },
};

const RELAYER = process.env.RELAYER_URL ?? "http://127.0.0.1:8787";
const DECIMALS = 6;
const POLL_MS = 2_000;
const TIMEOUT_MS = 10 * 60_000;

const demo = DEMOS[process.argv[2] ?? ""];
if (!demo) throw new Error(`usage: tsx scripts/demo.ts <${Object.keys(DEMOS).join("|")}> [amount]`);
const amount = parseUnits(process.argv[3] ?? "5", DECIMALS);
const started = Date.now();
const log = (line: string): void =>
  console.log(`[${String(Math.round((Date.now() - started) / 1000)).padStart(3)}s] ${line}`);

async function relayer(path: string, init?: RequestInit): Promise<TopUpView> {
  const response = await fetch(`${RELAYER}${path}`, init).catch(() => {
    throw new Error(`no relayer at ${RELAYER}; start the forks (pnpm forks:up) and the relayer (pnpm relayer:dev)`);
  });
  if (!response.ok) throw new Error(`relayer responded ${response.status} to ${path}`);
  return (await response.json()) as TopUpView;
}

const created = await relayer("/topups", { method: "POST" });
log(`top-up ${created.id}`);
log(`  deposit address    ${created.forwarder}`);
log(`  Asset Hub account  ${created.beneficiary.ss58}`);

const user = actor(demo.chain, devUserAccount());
const token = { address: demo.usdc, abi: erc20Abi } as const;
const balance = await user.reader.readContract({
  ...token,
  functionName: "balanceOf",
  args: [user.wallet.account.address],
});
if (balance < amount) {
  if (!demo.obtain) throw new Error(`the dev wallet holds ${formatUnits(balance, DECIMALS)} USDC on ${demo.chainName}`);
  await demo.obtain(user, amount - balance);
  log(`minted ${formatUnits(amount - balance, DECIMALS)} USDC from the faucet on ${demo.chainName}`);
}
const transfer = await user.wallet.writeContract({
  ...token,
  functionName: "transfer",
  args: [created.forwarder, amount],
});
await confirmed(user, transfer);
log(`user sent ${formatUnits(amount, DECIMALS)} USDC to the deposit address on ${demo.chainName}: ${transfer}`);

const reported = new Set<string>();
let topUp = created;
while (topUp.state !== "COMPLETED") {
  if (Date.now() - started > TIMEOUT_MS) throw new Error(`top-up stuck in ${topUp.state}`);
  await new Promise((poll) => setTimeout(poll, POLL_MS));
  topUp = await relayer(`/topups/${topUp.id}`);
  for (const step of topUp.steps) {
    const line = `${step.name.padEnd(17)} ${step.status}${step.detail ? `: ${step.detail}` : ""}`;
    if (reported.has(line)) continue;
    reported.add(line);
    const refs = Object.entries(step.refs).flatMap(([key, value]) => (key === "vaa" ? [] : [`${key}=${value}`]));
    log(`${line}${step.status === "done" ? `  ${refs.join(" ")}` : ""}`);
  }
}

const received = BigInt(topUp.steps.find(({ name }) => name === "COMPLETED")!.refs.received!);
log(
  `deposited ${formatUnits(amount, DECIMALS)} USDC on ${demo.chainName}, received ${formatUnits(received, DECIMALS)} USDT on Asset Hub`,
);
