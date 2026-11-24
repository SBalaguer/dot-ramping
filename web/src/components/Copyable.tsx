import { useState } from "react";

import { shorten } from "../present";

interface Props {
  value: string;
  /** What to show instead of the value's two ends. */
  text?: string;
  href?: string;
}

/** A hash or address: shortened, linked when an explorer can show it, and copied whole on click. */
export function Copyable({ value, text = shorten(value), href }: Props) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    void navigator.clipboard.writeText(value).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1_200);
    });
  };

  return (
    <span className="copyable">
      {href ? (
        <a className="mono" href={href} target="_blank" rel="noreferrer" title={value}>
          {text}
        </a>
      ) : (
        <span className="mono" title={value}>
          {text}
        </span>
      )}
      <button type="button" className="copy" onClick={copy} aria-label="Copy">
        {copied ? "copied" : "copy"}
      </button>
    </span>
  );
}
