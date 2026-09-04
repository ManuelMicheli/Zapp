"use client";

import { useState } from "react";

/** Trama con clamp a 5 righe e "leggi tutto". */
export function Overview({
  text,
  className = "px-5 md:px-0",
}: {
  text: string;
  /** Padding orizzontale: di default quello delle sezioni della scheda titolo. */
  className?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const isLong = text.length > 260;

  return (
    <section className={`flex flex-col gap-3 ${className}`}>
      <h2 className="text-xl font-bold tracking-[-0.03em]">Trama</h2>
      <p
        className={`text-pretty text-[15px] leading-[1.55] text-white/[0.78] ${
          !expanded && isLong ? "line-clamp-5" : ""
        }`}
      >
        {text}
      </p>
      {isLong && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="-my-1 self-start py-2.5 text-[13px] font-medium text-accent-soft"
        >
          {expanded ? "Mostra meno" : "Leggi tutto"}
        </button>
      )}
    </section>
  );
}
