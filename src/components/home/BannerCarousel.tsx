"use client";

import Image from "next/image";
import Link from "next/link";
import { useReducedMotion } from "framer-motion";
import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { backdropUrl, posterUrl } from "@/lib/config";

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

/** Un titolo dentro un banner: quel che serve a disegnarlo, da qualunque fila venga. */
export interface BannerItem {
  id: number;
  mediaType: "movie" | "tv";
  title: string;
  posterPath: string;
  backdropPath?: string | null;
  overview?: string | null;
  year: string | null;
  /** Voto 0-10, accanto all'anno. */
  voteAverage?: number | null;
  /** Pillola in alto a sinistra ("Per te 82%", "Novità"): senza, non si disegna. */
  chip?: string | null;
  /** `data-signal` per la raccolta dei segnali (fase A); dove non serve, `null`. */
  signal?: string | null;
}

/**
 * Il carosello a banner della home: un titolo alla volta, fondale intero, scorrimento
 * nativo con `scroll-snap`. Scorre da solo ogni 6 s; un tocco, un trascinamento, la
 * rotella o il mouse sopra lo fermano e riparte dopo 8 s di quiete. Da `lg` due frecce
 * in vetro ai bordi.
 *
 * Lo usano il carosello in testa alla home (`HeroCarousel`) e la fila del momento
 * (`MoodPills`): la seconda ci mette sopra il proprio titolo e le pillole del mood,
 * passandoli come `header`.
 */
export function BannerCarousel({
  items,
  label,
  header,
  resetKey,
  priority = false,
}: {
  items: BannerItem[];
  /** Nome della sezione per chi non vede lo schermo. */
  label: string;
  /** Testata sopra il banner (titolo della fila, pillole del mood). */
  header?: ReactNode;
  /** Cambiando valore si torna alla prima card (scheda Film/Serie, mood scelto). */
  resetKey?: string | null;
  /** `true` solo per il carosello in testa alla pagina. */
  priority?: boolean;
}) {
  const reduceMotion = useReducedMotion();
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

  /** Freccia: card precedente/successiva, a giro. */
  const go = useCallback(
    (delta: number) => {
      const next = (indexRef.current + delta + items.length) % items.length;
      scrollToIndex(next, reduceMotion ? "auto" : "smooth");
    },
    [items.length, reduceMotion, scrollToIndex],
  );

  /** L'utente ha toccato il carosello: fermo, e riparto solo dopo un po' di quiete. */
  const userTouched = useCallback(() => {
    setPaused(true);
    if (resumeTimer.current) clearTimeout(resumeTimer.current);
    resumeTimer.current = setTimeout(() => {
      if (!holding.current && !hover.current) setPaused(false);
    }, RESUME_AFTER_MS);
  }, []);

  // cambio scheda o mood: si riparte dalla prima card
  useEffect(() => {
    indexRef.current = 0;
    setIndex(0);
    programmaticUntil.current = Date.now() + PROGRAMMATIC_MS;
    scroller.current?.scrollTo({ left: 0 });
  }, [resetKey]);

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
    <section aria-label={label} className="relative">
      {header && <div className="mb-3 px-5 lg:px-10">{header}</div>}

      <div className="relative">
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
            <BannerCard
              key={`${item.mediaType}-${item.id}`}
              item={item}
              priority={priority && i === 0}
            />
          ))}
        </div>

        {items.length > 1 && (
          <>
            <CarouselArrow
              direction="prev"
              onClick={() => {
                userTouched();
                go(-1);
              }}
            />
            <CarouselArrow
              direction="next"
              onClick={() => {
                userTouched();
                go(1);
              }}
            />
          </>
        )}

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
      </div>
    </section>
  );
}

/**
 * Frecce del carosello: solo da `lg` (col mouse), due tondi in vetro ai bordi del
 * banner, sopra i veli ma fuori dal `Link` della card.
 *
 * Stanno **sopra la metà** (38%) e non al centro esatto: il titolo del film comincia
 * poco sotto la metà del banner e la freccia di sinistra gli finiva addosso.
 */
function CarouselArrow({
  direction,
  onClick,
}: {
  direction: "prev" | "next";
  onClick: () => void;
}) {
  const prev = direction === "prev";
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={prev ? "Titolo precedente" : "Titolo successivo"}
      className={`glass absolute top-[38%] z-10 hidden size-10 -translate-y-1/2 items-center justify-center rounded-full text-white/80 transition-colors hover:text-white lg:flex ${
        prev ? "left-4" : "right-4"
      }`}
    >
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d={prev ? "M15 5l-7 7 7 7" : "M9 5l7 7-7 7"} />
      </svg>
    </button>
  );
}

function BannerCard({ item, priority }: { item: BannerItem; priority: boolean }) {
  // il fondale è il protagonista a tutte le larghezze; senza backdrop resta la locandina
  const wide =
    backdropUrl(item.backdropPath ?? null, "original") ??
    posterUrl(item.posterPath, "original");
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
      data-signal={item.signal ?? undefined}
      className={`${SHAPE} group relative flex w-full shrink-0 snap-start flex-col overflow-hidden lg:block`}
      draggable={false}
    >
      {/* Riquadro dell'immagine: 16:9 intero sotto `lg`, tutta la card da `lg`.
          L'immagine è tenuta al **centro** (`object-center`, non più `object-top`):
          da `lg` il banner è quasi 21:9 e taglia sopra e sotto, e da un ripiego sulla
          locandina 2:3 si vedeva solo la striscia in cima — cielo sopra la testa dei
          protagonisti, film irriconoscibile. Tagliato va bene, purché resti la parte
          centrale (richiesta utente 2026-09-08). */}
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
            className="object-cover object-center"
          />
        )}

        {/* veli: sotto `lg` solo un respiro nero in fondo, fuori dal soggetto; da `lg`
            dal basso e da sinistra, sotto il testo */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black to-transparent lg:h-2/3 lg:from-black/95 lg:via-black/35" />
        <div className="pointer-events-none absolute inset-0 hidden bg-gradient-to-r from-black/90 via-black/45 to-transparent lg:block" />

        {item.chip && (
          <span className="glass absolute left-5 top-4 rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.04em] text-white lg:left-10 lg:top-8 lg:text-[12px]">
            {item.chip}
          </span>
        )}
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
