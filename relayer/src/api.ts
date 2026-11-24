import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";

import { isHex } from "viem";

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
}

const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "content-type" };

function json(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { ...CORS, "Content-Type": "application/json" }).end(JSON.stringify(body));
}

/**
 * `POST /topups` creates a top-up (its deposit address is valid on every source chain), `GET /topups` and `GET /topups/:id` read them, `GET /events` streams
 * every change as server-sent events. Responses never contain a top-up's entropy.
 */
export function createApi({ store, create }: ApiOptions): Api {
  const subscribers = new Set<ServerResponse>();

  const handle = (request: IncomingMessage, response: ServerResponse): void => {
    const { pathname } = new URL(request.url ?? "/", "http://relayer");
    const route = `${request.method} ${pathname}`;

    if (request.method === "OPTIONS") {
      response.writeHead(204, { ...CORS, "Access-Control-Allow-Methods": "GET, POST" }).end();
    } else if (route === "POST /topups") {
      const topUp = create();
      store.save(topUp);
      publish(topUp);
      json(response, 201, viewOf(topUp));
    } else if (route === "GET /topups") {
      json(response, 200, store.all().map(viewOf));
    } else if (request.method === "GET" && pathname.startsWith("/topups/")) {
      const id = pathname.slice("/topups/".length);
      const topUp = isHex(id) ? store.get(id) : undefined;
      if (topUp) json(response, 200, viewOf(topUp));
      else json(response, 404, { error: "no such top-up" });
    } else if (route === "GET /events") {
      response.writeHead(200, { ...CORS, "Content-Type": "text/event-stream", "Cache-Control": "no-cache" });
      response.write(": connected\n\n");
      subscribers.add(response);
      request.on("close", () => subscribers.delete(response));
    } else {
      json(response, 404, { error: "not found" });
    }
  };

  const publish = (topUp: TopUp): void => {
    const view: TopUpView = viewOf(topUp);
    for (const subscriber of subscribers) subscriber.write(`event: topup\ndata: ${JSON.stringify(view)}\n\n`);
  };

  const server = createServer((request, response) => {
    try {
      handle(request, response);
    } catch (error) {
      json(response, 500, { error: error instanceof Error ? error.message : String(error) });
    }
  });
  return { server, publish };
}
