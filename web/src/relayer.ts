import type { Balance, ConfigView, RoutePreview, SourceChain, TopUpView } from "@onramp/relayer/api";
import { useEffect, useState } from "react";

const RELAYER_URL: string = (import.meta.env.VITE_RELAYER_URL as string | undefined) ?? "http://127.0.0.1:8787";

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${RELAYER_URL}${path}`, init);
  const body = (await response.json()) as T & { error?: string };
  if (!response.ok) throw new Error(body.error ?? `the relayer answered ${response.status}`);
  return body;
}

const post = (body?: unknown): RequestInit => ({
  method: "POST",
  headers: body === undefined ? undefined : { "content-type": "application/json" },
  body: body === undefined ? undefined : JSON.stringify(body),
});

/** Every request the dashboard makes. It only ever talks to the relayer, never to a chain. */
export const relayer = {
  config: () => call<ConfigView>("/config"),
  routes: (amount: string) => call<RoutePreview>(`/routes?amount=${encodeURIComponent(amount)}`),
  create: () => call<TopUpView>("/topups", post()),
  balances: (id: string) => call<Balance[]>(`/topups/${id}/balances`),
  deposit: (id: string, chain: SourceChain, amount: string) =>
    call<{ tx: string }>(`/topups/${id}/deposit`, post({ chain, amount })),
  request: (id: string, kind: "refund" | "retry") => call<{ accepted: string }>(`/topups/${id}/${kind}`, post()),
};

export interface Feed {
  /** Newest first. */
  topUps: TopUpView[];
  config?: ConfigView;
  /** Whether the event stream is open; while it is not, what is shown may be stale. */
  live: boolean;
}

/** The relayer's top-ups, kept current by its event stream and reloaded whenever the stream reconnects. */
export function useFeed(): Feed {
  const [byId, setById] = useState<Map<string, TopUpView>>(new Map());
  const [config, setConfig] = useState<ConfigView>();
  const [live, setLive] = useState(false);

  useEffect(() => {
    const events = new EventSource(`${RELAYER_URL}/events`);
    const upsert = (changed: TopUpView[]) =>
      setById((current) => new Map([...current, ...changed.map((topUp) => [topUp.id, topUp] as const)]));

    events.onopen = () => {
      setLive(true);
      void call<TopUpView[]>("/topups").then(upsert);
      void relayer.config().then(setConfig);
    };
    events.onerror = () => setLive(false);
    events.addEventListener("topup", (event) =>
      upsert([JSON.parse((event as MessageEvent<string>).data) as TopUpView]),
    );
    return () => events.close();
  }, []);

  const topUps = [...byId.values()].sort((a, b) => b.createdAt - a.createdAt);
  return { topUps, config, live };
}
