"use client";

import Image from "next/image";
import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import { useCallback, useEffect, useRef, useState } from "react";
import { posterUrl } from "@/lib/config";
import { HERO_REASON_LABEL, type HeroItem } from "@/lib/home/hero-rank";

type Tab = "movie" | "tv";

const TABS: { key: Tab; label: string }[] = [
  { key: "movie", label: "Film" },
  { key: "tv", label: "Serie TV" },
];

/** Ogni quanto il carosello passa alla card successiva da solo. */
const AUTOPLAY_MS = 4000;
/** Dopo un gesto dell'utente l'autoplay aspetta questo tempo prima di riprendere. */
const RESUME_AFTER_MS = 8000;
/** Finestra in cui uno `scroll` è nostro (programmato), non dell'utente. */
const PROGRAMMATIC_MS = 1500;

/** Larghezze delle card: le stesse delle classi Tailwind qui sotto. */
const CARD = "w-[200px] lg:w-[240px]";
const CARD_SIZES = "(max-width: 1024px) 200px, 240px";

/**
 * Carosello in testa alla home: card grandi con le locandine, divise fra film e
 * serie. Scorre da solo ogni 4 s; un tocco, un trascinamento, la rotella o il mouse
 * sopra lo fermano e riparte dopo 8 s di quiete. Lo scorrimento è nativo con
 * `scroll-snap`, così il gesto dell'utente resta quello di sempre.
 */
export function HeroCarousel({ movie, tv }: { movie: HeroItem[]; tv: HeroItem[] }) {
  const reduceMotion = useReducedMotion();
  const [tab, setTab] = useState<Tab>(
    movie.length > 0 || tv.length === 0 ? "movie" : "tv",
  );
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

  if (movie.length === 0 && tv.length === 0) return null;

  return (
    <section aria-label="In evidenza">
      <header className="flex items-center justify-between px-5 pb-4 pt-[calc(env(safe-area-inset-top,0px)+var(--nav-top)+32px)] lg:px-10">
        <h1 className="text-[34px] font-bold leading-none tracking-[-0.045em]">Home</h1>

        <div
          role="tablist"
          aria-label="Film o serie TV"
          className="glass flex h-10 items-center rounded-full p-1"
        >
          {TABS.map((t) => {
            const active = t.key === tab;
            return (
              <button
                key={t.key}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setTab(t.key)}
                className={`relative h-8 rounded-full px-4 text-[13px] font-semibold transition-colors ${
                  active ? "text-white" : "text-white/60 hover:text-white/85"
                }`}
              >
                {active && (
                  <motion.span
                    layoutId="home-hero-tab"
                    aria-hidden="true"
                    className="absolute inset-0 rounded-full bg-white/[0.16] shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]"
                    transition={
                      reduceMotion
                        ? { duration: 0 }
                        : { type: "spring", stiffness: 420, damping: 38, mass: 0.8 }
                    }
                  />
                )}
                <span className="relative">{t.label}</span>
              </button>
            );
          })}
        </div>
      </header>

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
        className="scrollbar-none flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-px-5 px-5 pb-1 lg:scroll-px-10 lg:px-10"
      >
        {items.map((item, i) => (
          <HeroCard key={`${item.mediaType}-${item.id}`} item={item} priority={i < 2} />
        ))}
      </div>

      {items.length > 1 && (
        <div className="mt-3 flex justify-center gap-1.5" aria-hidden="true">
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
  const src = posterUrl(item.posterPath, "w500");
  return (
    <Link
      href={`/title/${item.mediaType}/${item.id}`}
      className={`${CARD} group relative aspect-[2/3] shrink-0 snap-start overflow-hidden rounded-[20px] border border-white/[0.08] bg-surface-2`}
      draggable={false}
    >
      {src && (
        <Image
          src={src}
          alt={item.title}
          fill
          sizes={CARD_SIZES}
          priority={priority}
          draggable={false}
          className="object-cover transition-transform duration-500 group-hover:scale-[1.03]"
        />
      )}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-3/5 bg-gradient-to-t from-black/90 via-black/45 to-transparent" />
      <span className="glass absolute left-3 top-3 rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.04em] text-white">
        {HERO_REASON_LABEL[item.reason]}
      </span>
      <div className="absolute inset-x-0 bottom-0 p-3.5">
        <p className="line-clamp-2 text-[17px] font-bold leading-tight tracking-[-0.02em] text-white">
          {item.title}
        </p>
        <p className="mt-1 text-[12px] font-medium text-white/70">
          {[item.year, item.voteAverage ? `★ ${item.voteAverage.toFixed(1)}` : null]
            .filter(Boolean)
            .join(" · ")}
        </p>
      </div>
    </Link>
  );
}
