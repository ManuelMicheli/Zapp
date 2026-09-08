"use client";

import Image from "next/image";
import { useEffect, useRef, useState, useTransition } from "react";
import { posterUrl } from "@/lib/config";
import { REASON_MAX_LENGTH } from "@/lib/daily/rank";
import { answerDailyQuestion } from "@/lib/daily/actions";
import type { DailyQuestionRow, MyAnswer } from "@/lib/daily/queries";
import { useToast } from "@/components/ui/Toaster";
import { Button } from "@/components/ui/Button";
import type { SearchItem } from "@/lib/tmdb/mappers";

/** Ricerca del titolo, motivo facoltativo, invio. */
export function DailyComposer({
  question,
  current,
  onSaved,
}: {
  question: DailyQuestionRow;
  current: MyAnswer | null;
  onSaved: (answer: MyAnswer) => void;
}) {
  const { show } = useToast();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchItem[]>([]);
  const [picked, setPicked] = useState<MyAnswer | null>(current);
  const [reason, setReason] = useState(current?.reason ?? "");
  const [pending, startTransition] = useTransition();
  const abortRef = useRef<AbortController | null>(null);

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

  return (
    <div className="mx-auto flex w-full max-w-[720px] flex-col gap-5 px-5 py-6 lg:px-10">
      <div>
        <p className="text-[11px] uppercase tracking-[0.18em] text-muted-2">
          La domanda di oggi
        </p>
        <h2 className="mt-2 text-[24px] font-light leading-snug text-text lg:text-[34px]">
          {question.text}
        </h2>
      </div>

      {picked ? (
        <div className="flex items-center gap-4 rounded-[20px] border border-border bg-surface p-4">
          <div className="relative aspect-[2/3] w-20 shrink-0 overflow-hidden rounded-[14px] bg-surface-2">
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
            <p className="truncate text-[16px] text-text">{picked.title}</p>
            <button
              type="button"
              className="mt-1 text-[13px] text-accent-soft"
              onClick={() => setPicked(null)}
            >
              Cambia titolo
            </button>
          </div>
        </div>
      ) : (
        <>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={
              question.mediaScope === "tv" ? "Cerca una serie…" : "Cerca un titolo…"
            }
            className="w-full rounded-[14px] bg-surface-2 px-4 py-3 text-[15px] text-text outline-none placeholder:text-muted-2"
          />
          <ul className="grid grid-cols-3 gap-3 overflow-y-auto md:grid-cols-4 lg:grid-cols-5">
            {results.map((r) => (
              <li key={`${r.mediaType}:${r.id}`}>
                <button
                  type="button"
                  className="w-full text-left"
                  onClick={() =>
                    setPicked({
                      titleId: r.id,
                      mediaType: r.mediaType,
                      title: r.title,
                      posterPath: r.posterPath,
                      reason: null,
                    })
                  }
                >
                  <div className="relative aspect-[2/3] overflow-hidden rounded-[14px] bg-surface-2">
                    {r.posterPath && (
                      <Image
                        src={posterUrl(r.posterPath, "w342")!}
                        alt=""
                        fill
                        sizes="(max-width: 767px) 30vw, 140px"
                        className="object-cover"
                      />
                    )}
                  </div>
                  <p className="mt-1.5 line-clamp-2 text-[12px] text-text">{r.title}</p>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      {picked && (
        <>
          <label className="block">
            <span className="text-[13px] text-muted">Perché? (facoltativo)</span>
            <textarea
              value={reason}
              maxLength={REASON_MAX_LENGTH}
              rows={2}
              onChange={(e) => setReason(e.target.value)}
              className="mt-1.5 w-full resize-none rounded-[14px] bg-surface-2 px-4 py-3 text-[15px] text-text outline-none placeholder:text-muted-2"
              placeholder="Una riga, se ti va"
            />
            <span className="block text-right text-[12px] tabular-nums text-muted-2">
              {reason.length}/{REASON_MAX_LENGTH}
            </span>
          </label>
          <p className="text-[12px] text-muted-2">
            La tua risposta, il tuo nome e la tua foto sono visibili a tutti su Zapp,
            anche con il profilo privato.
          </p>
          <Button type="button" disabled={pending} onClick={submit} className="w-full">
            {current ? "Aggiorna la risposta" : "Invia"}
          </Button>
        </>
      )}
    </div>
  );
}
