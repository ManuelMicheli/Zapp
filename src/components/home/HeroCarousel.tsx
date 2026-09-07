"use client";

import Image from "next/image";
import Link from "next/link";
import { useReducedMotion } from "framer-motion";
import { useCallback, useEffect, useRef, useState } from "react";
import { backdropUrl, posterUrl } from "@/lib/config";
import { HERO_REASON_LABEL, type HeroItem } from "@/lib/home/hero-rank";
import { useHomeType } from "./HomeType";

/** Ogni quanto il carosello passa alla card successiva da solo. */
const AUTOPLAY_MS = 6000;
/** Dopo un gesto dell'utente l'autoplay aspetta questo tempo prima di riprendere. */
const RESUME_AFTER_MS = 8000;
/** Finestra in cui uno `scroll` è nostro (programmato), non dell'utente. */
const PROGRAMMATIC_MS = 1500;

/**
 * Una card = una schermata, a tutte le larghezze un **banner col fondale del film**.
 * Sotto `lg` il fondale 16:9 è intero, da bordo a bordo, e titolo, anno/voto e trama
 * stanno **sotto** l'immagine, sul nero; da `lg` è un **banner alla Netflix**: fondale
 * a tutta altezza, titolo grande e trama a sinistra sopra l'immagine.
 */
const SHAPE = "lg:h-[64svh] lg:min-h-[420px] lg:max-h-[680px]";

/**
 * Carosello in testa alla home: un titolo alla volta della scheda scelta in testata
 * (Tutto / Film / Serie TV, `HomeTypeProvider`) — banner col fondale intero su
 * telefono, banner cinematografico da desktop. Scorre da solo ogni 6 s; un tocco, un
 * trascinamento, la rotella o il mouse sopra lo fermano e riparte dopo 8 s di
 * quiete. Lo scorrimento è nativo con `scroll-snap`, così il gesto dell'utente
 * resta quello di sempre.
 */
