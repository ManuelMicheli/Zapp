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
 * Una card = una schermata. Sotto `lg` è **una locandina grande alla volta**
 * (tutta la larghezza meno un filo di sbirciata sulla successiva); da `lg` è un
 * **banner alla Netflix**: fondale a tutta larghezza, titolo grande e trama a
 * sinistra, un film alla volta.
 */
const SLIDE = "w-[calc(100%-52px)] lg:w-full";
const SHAPE =
  "aspect-[2/3] lg:aspect-auto lg:h-[64svh] lg:min-h-[420px] lg:max-h-[680px]";
const POSTER_SIZES = "(max-width: 1023px) calc(100vw - 52px), 1px";

/**
 * Carosello in testa alla home: un titolo alla volta del tipo scelto in testata
 * (Film / Serie TV, `HomeTypeProvider`) — locandina su telefono, banner
 * cinematografico da desktop. Scorre da solo ogni 6 s; un tocco, un
 * trascinamento, la rotella o il mouse sopra lo fermano e riparte dopo 8 s di
 * quiete. Lo scorrimento è nativo con `scroll-snap`, così il gesto dell'utente
 * resta quello di sempre.
 */
export function HeroCarousel({ movie, tv }: { movie: HeroItem[]; tv: HeroItem[] }) {
  const reduceMotion = useReducedMotion();
  const tab = useHomeType()?.type ?? "movie";
  const items = tab === "movie" ? movie : tv;

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
        className="scrollbar-none flex snap-x snap-mandatory gap-4 overflow-x-auto scroll-px-5 px-5 pb-1 lg:gap-0 lg:scroll-px-0 lg:px-0 lg:pb-0"
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
  const poster = posterUrl(item.posterPath, "original");
  // da `lg` il fondale è il protagonista; senza backdrop resta la locandina
  const wide = backdropUrl(item.backdropPath, "original") ?? poster;
  const meta = [item.year, item.voteAverage ? `★ ${item.voteAverage.toFixed(1)}` : null]
    .filter(Boolean)
    .join(" · ");

  return (
    <Link
      href={`/title/${item.mediaType}/${item.id}`}
      className={`${SLIDE} ${SHAPE} group relative shrink-0 snap-start overflow-hidden rounded-[24px] border border-white/[0.08] bg-surface-2 lg:rounded-none lg:border-0`}
      draggable={false}
    >
      {poster && (
        <Image
          src={poster}
          alt={item.title}
          fill
          sizes={POSTER_SIZES}
          priority={priority}
          loading={priority ? undefined : "lazy"}
          draggable={false}
          className="object-cover transition-transform duration-500 group-hover:scale-[1.02] lg:hidden"
        />
      )}
      {wide && (
        <Image
          src={wide}
          alt=""
          fill
          sizes="100vw"
          priority={priority}
          loading={priority ? undefined : "lazy"}
          draggable={false}
          className="hidden object-cover object-top lg:block"
        />
      )}

      {/* veli: dal basso su telefono, anche da sinistra sul banner desktop */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-3/5 bg-gradient-to-t from-black via-black/50 to-transparent lg:h-2/3 lg:from-black/95 lg:via-black/35" />
      <div className="pointer-events-none absolute inset-0 hidden bg-gradient-to-r from-black/90 via-black/45 to-transparent lg:block" />

      <span className="glass absolute left-3 top-3 rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.04em] text-white lg:left-10 lg:top-8 lg:text-[12px]">
        {HERO_REASON_LABEL[item.reason]}
      </span>

      <div className="absolute inset-x-0 bottom-0 p-4 lg:inset-y-0 lg:right-auto lg:flex lg:max-w-[46%] lg:flex-col lg:justify-end lg:px-10 lg:pb-16 xl:max-w-[42%]">
        <p className="line-clamp-2 text-[20px] font-bold leading-tight tracking-[-0.02em] text-white lg:text-[46px] lg:leading-[1.03] lg:tracking-[-0.035em] xl:text-[56px]">
          {item.title}
        </p>
        {meta && (
          <p className="mt-1 text-[13px] font-medium text-white/70 lg:mt-3 lg:text-[15px]">
            {meta}
          </p>
        )}
        {item.overview && (
          <p className="mt-3 hidden text-[15px] leading-relaxed text-white/75 lg:line-clamp-3">
            {item.overview}
          </p>
        )}
        <span className="mt-6 hidden h-11 w-fit items-center rounded-full bg-accent px-6 text-[15px] font-semibold text-white transition-colors group-hover:bg-accent-strong lg:inline-flex">
          Vedi scheda
        </span>
      </div>
    </Link>
  );
}
