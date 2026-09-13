import "server-only";

/**
 * La ricerca per nome, nella forma che `chooseCandidate` sa leggere.
 *
 * Stava dentro `resolve.ts` (ramo "testo") ed e' uscita di li' quando anche la
 * rotta degli intent (`/api/devices/intent`, "Ehi Siri, ho visto…") ha avuto
 * bisogno della stessa identica mappatura: un titolo scelto male da Siri e uno
 * scelto male dal foglio "Condividi" devono essere lo stesso titolo, e due
 * copie di questa mappatura sarebbero divergute alla prima correzione.
 *
 * **Non cattura gli errori**: chi chiama decide cosa vuol dire una ricerca
 * fallita (per la condivisione e' "non trovato", niente di fatale; per la rotta
 * e' la stessa cosa, ma con un log diverso). Cambiare idea qui cambierebbe il
 * comportamento di `resolve.ts`, che e' proprio cio' che l'estrazione non
 * doveva fare.
 */
import { searchMulti } from "@/lib/tmdb/client";
import type { Candidate } from "./choose";

/** Un candidato con quel che serve alla pagina "Quale intendevi?" per disegnarlo. */
export type ShareOption = Candidate & { posterPath: string | null };

/** Quanti risultati di ricerca si danno in pasto alla scelta. */
const MAX_CANDIDATI = 10;

export async function searchCandidates(query: string): Promise<ShareOption[]> {
  const search = await searchMulti(query);
  return search.results
    .filter((r) => r.media_type === "movie" || r.media_type === "tv")
    .slice(0, MAX_CANDIDATI)
    .map((r) =>
      r.media_type === "movie"
        ? {
            id: r.id,
            mediaType: "movie" as const,
            title: r.title,
            originalTitle: r.original_title ?? null,
            year: r.release_date ? Number(r.release_date.slice(0, 4)) || null : null,
            popularity: r.popularity,
            posterPath: r.poster_path ?? null,
          }
        : {
            id: r.id,
            mediaType: "tv" as const,
            title: r.name,
            originalTitle: r.original_name ?? null,
            year: r.first_air_date ? Number(r.first_air_date.slice(0, 4)) || null : null,
            popularity: r.popularity,
            posterPath: r.poster_path ?? null,
          },
    );
}
