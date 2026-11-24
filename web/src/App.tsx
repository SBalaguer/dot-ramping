import { useEffect, useState } from "react";

import { Launch } from "./components/Launch";
import { TopUpDetail } from "./components/TopUpDetail";
import { TopUpList } from "./components/TopUpList";
import { shorten } from "./present";
import { useFeed } from "./relayer";

const selectedInUrl = (): string => window.location.hash.replace(/^#\/?/, "");

/** The selected top-up lives in the URL fragment, so a view can be linked to and reloaded. */
function useSelection(): [string, (id: string) => void] {
  const [selected, setSelected] = useState(selectedInUrl);
  useEffect(() => {
    const follow = () => setSelected(selectedInUrl());
    window.addEventListener("hashchange", follow);
    return () => window.removeEventListener("hashchange", follow);
  }, []);
  return [selected, (id) => (window.location.hash = `/${id}`)];
}

export function App() {
  const { topUps, config, live } = useFeed();
  const [selected, select] = useSelection();
  const shown = topUps.find(({ id }) => id === selected) ?? topUps[0];

  return (
    <>
      <header className="masthead">
        <div>
          <h1>Onramp bridges</h1>
          <p>Stablecoins sent to a deposit address on Ethereum or Base, delivered as USDT on Polkadot Asset Hub.</p>
        </div>
        <dl className="status">
          <div>
            <dt>Relayer</dt>
            <dd className={live ? "ok" : "down"}>{live ? "connected" : "not reachable"}</dd>
          </div>
          {config && (
            <div>
              <dt>Factory</dt>
              <dd className="mono" title={config.factory}>
                {shorten(config.factory, 8, 6)}
              </dd>
            </div>
          )}
        </dl>
      </header>

      <main className="layout">
        <div className="column">
          {config && <Launch config={config} onCreated={select} />}
          <TopUpList topUps={topUps} selected={shown?.id} onSelect={select} />
        </div>
        <div className="column wide">
          {shown && config ? (
            <TopUpDetail key={shown.id} topUp={shown} config={config} />
          ) : (
            <section className="card empty">
              {live ? "No top-ups yet. Start one on the left." : "Waiting for the relayer at its API address."}
            </section>
          )}
        </div>
      </main>
    </>
  );
}
