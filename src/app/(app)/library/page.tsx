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
            className="glass-accent flex h-[52px] items-center justify-center gap-2 rounded-2xl px-3 text-[15px] font-semibold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-light lg:ml-auto lg:min-w-40"
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
  const statusLabel = TABS.find((t) => t.key === status)!.label;
  const emptyCopy: Record<
    Enums<"watch_status">,
    { title: string; description: string }
  > = {
    watching: {
      title: "La tua prossima storia parte da qui",
      description: "Scegli un film o una serie che stai guardando: lo ritroverai qui.",
    },
    want: {
      title: "Le prossime storie ti aspettano",
      description: "Segna un titolo da vedere e tienilo a portata di mano.",
    },
    watched: {
      title: "Il tuo diario è pronto",
      description:
        "Segna il primo titolo visto: questa lista conserverà le tue scoperte.",
    },
    dropped: {
      title: "Nessun titolo lasciato a metà",
      description: "Se interrompi un film o una serie, lo ritroverai qui.",
    },
  };

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
            className="glass-accent flex h-[52px] items-center justify-center gap-2 rounded-2xl px-3 text-[15px] font-semibold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-light lg:min-w-40"
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
                d="M7.5 10.5 11 4.8c.5-.8 1.7-.5 1.7.5v3.2h4.6c1.5 0 2.5 1.4 2.1 2.8l-1.5 6a2.2 2.2 0 0 1-2.1 1.7H7.5m0-8.5V19H4v-8.5h3.5Z"
              />
            </svg>
            Consigliati
          </Link>
          <Link
            href="/lists"
            className="glass-accent flex h-[52px] items-center justify-center gap-2 rounded-2xl px-3 text-[15px] font-semibold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-light lg:min-w-40"
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
            className={`flex h-[38px] shrink-0 items-center rounded-full px-4 text-[13px] font-semibold lg:h-[42px] lg:px-5 lg:text-[14px] ${
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
        <p className="text-[13px] text-muted lg:text-[14px]">
          {total} {total === 1 ? "titolo" : "titoli"}
        </p>
        <div className="flex shrink-0 gap-1 rounded-full border border-white/[0.08] bg-white/[0.08] p-[3px]">
          {TYPE_FILTERS.map((f) => (
            <Link
              key={f.label}
              href={qs(status, f.key)}
              className={`flex h-7 items-center rounded-full px-3 text-xs font-semibold lg:h-8 lg:text-[13px] ${
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
              title={
                typeFilter
                  ? `Nessun ${typeFilter === "movie" ? "film" : "serie"} in questo scaffale`
                  : emptyCopy[status].title
              }
              description={
                typeFilter
                  ? "Puoi mostrare tutti i titoli di questo scaffale oppure aggiungerne uno."
                  : emptyCopy[status].description
              }
              action={
                <div className="flex flex-wrap items-center justify-center gap-2">
                  {typeFilter && (
                    <Link
                      href={qs(status, null)}
                      className="flex min-h-10 items-center rounded-xl border border-border bg-surface-2 px-4 text-sm font-semibold text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-light"
                    >
                      Vedi tutti
                    </Link>
                  )}
                  <Link
                    href="/search"
                    className="glass-accent flex min-h-10 items-center rounded-xl px-4 text-sm font-semibold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-light"
                  >
                    Cerca un titolo
                  </Link>
                </div>
              }
            />
          </div>
        ) : (
          <LibraryGrid
            key={`${status}-${typeFilter ?? "all"}`}
            statusLabel={statusLabel}
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
