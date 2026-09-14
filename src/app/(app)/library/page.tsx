import { HorizontalScroll } from "@/components/ui/HorizontalScroll";
import Link from "next/link";
import { EmptyState } from "@/components/ui/EmptyState";
import { getLibraryPage } from "@/lib/watch/queries";
import { getLibraryRecommendations } from "@/lib/social/queries";
import { LibraryGrid } from "./LibraryGrid";
import { LIBRARY_PAGE_SIZE } from "./limits";
import type { Enums } from "@/types/database";
import { RecommendedSection } from "@/components/library/RecommendedSection";

export const metadata = { title: "Libreria" };

const TABS: { key: Enums<"watch_status">; label: string }[] = [
  { key: "watching", label: "Sto guardando" },
  { key: "want", label: "Da vedere" },
  { key: "watched", label: "Visti" },
  { key: "dropped", label: "Abbandonati" },
];

const TYPE_FILTERS: { key: "movie" | "tv" | null; label: string }[] = [
  { key: null, label: "Tutti" },
  { key: "movie", label: "Film" },
  { key: "tv", label: "Serie" },
];

interface Props {
  searchParams: Promise<{ status?: string; type?: string; view?: string }>;
}

export default async function LibraryPage({ searchParams }: Props) {
  const params = await searchParams;
  const view = params.view === "recommended" ? "recommended" : "library";
  if (view === "recommended") {
    const recommendations = await getLibraryRecommendations();
    return (
      <main className="pb-16">
        <div className="flex flex-col gap-4 px-5 pt-[calc(env(safe-area-inset-top,0px)+var(--nav-top)+20px)] lg:flex-row lg:items-center lg:px-10">
          <h1 className="flex min-h-10 min-w-0 items-center pr-[calc(var(--nav-actions)+12px-20px)] text-[30px] font-bold leading-none tracking-[-0.045em] min-[360px]:text-[34px] lg:pr-0">
            Consigliati
          </h1>
          <Link
            href="/lists"
            className="flex h-[52px] items-center justify-center gap-2 rounded-2xl border border-border bg-surface-2 px-3 text-[15px] font-semibold text-text transition-colors hover:border-white/20 hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40 lg:ml-auto lg:min-w-40"
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.8}
              className="h-5 w-5 shrink-0"
            >
              <path strokeLinecap="round" d="M9 6h11M9 12h11M9 18h11" />
              <path strokeLinecap="round" d="M4 6h.01M4 12h.01M4 18h.01" />
            </svg>
            Liste
          </Link>
        </div>
        <div className="mt-5">
          <RecommendedSection initialItems={recommendations} />
        </div>
      </main>
    );
  }
  const status = (TABS.find((t) => t.key === params.status)?.key ??
    "watching") as Enums<"watch_status">;
  const typeFilter = params.type === "movie" || params.type === "tv" ? params.type : null;

  // prima pagina: 60 entry, filtro per tipo nel DB; il resto con "Carica altri"
  const { items, total } = await getLibraryPage(status, typeFilter, 0, LIBRARY_PAGE_SIZE);

  const qs = (s: string, t: string | null) =>
    `/library?status=${s}${t ? `&type=${t}` : ""}`;

  return (
    <main className="pb-16">
      {/* titolo alto quanto i due tondi fissi in alto a destra (domanda del giorno +
          campanella) e sulla loro stessa riga: la fascia `--nav-actions` resta libera.
          Film/Serie stanno con il conteggio, sotto: in linea col titolo finirebbero
          sotto le icone. */}
      <div className="flex flex-col items-stretch gap-4 px-5 pt-[calc(env(safe-area-inset-top,0px)+var(--nav-top)+20px)] lg:flex-row lg:items-center lg:px-10">
        <h1 className="flex h-10 items-center pr-[calc(var(--nav-actions)+12px-20px)] text-[34px] font-bold leading-none tracking-[-0.045em] lg:pr-0">
          Libreria
        </h1>
        <div className="grid grid-cols-2 gap-2 lg:ml-auto lg:flex">
          <Link
            href="/library?view=recommended"
            className="flex h-[52px] items-center justify-center gap-2 rounded-2xl border border-accent/30 bg-accent/15 px-3 text-[15px] font-semibold text-accent-pale transition-colors hover:border-accent/50 hover:bg-accent/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70 lg:min-w-40"
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.8}
              className="h-5 w-5 shrink-0"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="m12 3 1.35 4.15L17.5 8.5l-4.15 1.35L12 14l-1.35-4.15L6.5 8.5l4.15-1.35L12 3Z"
              />
              <path
                strokeLinecap="round"
                d="m18.5 14 .7 2.3 2.3.7-2.3.7-.7 2.3-.7-2.3-2.3-.7 2.3-.7.7-2.3Z"
              />
            </svg>
            Consigliati
          </Link>
          <Link
            href="/lists"
            className="flex h-[52px] items-center justify-center gap-2 rounded-2xl border border-border bg-surface-2 px-3 text-[15px] font-semibold text-text transition-colors hover:border-white/20 hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40 lg:min-w-40"
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.8}
              className="h-5 w-5 shrink-0"
            >
              <path strokeLinecap="round" d="M9 6h11M9 12h11M9 18h11" />
              <path strokeLinecap="round" d="M4 6h.01M4 12h.01M4 18h.01" />
            </svg>
            Liste
          </Link>
        </div>
      </div>

      <HorizontalScroll className="scrollbar-none mt-4 flex gap-2 overflow-x-auto px-5 lg:px-10">
        {TABS.map((tab) => (
          <Link
            key={tab.key}
            href={qs(tab.key, typeFilter)}
            className={`flex h-[38px] shrink-0 items-center rounded-full px-4 text-[13px] font-semibold ${
              status === tab.key
                ? "glass-accent text-white"
                : "border border-white/[0.08] bg-white/[0.06] text-muted"
            }`}
          >
            {tab.label}
          </Link>
        ))}
      </HorizontalScroll>

      <div className="mt-3.5 flex items-center justify-between gap-3 px-5 lg:px-10">
        <p className="text-[13px] text-muted">
          {total} {total === 1 ? "titolo" : "titoli"}
        </p>
        <div className="flex shrink-0 gap-1 rounded-full border border-white/[0.08] bg-white/[0.08] p-[3px]">
          {TYPE_FILTERS.map((f) => (
            <Link
              key={f.label}
              href={qs(status, f.key)}
              className={`flex h-7 items-center rounded-full px-3 text-xs font-semibold ${
                typeFilter === f.key ? "bg-white/[0.14] text-white" : "text-muted"
              }`}
            >
              {f.label}
            </Link>
          ))}
        </div>
      </div>

      <div className="mt-3.5">
        {items.length === 0 ? (
          <div className="px-5 lg:px-10">
            <EmptyState
              title="Niente qui"
              description="I titoli che aggiungi compariranno in questa lista."
              action={
                <Link
                  href="/search"
                  className="rounded-xl glass-accent px-5 py-2.5 text-sm font-semibold text-white"
                >
                  Cerca un titolo
                </Link>
              }
            />
          </div>
        ) : (
          <LibraryGrid
            key={`${status}-${typeFilter ?? "all"}`}
            statusLabel={TABS.find((t) => t.key === status)!.label}
            status={status}
            mediaType={typeFilter}
            initialItems={items}
            total={total}
          />
        )}
      </div>
    </main>
  );
}
