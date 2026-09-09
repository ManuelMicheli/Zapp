"use client";

import Image from "next/image";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useEffect, useRef, useState, useTransition } from "react";
import { posterUrl } from "@/lib/config";
import { REASON_MAX_LENGTH } from "@/lib/daily/rank";
import { answerDailyQuestion } from "@/lib/daily/actions";
import type {
  DailyQuestionRow,
  MyAnswer,
  Suggestion,
  Suggestions,
} from "@/lib/daily/queries";
import { useToast } from "@/components/ui/Toaster";
import { Button } from "@/components/ui/Button";
import type { SearchItem } from "@/lib/tmdb/mappers";

/** Copertina proposta: un tocco e la risposta è scelta. */
function Poster({
  item,
  onPick,
  delay,
}: {
  item: Suggestion;
  onPick: () => void;
  delay: number;
}) {
  const fermo = useReducedMotion();
  return (
    <motion.button
      type="button"
      onClick={onPick}
      initial={fermo ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: fermo ? 0 : delay, duration: 0.25 }}
      whileTap={fermo ? undefined : { scale: 0.94 }}
      className="group w-[84px] shrink-0 text-left lg:w-full"
    >
      <div className="relative aspect-[2/3] overflow-hidden rounded-[14px] bg-surface-2 ring-0 ring-accent transition-all group-hover:ring-2">
        {item.posterPath && (
          <Image
            src={posterUrl(item.posterPath, "w342")!}
            alt=""
            fill
            sizes="104px"
            className="object-cover"
          />
        )}
        {item.rating != null && (
          <span className="glass absolute bottom-1 left-1 rounded-full px-1.5 py-0.5 text-[11px] font-medium tabular-nums text-text">
            {item.rating}
          </span>
        )}
      </div>
      <p className="mt-1.5 line-clamp-2 text-[11px] font-medium leading-tight text-white [text-shadow:0_1px_10px_rgba(0,0,0,0.85),0_1px_2px_rgba(0,0,0,0.7)]">
        {item.title}
      </p>
    </motion.button>
  );
}

/** Una fila di proposte con la sua etichetta. */
function Fila({
  label,
  items,
  onPick,
  from,
}: {
  label: string;
  items: Suggestion[];
  onPick: (s: Suggestion) => void;
  from: number;
}) {
  if (items.length === 0) return null;
  return (
    <div>
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-white [text-shadow:0_1px_10px_rgba(0,0,0,0.85),0_1px_2px_rgba(0,0,0,0.7)]">
        {label}
      </p>
      <div className="-mx-1 flex gap-2.5 overflow-x-auto px-1 pb-1 lg:mx-0 lg:grid lg:grid-cols-6 lg:gap-2.5 lg:overflow-visible lg:px-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {items.map((s, i) => (
          <Poster
            key={`${s.mediaType}:${s.titleId}`}
            item={s}
            delay={(from + i) * 0.03}
            onPick={() => onPick(s)}
          />
        ))}
      </div>
    </div>
  );
}

/**
 * La domanda di oggi: prima le proposte dalla libreria (un tocco e hai
 * risposto), la ricerca solo se serve. Davanti a un campo vuoto ci si blocca a
 * pensare a tutti i film; davanti a sei copertine si sceglie.
 */
