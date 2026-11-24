import type { TopUpView } from "@onramp/relayer/api";

import { STEP_LABELS, formatDuration, referencesOf, stepChain, timelineOf } from "../present";
import { Copyable } from "./Copyable";

const clock = (at: number): string => new Date(at).toLocaleTimeString([], { hour12: false });

/** Every state of the top-up's route, top to bottom: what happened, where, when, and what it left behind. */
export function Timeline({ topUp }: { topUp: TopUpView }) {
  return (
    <ol className="timeline">
      {timelineOf(topUp).map((entry) => {
        const taken = "refs" in entry ? entry : undefined;
        return (
          <li key={entry.name} className={`step ${entry.status}`}>
            <span className="marker" aria-hidden="true" />
            <div className="what">
              <div className="headline">
                <strong>{STEP_LABELS[entry.name]}</strong>
                <code>{entry.name}</code>
                {entry.name === "RELAY_SIMULATED" && <span className="badge simulated">relay simulated</span>}
              </div>
              {taken && (
                <div className="meta">
                  <span>{stepChain(taken)}</span>
                  <span>{taken.status}</span>
                  {taken.finishedAt !== undefined && (
                    <span>
                      {clock(taken.finishedAt)} · took {formatDuration(taken.finishedAt - taken.startedAt)}
                    </span>
                  )}
                  {taken.attempts > 0 && <span>{taken.attempts} failed attempts</span>}
                </div>
              )}
              {taken?.detail && <p className="detail">{taken.detail}</p>}
              {entry.name === "RELAY_SIMULATED" && taken && (
                <p className="detail">
                  Snowbridge runs no testnet relayers. This message is rebuilt from the Gateway's event and handed to
                  the Asset Hub fork; on mainnet the hop takes about 30 minutes.
                </p>
              )}
              {taken && (
                <dl className="refs">
                  {referencesOf(taken).map(({ key, value, text, href }) => (
                    <div key={key}>
                      <dt>{key}</dt>
                      <dd>
                        {text === value && !href ? (
                          <span className="mono">{value}</span>
                        ) : (
                          <Copyable value={value} text={text} href={href} />
                        )}
                      </dd>
                    </div>
                  ))}
                </dl>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
