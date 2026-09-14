import "server-only";
import { unstable_cache } from "next/cache";
import { getExternalIds } from "@/lib/tmdb/client";
import type { TvmazeCastEntry } from "./match";

/**
 * Ritratti dei personaggi di una serie da TVmaze (api.tvmaze.com, gratuita,
 * senza chiave, licenza CC BY-SA con attribuzione nel footer del profilo).
 * TMDB non ha immagini dei personaggi: i "tagged images" coprono solo pochi
 * protagonisti (spike 2026-09-14: Breaking Bad 2 su 8, Stranger Things 0).
 * TVmaze copre solo le serie: sui film la sezione non c'è.
 *
 * Il ponte fra i due cataloghi è l'id IMDb (`external_ids` di TMDB →
 * `/lookup/shows?imdb=`). Cache 7 giorni per serie: TVmaze concede 20
 * chiamate ogni 10 secondi, e il cast di una serie non cambia ogni ora.
 */

const TVMAZE = "https://api.tvmaze.com";
const WEEK = 7 * 86400;

interface TvmazeImage {
  medium?: string;
  original?: string;
}

interface TvmazeCastItem {
  person?: { name?: string };
  character?: { name?: string; image?: TvmazeImage | null };
}

async function fetchTvmaze<T>(path: string): Promise<T | null> {
  const res = await fetch(`${TVMAZE}${path}`, {
    headers: { Accept: "application/json" },
    // la cache di Next sta sulla funzione esterna: qui niente doppia cache
    cache: "no-store",
    // un TVmaze lento non deve trattenere la scheda: meglio la sezione assente
    signal: AbortSignal.timeout(6000),
  });
  if (!res.ok) return null;
  return (await res.json()) as T;
}

/**
 * Il cast di TVmaze per una serie TMDB, ridotto a nome interprete, nome
 * personaggio e ritratto. Vuoto se la serie non è su TVmaze o TVmaze non risponde.
 */
export const getTvmazeCast = unstable_cache(
  async (tvId: number): Promise<TvmazeCastEntry[]> => {
    try {
      const ext = await getExternalIds(tvId, "tv");
      if (!ext.imdb_id) return [];
      const show = await fetchTvmaze<{ id: number }>(
        `/lookup/shows?imdb=${encodeURIComponent(ext.imdb_id)}`,
      );
      if (!show?.id) return [];
      const cast = await fetchTvmaze<TvmazeCastItem[]>(`/shows/${show.id}/cast`);
      return (cast ?? [])
        .filter((c) => c.person?.name && c.character?.name)
        .map((c) => ({
          personName: c.person!.name!,
          characterName: c.character!.name!,
          image: c.character?.image?.original ?? c.character?.image?.medium ?? null,
        }));
    } catch (e) {
      console.error("getTvmazeCast", tvId, e);
      return [];
    }
  },
  ["tvmaze-cast"],
  { revalidate: WEEK },
);
