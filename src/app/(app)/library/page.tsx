import Link from "next/link";
import { TopBar } from "@/components/layout/TopBar";
import { EmptyState } from "@/components/ui/EmptyState";
import { getLibrary } from "@/lib/watch/queries";
import { LibraryGrid } from "./LibraryGrid";
import type { Enums } from "@/types/database";

export const metadata = { title: "Libreria" };

const TABS: { key: Enums<"watch_status">; label: string }[] = [
  { key: "watching", label: "Sto guardando" },
  { key: "want", label: "Da vedere" },
  { key: "watched", label: "Visti" },
  { key: "dropped", label: "Abbandonati" },
];

interface Props {
  searchParams: Promise<{ status?: string; type?: string }>;
}

export default async function LibraryPage({ searchParams }: Props) {
  const params = await searchParams;
  const status = (TABS.find((t) => t.key === params.status)?.key ??
    "watching") as Enums<"watch_status">;
  const typeFilter =
    params.type === "movie" || params.type === "tv" ? params.type : null;

  const entries = await getLibrary(status);
  const filtered = typeFilter
    ? entries.filter((e) => e.media_type === typeFilter)
    : entries;

  const qs = (s: string, t: string | null) =>
    `/library?status=${s}${t ? `&type=${t}` : ""}`;

  return (
    <>
      <TopBar title="Libreria" />
      <main className="pb-28">
        <div className="scrollbar-none mb-3 flex gap-2 overflow-x-auto px-4">
          {TABS.map((tab) => (
            <Link
              key={tab.key}
              href={qs(tab.key, typeFilter)}
              className={`shrink-0 rounded-full px-4 py-1.5 text-xs font-semibold ${
                status === tab.key
                  ? "bg-accent text-white"
                  : "border border-border bg-surface text-muted"
              }`}
            >
              {tab.label}
            </Link>
          ))}
        </div>
        <div className="mb-4 flex gap-2 px-4">
          {[
            { key: null, label: "Tutti" },
            { key: "movie", label: "Film" },
            { key: "tv", label: "Serie" },
          ].map((f) => (
            <Link
              key={f.label}
              href={qs(status, f.key)}
              className={`rounded-full px-3.5 py-1 text-[11px] font-semibold ${
                typeFilter === f.key
                  ? "bg-surface-2 text-text"
                  : "text-muted"
              }`}
            >
              {f.label}
            </Link>
          ))}
        </div>

        {filtered.length === 0 ? (
          <EmptyState
            title="Niente qui"
            description="I titoli che aggiungi compariranno in questa lista."
            action={
              <Link
                href="/search"
                className="rounded-xl bg-accent px-5 py-2.5 text-sm font-semibold text-white"
              >
                Cerca un titolo
              </Link>
            }
          />
        ) : (
          <LibraryGrid
            items={filtered.map((e) => ({
              titleId: e.title_id,
              mediaType: e.media_type,
              status: e.status,
              rating: e.rating,
              name: e.title?.title ?? "",
              posterPath: e.title?.poster_path ?? null,
              year: e.title?.release_date?.slice(0, 4) ?? null,
            }))}
          />
        )}
      </main>
    </>
  );
}
