import type { TmdbPersonMovieCredits, TmdbPersonTvCredits } from "@/lib/tmdb/types";

/**
 * Da due risposte TMDB alla filmografia che la pagina mostra.
 *
 * Funzione **pura**: qui stanno le sole scelte discutibili — cosa si butta via e in
 * che ordine si mette il resto — e si provano con dati finti invece che aprendo la
 * pagina di Tom Hanks e contando le locandine.
 */

/** Oltre questi, la pagina e' un elenco telefonico e nessuno scorre fino in fondo. */
export const MAX_CREDITI = 60;

export interface CreditoPersona {
  id: number;
  mediaType: "movie" | "tv";
  title: string;
  /** Mai `null`: i crediti senza locandina non entrano nemmeno. */
  posterPath: string;
  year: string | null;
  voteAverage: number | null;
}

export interface Filmografia {
  interprete: CreditoPersona[];
  regista: CreditoPersona[];
}

/** Quello che serve qui di un risultato TMDB, film o serie che sia. */
interface CreditoGrezzo {
  id?: number;
  title?: string;
  name?: string;
  poster_path?: string | null;
  release_date?: string;
  first_air_date?: string;
  vote_average?: number;
  popularity?: number;
  job?: string;
}

function mappa(
  grezzo: CreditoGrezzo,
  mediaType: "movie" | "tv",
): (CreditoPersona & { popularity: number }) | null {
  const titolo = (mediaType === "movie" ? grezzo.title : grezzo.name)?.trim();
  const poster = grezzo.poster_path;
  if (!grezzo.id || !titolo || !poster) return null;
  const data = mediaType === "movie" ? grezzo.release_date : grezzo.first_air_date;
  const voto = grezzo.vote_average;
  return {
    id: grezzo.id,
    mediaType,
    title: titolo,
    posterPath: poster,
    year: data && data.length >= 4 ? data.slice(0, 4) : null,
    // TMDB scrive 0 sui titoli che nessuno ha votato, e "0" si legge come stroncatura
    voteAverage: voto && voto > 0 ? voto : null,
    popularity: grezzo.popularity ?? 0,
  };
}

function raccogli(
  liste: { crediti: CreditoGrezzo[]; mediaType: "movie" | "tv" }[],
): CreditoPersona[] {
  const visti = new Set<string>();
  const out: (CreditoPersona & { popularity: number })[] = [];
  for (const { crediti, mediaType } of liste) {
    for (const grezzo of crediti) {
      const c = mappa(grezzo, mediaType);
      if (!c) continue;
      // stesso id su un film e su una serie sono due titoli diversi
      const chiave = `${c.mediaType}-${c.id}`;
      if (visti.has(chiave)) continue;
      visti.add(chiave);
      out.push(c);
    }
  }
  out.sort((a, b) => b.popularity - a.popularity);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  return out.slice(0, MAX_CREDITI).map(({ popularity: _, ...resto }) => resto);
}

export function filmografia(
  movies: TmdbPersonMovieCredits | null | undefined,
  tv: TmdbPersonTvCredits | null | undefined,
): Filmografia {
  const soloRegia = (crediti: CreditoGrezzo[]) =>
    crediti.filter((c) => c.job === "Director");

  return {
    interprete: raccogli([
      { crediti: (movies?.cast ?? []) as CreditoGrezzo[], mediaType: "movie" },
      { crediti: (tv?.cast ?? []) as CreditoGrezzo[], mediaType: "tv" },
    ]),
    regista: raccogli([
      { crediti: soloRegia((movies?.crew ?? []) as CreditoGrezzo[]), mediaType: "movie" },
      { crediti: soloRegia((tv?.crew ?? []) as CreditoGrezzo[]), mediaType: "tv" },
    ]),
  };
}
