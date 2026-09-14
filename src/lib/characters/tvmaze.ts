import "server-only";
import { unstable_cache } from "next/cache";
import type { PortraitSourceEntry } from "./match";

/**
 * Ritratti dei personaggi di una serie da TVmaze (api.tvmaze.com, gratuita,
 * senza chiave, licenza CC BY-SA con attribuzione nel footer del profilo).
 * TMDB non ha immagini dei personaggi: i "tagged images" coprono solo pochi
 * protagonisti (spike 2026-09-14: Breaking Bad 2 su 8, Stranger Things 0).
 *
 * Il ponte fra i due cataloghi è l'id IMDb (`/lookup/shows?imdb=`, risponde
 * 301 verso `/shows/:id` e `fetch` lo segue). Cache 7 giorni per serie: TVmaze
 * concede 20 chiamate ogni 10 secondi, e il cast di una serie non cambia ogni ora.
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
  // un guasto (5xx, 429) deve propagarsi per non finire in cache; un 404 è un valore
  if (res.status >= 500 || res.status === 429) throw new Error(`TVmaze ${res.status}`);
  if (!res.ok) return null;
  return (await res.json()) as T;
}

/**
 * Dentro `unstable_cache` un errore non si cachea, un valore sì: un timeout di
 * rete deve propagarsi, non diventare "nessun personaggio" per 7 giorni (è
 * successo su Death Note il 2026-09-14). Un 404 vero (serie assente) è invece
 * un valore, e si cachea.
 */
const cachedTvmazeCast = unstable_cache(
  async (imdbId: string): Promise<PortraitSourceEntry[]> => {
    const show = await fetchTvmaze<{ id: number }>(
      `/lookup/shows?imdb=${encodeURIComponent(imdbId)}`,
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
  },
  ["tvmaze-cast"],
  { revalidate: WEEK },
);

/** Il cast di TVmaze per un id IMDb: vuoto (non cachato) se TVmaze non risponde. */
export async function getTvmazeCast(imdbId: string): Promise<PortraitSourceEntry[]> {
  try {
    return await cachedTvmazeCast(imdbId);
  } catch (e) {
    console.error("getTvmazeCast", imdbId, e);
    return [];
  }
}
