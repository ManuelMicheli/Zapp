"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { posterUrl } from "@/lib/config";
import type { ImportProposal } from "@/lib/import/netflix";
import type { SearchItem } from "@/lib/tmdb/mappers";
import {
  confirmNetflixImport,
  parseNetflixCsv,
  type ConfirmResult,
} from "./actions";

type Step = "upload" | "review" | "done";

export function ImportClient() {
  const [step, setStep] = useState<Step>("upload");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [proposals, setProposals] = useState<ImportProposal[]>([]);
  const [totalRows, setTotalRows] = useState(0);
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [result, setResult] = useState<ConfirmResult | null>(null);

  const matched = useMemo(() => proposals.filter((p) => p.tmdbId != null), [proposals]);
  const unmatched = useMemo(() => proposals.filter((p) => p.tmdbId == null), [proposals]);
  const selectedCount = matched.filter((p) => !excluded.has(p.key)).length;

  function handleFile(file: File) {
    setError(null);
    const formData = new FormData();
    formData.set("file", file);
    startTransition(async () => {
      const res = await parseNetflixCsv(formData);
      if (!res.ok) {
        setError(res.error ?? "Errore");
        return;
      }
      setProposals(res.proposals);
      setTotalRows(res.totalRows);
      setStep("review");
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

  function confirm() {
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
      const res = await confirmNetflixImport(items, totalRows);
      if (!res.ok) {
        setError(res.error ?? "Errore");
        return;
      }
      setResult(res);
      setStep("done");
    });
  }

  if (step === "upload") {
    return (
      <div className="space-y-4">
        <div className="rounded-2xl border border-border bg-surface p-4 text-sm leading-relaxed text-text/90">
          <p className="font-semibold">Come scaricare il tuo storico</p>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-muted">
            <li>Netflix → Account → Profilo → Attività di visione</li>
            <li>In fondo, &quot;Scarica tutto&quot;</li>
            <li>Carica qui il file NetflixViewingHistory.csv</li>
          </ol>
          <p className="mt-2 text-xs text-muted">
            Il file viene elaborato in memoria e scartato: non salviamo né il CSV né
            l&apos;elenco dei titoli non importati.
          </p>
        </div>

        <label className="block cursor-pointer rounded-2xl border-2 border-dashed border-border bg-surface p-8 text-center">
          <input
            type="file"
            accept=".csv,text/csv"
            hidden
            disabled={pending}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
            }}
          />
          <p className="text-base font-semibold">
            {pending ? "Analisi in corso…" : "Scegli il file CSV"}
          </p>
          <p className="mt-1 text-xs text-muted">max 5MB</p>
        </label>
        {pending && (
          <p className="text-center text-xs text-muted">
            Riconoscimento dei titoli su TMDB, può richiedere qualche secondo…
          </p>
        )}
        {error && <p className="text-sm text-danger">{error}</p>}
      </div>
    );
  }

  if (step === "done" && result) {
    return (
      <div className="flex flex-col items-center gap-4 py-16 text-center">
        <div className="flex size-16 items-center justify-center rounded-full bg-accent/20 text-3xl">
          ✓
        </div>
        <p className="text-xl font-bold">{result.written} titoli importati</p>
        {result.skipped > 0 && (
          <p className="text-sm text-muted">
            {result.skipped} saltati (già presenti con progresso o voto).
          </p>
        )}
        <Link
          href="/library?status=watched"
          className="rounded-xl bg-accent px-6 py-3 text-sm font-bold text-white"
        >
          Vai alla libreria
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-border bg-surface p-3 text-sm">
        <span className="font-semibold">{matched.length}</span> titoli riconosciuti su{" "}
        <span className="font-semibold">{proposals.length}</span> ({totalRows} righe CSV).
        Nulla viene scritto prima della conferma.
      </div>

      <section className="space-y-2 lg:grid lg:grid-cols-2 lg:gap-2 lg:space-y-0 xl:grid-cols-3">
        {matched.map((p) => (
          <div
            key={p.key}
            className={`flex items-center gap-3 rounded-xl border border-border bg-surface p-2.5 ${
              excluded.has(p.key) ? "opacity-40" : ""
            }`}
          >
            <input
              type="checkbox"
              checked={!excluded.has(p.key)}
              onChange={(e) => {
                setExcluded((prev) => {
                  const next = new Set(prev);
                  if (e.target.checked) next.delete(p.key);
                  else next.add(p.key);
                  return next;
                });
              }}
              className="size-5 shrink-0 accent-[var(--color-accent)]"
              aria-label={`Includi ${p.matchedTitle}`}
            />
            <div className="relative aspect-[2/3] w-10 shrink-0 overflow-hidden rounded-md bg-surface-2">
              {p.posterPath && (
                <Image
                  src={posterUrl(p.posterPath, "w92")!}
                  alt=""
                  fill
                  sizes="40px"
                  className="object-cover"
                />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">
                {p.matchedTitle}
                {p.year && <span className="text-muted"> ({p.year})</span>}
              </p>
              <p className="text-xs text-muted">
                {p.kind === "tv"
                  ? `Serie · fino a S${p.season}E${p.episode}`
                  : `Film · visto${p.lastDate ? ` il ${p.lastDate}` : ""}`}
              </p>
            </div>
          </div>
        ))}
      </section>

      {unmatched.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-bold text-muted">
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

      <button
        type="button"
        disabled={pending || selectedCount === 0}
        onClick={confirm}
        className="w-full rounded-xl bg-accent py-3.5 text-base font-bold text-white disabled:opacity-50"
      >
        {pending ? "Importazione…" : `Importa ${selectedCount} titoli`}
      </button>
    </div>
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
    <div className="rounded-xl border border-border bg-surface p-2.5">
      <div className="flex items-center justify-between gap-2">
        <p className="min-w-0 truncate text-sm">{proposal.netflixTitle}</p>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="shrink-0 text-xs font-semibold text-accent"
        >
          {open ? "Chiudi" : "Cerca a mano"}
        </button>
      </div>
      {open && (
        <div className="mt-2 space-y-2">
          <div className="flex gap-2">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && search()}
              className="min-w-0 flex-1 rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm outline-none focus:border-accent"
            />
            <button
              type="button"
              onClick={search}
              disabled={searching}
              className="shrink-0 rounded-lg bg-accent px-3 py-2 text-xs font-bold text-white disabled:opacity-50"
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
              className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-surface-2"
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
