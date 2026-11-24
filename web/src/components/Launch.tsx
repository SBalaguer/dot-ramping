import type { ConfigView, RoutePreview, SourceView } from "@onramp/relayer/api";
import { useEffect, useState } from "react";

import { ROUTE_LABELS } from "../present";
import { relayer } from "../relayer";

interface Props {
  config: ConfigView;
  onCreated: (id: string) => void;
}

const SMALL_DEPOSIT = 5;
const DECIMAL = /^\d+(\.\d+)?$/;

/** A chain that only has Snowbridge is demonstrated with a deposit above the routing threshold. */
const demoAmount = (source: SourceView, thresholdUsd: number): string =>
  String(source.routes.every((route) => route === "snowbridge") ? thresholdUsd + 50 : SMALL_DEPOSIT);

/** The preview belongs to the amount it was asked for; while another amount is typed there is none. */
function useRoutePreview(amount: string): RoutePreview | undefined {
  const [preview, setPreview] = useState<{ amount: string; routes: RoutePreview }>();
  useEffect(() => {
    if (!DECIMAL.test(amount)) return;
    let current = true;
    const pending = setTimeout(() => {
      void relayer.routes(amount).then((routes) => current && setPreview({ amount, routes }));
    }, 200);
    return () => {
      current = false;
      clearTimeout(pending);
    };
  }, [amount]);
  return preview?.amount === amount ? preview.routes : undefined;
}

export function Launch({ config, onCreated }: Props) {
  const [busy, setBusy] = useState<string>();
  const [error, setError] = useState<string>();
  const [amount, setAmount] = useState("100");
  const preview = useRoutePreview(amount);

  const run = (label: string, work: () => Promise<void>) => {
    setBusy(label);
    setError(undefined);
    work()
      .catch((failure: unknown) => setError(failure instanceof Error ? failure.message : String(failure)))
      .finally(() => setBusy(undefined));
  };
  const create = async (): Promise<string> => {
    const { id } = await relayer.create();
    onCreated(id);
    return id;
  };

  return (
    <section className="card">
      <h2>Start a top-up</h2>

      {config.demoDeposits && (
        <>
          <p className="hint">One click: a new deposit address, then a deposit to it from the dev wallet.</p>
          <div className="demos">
            {config.sources.map((source) => {
              const deposit = demoAmount(source, config.thresholdUsd);
              return (
                <button
                  key={source.chain}
                  type="button"
                  className="demo"
                  disabled={busy !== undefined}
                  onClick={() =>
                    run(source.chain, async () => void (await relayer.deposit(await create(), source.chain, deposit)))
                  }
                >
                  <strong>
                    {deposit} {source.symbol}
                  </strong>
                  <span>on {source.name}</span>
                  <em>
                    {busy === source.chain ? "sending…" : source.routes.map((route) => ROUTE_LABELS[route]).join(", ")}
                  </em>
                </button>
              );
            })}
          </div>
        </>
      )}

      <button
        type="button"
        className="secondary"
        disabled={busy !== undefined}
        onClick={() => run("create", async () => void (await create()))}
      >
        New deposit address only
      </button>
      {error && <p className="error">{error}</p>}

      <h3>Which route would a deposit take?</h3>
      <label className="field">
        <span>Amount in USD</span>
        <input inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value.trim())} />
      </label>
      <table className="routes">
        <tbody>
          {config.sources.map(({ chain, name, symbol }) => {
            const route = preview?.[chain];
            return (
              <tr key={chain}>
                <th scope="row">
                  {name} <small>{symbol}</small>
                </th>
                <td>{route ? ROUTE_LABELS[route] : preview ? "no route" : "…"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="hint">Snowbridge from {config.thresholdUsd} USD up, where the chain has it.</p>
    </section>
  );
}