export function HeroCarousel({
  movie,
  tv,
  all,
}: {
  movie: HeroItem[];
  tv: HeroItem[];
  all: HeroItem[];
}) {
  const reduceMotion = useReducedMotion();
  const tab = useHomeType()?.type ?? "movie";
  const items = tab === "all" ? all : tab === "movie" ? movie : tv;

  const scroller = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const indexRef = useRef(0);
  const [paused, setPaused] = useState(false);
  const hover = useRef(false);
  const holding = useRef(false);
  const resumeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const programmaticUntil = useRef(0);

  const cardAt = useCallback((i: number) => {
    const el = scroller.current;
    return el ? (el.children[i] as HTMLElement | undefined) : undefined;
  }, []);

  const scrollToIndex = useCallback(
    (i: number, behavior: ScrollBehavior) => {
      const el = scroller.current;
      const card = cardAt(i);
      if (!el || !card) return;
      programmaticUntil.current = Date.now() + PROGRAMMATIC_MS;
      const padding = parseFloat(getComputedStyle(el).paddingLeft) || 0;
      el.scrollTo({ left: card.offsetLeft - padding, behavior });
      indexRef.current = i;
      setIndex(i);
    },
    [cardAt],
  );

  /** L'utente ha toccato il carosello: fermo, e riparto solo dopo un po' di quiete. */
  const userTouched = useCallback(() => {
    setPaused(true);
    if (resumeTimer.current) clearTimeout(resumeTimer.current);
    resumeTimer.current = setTimeout(() => {
      if (!holding.current && !hover.current) setPaused(false);
    }, RESUME_AFTER_MS);
  }, []);

  // cambio scheda: si riparte dalla prima card
  useEffect(() => {
    indexRef.current = 0;
    setIndex(0);
    programmaticUntil.current = Date.now() + PROGRAMMATIC_MS;
    scroller.current?.scrollTo({ left: 0 });
  }, [tab]);

  // autoplay
  useEffect(() => {
    if (reduceMotion || paused || items.length < 2) return;
    const id = setInterval(() => {
      if (document.hidden) return;
      scrollToIndex((indexRef.current + 1) % items.length, "smooth");
    }, AUTOPLAY_MS);
    return () => clearInterval(id);
  }, [reduceMotion, paused, items.length, scrollToIndex]);

  useEffect(
    () => () => {
      if (resumeTimer.current) clearTimeout(resumeTimer.current);
    },
    [],
  );

  // card attiva = la più vicina al bordo sinistro; uno scroll fuori dalla finestra
  // programmata è dell'utente
  const onScroll = useCallback(() => {
    const el = scroller.current;
    if (!el) return;
    const padding = parseFloat(getComputedStyle(el).paddingLeft) || 0;
    const x = el.scrollLeft + padding;
    let best = 0;
    let bestDist = Infinity;
    for (let i = 0; i < el.children.length; i++) {
      const d = Math.abs((el.children[i] as HTMLElement).offsetLeft - x);
      if (d < bestDist) {
        bestDist = d;
        best = i;
      }
    }
    if (best !== indexRef.current) {
      indexRef.current = best;
      setIndex(best);
    }
    if (Date.now() > programmaticUntil.current) userTouched();
  }, [userTouched]);

  if (items.length === 0) return null;

  return (
    <section aria-label="In evidenza" className="relative">
      <div
        ref={scroller}
        onScroll={onScroll}
        onPointerDown={() => {
          holding.current = true;
          userTouched();
        }}
        onPointerUp={() => {
          holding.current = false;
          userTouched();
        }}
        onPointerCancel={() => {
          holding.current = false;
          userTouched();
        }}
        // solo il mouse vero: su touch "enter" scatta ma "leave" no, e resterebbe fermo
        onPointerEnter={(e) => {
          if (e.pointerType !== "mouse") return;
          hover.current = true;
          setPaused(true);
        }}
        onPointerLeave={(e) => {
          if (e.pointerType !== "mouse") return;
          hover.current = false;
          userTouched();
        }}
        onWheel={userTouched}
        className="scrollbar-none flex snap-x snap-mandatory overflow-x-auto"
      >
        {items.map((item, i) => (
          <HeroCard key={`${item.mediaType}-${item.id}`} item={item} priority={i === 0} />
        ))}
      </div>

      {items.length > 1 && (
        <div
          className="mt-3 flex justify-center gap-1.5 lg:absolute lg:bottom-8 lg:right-10 lg:mt-0"
          aria-hidden="true"
        >
          {items.map((item, i) => (
            <button
              key={`${item.mediaType}-${item.id}`}
              type="button"
              tabIndex={-1}
              onClick={() => {
                userTouched();
                scrollToIndex(i, reduceMotion ? "auto" : "smooth");
              }}
              className={`h-1.5 rounded-full transition-all duration-300 ${
                i === index ? "w-5 bg-white" : "w-1.5 bg-white/30"
              }`}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function HeroCard({ item, priority }: { item: HeroItem; priority: boolean }) {
  // il fondale è il protagonista a tutte le larghezze; senza backdrop resta la locandina
  const wide =
    backdropUrl(item.backdropPath, "original") ?? posterUrl(item.posterPath, "original");
  const meta = [
    item.year,
    item.voteAverage
      ? `★ ${item.voteAverage.toLocaleString("it-IT", { maximumFractionDigits: 1 })}`
      : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <Link
      href={`/title/${item.mediaType}/${item.id}`}
      className={`${SHAPE} group relative flex w-full shrink-0 snap-start flex-col overflow-hidden lg:block`}
      draggable={false}
    >
      {/* riquadro dell'immagine: 16:9 intero sotto `lg`, tutta la card da `lg` */}
      <div className="relative aspect-video w-full bg-surface-2 lg:absolute lg:inset-0 lg:aspect-auto">
        {wide && (
          <Image
            src={wide}
            alt=""
            fill
            sizes="100vw"
            priority={priority}
            loading={priority ? undefined : "lazy"}
            draggable={false}
            className="object-cover object-top"
          />
        )}

        {/* veli: sotto `lg` solo un respiro nero in fondo, fuori dal soggetto; da `lg`
            dal basso e da sinistra, sotto il testo */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black to-transparent lg:h-2/3 lg:from-black/95 lg:via-black/35" />
        <div className="pointer-events-none absolute inset-0 hidden bg-gradient-to-r from-black/90 via-black/45 to-transparent lg:block" />

        <span className="glass absolute left-5 top-4 rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.04em] text-white lg:left-10 lg:top-8 lg:text-[12px]">
          {HERO_REASON_LABEL[item.reason]}
        </span>
      </div>

      <div className="px-5 pt-3 lg:absolute lg:inset-y-0 lg:left-0 lg:flex lg:max-w-[46%] lg:flex-col lg:justify-end lg:px-10 lg:pb-16 lg:pt-0 xl:max-w-[42%]">
        <p className="line-clamp-2 text-[22px] font-bold leading-tight tracking-[-0.02em] text-white lg:text-[46px] lg:leading-[1.03] lg:tracking-[-0.035em] xl:text-[56px]">
          {item.title}
        </p>
        {meta && (
          <p className="mt-1 text-[13px] font-medium text-white/70 lg:mt-3 lg:text-[15px]">
            {meta}
          </p>
        )}
        {item.overview && (
          <p className="mt-2 line-clamp-2 text-[14px] leading-relaxed text-white/70 lg:mt-3 lg:line-clamp-3 lg:text-[15px] lg:text-white/75">
            {item.overview}
          </p>
        )}
        <span className="mt-6 hidden h-11 w-fit items-center rounded-full glass-accent px-6 text-[15px] font-semibold text-white transition-colors lg:inline-flex">
          Vedi scheda
        </span>
      </div>
    </Link>
  );
}
