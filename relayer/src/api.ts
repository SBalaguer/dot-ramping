import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";

import { isHex } from "viem";

import { REQUEST_KINDS, refusal, type HasDeposit, type RequestKind } from "./requests";
import type { Store } from "./store";
import { viewOf, type TopUp, type TopUpView } from "./topup";

export interface Api {
  server: Server;
  /** Pushes a top-up's new state to every `GET /events` subscriber. */
  publish: (topUp: TopUp) => void;
}

export interface ApiOptions {
  store: Store;
  create: () => TopUp;
  hasDeposit: HasDeposit;
}

const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "content-type" };

function json(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { ...CORS, "Content-Type": "application/json" }).end(JSON.stringify(body));
}

/**
 * `POST /topups` creates a top-up (its deposit address is valid on every source chain), `GET /topups` and
 * `GET /topups/:id` read them, `GET /events` streams every change as server-sent events. `POST
 * /topups/:id/refund` and `POST /topups/:id/retry` are operator requests: they are checked, queued and
 * answered with 202, and the worker carries them out. Responses never contain a top-up's entropy.
 */
export function createApi({ store, create, hasDeposit }: ApiOptions): Api {
  const subscribers = new Set<ServerResponse>();

  const handle = async (request: IncomingMessage, response: ServerResponse): Promise<void> => {
    const { pathname } = new URL(request.url ?? "/", "http://relayer");
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
    } else if (request.method === "POST" && REQUEST_KINDS.includes(action as RequestKind)) {
      const kind = action as RequestKind;
      const refused = await refusal(topUp, kind, hasDeposit);
      if (refused) {
        json(response, 409, { error: refused });
      } else {
        store.request(topUp.id, kind);
        json(response, 202, { accepted: kind });
      }
    } else {
      json(response, 404, { error: "not found" });
    }
  };

  const publish = (topUp: TopUp): void => {
    const view: TopUpView = viewOf(topUp);
    for (const subscriber of subscribers) subscriber.write(`event: topup\ndata: ${JSON.stringify(view)}\n\n`);
  };

  const server = createServer((request, response) => {
    handle(request, response).catch((error: unknown) => {
      json(response, 500, { error: error instanceof Error ? error.message : String(error) });
    });
  });
  return { server, publish };
}