export function DailyComposer({
  question,
  current,
  suggestions,
  onSaved,
}: {
  question: DailyQuestionRow;
  current: MyAnswer | null;
  suggestions: Suggestions;
  onSaved: (answer: MyAnswer) => void;
}) {
  const { show } = useToast();
  const fermo = useReducedMotion();
  const [cerca, setCerca] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchItem[]>([]);
  const [picked, setPicked] = useState<MyAnswer | null>(current);
  const [reason, setReason] = useState(current?.reason ?? "");
  const [pending, startTransition] = useTransition();
  const abortRef = useRef<AbortController | null>(null);
  const campo = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (cerca) campo.current?.focus();
  }, [cerca]);

  // stessa ricerca istantanea di /cerca: 60 ms dopo il tasto, la precedente si annulla
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`, {
          signal: controller.signal,
        });
        if (!res.ok) return;
        const data = (await res.json()) as { results: SearchItem[] };
        setResults(
          data.results.filter(
            (r) => question.mediaScope === "any" || r.mediaType === question.mediaScope,
          ),
        );
      } catch {
        // richiesta annullata o rete giù: si tiene l'elenco precedente
      }
    }, 60);
    return () => clearTimeout(timer);
  }, [query, question.mediaScope]);

  function scegli(s: Suggestion | SearchItem) {
    setPicked({
      titleId: "titleId" in s ? s.titleId : s.id,
      mediaType: s.mediaType,
      title: s.title,
      posterPath: s.posterPath,
      reason: null,
    });
    setCerca(false);
    setQuery("");
  }

  function submit() {
    if (!picked) return;
    startTransition(async () => {
      const res = await answerDailyQuestion(picked.titleId, picked.mediaType, reason);
      if (!res.ok) {
        show(res.error ?? "Non è riuscito, riprova.");
        return;
      }
      onSaved({ ...picked, reason: reason.trim() || null });
      show("Risposta salvata");
    });
  }

  const vuoto = suggestions.rated.length === 0 && suggestions.recent.length === 0;

  return (
    <div className="flex flex-col gap-4 lg:grid lg:h-full lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:items-stretch lg:gap-10">
      <div className="lg:self-center">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white [text-shadow:0_1px_10px_rgba(0,0,0,0.85),0_1px_2px_rgba(0,0,0,0.7)]">
          La domanda di oggi
        </p>
        <h2 className="mt-1.5 text-[21px] font-medium leading-snug text-white [text-shadow:0_2px_16px_rgba(0,0,0,0.85),0_1px_3px_rgba(0,0,0,0.7)] lg:mt-3 lg:text-[32px] xl:text-[36px]">
          {question.text}
        </h2>
      </div>

      <AnimatePresence mode="wait" initial={false}>
        {picked ? (
          <motion.div
            key="scelto"
            initial={fermo ? false : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={fermo ? undefined : { opacity: 0, y: -10 }}
            className="flex flex-col gap-4 lg:justify-end"
          >
            <div className="flex items-center gap-4">
              <div className="relative aspect-[2/3] w-20 shrink-0 overflow-hidden rounded-[14px] bg-surface-2 ring-2 ring-accent">
                {picked.posterPath && (
                  <Image
                    src={posterUrl(picked.posterPath, "w342")!}
                    alt=""
                    fill
                    sizes="80px"
                    className="object-cover"
                  />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[17px] font-medium text-white [text-shadow:0_1px_3px_rgba(0,0,0,0.7)]">
                  {picked.title}
                </p>
                <button
                  type="button"
                  className="mt-1 text-[13px] text-accent-soft"
                  onClick={() => setPicked(null)}
                >
                  Scegli un altro titolo
                </button>
              </div>
              <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-accent text-bg">
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M5 12.5l4.5 4.5L19 7.5" />
                </svg>
              </span>
            </div>

            <label className="block">
              <span className="text-[13px] font-medium text-white [text-shadow:0_1px_10px_rgba(0,0,0,0.85),0_1px_2px_rgba(0,0,0,0.7)]">Perché? (facoltativo)</span>
              <textarea
                value={reason}
                maxLength={REASON_MAX_LENGTH}
                rows={2}
                onChange={(e) => setReason(e.target.value)}
                className="mt-1.5 w-full resize-none rounded-[14px] border border-white/10 bg-white/[0.06] px-4 py-3 text-[15px] text-text outline-none placeholder:text-muted-2"
                placeholder="Una riga, se ti va"
              />
              <span className="block text-right text-[12px] tabular-nums text-muted-2">
                {reason.length}/{REASON_MAX_LENGTH}
              </span>
            </label>
            <p className="text-[12px] text-white/80 [text-shadow:0_1px_10px_rgba(0,0,0,0.85),0_1px_2px_rgba(0,0,0,0.7)]">
              La tua risposta, il tuo nome e la tua foto sono visibili a tutti su Zapp,
              anche con il profilo privato.
            </p>
            <Button type="button" disabled={pending} onClick={submit} className="w-full">
              {current ? "Aggiorna la risposta" : "Invia"}
            </Button>
          </motion.div>
        ) : (
          <motion.div
            key="scelta"
            initial={fermo ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={fermo ? undefined : { opacity: 0 }}
            className="flex flex-col gap-4 lg:max-h-full lg:justify-end lg:overflow-y-auto lg:overscroll-contain lg:pb-1 lg:pr-1 [scrollbar-width:thin]"
          >
            {!cerca && (
              <>
                <Fila
                  label="Dai tuoi voti più alti"
                  items={suggestions.rated}
                  onPick={scegli}
                  from={0}
                />
                <Fila
                  label="Visti di recente"
                  items={suggestions.recent}
                  onPick={scegli}
                  from={suggestions.rated.length}
                />
                <button
                  type="button"
                  onClick={() => setCerca(true)}
                  className="glass flex items-center gap-2 self-start rounded-full px-4 py-2.5 text-[14px] text-text"
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
                    <circle cx="11" cy="11" r="7" />
                    <path d="M20 20l-3.5-3.5" />
                  </svg>
                  {vuoto ? "Cerca un titolo" : "Cerca un altro titolo"}
                </button>
              </>
            )}

            {cerca && (
              <>
                <div className="flex items-center gap-2">
                  <input
                    ref={campo}
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder={
                      question.mediaScope === "tv"
                        ? "Cerca una serie…"
                        : "Cerca un titolo…"
                    }
                    className="w-full rounded-[14px] border border-white/10 bg-white/[0.06] px-4 py-3 text-[15px] text-text outline-none placeholder:text-muted-2"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setCerca(false);
                      setQuery("");
                    }}
                    className="shrink-0 text-[13px] text-muted"
                  >
                    Annulla
                  </button>
                </div>
                <ul className="grid max-h-[46vh] grid-cols-3 gap-2.5 overflow-y-auto overscroll-contain lg:grid-cols-4">
                  {results.map((r, i) => (
                    <li key={`${r.mediaType}:${r.id}`}>
                      <Poster
                        item={{
                          titleId: r.id,
                          mediaType: r.mediaType,
                          title: r.title,
                          posterPath: r.posterPath,
                          rating: null,
                        }}
                        delay={i * 0.02}
                        onPick={() => scegli(r)}
                      />
                    </li>
                  ))}
                </ul>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
