import Link from "next/link";
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

  const entries = await getLibrary(status);
  const filtered = typeFilter
    ? entries.filter((e) => e.media_type === typeFilter)
    : entries;

  const qs = (s: string, t: string | null) =>
    `/library?status=${s}${t ? `&type=${t}` : ""}`;

  return (
    <main className="pb-16">
      <div className="flex items-baseline justify-between px-5 pt-[calc(env(safe-area-inset-top,0px)+104px)] lg:px-10">
        <h1 className="text-[34px] font-bold tracking-[-0.045em]">Libreria</h1>
        <div className="flex gap-1 rounded-full border border-white/[0.08] bg-white/[0.08] p-[3px]">
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

      <div className="scrollbar-none mt-4 flex gap-2 overflow-x-auto px-5 lg:px-10">
        {TABS.map((tab) => (
          <Link
            key={tab.key}
            href={qs(tab.key, typeFilter)}
            className={`flex h-[38px] shrink-0 items-center rounded-full px-4 text-[13px] font-semibold ${
              status === tab.key
                ? "bg-accent text-white shadow-[0_6px_20px_rgba(139,92,246,0.35)]"
                : "border border-white/[0.08] bg-white/[0.06] text-muted"
            }`}
          >
            {tab.label}
          </Link>
        ))}
      </div>

      <p className="mt-3.5 px-5 text-[13px] text-muted lg:px-10">
        {filtered.length} {filtered.length === 1 ? "titolo" : "titoli"}
      </p>

      <div className="mt-3.5">
        {filtered.length === 0 ? (
          <div className="px-5 lg:px-10">
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
          </div>
        ) : (
          <LibraryGrid
            statusLabel={TABS.find((t) => t.key === status)!.label}
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
      </div>
    </main>
  );
}
