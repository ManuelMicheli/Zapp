"use client";

import Image from "next/image";
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

/** Durata di un fondale (ms) e della dissolvenza (ms). */
export const SLIDE_MS = 7000;
const FADE_MS = 1400;

interface Rotation {
  index: number;
  /** Rotazione attiva (più fondali, niente reduced-motion): zoom e dissolvenze. */
  animate: boolean;
}

const RotationContext = createContext<Rotation>({ index: 0, animate: false });

/**
 * Rotazione del banner "Al cinema oggi": possiede l'indice del film corrente e lo
 * passa a fondale (`RotatingBackdrop`) e didascalia (`RotatingCaption`), che così
 * cambiano insieme. Il primo film è nell'HTML del server (nessun flash); con
 * `prefers-reduced-motion` resta fermo sul primo. Gira **solo quando il banner si
 * vede** e la scheda è in primo piano: fuori schermo, una dissolvenza a tutta
 * larghezza con lo zoom continuo costa compositing e un fondale nuovo da scaricare
 * ogni 7 s per niente.
 */
export function CinemaRotation({
  count,
  children,
}: {
  count: number;
  children: ReactNode;
}) {
  const [index, setIndex] = useState(0);
  const [animate, setAnimate] = useState(false);
  // sentinella nascosta: si osserva il suo contenitore, cioè il banner
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const el = ref.current?.parentElement;
    if (!el || count < 2) return;
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
        timer = setInterval(() => setIndex((i) => (i + 1) % count), SLIDE_MS);
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
  }, [count]);

  return (
    <RotationContext.Provider value={{ index: count > 0 ? index % count : 0, animate }}>
      {children}
      <span ref={ref} hidden aria-hidden />
    </RotationContext.Provider>
  );
}

/**
 * Fondale a rotazione: dissolvenza continua fra i fondali dei film in programmazione,
 * con un lento zoom (Ken Burns) su ciascuno. Monta solo corrente e successivo (il
 * successivo precarica dietro, invisibile), così non si scaricano 9 `original` insieme.
 */
export function RotatingBackdrop({
  sources,
  sizes = "100vw",
  className = "",
}: {
  sources: string[];
  sizes?: string;
  className?: string;
}) {
  const { index, animate } = useContext(RotationContext);
  const next = (index + 1) % sources.length;

  return (
    <div className={`absolute inset-0 overflow-hidden ${className}`} aria-hidden>
      {sources.map((src, i) => {
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

export interface CaptionSlide {
  title: string;
  line: string;
}

/**
 * Titolo e riga del film corrente, che cambiano col fondale (dissolvenza breve
 * `.caption-fade`), a tutte le larghezze: da `lg` la stessa didascalia in corpo
 * grande accanto alla parete di locandine. Il titolo riserva sempre due righe, così
 * la card non salta quando il nome del film è più lungo.
 */
export function RotatingCaption({
  slides,
  className = "",
}: {
  slides: CaptionSlide[];
  className?: string;
}) {
  const { index, animate } = useContext(RotationContext);
  const slide = slides[index % slides.length] ?? slides[0];
  if (!slide) return null;

  return (
    <div
      key={index}
      className={`flex min-w-0 flex-col gap-1 lg:gap-2 ${animate ? "caption-fade" : ""} ${className}`}
    >
      <div className="flex min-h-[2lh] flex-col justify-end text-[24px] leading-[1.02] lg:text-[40px]">
        <p className="line-clamp-2 font-extrabold tracking-[-0.045em]">{slide.title}</p>
      </div>
      <p className="truncate text-[13px] text-white/75 lg:text-[15px]">{slide.line}</p>
    </div>
  );
}
