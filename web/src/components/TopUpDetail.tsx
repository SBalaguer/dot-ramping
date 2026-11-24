import type { ConfigView, SourceChain, TopUpView } from "@onramp/relayer/api";
import { QRCodeSVG } from "qrcode.react";
import { useEffect, useState } from "react";

import {
  ROUTE_LABELS,
  STABLE_DECIMALS,
  addressLink,
  chainLabel,
  formatDuration,
  formatUnits,
  shorten,
  summarize,
} from "../present";
import { relayer } from "../relayer";
import { Balances } from "./Balances";
import { Copyable } from "./Copyable";
import { Timeline } from "./Timeline";

interface Props {
  topUp: TopUpView;
  config: ConfigView;
}

/** A clock that only ticks while something on screen depends on it. */
function useNow(ticking: boolean): number {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (!ticking) return;
    const timer = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(timer);
  }, [ticking]);
  return now;
}

function useAction(): [string | undefined, (work: () => Promise<unknown>) => void, boolean] {
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const run = (work: () => Promise<unknown>) => {
    setBusy(true);
    setError(undefined);
    work()
      .catch((failure: unknown) => setError(failure instanceof Error ? failure.message : String(failure)))
      .finally(() => setBusy(false));
  };
  return [error, run, busy];
}

const usdt = (amount: bigint | undefined): string =>
  amount === undefined ? "—" : formatUnits(amount, STABLE_DECIMALS);

function DemoDeposit({ topUp, config }: Props) {
  const [chain, setChain] = useState<SourceChain>(config.sources[0]!.chain);
  const [amount, setAmount] = useState("5");
  const [error, run, busy] = useAction();
  const source = config.sources.find((candidate) => candidate.chain === chain)!;

  return (
    <form
      className="deposit"
      onSubmit={(event) => {
        event.preventDefault();
        run(() => relayer.deposit(topUp.id, chain, amount));
      }}
    >
      <label className="field">
        <span>Chain</span>
        <select value={chain} onChange={(event) => setChain(event.target.value as SourceChain)}>
          {config.sources.map(({ chain: option, name }) => (
            <option key={option} value={option}>
              {name}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span>Amount ({source.symbol})</span>
        <input inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value.trim())} />
      </label>
      <button type="submit" disabled={busy}>
        {busy ? "Sending…" : "Send from the dev wallet"}
      </button>
      {error && <p className="error">{error}</p>}
    </form>
  );
}

export function TopUpDetail({ topUp, config }: Props) {
  const moving = topUp.state !== "COMPLETED" && topUp.state !== "REFUNDED" && topUp.state !== "FAILED";
  const now = useNow(moving);
  const { outcome, chain, route, deposited, received, cost, elapsedMs } = summarize(topUp, now);
  const [error, run, busy] = useAction();
  const forwarded = topUp.steps.some(({ name, status }) => name === "SOURCE_SUBMITTED" && status === "done");
  const symbol = config.sources.find((source) => source.chain === chain)?.symbol ?? "";

  return (
    <section className="card detail">
      <header className="summary">
        <div>
          <h2>
            Top-up <span className="mono">{shorten(topUp.id, 10, 6)}</span>
          </h2>
          <p>
            <span className={`badge ${outcome.replace(" ", "-")}`}>{outcome}</span>
            {route && chain && (
              <span className="route">
                {ROUTE_LABELS[route]} from {chainLabel(chain)}
              </span>
            )}
          </p>
        </div>
        <dl className="figures">
          <div>
            <dt>Deposited</dt>
            <dd>
              {usdt(deposited)} <small>{symbol}</small>
            </dd>
          </div>
          <div>
            <dt>Received</dt>
            <dd>
              {usdt(received)} <small>USDT</small>
            </dd>
          </div>
          <div>
            <dt>{cost !== undefined && cost < 0n ? "Gained by the user" : "Cost to the user"}</dt>
            <dd>{usdt(cost === undefined || cost >= 0n ? cost : -cost)}</dd>
          </div>
          <div>
            <dt>Time</dt>
            <dd>{elapsedMs === undefined ? "—" : formatDuration(elapsedMs)}</dd>
          </div>
        </dl>
      </header>

      <div className="addresses">
        <QRCodeSVG className="qr" value={topUp.forwarder} size={132} marginSize={2} />
        <dl>
          <div>
            <dt>Deposit address, the same on every source chain</dt>
            <dd>
              <Copyable value={topUp.forwarder} text={topUp.forwarder} />
              <span className="links">
                {config.sources.map(({ chain: source, name }) => {
                  const href = addressLink(source, topUp.forwarder);
                  return (
                    href && (
                      <a key={source} href={href} target="_blank" rel="noreferrer">
                        {name}
                      </a>
                    )
                  );
                })}
              </span>
            </dd>
          </div>
          <div>
            <dt>Asset Hub account that receives the USDT</dt>
            <dd>
              <Copyable value={topUp.beneficiary.ss58} text={topUp.beneficiary.ss58} />
            </dd>
          </div>
          <div>
            <dt>Refund address</dt>
            <dd>
              <Copyable value={topUp.refund} text={topUp.refund} />
            </dd>
          </div>
        </dl>
      </div>

      {outcome === "awaiting deposit" && config.demoDeposits && (
        <>
          <h3>Send a deposit</h3>
          <DemoDeposit topUp={topUp} config={config} />
        </>
      )}

      <h3>Where the money is</h3>
      <Balances topUp={topUp} moving={moving} />

      <h3>Timeline</h3>
      <Timeline topUp={topUp} />

      <footer className="actions">
        {topUp.state === "FAILED" && (
          <button type="button" disabled={busy} onClick={() => run(() => relayer.request(topUp.id, "retry"))}>
            Retry the failed step
          </button>
        )}
        {!forwarded && (
          <button
            type="button"
            className="secondary"
            disabled={busy}
            onClick={() => run(() => relayer.request(topUp.id, "refund"))}
          >
            Refund what is at the deposit address
          </button>
        )}
        {error && <p className="error">{error}</p>}
      </footer>
    </section>
  );
}
