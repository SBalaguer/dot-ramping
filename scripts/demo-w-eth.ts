import { SEPOLIA_USDC, devUserAccount } from "@onramp/chains";
import { actor, confirmed } from "@onramp/contracts";
import { erc20Abi, formatUnits, parseUnits } from "viem";

import type { TopUpView } from "../relayer/src/topup";

const RELAYER = process.env.RELAYER_URL ?? "http://127.0.0.1:8787";
const DECIMALS = 6;
const POLL_MS = 2_000;
const TIMEOUT_MS = 10 * 60_000;

const amount = parseUnits(process.argv[2] ?? "5", DECIMALS);
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

const created = await relayer("/topups", { method: "POST", body: JSON.stringify({ chain: "sepolia" }) });
log(`top-up ${created.id}`);
log(`  deposit address (Sepolia)  ${created.forwarder}`);
log(`  Asset Hub account          ${created.beneficiary.ss58}`);

const user = actor("sepolia", devUserAccount());
const transfer = await user.wallet.writeContract({
  address: SEPOLIA_USDC,
  abi: erc20Abi,
  functionName: "transfer",
  args: [created.forwarder, amount],
});
await confirmed(user, transfer);
log(`user sent ${formatUnits(amount, DECIMALS)} USDC to the deposit address: ${transfer}`);

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
  `deposited ${formatUnits(amount, DECIMALS)} USDC on Sepolia, received ${formatUnits(received, DECIMALS)} USDT on Asset Hub`,
);
