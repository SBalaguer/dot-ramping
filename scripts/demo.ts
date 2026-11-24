import { formatUnits } from "viem";

import type { ConfigView, SourceChain, TopUpView } from "../relayer/src/api-types";

/** Each demo deposits on the chain that has its route; the Snowbridge one starts at the routing threshold. */
const DEMOS: Record<string, { chain: SourceChain; defaultAmount: string }> = {
  "w-eth": { chain: "sepolia", defaultAmount: "5" },
  "w-base": { chain: "baseSepolia", defaultAmount: "5" },
  "s-eth": { chain: "ethereumFork", defaultAmount: "300" },
};

const RELAYER = process.env.RELAYER_URL ?? "http://127.0.0.1:8787";
const POLL_MS = 2_000;
const TIMEOUT_MS = 10 * 60_000;
const HOME_DECIMALS = 6;
/** Whole messages, too long to print. */
const LONG_REFS = new Set(["vaa", "xcm", "message"]);

const demo = DEMOS[process.argv[2] ?? ""];
if (!demo) throw new Error(`usage: tsx scripts/demo.ts <${Object.keys(DEMOS).join("|")}> [amount]`);
const amount = process.argv[3] ?? demo.defaultAmount;
const started = Date.now();
const log = (line: string): void =>
  console.log(`[${String(Math.round((Date.now() - started) / 1000)).padStart(3)}s] ${line}`);

async function relayer<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${RELAYER}${path}`, init).catch(() => {
    throw new Error(`no relayer at ${RELAYER}; start the forks (pnpm forks:up) and the relayer (pnpm relayer:dev)`);
  });
  const body = (await response.json()) as T & { error?: string };
  if (!response.ok) throw new Error(`relayer refused ${path}: ${body.error ?? response.status}`);
  return body;
}

const config = await relayer<ConfigView>("/config");
const source = config.sources.find(({ chain }) => chain === demo.chain)!;

const created = await relayer<TopUpView>("/topups", { method: "POST" });
log(`top-up ${created.id}`);
log(`  deposit address    ${created.forwarder}`);
log(`  Asset Hub account  ${created.beneficiary.ss58}`);

const { tx } = await relayer<{ tx: string }>(`/topups/${created.id}/deposit`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ chain: demo.chain, amount }),
});
log(`the dev wallet sent ${amount} ${source.symbol} to the deposit address on ${source.name}: ${tx}`);

const reported = new Set<string>();
let topUp = created;
while (topUp.state !== "COMPLETED") {
  if (topUp.state === "FAILED") throw new Error(`top-up failed; see GET /topups/${topUp.id}`);
  if (Date.now() - started > TIMEOUT_MS) throw new Error(`top-up stuck in ${topUp.state}`);
  await new Promise((poll) => setTimeout(poll, POLL_MS));
  topUp = await relayer<TopUpView>(`/topups/${topUp.id}`);
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
  `deposited ${amount} ${source.symbol} on ${source.name}, received ${formatUnits(received, HOME_DECIMALS)} USDT on Asset Hub`,
);
