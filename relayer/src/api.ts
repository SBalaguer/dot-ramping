import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";

import { isHex } from "viem";

import type { Store } from "./store";
import { viewOf, type SourceChain, type TopUp, type TopUpView } from "./topup";

export interface Api {
  server: Server;
  /** Pushes a top-up's new state to every `GET /events` subscriber. */
  publish: (topUp: TopUp) => void;
}

export interface ApiOptions {
  store: Store;
  sourceChains: SourceChain[];
  create: (sourceChain: SourceChain) => TopUp;
}

const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "content-type" };

function json(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { ...CORS, "Content-Type": "application/json" }).end(JSON.stringify(body));
}

async function body(request: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(chunk as Buffer);
  const text = Buffer.concat(chunks).toString("utf8");
  return text ? (JSON.parse(text) as Record<string, unknown>) : {};
}

/**
 * `POST /topups` creates a top-up, `GET /topups` and `GET /topups/:id` read them, `GET /events` streams
 * every change as server-sent events. Responses never contain a top-up's entropy.
 */
export function createApi({ store, sourceChains, create }: ApiOptions): Api {
  const subscribers = new Set<ServerResponse>();

  const handle = async (request: IncomingMessage, response: ServerResponse): Promise<void> => {
    const { pathname } = new URL(request.url ?? "/", "http://relayer");
    const route = `${request.method} ${pathname}`;

    if (request.method === "OPTIONS") {
      response.writeHead(204, { ...CORS, "Access-Control-Allow-Methods": "GET, POST" }).end();
    } else if (route === "POST /topups") {
      const { chain = sourceChains[0] } = await body(request);
      if (!sourceChains.includes(chain as SourceChain)) {
        return json(response, 400, { error: `chain must be one of ${sourceChains.join(", ")}` });
      }
      const topUp = create(chain as SourceChain);
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
    handle(request, response).catch((error: unknown) => {
      json(response, 400, { error: error instanceof Error ? error.message : String(error) });
    });
  });
  return { server, publish };
}
