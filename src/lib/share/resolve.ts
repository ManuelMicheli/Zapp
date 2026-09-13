import "server-only";

/**
 * Dal bersaglio di una condivisione (`parseShared`) al titolo di Zapp.
 *
 * Qui c'e' l'input/output che il parser non puo' avere: la tabella dei link di
 * piattaforma, `find` di TMDB, la ricerca. L'ordine e' quello del costo: un URL
 * di scheda si risolve con **una** query indicizzata su
 * `title_provider_links` e non chiama nessuno; solo quando il link non dice
 * niente si scende sulla ricerca per nome.
 *
 * Niente e' fatale: qualunque errore diventa "non trovato", perche' chi ha
 * appena premuto "Condividi" deve vedere una pagina con un bottone "Cerca", non
 * un errore. L'URL condiviso non entra mai nei log per intero — e' cronologia
 * di visione di una persona: si registrano solo il tipo di bersaglio e l'host.
 */
import { createClient } from "@/lib/supabase/server";
import { getOrFetchTitle } from "@/lib/tmdb/cache";
import { findByImdb } from "@/lib/tmdb/client";
import { searchCandidates, type ShareOption } from "./candidates";
import { chooseCandidate } from "./choose";
import type { SharedTarget } from "./parse-shared";

// La pagina "Quale intendevi?" importa il tipo da qui da sempre: resta la porta
// d'ingresso, anche ora che a definirlo e' `candidates.ts`.
export type { ShareOption };

export type ShareResolution =
  | { status: "found"; mediaType: "movie" | "tv"; id: number }
  | { status: "choose"; query: string; options: ShareOption[] }
  | { status: "none"; query: string | null };

/** Il nome del titolo ricavato dal testo condiviso, quando c'era anche un testo. */
export interface ShareFallbackText {
  query: string;
  year: number | null;
}

/** Host del link condiviso: l'unica parte che si puo' scrivere in un log. */
function hostOf(raw: string): string {
  try {
    return new URL(raw).hostname;
  } catch {
    return "?";
  }
}

/**
 * Mai `error.message`: su un errore PostgREST puo' ripetere il valore del
 * filtro, che per il ramo "provider" e' l'URL condiviso — cronologia di
 * visione di una persona. Resta solo il tipo di errore, se Postgres ne manda
 * uno (`error.code`, es. `42P01`); per un `Error` normale non c'e' niente
 * altro da scrivere in modo sicuro.
 */
function logError(kind: string, dove: string, error: unknown): void {
  const codice =
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof (error as { code: unknown }).code === "string"
      ? (error as { code: string }).code
      : null;
  console.error(`[share] ${kind} (${dove}): errore${codice ? ` (${codice})` : ""}`);
}

/**
 * Il link non ha portato a niente. Se chi ha condiviso ha mandato anche un
 * testo si prosegue di li': "Guarda Dark su Netflix" con un URL di episodio che
 * non e' in tabella deve comunque aprire Dark.
 */
async function senzaLink(
  fallbackText: ShareFallbackText | undefined,
): Promise<ShareResolution> {
  if (!fallbackText) return { status: "none", query: null };
  return resolveText(fallbackText.query, fallbackText.year);
}

/** Un id TMDB inventato non deve aprire una scheda che poi e' un 404. */
async function esiste(id: number, mediaType: "movie" | "tv"): Promise<boolean> {
  try {
    return (await getOrFetchTitle(id, mediaType)) !== null;
  } catch (error) {
    logError("tmdb", `${mediaType}/${id}`, error);
    return false;
  }
}

async function resolveText(query: string, year: number | null): Promise<ShareResolution> {
  let options: ShareOption[];
  try {
    options = await searchCandidates(query);
  } catch (error) {
    logError("text", "search/multi", error);
    return { status: "none", query };
  }

  const { sure, shortlist } = chooseCandidate(query, year, options);
  if (sure) return { status: "found", mediaType: sure.mediaType, id: sure.id };
  if (shortlist.length === 0) return { status: "none", query };

  // `chooseCandidate` lavora su `Candidate`, che non conosce la locandina: la si
  // ripesca per chiave, invece di forzare il tipo di quel che torna.
  const perChiave = new Map(options.map((o) => [`${o.mediaType}:${o.id}`, o]));
  const conLocandina = shortlist
    .map((c) => perChiave.get(`${c.mediaType}:${c.id}`))
    .filter((o): o is ShareOption => o !== undefined);
  return { status: "choose", query, options: conLocandina };
}

export async function resolveShared(
  target: SharedTarget,
  fallbackText?: ShareFallbackText,
): Promise<ShareResolution> {
  if (target.kind === "provider") {
    try {
      // Client utente: `title_provider_links` e' leggibile da `authenticated`
      // (policy `title_provider_links_select_all`), quindi qui non serve — e non
      // si usa — il service client. Lo stesso URL sta spesso su piu' righe
      // (un titolo con piu' provider_id JustWatch, fino a 5 viste dal vivo):
      // non e' ambiguita' sul *titolo*, quindi non si conta le righe ma i
      // titoli distinti. `limit(10)` copre le due forme di Prime insieme
      // (`target.urls`, fino a 2) anche nel caso piu' affollato osservato.
      const supabase = await createClient();
      const { data, error } = await supabase
        .from("title_provider_links")
        .select("title_id, media_type")
        .in("url", target.urls)
        .limit(10);
      if (error) throw error;
      if (data && data.length > 0) {
        const titoli = new Set(data.map((r) => `${r.media_type}:${r.title_id}`));
        if (titoli.size === 1) {
          return { status: "found", mediaType: data[0].media_type, id: data[0].title_id };
        }
      }
    } catch (error) {
      logError("provider", hostOf(target.urls[0]), error);
    }
    // Il testo condiviso a parte vince (e' quello che la persona ha scritto);
    // altrimenti il nome che il parser stesso aveva ricavato dal link (oggi
    // solo NOW, dal suo slug) — meglio di niente quando quel titolo non e'
    // mai stato aperto da nessuno in Zapp.
    return senzaLink(fallbackText ?? target.fallback);
  }

  if (target.kind === "imdb") {
    try {
      const found = await findByImdb(target.imdbId);
      const film = found.movie_results?.[0];
      if (film) return { status: "found", mediaType: "movie", id: film.id };
      const serie = found.tv_results?.[0];
      if (serie) return { status: "found", mediaType: "tv", id: serie.id };
    } catch (error) {
      logError("imdb", "find", error);
    }
    return senzaLink(fallbackText);
  }

  if (target.kind === "tmdb") {
    if (await esiste(target.id, target.mediaType)) {
      return { status: "found", mediaType: target.mediaType, id: target.id };
    }
    return senzaLink(fallbackText);
  }

  return resolveText(target.query, target.year);
}
