import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { devUserAccount } from "@onramp/chains";
import { parseUnits } from "viem";

import { createApi } from "./api";
import type { SourceChain } from "./api-types";
import { connect } from "./context";
import { demoDepositor } from "./demo";
import { pipelineOf } from "./routes";
import { hasDeposit } from "./steps/refund";
import { Store } from "./store";
import type { TopUp } from "./topup";
import { createTopUp } from "./topups";
import { balancesOf, configOf, previewRoutes } from "./views";
import { startWorker } from "./worker";

const port = Number(process.env.RELAYER_PORT ?? 8787);
const databaseFile = process.env.RELAYER_DB ?? fileURLToPath(new URL("../data/relayer.sqlite", import.meta.url));
const thresholdUsd = Number(process.env.ROUTE_THRESHOLD_USD ?? 250);
const POLL_INTERVAL_MS = 5_000;

mkdirSync(dirname(databaseFile), { recursive: true });
const store = new Store(databaseFile);
const { context, disconnect } = await connect(thresholdUsd);
const routes = Object.values(context.sources).reduce((mask, source) => mask | source.routes, 0);

const depositHeld = (topUp: TopUp): Promise<boolean> => hasDeposit(context.sources, topUp);

// The dev wallet plays the user in demos; without its key the relayer runs the same, minus that endpoint.
const demoDeposit = process.env.DEV_USER_EVM_PK ? demoDepositor(context.sources, devUserAccount()) : undefined;

const api = createApi({
  store,
  create: () => createTopUp({ factory: context.factory, routeMask: routes }),
  hasDeposit: depositHeld,
  planOf: (topUp) => pipelineOf(topUp).map(({ name }) => name),
  config: () => configOf(context, demoDeposit !== undefined),
  previewRoutes: (amount) => previewRoutes(context, amount),
  balancesOf: (topUp) => balancesOf(context, topUp),
  demoDeposit:
    demoDeposit &&
    ((topUp, chain, amount) => {
      if (!Object.hasOwn(context.sources, chain)) throw new Error(`${chain} is not a source chain`);
      const { decimals } = context.sources[chain as SourceChain];
      return demoDeposit(topUp.forwarder, chain as SourceChain, parseUnits(amount, decimals));
    }),
});
const save = (topUp: TopUp): void => {
  store.save(topUp);
  api.publish(topUp);
  const step = topUp.steps.at(-1);
  const progress = step ? `${step.name} ${step.status}${step.detail ? `: ${step.detail}` : ""}` : topUp.state;
  console.log(`${topUp.id.slice(0, 10)} ${progress}`);
};
const worker = startWorker(store, { context, pipelineOf, save }, depositHeld, POLL_INTERVAL_MS);

api.server.listen(port, () => {
  console.log(`relayer ${context.hydrationEvm.wallet.account.address} listening on http://127.0.0.1:${port}`);
  console.log(`factory ${context.factory}, route mask ${routes}, ${store.open().length} open top-ups`);
});

const shutdown = async (): Promise<void> => {
  api.server.close();
  api.server.closeAllConnections();
  await worker.stop();
  disconnect();
  store.close();
  process.exit(0);
};
process.once("SIGINT", () => void shutdown());
process.once("SIGTERM", () => void shutdown());
