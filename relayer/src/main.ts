import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { factoryAbi } from "@onramp/contracts";
import { Route, routeMask } from "@onramp/keys";
import { zeroAddress } from "viem";

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
const { context, disconnect } = connect(thresholdUsd);
const { factory } = context.deployed.sepolia;

/** A deposit address is bound to exactly the routes its factory has on the source chain. */
const configured = await Promise.all(
  Object.values(Route).map(async (route) => {
    const [bridge] = await context.sepolia.reader.readContract({
      address: factory,
      abi: factoryAbi,
      functionName: "routeConfig",
      args: [route],
    });
    return bridge === zeroAddress ? [] : [route];
  }),
);
const sepoliaRoutes = routeMask(...configured.flat());

const api = createApi({
  store,
  sourceChains: ["sepolia"],
  create: (sourceChain) => createTopUp({ sourceChain, factory, routeMask: sepoliaRoutes }),
});
const save = (topUp: TopUp): void => {
  store.save(topUp);
  api.publish(topUp);
  const step = topUp.steps.at(-1);
  console.log(`${topUp.id.slice(0, 10)} ${step?.name} ${step?.status}${step?.detail ? `: ${step.detail}` : ""}`);
};
const worker = startWorker(store, { context, pipelineOf, save }, POLL_INTERVAL_MS);

api.server.listen(port, () => {
  console.log(`relayer ${context.sepolia.wallet.account.address} listening on http://127.0.0.1:${port}`);
  console.log(`factory ${factory} on Sepolia, route mask ${sepoliaRoutes}, ${store.open().length} open top-ups`);
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
