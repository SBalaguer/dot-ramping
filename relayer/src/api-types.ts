import type { Address } from "viem";

import type { StepName, TopUp } from "./topup";

export type { Refs, Step, StepName } from "./topup";

/** "Ethereum" is two environments in this POC: Sepolia for Basejump and a mainnet fork for Snowbridge. */
export type SourceChain = "sepolia" | "baseSepolia" | "ethereumFork";

export type RouteName = "snowbridge" | "basejump" | "psm";

/** A top-up as the API returns it: everything but its entropy, plus the steps its route consists of. */
export type TopUpView = Omit<TopUp, "entropy"> & {
  /** Every step of the top-up's current pipeline, done or not, in order. */
  plan: StepName[];
};

export interface SourceView {
  chain: SourceChain;
  name: string;
  token: Address;
  symbol: string;
  decimals: number;
  routes: RouteName[];
}

/** What a client needs to know about this relayer before it creates a top-up. */
export interface ConfigView {
  relayer: Address;
  factory: Address;
  thresholdUsd: number;
  sources: SourceView[];
  /** Whether `POST /topups/:id/deposit` can send a deposit from the dev wallet. */
  demoDeposits: boolean;
}

/** The route a deposit of one size would take on each source chain; `null` where it would have none. */
export type RoutePreview = Record<SourceChain, RouteName | null>;

/** One holding along a top-up's path. Amounts are decimal strings in the asset's smallest unit. */
export interface Balance {
  /** A source chain, `hydration` or `asset-hub`. */
  chain: string;
  holder: "deposit address" | "top-up account";
  asset: string;
  decimals: number;
  amount: string;
}
