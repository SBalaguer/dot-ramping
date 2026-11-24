import {
  BASE_SEPOLIA_AAVE_FAUCET,
  BASE_SEPOLIA_USDC,
  MAINNET_USDT,
  SEPOLIA_USDC,
  devUserAccount,
  tetherAbi,
  type EvmChainKey,
} from "@onramp/chains";
import { actor, confirmed, send, type Actor } from "@onramp/contracts";
import { formatUnits, parseAbi, parseUnits, type Address } from "viem";

import type { TopUpView } from "../relayer/src/topup";

interface Demo {
  chain: Exclude<EvmChainKey, "hydrationFork">;
  chainName: string;
  token: Address;
  symbol: string;
  /** Deposit when no amount is given; the Snowbridge route starts at the routing threshold. */
  defaultAmount: string;
  /** Tops the dev wallet up by at least `shortfall` when the chain has a faucet anyone can call; returns what it minted. */
  obtain?: (user: Actor, shortfall: bigint) => Promise<bigint>;
}

const faucetAbi = parseAbi(["function mint(address token, address to, uint256 amount) returns (uint256)"]);
const DECIMALS = 6;
/** Aave's faucet serves an address once an hour, so one mint has to cover many demo runs. */
const FAUCET_STOCK = parseUnits("1000", DECIMALS);

const DEMOS: Record<string, Demo> = {
  "w-eth": { chain: "sepolia", chainName: "Sepolia", token: SEPOLIA_USDC, symbol: "USDC", defaultAmount: "5" },
  "w-base": {
    chain: "baseSepolia",
    chainName: "Base Sepolia",
    token: BASE_SEPOLIA_USDC,
    symbol: "USDC",
    defaultAmount: "5",
    obtain: async (user, shortfall) => {
      const amount = shortfall > FAUCET_STOCK ? shortfall : FAUCET_STOCK;
      const args = [BASE_SEPOLIA_USDC, user.wallet.account.address, amount] as const;
      await send(user, { address: BASE_SEPOLIA_AAVE_FAUCET, abi: faucetAbi, functionName: "mint", args });
      return amount;
    },
  },
  /** `pnpm forks:up` gives the dev wallet its USDT on the fork. */
  "s-eth": {
    chain: "ethereumFork",
    chainName: "the Ethereum fork",
    token: MAINNET_USDT,
    symbol: "USDT",
    defaultAmount: "300",
  },
};

const RELAYER = process.env.RELAYER_URL ?? "http://127.0.0.1:8787";
const POLL_MS = 2_000;
/** Whole messages, too long to print. */
const LONG_REFS = new Set(["vaa", "xcm", "message"]);
const TIMEOUT_MS = 10 * 60_000;

const demo = DEMOS[process.argv[2] ?? ""];
if (!demo) throw new Error(`usage: tsx scripts/demo.ts <${Object.keys(DEMOS).join("|")}> [amount]`);
const amount = parseUnits(process.argv[3] ?? demo.defaultAmount, DECIMALS);
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

const user = actor(demo.chain, devUserAccount());
// Tether's ABI also fits the USDC tokens: only `transfer`'s unused return value differs.
const token = { address: demo.token, abi: tetherAbi } as const;
const balance = await user.reader.readContract({
  ...token,
  functionName: "balanceOf",
  args: [user.wallet.account.address],
});
if (balance < amount) {
  if (!demo.obtain) {
    throw new Error(`the dev wallet holds ${formatUnits(balance, DECIMALS)} ${demo.symbol} on ${demo.chainName}`);
  }
  const minted = await demo.obtain(user, amount - balance);
  log(`minted ${formatUnits(minted, DECIMALS)} ${demo.symbol} from the faucet on ${demo.chainName}`);
}
const created = await relayer("/topups", { method: "POST" });
log(`top-up ${created.id}`);
log(`  deposit address    ${created.forwarder}`);
log(`  Asset Hub account  ${created.beneficiary.ss58}`);

const transfer = await user.wallet.writeContract({
  ...token,
  functionName: "transfer",
  args: [created.forwarder, amount],
});
await confirmed(user, transfer);
log(
  `user sent ${formatUnits(amount, DECIMALS)} ${demo.symbol} to the deposit address on ${demo.chainName}: ${transfer}`,
);

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
    const refs = Object.entries(step.refs).flatMap(([key, value]) => (LONG_REFS.has(key) ? [] : [`${key}=${value}`]));
    log(`${line}${step.status === "done" ? `  ${refs.join(" ")}` : ""}`);
  }
}

const received = BigInt(topUp.steps.find(({ name }) => name === "COMPLETED")!.refs.received!);
log(
  `deposited ${formatUnits(amount, DECIMALS)} ${demo.symbol} on ${demo.chainName}, received ${formatUnits(received, DECIMALS)} USDT on Asset Hub`,
);
