"use client";

import Image from "next/image";
import { useEffect, useState } from "react";

/** Durata di un fondale (ms) e della dissolvenza (ms). */
export const SLIDE_MS = 7000;
const FADE_MS = 1400;

/**
 * Fondale a rotazione del banner "Al cinema oggi": dissolvenza continua fra i fondali
 * dei film in programmazione, con un lento zoom (Ken Burns) su ciascuno. Il primo
 * fondale è nell'HTML del server (nessun flash); gli altri si montano solo quando
 * servono (corrente + successivo), così non si scaricano 9 `original` insieme.
 * Con `prefers-reduced-motion` resta fermo sul primo.
 */
export function BackdropRotator({
  sources,
  sizes = "100vw",
  className = "",
}: {
  sources: string[];
  sizes?: string;
  className?: string;
}) {
  const [index, setIndex] = useState(0);
  const [animate, setAnimate] = useState(false);

  useEffect(() => {
    if (sources.length < 2) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    setAnimate(true);
    const t = setInterval(() => setIndex((i) => (i + 1) % sources.length), SLIDE_MS);
    return () => clearInterval(t);
  }, [sources.length]);

  const next = (index + 1) % sources.length;

  return (
    <div className={`absolute inset-0 overflow-hidden ${className}`} aria-hidden>
      {sources.map((src, i) => {
        // monta solo corrente e successivo (il successivo precarica dietro, invisibile)
        if (i !== index && i !== next) return null;
        const active = i === index;
        return (
          <Image
            key={src}
            src={src}
            alt=""
            fill
            sizes={sizes}
            quality={95}
            priority={i === 0}
            className={`object-cover object-[50%_25%] transition-opacity ease-in-out ${
              active ? "opacity-100" : "opacity-0"
            } ${animate && active ? "backdrop-kenburns" : ""}`}
            style={{ transitionDuration: `${FADE_MS}ms` }}
          />
        );
      })}
    </div>
  );
}
