"use client";

import Image from "next/image";
import { AnimatePresence, motion } from "framer-motion";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { posterUrl } from "@/lib/config";
import { markDailyQuestionSeen } from "@/lib/daily/actions";
import type {
  DailyQuestionRow,
  MyAnswer,
  Podium,
  Suggestions,
} from "@/lib/daily/queries";
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
  suggestions,
  seen,
}: {
  question: DailyQuestionRow | null;
  podium: Podium | null;
  answer: MyAnswer | null;
  suggestions: Suggestions;
  seen: boolean;
}) {
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const [mine, setMine] = useState<MyAnswer | null>(answer);
  const scroller = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  // l'overlay è `fixed inset-0`: senza questo, un link al titolo o al profilo
  // cambiava pagina **dietro** di lui e restava lì sopra a coprirla
  const pathname = usePathname();
  const apertoSu = useRef(pathname);

  useEffect(() => setMounted(true), []);

  // prima apertura del giorno: si apre da solo, e la riga "visto" si scrive subito
  useEffect(() => {
    if (seen || (!question && !podium)) return;
    setOpen(true);
    apertoSu.current = pathname;
    void markDailyQuestionSeen();
    // il percorso non deve far riaprire il popup: si legge solo al momento
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seen, question, podium]);

  useEffect(() => {
    if (open && pathname !== apertoSu.current) setOpen(false);
  }, [pathname, open]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open]);

  // Con il popup aperto si scorre dentro il popup, non la pagina sotto: il
  // `body` resta fermo (e non salta in cima, perché la posizione si rimette
  // alla chiusura) e i contenitori interni hanno `overscroll-contain`, così
  // arrivati in fondo lo scorrimento non passa alla pagina.
  useEffect(() => {
    if (!open) return;
    const body = document.body;
    const y = window.scrollY;
    const prev = {
      overflow: body.style.overflow,
      position: body.style.position,
      top: body.style.top,
      width: body.style.width,
    };
    body.style.overflow = "hidden";
    // su iOS `overflow: hidden` da solo non basta
    body.style.position = "fixed";
    body.style.top = `-${y}px`;
    body.style.width = "100%";
    return () => {
      body.style.overflow = prev.overflow;
      body.style.position = prev.position;
      body.style.top = prev.top;
      body.style.width = prev.width;
      window.scrollTo(0, y);
    };
  }, [open]);

  if (!question && !podium) return null;

  const slides: ReactNode[] = [];
  if (podium) slides.push(<DailyPodium key="podium" podium={podium} />);
  if (question) {
    slides.push(
      <div key="today" className="flex flex-col gap-6 lg:h-full">
        <DailyComposer
          question={question}
          current={mine}
          suggestions={suggestions}
          onSaved={setMine}
        />
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

  // Lo sfondo è **la stessa locandina che sta sul podio**, non il backdrop: sfumata
  // com'è, un fotogramma diverso non si riconosce e non si capisce che è quel film
  // (richiesta utente 2026-09-09).
  const hero = podium?.entries[0]?.posterPath ?? null;

  return (
    <>
      <button
        type="button"
        aria-label="La domanda del giorno"
        onClick={() => {
          apertoSu.current = pathname;
          setOpen(true);
        }}
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
                className="fixed inset-0 z-[60] flex items-center justify-center p-4"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
              >
                {/* Fuori dal riquadro l'app resta visibile, solo velata: così si
                    vede che è un popup e non una pagina (richiesta utente). */}
                <div
                  className="absolute inset-0 bg-black/45 backdrop-blur-sm"
                  onClick={() => setOpen(false)}
                />

                <motion.div
                  role="dialog"
                  aria-modal="true"
                  aria-label="La domanda del giorno"
                  initial={{ opacity: 0, scale: 0.94, y: 16 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  // si richiude verso l'icona, in alto a destra
                  exit={{ opacity: 0, scale: 0.35, x: "34%", y: "-38%" }}
                  transition={{ type: "spring", stiffness: 280, damping: 28 }}
                  className="daily-veil relative flex max-h-[78svh] w-full max-w-[400px] flex-col overflow-hidden rounded-[26px] border border-white/10 shadow-[0_30px_90px_rgba(0,0,0,0.65)] lg:aspect-[21/9] lg:max-h-[84svh] lg:w-[min(1120px,82vw)] lg:max-w-none 2xl:w-[min(1320px,76vw)]"
                >
                  {hero && (
                    // La locandina del film che ha vinto è **sfondo dietro al vetro**,
                    // non una copertina in primo piano (richieste utente 2026-09-09):
                    // deve restare riconoscibile ma non competere col podio.
                    // Due strati, perché una locandina 2:3 dentro un riquadro largo
                    // (21:9 da `lg`) o si taglia o si deforma: sotto una copia
                    // `object-cover` sfocatissima che porta i colori fino ai bordi,
                    // sopra la locandina **intera e nelle sue proporzioni**
                    // (`object-contain`), sfocata quel tanto che basta.
                    <div className="pointer-events-none absolute inset-0 overflow-hidden">
                      <div className="absolute inset-[-14%]">
                        <Image
                          src={posterUrl(hero, "w500")!}
                          alt=""
                          fill
                          unoptimized
                          className="object-cover opacity-70 blur-[52px] saturate-[0.85]"
                        />
                      </div>
                      <Image
                        src={posterUrl(hero, "w500")!}
                        alt=""
                        fill
                        unoptimized
                        className="ken-burns object-contain opacity-80 blur-[10px] saturate-[0.9] lg:blur-[16px]"
                      />
                      <div className="daily-glass absolute inset-0" />
                    </div>
                  )}

                  <div
                    ref={scroller}
                    onScroll={(e) => {
                      const el = e.currentTarget;
                      setIndex(Math.round(el.scrollLeft / Math.max(el.clientWidth, 1)));
                    }}
                    // `relative z-10`: il fotogramma e il vetro sono elementi
                    // **posizionati**, quindi si dipingono sopra a un blocco statico —
                    // il testo bianco finiva sotto al vetro e si leggeva grigio.
                    className="relative z-10 flex min-h-0 flex-1 snap-x snap-mandatory overflow-x-auto overflow-y-auto overscroll-contain lg:overflow-y-hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                  >
                    {slides.map((slide, i) => (
                      <section
                        key={i}
                        className="w-full shrink-0 snap-center overscroll-contain px-5 pb-4 pt-6 lg:h-full lg:overflow-y-auto lg:px-10 lg:pb-2 lg:pt-5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                      >
                        {slide}
                      </section>
                    ))}
                  </div>

                  <button
                    type="button"
                    aria-label="Chiudi"
                    onClick={() => setOpen(false)}
                    className="glass absolute right-3 top-3 z-10 flex size-9 items-center justify-center rounded-full text-text"
                  >
                    <svg
                      width="16"
                      height="16"
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
                    <div className="flex items-center justify-center gap-4 pb-4">
                      <button
                        type="button"
                        aria-label="Indietro"
                        onClick={() => go(-1)}
                        className="glass size-8 rounded-full text-text"
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
                        className="glass size-8 rounded-full text-text"
                      >
                        ›
                      </button>
                    </div>
                  )}
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>,
          document.body,
        )}
    </>
  );
}
