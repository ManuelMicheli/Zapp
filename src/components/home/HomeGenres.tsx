import { getGenres } from "@/lib/tmdb/client";
import { GenreFilter } from "./GenreFilter";
import { HomeTypeSwap } from "./HomeType";

/**
 * Generi in testa alla home (prima erano le pillole in fondo a `DiscoverSections`).
 * Le due liste — film e serie — arrivano già divise dal server e `HomeTypeSwap`
 * mostra quella della scheda attiva: cambiare scheda non torna al server.
 * `getGenres` è in cache Next 1 h ed è la stessa chiamata degli scaffali Scopri.
 */
export async function HomeGenres() {
  const [movie, tv] = await Promise.all([
    getGenres("movie").catch(() => null),
    getGenres("tv").catch(() => null),
  ]);
  const movieGenres = movie?.genres ?? [];
  const tvGenres = tv?.genres ?? [];
  if (movieGenres.length === 0 && tvGenres.length === 0) return null;

  return (
    <HomeTypeSwap
      movie={<GenreFilter genres={movieGenres} type="movie" />}
      tv={<GenreFilter genres={tvGenres} type="tv" />}
    />
  );
}

/** Stessa geometria: la scritta su mobile, etichetta e fila di pillole da lg. */
export function HomeGenresSkeleton() {
  return (
    <div className="pb-5 lg:pb-6">
      <div className="px-5 lg:hidden">
        <div className="h-9 w-[116px] rounded-full bg-white/[0.06]" />
      </div>
      <div className="hidden lg:flex lg:items-center lg:gap-4 lg:pl-10">
        <div className="h-3 w-[86px] rounded-full bg-white/[0.06]" />
        <span aria-hidden="true" className="h-4 w-px bg-white/10" />
        <div className="flex gap-2 overflow-hidden">
          {[72, 96, 64, 110, 84, 92, 70].map((w, i) => (
            <div
              key={i}
              style={{ width: w }}
              className="h-9 shrink-0 rounded-full bg-white/[0.05]"
            />
          ))}
        </div>
      </div>
    </div>
  );
}
