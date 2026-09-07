import "server-only";
import { cache } from "react";
import { createServiceClient } from "@/lib/supabase/server";
import type { TmdbVideos } from "@/lib/tmdb/types";
import type { Enums, Json } from "@/types/database";
import { computeTrailers, MAX_SEARCH_TRIES } from "./compute";
import { withFrames, type Trailer, type TrailerLang } from "./frame";
import { getVideoAuthor } from "./oembed";
import { parseTrailers } from "./stored";
import { getVideoDetails, searchYouTube } from "./youtube";

/** Riga piena con un trailer italiano: vale un mese. */
const FOUND_TTL_MS = 30 * 24 * 60 * 60 * 1000;
/** Riga piena col ripiego inglese e tentativi di ricerca ancora disponibili. */
const FALLBACK_TTL_MS = 7 * 24 * 60 * 60 * 1000;
/** Riga vuota: si ritenta il giorno dopo (il trailer di un film in uscita arriva poi). */
const EMPTY_RETRY_MS = 24 * 60 * 60 * 1000;
/**
 * Righe scritte prima della revisione dei trailer (2026-09-07: verifica del titolo,
 * allowlist allargata, ripiego inglese etichettato): scadute subito, si ricalcolano
 * alla prima visita. Va alzata ogni volta che cambia la scala o si allarga l'allowlist.
 */
const EMPTY_BEFORE_MS = Date.parse("2026-09-07T00:00:00Z");

type TrailerSource = "tmdb" | "youtube" | "none";

export interface OfficialTrailerRequest {
  /** `raw.videos` del titolo (o `videos` della stagione). */
  videos: TmdbVideos | undefined;
  titleId: number;
  mediaType: Enums<"media_type">;
  /** 0 = scheda titolo, N = pagina della stagione N. */
  season?: number;
  /**
   * Nome del titolo, usato per la ricerca YouTube e per la verifica; vuoto = niente
   * ricerca e niente cache DB (senza riga in `titles` la FK di `title_trailers`
   * fallirebbe).
   */
  name: string;
  /** Titolo originale TMDB: il video YouTube può usare quello invece dell'italiano. */
  originalTitle?: string | null;
  /** Film: data d'uscita, per scartare trailer di omonimi più vecchi. */
  releaseDate?: string | null;
}

/**
 * Trailer da canali ufficiali per un titolo o una stagione, in ordine di preferenza, con
 * il riquadro dell'immagine reale di ogni video (bande nere escluse, `frame.ts`) e la
 * lingua.
 *
 * **DB-first**: ogni visita fa una sola lettura di `title_trailers`; la lista si
 * ricalcola solo a riga assente o scaduta. Così il primo chunk della scheda non aspetta
 * mai oEmbed, miniature o ricerca YouTube, e la banda della testata (che prende la forma
 * dal riquadro) non cambia altezza dopo il render.
 *
 * La scala e le sue regole stanno in `compute.ts`; qui restano il cache, le scadenze e
 * il conto dei tentativi di ricerca. Un trailer di un'altra opera non passa mai:
 * `match.ts` verifica che il video sia di quel titolo.
 *
 * Avvolta in `cache()`: scheda e stagione possono chiederla più volte nel render.
 */
export const getOfficialTrailers = cache(
  async (req: OfficialTrailerRequest): Promise<Trailer[]> => {
    const persist = Boolean(req.name);
    const season = req.season ?? 0;
    const db = persist ? createServiceClient() : null;

    const row = db
      ? (
          await db
            .from("title_trailers")
            .select("trailers, checked_at, search_at, search_tries")
            .eq("title_id", req.titleId)
            .eq("media_type", req.mediaType)
            .eq("season_number", season)
            .maybeSingle()
        ).data
      : null;
    const cached = row ? parseTrailers(row.trailers) : null;
    if (row && cached && isFresh(row.checked_at, cached, row.search_tries)) return cached;

    const computed = await computeTrailers(
      {
        videos: req.videos,
        identity: {
          title: req.name,
          originalTitle: req.originalTitle,
          mediaType: req.mediaType,
          season,
        },
        releaseDate: req.releaseDate,
        name: req.name,
        searchAt: row?.search_at ?? null,
        searchTries: row?.search_tries ?? 0,
      },
      { getVideoAuthor, getVideoDetails, searchYouTube },
    );
    // ricerca fallita (quota, rete): la riga vecchia, se c'è, vale più di niente
    if (computed === null) return cached ?? [];

    const trailers = await withFrames(computed.keys, computed.lang);
    if (db) {
      const now = new Date().toISOString();
      const { error } = await db.from("title_trailers").upsert(
        {
          title_id: req.titleId,
          media_type: req.mediaType,
          season_number: season,
          keys: computed.keys,
          trailers: trailers as unknown as Json,
          source: computed.source as TrailerSource,
          checked_at: now,
          search_at: computed.searched ? now : (row?.search_at ?? null),
          search_tries: (row?.search_tries ?? 0) + (computed.searched ? 1 : 0),
        },
        { onConflict: "title_id,media_type,season_number" },
      );
      if (error) console.error("[trailers] errore upsert title_trailers:", error);
    }
    return trailers;
  },
);

/** Solo le chiavi YouTube, per chi non ha bisogno del riquadro. */
export const getOfficialTrailerKeys = cache(
  async (req: OfficialTrailerRequest): Promise<string[]> =>
    (await getOfficialTrailers(req)).map((t) => t.key),
);

/**
 * Quanto vale una riga: un mese se ha un trailer italiano o se i tentativi di ricerca
 * sono finiti, una settimana se mostra il ripiego inglese e una ricerca è ancora
 * possibile (così l'italiano arriva appena c'è quota), un giorno se è vuota. Una riga
 * scritta prima di `EMPTY_BEFORE_MS` è sempre scaduta: è il modo di invalidare in blocco
 * il cache quando cambiano le regole.
 */
function isFresh(checkedAt: string, trailers: Trailer[], searchTries: number): boolean {
  const checked = new Date(checkedAt).getTime();
  if (checked < EMPTY_BEFORE_MS) return false;
  const age = Date.now() - checked;
  if (trailers.length === 0) return age < EMPTY_RETRY_MS;
  const lang: TrailerLang = trailers[0].lang;
  if (lang === "en" && searchTries < MAX_SEARCH_TRIES) return age < FALLBACK_TTL_MS;
  return age < FOUND_TTL_MS;
}
