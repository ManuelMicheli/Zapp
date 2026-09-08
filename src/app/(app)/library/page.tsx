import Link from "next/link";
import { EmptyState } from "@/components/ui/EmptyState";
import { getLibraryPage } from "@/lib/watch/queries";
import { LibraryGrid } from "./LibraryGrid";
import { LIBRARY_PAGE_SIZE } from "./limits";
import type { Enums } from "@/types/database";

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
  searchParams: Promise<{ status?: string; type?: string }>;
}

export default async function LibraryPage({ searchParams }: Props) {
  const params = await searchParams;
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
      <div className="flex items-center pl-5 pr-[calc(var(--nav-actions)+12px)] pt-[calc(env(safe-area-inset-top,0px)+var(--nav-top)+20px)] lg:px-10">
        <h1 className="flex h-10 items-center text-[34px] font-bold leading-none tracking-[-0.045em]">
          Libreria
        </h1>
      </div>

      <div className="scrollbar-none mt-4 flex gap-2 overflow-x-auto px-5 lg:px-10">
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
      </div>

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
