"use client";

import { useState } from "react";

/** Trama con clamp a 5 righe e "leggi tutto". */
export function Overview({
  text,
  className = "px-5 md:px-0",
  size = 15,
  heading = true,
}: {
  text: string;
  /** Padding orizzontale: di default quello delle sezioni della scheda titolo. */
  className?: string;
  /** 15px nella pagina stagione, 16px sotto la tagline della scheda titolo. */
  size?: 15 | 16;
  /** La scheda titolo apre con la tagline: lì il titolo "Trama" non serve. */
  heading?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const isLong = text.length > 260;

  return (
    <section className={`flex flex-col gap-3 ${className}`}>
      {heading && <h2 className="text-xl font-bold tracking-[-0.03em]">Trama</h2>}
      <p
        className={`text-pretty leading-[1.55] text-white/[0.78] ${
          size === 16 ? "text-base" : "text-[15px]"
        } ${!expanded && isLong ? (size === 16 ? "line-clamp-6" : "line-clamp-5") : ""}`}
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
