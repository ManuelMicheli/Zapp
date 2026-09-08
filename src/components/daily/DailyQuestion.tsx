"use client";

import Image from "next/image";
import { AnimatePresence, motion } from "framer-motion";
import { createPortal } from "react-dom";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { backdropUrl } from "@/lib/config";
import { markDailyQuestionSeen } from "@/lib/daily/actions";
import type { DailyQuestionRow, MyAnswer, Podium } from "@/lib/daily/queries";
import { DailyPodium } from "./DailyPodium";
import { DailyComposer } from "./DailyComposer";
import { DailyAnswerList } from "./DailyAnswerList";

/**
 * La domanda del giorno: un'icona accanto alla campanella e un overlay a tutto
 * schermo. L'overlay si apre da solo alla prima apertura del giorno (nessuna
 * riga in `daily_question_views`), poi si "riduce" verso l'icona.
 *
 * Due schermate su scorrimento orizzontale con snap, puntini e frecce: lo stesso
 * schema di `ScanMode`.
 */
export function DailyQuestion({
  question,
  podium,
  answer,
  seen,
}: {
  question: DailyQuestionRow | null;
  podium: Podium | null;
  answer: MyAnswer | null;
  seen: boolean;
}) {
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const [mine, setMine] = useState<MyAnswer | null>(answer);
  const scroller = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);

  useEffect(() => setMounted(true), []);

  // prima apertura del giorno: si apre da solo, e la riga "visto" si scrive subito
  useEffect(() => {
    if (seen || (!question && !podium)) return;
    setOpen(true);
    void markDailyQuestionSeen();
  }, [seen, question, podium]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open]);

  if (!question && !podium) return null;

  const slides: ReactNode[] = [];
  if (podium) slides.push(<DailyPodium key="podium" podium={podium} />);
  if (question) {
    slides.push(
      <div key="today" className="flex h-full flex-col overflow-y-auto">
        <DailyComposer question={question} current={mine} onSaved={setMine} />
        {mine && <DailyAnswerList />}
      </div>,
    );
  }

  function go(delta: number) {
    const el = scroller.current;
    if (!el) return;
    const next = Math.min(Math.max(index + delta, 0), slides.length - 1);
    el.scrollTo({ left: next * el.clientWidth, behavior: "smooth" });
    setIndex(next);
  }

  const hero = podium?.entries[0]?.backdropPath ?? null;

  return (
    <>
      <button
        type="button"
        aria-label="La domanda del giorno"
        onClick={() => setOpen(true)}
        className="glass relative flex size-10 items-center justify-center rounded-full text-text"
      >
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="9" />
          <path d="M9.3 9.1a2.8 2.8 0 1 1 3.5 2.7c-.75.25-1.2.9-1.2 1.7v.3" />
          <path d="M11.98 16.9h.01" />
        </svg>
        {!mine && (
          <span className="absolute right-1.5 top-1.5 size-[9px] rounded-full border-2 border-bg bg-accent" />
        )}
      </button>

      {mounted &&
        createPortal(
          <AnimatePresence>
            {open && (
              <motion.div
                className="fixed inset-0 z-[60] overflow-hidden bg-bg"
                initial={{ opacity: 0, scale: 0.92 }}
                animate={{ opacity: 1, scale: 1 }}
                // si richiude verso l'angolo in alto a destra, dov'è l'icona
                exit={{ opacity: 0, scale: 0.2, x: "38%", y: "-42%" }}
                transition={{ type: "spring", stiffness: 260, damping: 30 }}
                role="dialog"
                aria-modal="true"
              >
                {hero && (
                  <div className="pointer-events-none absolute inset-0 -z-10">
                    <Image
                      src={backdropUrl(hero, "original")!}
                      alt=""
                      fill
                      unoptimized
                      className="ken-burns object-cover opacity-40"
                    />
                    <div className="absolute inset-0 bg-gradient-to-b from-black/70 via-black/80 to-black" />
                  </div>
                )}

                <div
                  ref={scroller}
                  onScroll={(e) => {
                    const el = e.currentTarget;
                    setIndex(Math.round(el.scrollLeft / Math.max(el.clientWidth, 1)));
                  }}
                  className="flex h-full snap-x snap-mandatory overflow-x-auto overflow-y-hidden"
                >
                  {slides.map((slide, i) => (
                    <section key={i} className="h-full w-full shrink-0 snap-center">
                      {slide}
                    </section>
                  ))}
                </div>

                <button
                  type="button"
                  aria-label="Chiudi"
                  onClick={() => setOpen(false)}
                  className="glass absolute right-5 top-[calc(env(safe-area-inset-top,0px)+12px)] flex size-10 items-center justify-center rounded-full text-text"
                >
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    aria-hidden="true"
                  >
                    <path d="M6 6l12 12M18 6L6 18" />
                  </svg>
                </button>

                {slides.length > 1 && (
                  <div className="absolute inset-x-0 bottom-[calc(env(safe-area-inset-bottom,0px)+16px)] flex items-center justify-center gap-4">
                    <button
                      type="button"
                      aria-label="Indietro"
                      onClick={() => go(-1)}
                      className="glass size-9 rounded-full text-text"
                    >
                      ‹
                    </button>
                    <div className="flex gap-1.5">
                      {slides.map((_, i) => (
                        <span
                          key={i}
                          className={`size-1.5 rounded-full ${
                            i === index ? "bg-text" : "bg-white/30"
                          }`}
                        />
                      ))}
                    </div>
                    <button
                      type="button"
                      aria-label="Avanti"
                      onClick={() => go(1)}
                      className="glass size-9 rounded-full text-text"
                    >
                      ›
                    </button>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>,
          document.body,
        )}
    </>
  );
}
