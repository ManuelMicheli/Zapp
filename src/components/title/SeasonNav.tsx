import Link from "next/link";
import type { TmdbSeasonSummary } from "@/lib/tmdb/types";

/**
 * Navigazione fra le stagioni di una serie, dentro la pagina di una stagione.
 * Senza, per passare da S1 a S2 si doveva tornare alla scheda serie e riscendere.
 *
 * I dati sono le `seasons` già in pagina (`titles.raw`): nessuna chiamata in più.
 * Il filtro è lo stesso di `SeasonList` (`season_number > 0`, gli speciali restano
 * fuori), così le due liste dicono le stesse cose.
 */

/** Stagioni mostrate: le stesse di `SeasonList`, in ordine. */
export function navSeasons(
  seasons: TmdbSeasonSummary[] | undefined,
): TmdbSeasonSummary[] {
  if (!Array.isArray(seasons)) return [];
  return seasons
    .filter((s) => s.season_number > 0)
    .sort((a, b) => a.season_number - b.season_number);
}

/**
 * Riga di pillole sticky sotto la testata. Sta appena sotto la nav (che da `lg` è in
 * alto, sotto `lg` in basso: la quota è `--nav-top`, mai un numero fisso).
 */
export function SeasonPills({
  tvId,
  seasons,
  current,
}: {
  tvId: number;
  seasons: TmdbSeasonSummary[];
  current: number;
}) {
  const list = navSeasons(seasons);
  if (list.length < 2) return null;

  return (
    <nav
      aria-label="Stagioni"
      className="sticky top-[calc(env(safe-area-inset-top,0px)+var(--nav-top))] z-20 -mx-5 bg-gradient-to-b from-black/85 via-black/60 to-transparent px-5 py-3 backdrop-blur-sm md:-mx-8 md:px-8 lg:-mx-10 lg:px-10"
    >
      <div className="flex snap-x snap-mandatory gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {list.map((season) => {
          const active = season.season_number === current;
          return (
            <Link
              key={season.id}
              href={`/title/tv/${tvId}/season/${season.season_number}`}
              aria-current={active ? "page" : undefined}
              className={`shrink-0 snap-start rounded-full px-4 py-1.5 text-[13px] font-semibold transition-colors ${
                active
                  ? "bg-accent text-white"
                  : "glass text-white/75 hover:bg-white/[0.16]"
              }`}
            >
              S{season.season_number}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

/** Stagione precedente e successiva, in fondo alla lista episodi. */
export function SeasonEnds({
  tvId,
  seasons,
  current,
}: {
  tvId: number;
  seasons: TmdbSeasonSummary[];
  current: number;
}) {
  const list = navSeasons(seasons);
  const i = list.findIndex((s) => s.season_number === current);
  if (i < 0) return null;
  const prev = list[i - 1] ?? null;
  const next = list[i + 1] ?? null;
  if (!prev && !next) return null;

  return (
    <nav aria-label="Altre stagioni" className="flex gap-2.5">
      {prev ? (
        <SeasonEndLink tvId={tvId} season={prev} direction="prev" />
      ) : (
        <div className="flex-1" />
      )}
      {next ? (
        <SeasonEndLink tvId={tvId} season={next} direction="next" />
      ) : (
        <div className="flex-1" />
      )}
    </nav>
  );
}

function SeasonEndLink({
  tvId,
  season,
  direction,
}: {
  tvId: number;
  season: TmdbSeasonSummary;
  direction: "prev" | "next";
}) {
  const prev = direction === "prev";
  return (
    <Link
      href={`/title/tv/${tvId}/season/${season.season_number}`}
      className={`flex flex-1 items-center gap-2 rounded-[20px] border border-border bg-surface px-4 py-3 transition-colors hover:bg-surface-2 ${
        prev ? "justify-start" : "justify-end text-right"
      }`}
    >
      {prev && <Arrow direction="prev" />}
      <span className="flex min-w-0 flex-col">
        <span className="text-[11px] uppercase tracking-[0.08em] text-muted">
          {prev ? "Precedente" : "Successiva"}
        </span>
        <span className="truncate text-[15px] font-semibold">{season.name}</span>
      </span>
      {!prev && <Arrow direction="next" />}
    </Link>
  );
}

function Arrow({ direction }: { direction: "prev" | "next" }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="shrink-0 text-muted"
      aria-hidden="true"
    >
      <path d={direction === "prev" ? "M15 5l-7 7 7 7" : "m9 6 6 6-6 6"} />
    </svg>
  );
}
