import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { createApi } from "./api";
import { connect } from "./context";
import { pipelineOf } from "./routes";
import { Store } from "./store";
import type { TopUp } from "./topup";
import { createTopUp } from "./topups";
import { startWorker } from "./worker";

const port = Number(process.env.RELAYER_PORT ?? 8787);
const databaseFile = process.env.RELAYER_DB ?? fileURLToPath(new URL("../data/relayer.sqlite", import.meta.url));
const thresholdUsd = Number(process.env.ROUTE_THRESHOLD_USD ?? 250);
const POLL_INTERVAL_MS = 5_000;

mkdirSync(dirname(databaseFile), { recursive: true });
const store = new Store(databaseFile);
const { context, disconnect } = await connect(thresholdUsd);
const routes = Object.values(context.sources).reduce((mask, source) => mask | source.routes, 0);

const api = createApi({ store, create: () => createTopUp({ factory: context.factory, routeMask: routes }) });
const save = (topUp: TopUp): void => {
  store.save(topUp);
  api.publish(topUp);
  const step = topUp.steps.at(-1);
  console.log(`${topUp.id.slice(0, 10)} ${step?.name} ${step?.status}${step?.detail ? `: ${step.detail}` : ""}`);
};
const worker = startWorker(store, { context, pipelineOf, save }, POLL_INTERVAL_MS);

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
