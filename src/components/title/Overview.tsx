"use client";

import { useState } from "react";

/** Trama con clamp a 4 righe e "leggi tutto". */
export function Overview({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  const isLong = text.length > 220;

  return (
    <section className="px-4">
      <h2 className="mb-2 text-base font-bold">Trama</h2>
      <p
        className={`text-sm leading-relaxed text-text/90 ${
          !expanded && isLong ? "line-clamp-4" : ""
        }`}
      >
        {text}
      </p>
      {isLong && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-1 text-sm font-medium text-accent"
        >
          {expanded ? "Mostra meno" : "Leggi tutto"}
        </button>
      )}
    </section>
  );
}
