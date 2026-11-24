import type { Address, Hex } from "viem";

export type StepName =
  | "DEPOSIT_DETECTED"
  | "SOURCE_SUBMITTED"
  | "VAA_SIGNED"
  | "DELIVERED"
  | "FEE_ASSET_SET"
  | "SWAPPED_AND_SENT"
  | "COMPLETED";

/** References a step leaves behind for later steps and the dashboard: hashes, sequences, amounts as decimal strings. */
export type Refs = Record<string, string>;

export interface Step {
  name: StepName;
  /** Where the step acts, for display. */
  chain: string;
  status: "waiting" | "retrying" | "done";
  attempts: number;
  /** Why the step is not done yet. */
  detail?: string;
  /** Unix ms before which a failed step is not tried again. */
  retryAt?: number;
  startedAt: number;
  finishedAt?: number;
  refs: Refs;
}

export type SourceChain = "sepolia";
export type RouteName = "basejump";

export interface TopUp {
  id: Hex;
  /** With `id`, the secret every key and address of this top-up derives from. Never leaves the relayer. */
  entropy: Hex;
  sourceChain: SourceChain;
  beneficiary: { ss58: string; accountId: Hex };
  forwarder: Address;
  refund: Address;
  routeMask: number;
  state: "CREATED" | StepName;
  steps: Step[];
  createdAt: number;
  updatedAt: number;
}

export type TopUpView = Omit<TopUp, "entropy">;

export function viewOf({ entropy: _secret, ...view }: TopUp): TopUpView {
  return view;
}

export function refsOf(topUp: TopUp, step: StepName): Refs {
  const found = topUp.steps.find(({ name, status }) => name === step && status === "done");
  if (!found) throw new Error(`top-up ${topUp.id} has not completed ${step}`);
  return found.refs;
}
