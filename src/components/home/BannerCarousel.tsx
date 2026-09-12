"use client";

import Image from "next/image";
import Link from "next/link";
import { useReducedMotion } from "framer-motion";
import { useCallback, useEffect, useRef, useState } from "react";
import { backdropUrl, posterUrl } from "@/lib/config";

/** Ogni quanto il carosello passa alla card successiva da solo. */
const AUTOPLAY_MS = 6000;
/** Dopo un gesto dell'utente l'autoplay aspetta questo tempo prima di riprendere. */
const RESUME_AFTER_MS = 8000;
/** Finestra in cui uno `scroll` è nostro (programmato), non dell'utente. */
const PROGRAMMATIC_MS = 1500;

/**
 * Una card = una schermata, a tutte le larghezze un **banner alla Netflix**: fondale a
 * tutta altezza della card e titolo, anno/voto e trama **sopra l'immagine**, mai sul
 * nero. Anche su telefono il banner è alto mezza schermata (`52svh`): prima era una
 * striscia 16:9 col testo sotto, sul nero — troppo bassa, e il testo fuori dalla
 * copertina (richiesta utente 2026-09-12).
 */
const SHAPE =
  "h-[52svh] min-h-[360px] max-h-[500px] lg:h-[64svh] lg:min-h-[420px] lg:max-h-[680px]";

/**
 * Quando il banner comincia in cima alla pagina, i comandi che gli stanno sopra (la
 * nav con le sue due icone, la barra di ricerca) sono **sovrapposti e trasparenti**: il
 * fondale **si estende verso l'alto** di `--banner-top` e riempie lo spazio che era
 * nero, invece di restare della stessa altezza e salire.
 *
 * Da `lg` a crescere è la **card**: `64svh` diventa `64svh + --banner-top`, e con lei i
 * limiti minimo e massimo. Traslare in su la card di prima lasciava il banner della
 * stessa altezza — la stessa fetta 21:9 spostata — che non è estendere l'immagine
 * (richiesta utente 2026-09-12).
 *
 * Sotto `lg` cresce allo stesso modo: `52svh` diventa `52svh + --banner-top`, così la
 * fetta di fondale coperta dai comandi è in più, non al posto di quella che si vedeva.
 */
const GROWN_SHAPE =
  "h-[calc(52svh+var(--banner-top))] min-h-[calc(360px+var(--banner-top))] max-h-[calc(500px+var(--banner-top))] " +
  "lg:h-[calc(64svh+var(--banner-top))] lg:min-h-[calc(420px+var(--banner-top))] lg:max-h-[calc(680px+var(--banner-top))]";

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
 * (`MoodPills`): in entrambi i casi il banner comincia in cima alla pagina e sopra gli
 * stanno, in trasparenza, solo la nav e la barra di ricerca — vedi `bannerTop`.
 */
export function BannerCarousel({
  items,
  label,
  bannerTop,
  resetKey,
  priority = false,
}: {
  items: BannerItem[];
  /** Nome della sezione per chi non vede lo schermo. */
  label: string;
  /**
   * Classi che impostano `--banner-top`, cioè quanto spazio in cima è coperto dai
   * comandi sovrapposti — la nav con le sue due icone, e in Cerca la barra di ricerca:
   * **solo quelli** stanno sull'immagine (richiesta utente 2026-09-12), tutto il resto
   * sta sotto il banner. Può cambiare per breakpoint, quindi classi e non stile in
   * linea. Senza, il banner sta nel flusso come una fila qualunque.
   */
  bannerTop?: string;
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
    <section
      aria-label={label}
      // `@container`: il `cqw` di `GROWN_MEDIA` misura questa sezione (= la card)
      className={`relative ${bannerTop ? `@container ${bannerTop}` : ""}`}
    >
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
              conCoperta={Boolean(bannerTop)}
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
            className="absolute inset-x-0 bottom-4 flex justify-center gap-1.5 lg:inset-x-auto lg:bottom-8 lg:right-10"
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

function BannerCard({
  item,
  priority,
  conCoperta,
}: {
  item: BannerItem;
  priority: boolean;
  /** Vero quando in cima ci sono comandi sovrapposti: il fondale cresce e prende un velo. */
  conCoperta: boolean;
}) {
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
      className={`${conCoperta ? GROWN_SHAPE : SHAPE} group relative block w-full shrink-0 snap-start overflow-hidden`}
      draggable={false}
    >
      {/* Riquadro dell'immagine: tutta la card, a ogni larghezza.
          L'immagine è tenuta **sopra il centro** (`object-[50%_32%]`): da `lg` il
          banner è quasi 21:9 e taglia sopra e sotto, e ancorandola in alto
          (`object-top`) da un ripiego sulla locandina 2:3 restava solo la striscia in
          cima — cielo sopra la testa dei protagonisti, film irriconoscibile; al centro
          esatto il taglio mangiava le teste. Tagliato va bene, purché si riconosca la
          copertina: il soggetto sta sopra la metà (richiesta utente 2026-09-08, alzato
          ancora il 2026-09-09: da 40% a 32%). */}
      <div className="absolute inset-0 bg-surface-2">
        {wide && (
          <Image
            src={wide}
            alt=""
            fill
            sizes="100vw"
            priority={priority}
            loading={priority ? undefined : "lazy"}
            draggable={false}
            className="object-cover object-[50%_32%]"
          />
        )}

        {/* Veli: il testo sta **sopra** l'immagine, quindi in fondo serve un velo che lo
            renda leggibile. Tenuto **leggero** (richiesta utente 2026-09-12: "non
            sfumare così tanto di nero sul fondo del banner"): sotto `lg` metà card da
            `black/85` a trasparente, da `lg` la leggibilità del titolo la fa il velo
            da sinistra e questo resta più basso. */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/85 via-black/45 to-transparent lg:from-black/80 lg:via-black/20" />
        <div className="pointer-events-none absolute inset-0 hidden bg-gradient-to-r from-black/90 via-black/45 to-transparent lg:block" />

        {/* velo in cima: i comandi sovrapposti devono restare leggibili anche su un
            fondale chiaro, ma senza fondo pieno — sfuma e il fondale si vede sotto */}
        {conCoperta && (
          <div className="pointer-events-none absolute inset-x-0 top-0 h-[var(--banner-top)] bg-gradient-to-b from-black/85 via-black/45 to-transparent" />
        )}

        {/* La pillola del motivo sta in cima solo da `lg`: sotto `lg` in cima ci sono
            già "Home" e la scheda Tutto / Film / Serie TV, e una terza pillola in fila
            faceva mucchio — lì va sopra il titolo, dove si legge come un'etichetta */}
        {item.chip && (
          <span
            className={`glass absolute left-5 hidden rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.04em] text-white lg:left-10 lg:block lg:text-[12px] ${
              // appesa alla **base della scritta**, non al fondo di tutta la riga
              // (`--banner-top` comprende anche il suo `padding-bottom`): sotto la nav
              // senza toccarla, e non venti pixel più in giù (richiesta utente)
              conCoperta ? "top-[calc(var(--banner-top)-8px)]" : "top-4 lg:top-8"
            }`}
          >
            {item.chip}
          </span>
        )}
      </div>

      <div className="absolute inset-x-0 bottom-0 px-5 pb-11 lg:inset-y-0 lg:right-auto lg:flex lg:max-w-[46%] lg:flex-col lg:justify-end lg:px-10 lg:pb-7 xl:max-w-[42%]">
        {item.chip && (
          <span className="glass mb-2 inline-block rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.04em] text-white lg:hidden">
            {item.chip}
          </span>
        )}
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
