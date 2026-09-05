"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo, useRef, useState, useTransition, type ReactNode } from "react";
import { posterUrl } from "@/lib/config";
import { Button } from "@/components/ui/Button";
import type { ImportCandidate, ImportProposal } from "@/lib/import/netflix";
import type { SearchItem } from "@/lib/tmdb/mappers";
import {
  confirmNetflixImport,
  matchNetflixCandidates,
  parseNetflixCsv,
  type ConfirmResult,
} from "./actions";
import { CONFIRM_CHUNK_SIZE, MATCH_CHUNK_SIZE } from "./limits";
import { CSV_INVALID_MESSAGE } from "./messages";

type Step = "upload" | "review" | "done";

/** Avanzamento di una fase a blocchi (riconoscimento o scrittura). */
interface Progress {
  done: number;
  total: number;
}

const NETWORK_ERROR = "Connessione interrotta. Controlla la rete e riprova.";

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** Riga numerata delle istruzioni di download. */
function InstructionStep({ n, children }: { n: number; children: ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-accent/[0.18] text-xs font-bold text-accent-pale">
        {n}
      </span>
      <p className="pt-0.5 text-sm leading-[1.45] text-white/80">{children}</p>
    </div>
  );
}

export function ImportClient() {
  const [step, setStep] = useState<Step>("upload");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [proposals, setProposals] = useState<ImportProposal[]>([]);
  const [totalRows, setTotalRows] = useState(0);
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [result, setResult] = useState<ConfirmResult | null>(null);
  const [dragging, setDragging] = useState(false);
  const [progress, setProgress] = useState<Progress | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const matched = useMemo(() => proposals.filter((p) => p.tmdbId != null), [proposals]);
  const unmatched = useMemo(() => proposals.filter((p) => p.tmdbId == null), [proposals]);
  const selectedCount = matched.filter((p) => !excluded.has(p.key)).length;

  /**
   * Parsing in una chiamata breve, poi riconoscimento TMDB a blocchi: ogni
   * Server Action resta sotto i timeout del browser e l'avanzamento è visibile.
   * Qualsiasi eccezione (rete caduta, risposta non valida) diventa un messaggio,
   * mai un crash della pagina.
   */
  function handleFile(file: File) {
    setError(null);
    const formData = new FormData();
    formData.set("file", file);
    startTransition(async () => {
      try {
        const res = await parseNetflixCsv(formData);
        if (!res.ok) {
          setError(res.error ?? "Errore");
          return;
        }
        const candidates: ImportCandidate[] = res.candidates;
        const all: ImportProposal[] = [];
        setProgress({ done: 0, total: candidates.length });
        for (const part of chunk(candidates, MATCH_CHUNK_SIZE)) {
          const match = await matchNetflixCandidates(part);
          if (!match.ok) {
            setError(match.error ?? "Errore");
            return;
          }
          all.push(...match.proposals);
          setProgress({ done: all.length, total: candidates.length });
        }
        setProposals(all);
        setTotalRows(res.totalRows);
        setStep("review");
      } catch {
        setError(NETWORK_ERROR);
      } finally {
        setProgress(null);
      }
    });
  }

  function assignManualMatch(key: string, item: SearchItem) {
    setProposals((prev) =>
      prev.map((p) =>
        p.key === key
          ? {
              ...p,
              tmdbId: item.id,
              kind: item.mediaType,
              matchedTitle: item.title,
              posterPath: item.posterPath,
              year: item.year,
            }
          : p,
      ),
    );
  }

  /**
   * Scrittura a blocchi: l'ultimo blocco porta `final` e chiude l'import
   * (riga `imports`, revalidate). Se la rete cade a metà, i blocchi già scritti
   * restano (l'import non degrada mai entrate esistenti, quindi si può ripetere).
   */
  function confirm() {
    setError(null);
    startTransition(async () => {
      const items = matched
        .filter((p) => !excluded.has(p.key))
        .map((p) => ({
          tmdbId: p.tmdbId!,
          kind: p.kind,
          season: p.season,
          episode: p.episode,
          lastDate: p.lastDate,
        }));
      const parts = chunk(items, CONFIRM_CHUNK_SIZE);
      let written = 0;
      let skipped = 0;
      setProgress({ done: 0, total: items.length });
      try {
        for (let i = 0; i < parts.length; i++) {
          const isLast = i === parts.length - 1;
          const res = await confirmNetflixImport(
            parts[i],
            isLast ? { totalRows, writtenBefore: written } : null,
          );
          if (!res.ok) {
            setError(res.error ?? "Errore");
            return;
          }
          written += res.written;
          skipped += res.skipped;
          setProgress({
            done: Math.min(items.length, (i + 1) * CONFIRM_CHUNK_SIZE),
            total: items.length,
          });
        }
        setResult({ ok: true, written, skipped });
        setStep("done");
      } catch {
        setError(NETWORK_ERROR);
      } finally {
        setProgress(null);
      }
    });
  }

  if (step === "upload") {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3.5 pb-1.5">
          <div className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-[#E50914] text-3xl font-extrabold text-white shadow-[0_12px_30px_rgba(229,9,20,0.35)]">
            N
          </div>
          <p className="text-pretty text-[15px] leading-[1.45] text-white/80">
            Porta in Zapp tutto quello che hai già visto. Ci vuole un minuto.
          </p>
        </div>

        <div className="space-y-3.5 rounded-[20px] border border-border bg-surface p-[18px]">
          <p className="text-[15px] font-semibold">Come scaricare il tuo storico</p>
          <InstructionStep n={1}>
            Netflix → <b className="font-semibold text-white">Account</b> →{" "}
            <b className="font-semibold text-white">Profilo</b> →{" "}
            <b className="font-semibold text-white">Attività di visione</b>
          </InstructionStep>
          <InstructionStep n={2}>
            In fondo,{" "}
            <b className="font-semibold text-white">&quot;Scarica tutto&quot;</b>
          </InstructionStep>
          <InstructionStep n={3}>
            Carica qui il file{" "}
            <span className="text-accent-pale">NetflixViewingHistory.csv</span>
          </InstructionStep>
          <p className="text-xs leading-relaxed text-muted">
            Il file viene elaborato in memoria e scartato: non salviamo né il CSV né
            l&apos;elenco dei titoli non importati.
          </p>
        </div>

        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            const f = e.dataTransfer.files?.[0];
            if (!f) return;
            // solo .csv: un file di altro tipo mostra l'errore senza chiamare il parser
            if (!f.name.toLowerCase().endsWith(".csv")) {
              setError(CSV_INVALID_MESSAGE);
              return;
            }
            handleFile(f);
          }}
          className={`flex flex-col items-center gap-2.5 rounded-[22px] border-[1.5px] border-dashed px-5 py-7 ${
            dragging
              ? "border-accent bg-accent/[0.12]"
              : "border-accent/50 bg-accent/[0.06]"
          }`}
        >
          <div className="flex size-[52px] items-center justify-center rounded-[14px] bg-accent/[0.18]">
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-accent-pale"
              aria-hidden="true"
            >
              <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
              <path d="M14 3v5h5" />
              <path d="M12 18v-6M9 15l3-3 3 3" />
            </svg>
          </div>
          <p className="text-[15px] font-semibold">Trascina qui il CSV</p>
          <p className="text-xs text-muted">max 5MB</p>
        </div>

        <input
          ref={inputRef}
          type="file"
          accept=".csv,text/csv"
          hidden
          disabled={pending}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
          }}
        />
        <Button
          type="button"
          className="w-full"
          disabled={pending}
          onClick={() => inputRef.current?.click()}
        >
          {pending
            ? progress
              ? `Riconoscimento ${progress.done}/${progress.total}…`
              : "Analisi in corso…"
            : "Scegli il file CSV"}
        </Button>
        <p className="text-center text-xs leading-relaxed text-muted">
          Riconoscimento dei titoli su TMDB, può richiedere qualche secondo…
        </p>
        {error && <p className="text-sm text-danger">{error}</p>}
      </div>
    );
  }

  if (step === "done" && result) {
    return (
      <div className="flex flex-col items-center gap-4 py-16 text-center">
        <div className="flex size-16 items-center justify-center rounded-full bg-accent/20 text-3xl text-accent-pale">
          ✓
        </div>
        <p className="text-xl font-bold tracking-[-0.02em]">
          {result.written} titoli importati
        </p>
        {result.skipped > 0 && (
          <p className="text-sm text-muted">
            {result.skipped} saltati (già presenti con progresso o voto).
          </p>
        )}
        <Link
          href="/library?status=watched"
          className="inline-flex h-[54px] items-center justify-center rounded-full bg-accent px-6 text-[17px] font-semibold text-white shadow-[var(--shadow-accent)]"
        >
          Vai alla libreria
        </Link>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-[18px]">
        <div className="flex items-baseline gap-2.5">
          <span className="text-[44px] font-extrabold leading-none tracking-[-0.05em]">
            {matched.length}
          </span>
          <span className="text-[15px] text-white/70">
            titoli riconosciuti su {proposals.length}
          </span>
        </div>
        <p className="-mt-2 text-xs text-muted">
          ({totalRows} righe CSV). Nulla viene scritto prima della conferma.
        </p>

        <section className="space-y-2 lg:grid lg:grid-cols-2 lg:gap-2 lg:space-y-0">
          {matched.map((p) => {
            const included = !excluded.has(p.key);
            const poster = posterUrl(p.posterPath, "w92");
            return (
              <label
                key={p.key}
                className={`flex cursor-pointer items-center gap-3 rounded-[20px] border border-border bg-surface py-2 pl-2 pr-3 ${
                  included ? "" : "opacity-40"
                }`}
              >
                <input
                  type="checkbox"
                  checked={included}
                  onChange={(e) => {
                    setExcluded((prev) => {
                      const next = new Set(prev);
                      if (e.target.checked) next.delete(p.key);
                      else next.add(p.key);
                      return next;
                    });
                  }}
                  className="peer sr-only"
                  aria-label={`Includi ${p.matchedTitle}`}
                />
                <span
                  aria-hidden="true"
                  className={`ml-1 flex size-6 shrink-0 items-center justify-center rounded-lg peer-focus-visible:ring-2 peer-focus-visible:ring-accent peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-bg ${
                    included ? "bg-accent" : "border-[1.5px] border-white/25"
                  }`}
                >
                  {included && (
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="#ffffff"
                      strokeWidth="2.6"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M5 12l4.5 4.5L19 7" />
                    </svg>
                  )}
                </span>
                <span className="relative block h-[54px] w-9 shrink-0 overflow-hidden rounded-[7px] bg-surface-2">
                  {poster && (
                    <Image
                      src={poster}
                      alt=""
                      fill
                      sizes="36px"
                      className="object-cover"
                    />
                  )}
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="truncate text-sm font-semibold">
                    {p.matchedTitle}
                    {p.year && <span className="text-muted"> ({p.year})</span>}
                  </span>
                  <span className="text-xs text-muted">
                    {p.kind === "tv"
                      ? `Serie, fino a S${p.season}E${p.episode}`
                      : `Film${p.lastDate ? `, visto il ${p.lastDate}` : ""}`}
                  </span>
                </span>
              </label>
            );
          })}
        </section>

        {unmatched.length > 0 && (
          <section className="space-y-2">
            <h2 className="px-1 text-[13px] font-semibold text-muted">
              Non riconosciuti ({unmatched.length})
            </h2>
            <div className="space-y-2">
              {unmatched.map((p) => (
                <UnmatchedRow key={p.key} proposal={p} onMatch={assignManualMatch} />
              ))}
            </div>
          </section>
        )}

        {error && <p className="text-sm text-danger">{error}</p>}
      </div>

      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-20 h-[150px] bg-gradient-to-b from-transparent via-black/90 to-black lg:h-[140px]" />
      {/* da lg la barra occupa tutta la larghezza e si allinea al padding della pagina */}
      <div className="fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom,0px)+22px)] z-30 px-5 lg:inset-x-auto lg:bottom-[26px] lg:left-0 lg:right-0 lg:px-10">
        <div className="lg:max-w-[720px]">
          <Button
            type="button"
            disabled={pending || selectedCount === 0}
            onClick={confirm}
            className="w-full"
          >
            {pending
              ? progress
                ? `Importazione ${progress.done}/${progress.total}…`
                : "Importazione…"
              : `Importa ${selectedCount} titoli`}
          </Button>
        </div>
      </div>
    </>
  );
}

