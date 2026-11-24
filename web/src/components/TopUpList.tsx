import type { TopUpView } from "@onramp/relayer/api";

import { ROUTE_LABELS, STABLE_DECIMALS, formatUnits, shorten, summarize } from "../present";

interface Props {
  topUps: TopUpView[];
  selected?: string;
  onSelect: (id: string) => void;
}

export function TopUpList({ topUps, selected, onSelect }: Props) {
  return (
    <section className="card">
      <h2>Top-ups</h2>
      {topUps.length === 0 && <p className="hint">None yet.</p>}
      <ul className="topups">
        {topUps.map((topUp) => {
          const { outcome, route, deposited } = summarize(topUp, topUp.updatedAt);
          return (
            <li key={topUp.id}>
              <button
                type="button"
                className={topUp.id === selected ? "row selected" : "row"}
                onClick={() => onSelect(topUp.id)}
              >
                <span className="grow">
                  <span className="mono">{shorten(topUp.id, 8, 4)}</span>
                  <small>
                    {deposited === undefined ? "no deposit yet" : formatUnits(deposited, STABLE_DECIMALS)}
                    {route && ` · ${ROUTE_LABELS[route]}`}
                  </small>
                </span>
                <span className={`badge ${outcome.replace(" ", "-")}`}>{outcome}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
