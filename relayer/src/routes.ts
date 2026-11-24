import { HYDRATION_ASSET } from "@onramp/chains";

import type { Context } from "./context";
import type { StepDefinition } from "./pipeline";
import { basejumpDelivered, basejumpSubmitted } from "./steps/basejump";
import { depositDetected } from "./steps/deposit";
import { homeSteps } from "./steps/home";
import { accountFunded, psmDelivered, psmSubmitted } from "./steps/psm";
import { vaaSigned } from "./steps/vaa";
import type { TopUp } from "./topup";

const PIPELINES: Record<string, StepDefinition<Context>[]> = {
  /** W-ETH: Sepolia USDC through Basejump; Hydration pays out Wormhole USDC. */
  basejump: [
    depositDetected,
    basejumpSubmitted,
    vaaSigned,
    basejumpDelivered,
    ...homeSteps({ assetIn: HYDRATION_ASSET.wormholeUsdc, route: [] }),
  ],
  /** W-BASE: Base Sepolia USDC through the HOLLAR PSM; Hydration mints HOLLAR. */
  psm: [
    depositDetected,
    accountFunded,
    psmSubmitted,
    vaaSigned,
    psmDelivered,
    ...homeSteps({ assetIn: HYDRATION_ASSET.hollar, route: [] }),
  ],
};

/** Until the deposit is seen only the watcher runs; after that, the pipeline of the route it chose. */
export function pipelineOf(topUp: TopUp): StepDefinition<Context>[] {
  const detection = topUp.steps.find(({ name, status }) => name === "DEPOSIT_DETECTED" && status === "done");
  if (!detection) return [depositDetected];
  const pipeline = PIPELINES[detection.refs.route ?? ""];
  if (!pipeline) throw new Error(`top-up ${topUp.id} chose the route ${detection.refs.route}, which has no pipeline`);
  return pipeline;
}
