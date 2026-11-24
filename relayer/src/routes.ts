import { HYDRATION_ASSET } from "@onramp/chains";

import type { Context } from "./context";
import type { StepDefinition } from "./pipeline";
import { delivered, sourceSubmitted, vaaSigned } from "./steps/basejump";
import { depositDetected } from "./steps/deposit";
import { homeSteps } from "./steps/home";
import type { TopUp } from "./topup";

/** W-ETH: Sepolia USDC through Basejump; Hydration pays out Wormhole USDC and swaps along its stored route. */
const BASEJUMP: StepDefinition<Context>[] = [
  depositDetected,
  sourceSubmitted,
  vaaSigned,
  delivered,
  ...homeSteps({ assetIn: HYDRATION_ASSET.wormholeUsdc, route: [] }),
];

const PIPELINES: Record<string, StepDefinition<Context>[]> = { basejump: BASEJUMP };

/** Until the deposit is seen only the watcher runs; after that, the pipeline of the route it chose. */
export function pipelineOf(topUp: TopUp): StepDefinition<Context>[] {
  const detection = topUp.steps.find(({ name, status }) => name === "DEPOSIT_DETECTED" && status === "done");
  if (!detection) return [depositDetected];
  const pipeline = PIPELINES[detection.refs.route ?? ""];
  if (!pipeline) throw new Error(`top-up ${topUp.id} chose the route ${detection.refs.route}, which has no pipeline`);
  return pipeline;
}
