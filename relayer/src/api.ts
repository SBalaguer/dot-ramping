import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";

import { isHex, type Hash } from "viem";

import { REQUEST_KINDS, refusal, type HasDeposit, type RequestKind } from "./requests";
import type { Store } from "./store";
import type { Balance, ConfigView, RoutePreview, StepName, TopUpView } from "./api-types";
import type { TopUp } from "./topup";

export interface Api {
  server: Server;
  /** Pushes a top-up's new state to every `GET /events` subscriber. */
  publish: (topUp: TopUp) => void;
}

export interface ApiOptions {
  store: Store;
  create: () => TopUp;
  hasDeposit: HasDeposit;
  /** The names of the steps a top-up's current pipeline consists of. */
  planOf: (topUp: TopUp) => StepName[];
  config: () => ConfigView;
  previewRoutes: (amount: string) => RoutePreview;
  balancesOf: (topUp: TopUp) => Promise<Balance[]>;
  /** Sends a deposit from the dev wallet; absent when the relayer has none. Amounts are in whole tokens. */
  demoDeposit?: (topUp: TopUp, chain: string, amount: string) => Promise<Hash>;
}

const DECIMAL = /^\d+(\.\d+)?$/;

const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "content-type" };

function json(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { ...CORS, "Content-Type": "application/json" }).end(JSON.stringify(body));
}

const withoutEntropy = ({ entropy: _secret, ...topUp }: TopUp): Omit<TopUp, "entropy"> => topUp;

async function bodyOf(request: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(chunk as Buffer);
  try {
    const parsed: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
    return parsed !== null && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/**
 * Reads: `GET /config`, `GET /routes?amount=` (the route a deposit of that size would take per chain),
 * `GET /topups`, `GET /topups/:id`, `GET /topups/:id/balances` and `GET /events` (server-sent events).
 * `POST /topups` creates a top-up; its deposit address is valid on every source chain. `POST
 * /topups/:id/refund` and `/retry` are operator requests: checked, queued, answered with 202 and carried
 * out by the worker. `POST /topups/:id/deposit` plays the user from the dev wallet. Responses never contain
 * a top-up's entropy.
 */
export function createApi(options: ApiOptions): Api {
  const { store, create, hasDeposit } = options;
  const subscribers = new Set<ServerResponse>();
  const viewOf = (topUp: TopUp): TopUpView => ({ ...withoutEntropy(topUp), plan: options.planOf(topUp) });

  const act = async (topUp: TopUp, action: string, request: IncomingMessage, response: ServerResponse) => {
    if (REQUEST_KINDS.includes(action as RequestKind)) {
      const kind = action as RequestKind;
      const refused = await refusal(topUp, kind, hasDeposit);
      if (refused) return json(response, 409, { error: refused });
      store.request(topUp.id, kind);
      return json(response, 202, { accepted: kind });
    }
    if (action === "deposit" && options.demoDeposit) {
      const { chain, amount } = await bodyOf(request);
      if (typeof chain !== "string" || typeof amount !== "string" || !DECIMAL.test(amount)) {
        return json(response, 400, { error: "expected a chain and a decimal amount" });
      }
      try {
        return json(response, 201, { tx: await options.demoDeposit(topUp, chain, amount) });
      } catch (error) {
        return json(response, 422, { error: error instanceof Error ? error.message : String(error) });
      }
    }
    return json(response, 404, { error: "not found" });
  };

  const handle = async (request: IncomingMessage, response: ServerResponse): Promise<void> => {
    const { pathname, searchParams } = new URL(request.url ?? "/", "http://relayer");
    const route = `${request.method} ${pathname}`;
    const [, collection, id, action, ...rest] = pathname.split("/");
    const topUp = collection === "topups" && id && isHex(id) && rest.length === 0 ? store.get(id) : undefined;

    if (request.method === "OPTIONS") {
      response.writeHead(204, { ...CORS, "Access-Control-Allow-Methods": "GET, POST" }).end();
    } else if (route === "POST /topups") {
      const created = create();
      store.save(created);
      publish(created);
      json(response, 201, viewOf(created));
    } else if (route === "GET /topups") {
      json(response, 200, store.all().map(viewOf));
    } else if (route === "GET /config") {
      json(response, 200, options.config());
    } else if (route === "GET /routes") {
      const amount = searchParams.get("amount") ?? "";
      if (DECIMAL.test(amount)) json(response, 200, options.previewRoutes(amount));
      else json(response, 400, { error: "expected a decimal amount" });
    } else if (route === "GET /events") {
      response.writeHead(200, { ...CORS, "Content-Type": "text/event-stream", "Cache-Control": "no-cache" });
      response.write(": connected\n\n");
      subscribers.add(response);
      request.on("close", () => subscribers.delete(response));
    } else if (collection !== "topups" || !id) {
      json(response, 404, { error: "not found" });
    } else if (!topUp) {
      json(response, 404, { error: "no such top-up" });
    } else if (request.method === "GET" && action === undefined) {
      json(response, 200, viewOf(topUp));
    } else if (request.method === "GET" && action === "balances") {
      json(response, 200, await options.balancesOf(topUp));
    } else if (request.method === "POST" && action !== undefined) {
      await act(topUp, action, request, response);
    } else {
      json(response, 404, { error: "not found" });
    }
  };

  const publish = (topUp: TopUp): void => {
    const view = viewOf(topUp);
    for (const subscriber of subscribers) subscriber.write(`event: topup\ndata: ${JSON.stringify(view)}\n\n`);
  };

  const server = createServer((request, response) => {
    handle(request, response).catch((error: unknown) => {
      json(response, 500, { error: error instanceof Error ? error.message : String(error) });
    });
  });
  return { server, publish };
}
