import type { RouteName, SourceChain, Step, StepName, TopUpView } from "@onramp/relayer/api";

/** Every stablecoin a top-up deposits or receives has six decimals. */
export const STABLE_DECIMALS = 6;

export const STEP_LABELS: Record<StepName, string> = {
  DEPOSIT_DETECTED: "Deposit seen at the deposit address",
  ACCOUNT_FUNDED: "Fee float sent to the top-up account",
  SOURCE_SUBMITTED: "Deposit forwarded into the bridge",
  VAA_SIGNED: "Wormhole guardians signed the message",
  GATEWAY_EVENT: "Snowbridge Gateway accepted the message",
  RELAY_SIMULATED: "Bridge Hub's message rebuilt",
  DRY_RUN_OK: "Dry-run on Asset Hub passed",
  DELIVERED_AH: "Message executed on Asset Hub",
  DELIVERED: "Funds arrived on Hydration",
  FEE_ASSET_SET: "Account can pay its fee",
  SWAPPED_AND_SENT: "Swapped to USDT and sent home",
  COMPLETED: "USDT received on Asset Hub",
  REFUNDED: "Deposit refunded",
};

export const ROUTE_LABELS: Record<RouteName, string> = {
  basejump: "Wormhole · Basejump",
  psm: "Wormhole · HOLLAR PSM",
  snowbridge: "Snowbridge",
};

const CHAIN_LABELS: Record<string, string> = {
  source: "Source chain",
  sepolia: "Sepolia",
  baseSepolia: "Base Sepolia",
  ethereumFork: "Ethereum fork",
  wormhole: "Wormhole testnet",
  "bridge-hub": "Bridge Hub",
  "asset-hub": "Asset Hub fork",
  hydration: "Hydration fork",
};

export const chainLabel = (chain: string): string => CHAIN_LABELS[chain] ?? chain;

/** Public explorers exist for the two testnets only; forks have none. */
const EXPLORERS: Record<string, string> = {
  sepolia: "https://sepolia.etherscan.io",
  baseSepolia: "https://sepolia.basescan.org",
};
const WORMHOLESCAN = "https://wormholescan.io/#/tx";

/** Whole messages; shown by size, not content. */
const BULKY_REFS = new Set(["vaa", "xcm", "message"]);
const ADDRESS = /^0x[0-9a-fA-F]{40}$/;

export function formatUnits(amount: string | bigint, decimals: number, maxFraction = 6): string {
  const value = BigInt(amount);
  const digits = (value < 0n ? -value : value).toString().padStart(decimals + 1, "0");
  const whole = digits.slice(0, digits.length - decimals).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const fraction = digits
    .slice(digits.length - decimals)
    .slice(0, maxFraction)
    .replace(/0+$/, "");
  return `${value < 0n ? "-" : ""}${whole}${fraction ? `.${fraction}` : ""}`;
}

export function formatDuration(ms: number): string {
  if (ms < 1_000) return `${Math.max(0, Math.round(ms))} ms`;
  const seconds = Math.round(ms / 1_000);
  if (seconds < 60) return `${seconds} s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} m ${String(seconds % 60).padStart(2, "0")} s`;
  return `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, "0")} m`;
}

export function shorten(value: string, head = 10, tail = 8): string {
  return value.length <= head + tail + 1 ? value : `${value.slice(0, head)}…${value.slice(-tail)}`;
}

export type Outcome = "awaiting deposit" | "in progress" | "completed" | "failed" | "refunded";

export interface Summary {
  outcome: Outcome;
  /** Set once a deposit has been seen. */
  chain?: SourceChain;
  route?: RouteName;
  deposited?: bigint;
  /** USDT on Asset Hub. */
  received?: bigint;
  /** What the route cost the user: deposited minus received. Negative when the swap paid above par. */
  cost?: bigint;
  /** From the deposit being seen to the end, or to `now` while the top-up is moving. */
  elapsedMs?: number;
}

const doneStep = (topUp: TopUpView, name: StepName): Step | undefined =>
  topUp.steps.find((step) => step.name === name && step.status === "done");

function outcomeOf(topUp: TopUpView, detected: boolean): Outcome {
  if (topUp.state === "COMPLETED") return "completed";
  if (topUp.state === "REFUNDED") return "refunded";
  if (topUp.state === "FAILED") return "failed";
  return detected ? "in progress" : "awaiting deposit";
}

export function summarize(topUp: TopUpView, now: number): Summary {
  const detection = doneStep(topUp, "DEPOSIT_DETECTED");
  const completion = doneStep(topUp, "COMPLETED");
  const outcome = outcomeOf(topUp, detection !== undefined);
  if (!detection) return { outcome };

  const deposited = BigInt(detection.refs.amount ?? "0");
  const received = completion?.refs.received === undefined ? undefined : BigInt(completion.refs.received);
  const moving = outcome === "in progress";
  const end = moving ? now : Math.max(...topUp.steps.map((step) => step.finishedAt ?? 0));
  return {
    outcome,
    chain: detection.refs.chain as SourceChain,
    route: detection.refs.route as RouteName,
    deposited,
    received,
    cost: received === undefined ? undefined : deposited - received,
    elapsedMs: end - (detection.finishedAt ?? detection.startedAt),
  };
}

/** `running` is the step the relayer is on but has not reported yet; `pending` ones come after it. */
export type TimelineEntry = Step | { name: StepName; status: "running" | "pending" };

/** The steps a top-up has taken, then those its route still has ahead of it. */
export function timelineOf(topUp: TopUpView): TimelineEntry[] {
  const started = new Set(topUp.steps.map(({ name }) => name));
  const ahead = topUp.plan.filter((name) => !started.has(name));
  const moving = topUp.steps.every(({ status }) => status === "done") && topUp.state !== "FAILED";
  return [
    ...topUp.steps,
    ...ahead.map((name, index) => ({
      name,
      status: moving && index === 0 ? ("running" as const) : ("pending" as const),
    })),
  ];
}

/** Where a step acted; the deposit and the refund name their chain in a reference. */
export function stepChain(step: Step): string {
  return chainLabel(step.chain === "source" ? (step.refs.chain ?? step.chain) : step.chain);
}

export interface Reference {
  key: string;
  value: string;
  /** Shortened for display; `value` is what gets copied. */
  text: string;
  href?: string;
}

/**
 * A step's references, with links where a public explorer can show them: testnet transactions and
 * addresses, and Wormhole messages. A reference named after a chain (`sepoliaTx`) belongs to that chain.
 */
export function referencesOf(step: Step): Reference[] {
  return Object.entries(step.refs).map(([key, value]) => {
    if (BULKY_REFS.has(key)) return { key, value, text: `${(value.length - 2) / 2} bytes` };
    if (key === "vaaId")
      return { key, value, text: shorten(value, 12, 6), href: `${WORMHOLESCAN}/${value}?network=Testnet` };

    const named = Object.keys(EXPLORERS).find((chain) => key.startsWith(chain));
    const explorer = EXPLORERS[named ?? (step.chain === "source" ? (step.refs.chain ?? "") : step.chain)];
    const isTransaction = key === "tx" || key.endsWith("Tx");
    const path = isTransaction ? "tx" : ADDRESS.test(value) ? "address" : undefined;
    return { key, value, text: shorten(value), href: explorer && path ? `${explorer}/${path}/${value}` : undefined };
  });
}

export function addressLink(chain: string, address: string): string | undefined {
  const explorer = EXPLORERS[chain];
  return explorer && `${explorer}/address/${address}`;
}
