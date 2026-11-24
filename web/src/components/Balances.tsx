import type { Balance, TopUpView } from "@onramp/relayer/api";
import { useEffect, useState } from "react";

import { chainLabel, formatUnits } from "../present";
import { relayer } from "../relayer";

const REFRESH_MS = 5_000;

/** Reloaded on every change to the top-up, and on a timer while it is still moving. */
function useBalances(topUp: TopUpView, moving: boolean): Balance[] | undefined {
  const [balances, setBalances] = useState<Balance[]>();
  useEffect(() => {
    let current = true;
    const load = () => void relayer.balances(topUp.id).then((loaded) => current && setBalances(loaded));
    load();
    const timer = moving ? setInterval(load, REFRESH_MS) : undefined;
    return () => {
      current = false;
      clearInterval(timer);
    };
  }, [topUp.id, topUp.updatedAt, moving]);
  return balances;
}

export function Balances({ topUp, moving }: { topUp: TopUpView; moving: boolean }) {
  const balances = useBalances(topUp, moving);
  if (!balances) return <p className="hint">Reading balances…</p>;
  const held = balances.filter(({ amount }) => amount !== "0");
  if (held.length === 0) {
    return <p className="hint">Nothing at the deposit address or in the top-up's accounts right now.</p>;
  }

  return (
    <table className="balances">
      <thead>
        <tr>
          <th>Where</th>
          <th>Held by</th>
          <th>Asset</th>
          <th className="number">Amount</th>
        </tr>
      </thead>
      <tbody>
        {held.map(({ chain, holder, asset, decimals, amount }) => (
          <tr key={`${chain}/${asset}`}>
            <td>{chainLabel(chain)}</td>
            <td>{holder}</td>
            <td>{asset}</td>
            <td className="number mono">{formatUnits(amount, decimals)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
