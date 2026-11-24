import type { Address, Hex } from "viem";

export type StepName =
  | "DEPOSIT_DETECTED"
  | "ACCOUNT_FUNDED"
  | "SOURCE_SUBMITTED"
  | "VAA_SIGNED"
  | "GATEWAY_EVENT"
  | "RELAY_SIMULATED"
  | "DRY_RUN_OK"
  | "DELIVERED_AH"
  | "DELIVERED"
  | "FEE_ASSET_SET"
  | "SWAPPED_AND_SENT"
  | "COMPLETED"
  | "REFUNDED";

/** References a step leaves behind for later steps and the dashboard: hashes, sequences, amounts as decimal strings. */
export type Refs = Record<string, string>;

export interface Step {
  name: StepName;
  /** Where the step acts, for display. */
  chain: string;
  /** `failed` is final until an operator asks for a retry. */
  status: "waiting" | "retrying" | "failed" | "done";
  attempts: number;
  /** Why the step is not done yet. */
  detail?: string;
  /** Unix ms before which a failed step is not tried again. */
  retryAt?: number;
  startedAt: number;
  finishedAt?: number;
  refs: Refs;
}

export interface TopUp {
  id: Hex;
  /** With `id`, the secret every key and address of this top-up derives from. Never leaves the relayer. */
  entropy: Hex;
  beneficiary: { ss58: string; accountId: Hex };
  /** The deposit address, the same on every source chain. */
  forwarder: Address;
  refund: Address;
  routeMask: number;
  /** The last step done, or `FAILED` once a step has used up its attempts. */
  state: "CREATED" | StepName | "FAILED";
  /** Set when an operator's refund request was accepted; from then on the top-up only refunds. */
  refundRequestedAt?: number;
  steps: Step[];
  createdAt: number;
  updatedAt: number;
}

/** How far a top-up got, whatever stopped it. */
export function progressOf(topUp: TopUp): "CREATED" | StepName {
  return topUp.steps.filter(({ status }) => status === "done").at(-1)?.name ?? "CREATED";
}

export function refsOf(topUp: TopUp, step: StepName): Refs {
  const found = topUp.steps.find(({ name, status }) => name === step && status === "done");
  if (!found) throw new Error(`top-up ${topUp.id} has not completed ${step}`);
  return found.refs;
}
