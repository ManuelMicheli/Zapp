import { orderGenres } from "@/lib/genres/catalog";
import { getPersonalContext } from "@/lib/similar/personal";
import { GenreFilter } from "./GenreFilter";
import { HomeTypeSwap } from "./HomeType";

/**
 * Generi in testa alla home. Non sono più l'elenco di TMDB — che è una tassonomia da
 * archivio, con dentro "Film TV" e "Musica" e senza niente di ciò che si cerca davvero
 * — ma il catalogo curato di `src/lib/genres/catalog.ts`.
 *
 * L'ordine è personale: davanti le voci che il profilo di gusto (fase A) riconosce come
 * sue — chi guarda thriller trova "Thriller" per primo — poi tutte le altre nell'ordine
 * del catalogo. Personalizzazione spenta o profilo ancora povero: l'ordine del
 * catalogo, identico per tutti.
 *
 * Le due liste — film e serie — arrivano già divise dal server e `HomeTypeSwap` mostra
 * quella della scheda attiva: cambiare scheda non torna al server. Nessuna chiamata a
 * TMDB, il catalogo è un file.
 */
export async function HomeGenres() {
  const { vector, attiva } = await getPersonalContext().catch(() => ({
    vector: null,
    attiva: false,
  }));

  return (
    <HomeTypeSwap
      movie={
        <GenreFilter
          entries={orderGenres("movie", attiva ? vector : null)}
          type="movie"
        />
      }
      tv={<GenreFilter entries={orderGenres("tv", attiva ? vector : null)} type="tv" />}
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