function UnmatchedRow({
  proposal,
  onMatch,
}: {
  proposal: ImportProposal;
  onMatch: (key: string, item: SearchItem) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(proposal.netflixTitle);
  const [results, setResults] = useState<SearchItem[]>([]);
  const [searching, setSearching] = useState(false);

  async function search() {
    setSearching(true);
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
      const data = (await res.json()) as { results: SearchItem[] };
      setResults(data.results);
    } finally {
      setSearching(false);
    }
  }

  return (
    <div className="rounded-[20px] border border-border bg-surface py-2.5 pl-3.5 pr-2.5">
      <div className="flex items-center justify-between gap-3">
        <p className="min-w-0 flex-1 truncate text-sm text-white/75">
          {proposal.netflixTitle}
        </p>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="glass -my-1 flex min-h-11 shrink-0 items-center rounded-full px-3 text-xs font-semibold"
        >
          {open ? "Chiudi" : "Cerca a mano"}
        </button>
      </div>
      {open && (
        <div className="mt-2.5 space-y-2">
          <div className="flex gap-2">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && search()}
              className="min-w-0 flex-1 rounded-[14px] border border-border bg-surface-2 px-3 py-2.5 text-sm outline-none focus:border-accent"
            />
            <button
              type="button"
              onClick={search}
              disabled={searching}
              className="shrink-0 rounded-[14px] bg-accent px-4 text-xs font-bold text-white disabled:opacity-50"
            >
              Cerca
            </button>
          </div>
          {results.map((item) => (
            <button
              key={`${item.mediaType}-${item.id}`}
              type="button"
              onClick={() => {
                onMatch(proposal.key, item);
                setOpen(false);
              }}
              className="flex w-full items-center gap-2 rounded-xl px-2 py-2.5 text-left hover:bg-surface-2"
            >
              <span className="text-xs">
                {item.title} {item.year && `(${item.year})`}{" "}
                <span className="text-muted">
                  · {item.mediaType === "tv" ? "serie" : "film"}
                </span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
