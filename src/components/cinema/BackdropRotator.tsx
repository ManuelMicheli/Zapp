"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";

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
  const ref = useRef<HTMLDivElement>(null);

  // Gira **solo quando il banner si vede** e la scheda è in primo piano: fuori
  // schermo o in un'altra scheda, una dissolvenza a tutta larghezza con lo zoom
  // continuo costa compositing e un fondale nuovo da scaricare ogni 7 s per niente.
  useEffect(() => {
    const el = ref.current;
    if (!el || sources.length < 2) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let timer: ReturnType<typeof setInterval> | null = null;
    let visible = false;
    const stop = () => {
      if (timer) clearInterval(timer);
      timer = null;
    };
    const sync = () => {
      const on = visible && !document.hidden;
      setAnimate(on);
      if (on && !timer) {
        timer = setInterval(() => setIndex((i) => (i + 1) % sources.length), SLIDE_MS);
      } else if (!on) {
        stop();
      }
    };
    const io = new IntersectionObserver(
      ([entry]) => {
        visible = entry.isIntersecting;
        sync();
      },
      { rootMargin: "200px" },
    );
    io.observe(el);
    document.addEventListener("visibilitychange", sync);
    return () => {
      stop();
      io.disconnect();
      document.removeEventListener("visibilitychange", sync);
    };
  }, [sources.length]);

  const next = (index + 1) % sources.length;

  return (
    <div
      ref={ref}
      className={`absolute inset-0 overflow-hidden ${className}`}
      aria-hidden
    >
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
