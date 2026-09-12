"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { rateLimit } from "@/lib/rate-limit";
import { lasciaPosto, prendiPosto } from "@/lib/gate";
import { getOrFetchTitle } from "@/lib/tmdb/cache";
import { nuovoBudget, unzipSources } from "@/lib/import/archive";
import {
  matchCandidates,
  type ImportCandidate,
  type ImportProposal,
} from "@/lib/import/match";
import {
  isSourceSlug,
  parseSource,
  SOURCES,
  type SourceSlug,
} from "@/lib/import/sources/registry";
import type { SourceFile } from "@/lib/import/sources/types";
import { availableSeasons, isLastEpisode } from "@/lib/watch/episodes";
import { isIntInRange, isMediaType, isTmdbId } from "@/lib/validate";
import { CSV_INVALID_MESSAGE } from "./messages";
import {
  CONFIRM_CHUNK_SIZE,
  MATCH_CHUNK_SIZE,
  MAX_FILE_BYTES,
  MAX_FILE_LABEL,
  MAX_UPLOAD_FILES,
} from "./limits";

/** Quante `getOrFetchTitle` in parallelo dentro un blocco (il client TMDB ha già il throttle). */
const CONFIRM_CONCURRENCY = 5;

export interface ParseResult {
  ok: boolean;
  error?: string;
  candidates: ImportCandidate[];
  totalRows: number;
}

/**
 * Quanti import possono girare insieme in tutta l'app. Un import sono migliaia
 * di chiamate a TMDB: il throttle del client TMDB e' per istanza, quindi cinque
 * import in parallelo sono cinque throttle indipendenti e TMDB comincia a
 * rispondere 429 a tutti, anche a chi sta solo navigando.
 */
const POSTI_IMPORT = 3;
/** Un import lasciato a meta' libera il posto da solo dopo mezz'ora. */
const TTL_IMPORT_S = 1800;

/**
 * Parsing in memoria: nessun file viene salvato né loggato. Gli zip si aprono
 * qui (`unzipSources`), i csv/json si leggono come testo; poi tutto passa al
 * parser della sorgente. Il riconoscimento su TMDB avviene a blocchi con
 * `matchImportCandidates`.
 */
export async function parseImportFiles(formData: FormData): Promise<ParseResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Non autenticato", candidates: [], totalRows: 0 };

  const slugRaw = String(formData.get("source") ?? "");
  if (!isSourceSlug(slugRaw)) {
    return { ok: false, error: "Sorgente sconosciuta", candidates: [], totalRows: 0 };
  }
  const slug: SourceSlug = slugRaw;

  // Un import intero e' gia' centinaia di chiamate TMDB: senza tetto orario
  // bastava rilanciarlo in continuazione per bruciare la quota condivisa.
  if (!(await rateLimit(`import:parse:${user.id}`, 20, 3600, { condiviso: true }))) {
    return {
      ok: false,
      error: "Troppi import ravvicinati, riprova piu' tardi",
      candidates: [],
      totalRows: 0,
    };
  }
  if (!(await prendiPosto("import", user.id, POSTI_IMPORT, TTL_IMPORT_S))) {
    return {
      ok: false,
      error: "Ci sono gia' tre import in corso, riprova fra qualche minuto",
      candidates: [],
      totalRows: 0,
    };
  }

  const uploaded = formData.getAll("file").filter((f): f is File => f instanceof File);
  if (uploaded.length === 0) {
    await lasciaPosto("import", user.id);
    return { ok: false, error: "Nessun file", candidates: [], totalRows: 0 };
  }
  if (uploaded.length > MAX_UPLOAD_FILES) {
    await lasciaPosto("import", user.id);
    return {
      ok: false,
      error: `Troppi file insieme (massimo ${MAX_UPLOAD_FILES})`,
      candidates: [],
      totalRows: 0,
    };
  }
  // Il filtro del client non e' un controllo: una Server Action e' un endpoint
  // HTTP e non ha nessun client davanti. Le estensioni buone sono quelle che la
  // sorgente dichiara, `accetta`, che e' anche quello che filtra l'input file.
  const estensioni = SOURCES[slug].accetta
    .split(",")
    .map((a) => a.trim().toLowerCase())
    .filter((a) => a.startsWith("."));
  if (
    uploaded.some((f) => !estensioni.some((ext) => f.name.toLowerCase().endsWith(ext)))
  ) {
    await lasciaPosto("import", user.id);
    return {
      ok: false,
      error: `Questa sorgente accetta ${estensioni.join(" o ")}`,
      candidates: [],
      totalRows: 0,
    };
  }

  // sulla somma, non sul singolo file: quello che ha un tetto e' il corpo della
  // richiesta (vedi `bodySizeLimit` in next.config.ts)
  if (uploaded.reduce((somma, f) => somma + f.size, 0) > MAX_FILE_BYTES) {
    await lasciaPosto("import", user.id);
    return {
      ok: false,
      error: `I file superano ${MAX_FILE_LABEL} in tutto`,
      candidates: [],
      totalRows: 0,
    };
  }

  // un solo tetto di decompressione per tutta la richiesta: con un budget per
  // archivio bastavano N zip nella stessa chiamata per avere N volte 10MB
  const budget = nuovoBudget();
  const files: SourceFile[] = [];
  for (const file of uploaded) {
    if (file.name.toLowerCase().endsWith(".zip")) {
      try {
        files.push(...unzipSources(new Uint8Array(await file.arrayBuffer()), budget));
      } catch (e) {
        await lasciaPosto("import", user.id);
        const error = e instanceof Error ? e.message : "Archivio illeggibile.";
        return { ok: false, error, candidates: [], totalRows: 0 };
      }
    } else {
      files.push({ name: file.name, text: await file.text() });
    }
  }

  const parsed = parseSource(slug, files);
  if (parsed.candidates.length === 0) {
    await lasciaPosto("import", user.id);
    return {
      ok: false,
      error: parsed.error ?? CSV_INVALID_MESSAGE,
      candidates: [],
      totalRows: 0,
    };
  }
  return { ok: true, candidates: parsed.candidates, totalRows: parsed.rows };
}

export interface MatchResult {
  ok: boolean;
  error?: string;
  proposals: ImportProposal[];
}

/** Riconosce su TMDB un blocco di candidati (max `MATCH_CHUNK_SIZE`). */
export async function matchImportCandidates(
  candidates: ImportCandidate[],
): Promise<MatchResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Non autenticato", proposals: [] };
  if (!Array.isArray(candidates) || candidates.length > MATCH_CHUNK_SIZE) {
    return { ok: false, error: "Blocco troppo grande", proposals: [] };
  }
  // Un import da 6000 righe sono ~200 blocchi: il tetto e' largo per l'uso vero
  // e stretto per chi volesse usare l'app come proxy verso TMDB.
  if (!(await rateLimit(`import:match:${user.id}`, 1500, 3600, { condiviso: true }))) {
    return { ok: false, error: "Troppe richieste, riprova piu' tardi", proposals: [] };
  }
  return { ok: true, proposals: await matchCandidates(candidates) };
}

export interface ConfirmItem {
  tmdbId: number;
  kind: "movie" | "tv";
  season: number | null;
  episode: number | null;
  lastDate: string | null;
  /** Voto della sorgente sulla scala di Zapp (1-10), o null. */
  rating: number | null;
  /** "want" = watchlist: si scrive solo se il titolo non è già in libreria. */
  status: "watched" | "want";
}

export interface ConfirmResult {
  ok: boolean;
  error?: string;
  written: number;
  skipped: number;
}

/** Ultimo blocco: registra la riga in `imports` e invalida le pagine. */
export interface ConfirmFinal {
  totalRows: number;
  /** Titoli scritti nei blocchi precedenti (per il totale in `imports.matched`). */
  writtenBefore: number;
  source: SourceSlug;
}

/** Riga già in libreria, per decidere se il CSV porta qualcosa di nuovo. */
interface ExistingEntry {
  status: string;
  rating: number | null;
  season_number: number | null;
  episode_number: number | null;
  started_at: string | null;
}

/**
 * Il CSV porta qualcosa che non c'è già? Un film già visto no. Una serie sì solo
 * se il progresso del CSV è più avanti di quello in libreria.
 *
 * Voto e stato `watched` **non** bloccano più l'aggiornamento: bloccandoli, una
 * serie finita (o votata) non riceveva mai le stagioni nuove e l'import
 * "riconosceva ma non importava" (import del 2026-09-06: 678 righe, 0 scritte).
 * Il voto resta comunque quello dell'utente (`coalesce` nella RPC). Unica
 * eccezione: una serie segnata finita a mano non ha numero di stagione, quindi
 * non è confrontabile e non si tocca.
 */
function hasNewProgress(existing: ExistingEntry, item: ConfirmItem): boolean {
  if (item.kind === "movie") return existing.status !== "watched";
  if (existing.status === "watched" && existing.season_number == null) return false;
  const currentSeason = existing.season_number ?? 0;
  const currentEpisode = existing.episode_number ?? 0;
  const season = item.season ?? 1;
  const episode = item.episode ?? 1;
  return season > currentSeason || (season === currentSeason && episode > currentEpisode);
}

const DATA_ISO = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Una voce confermata scritta da chiunque abbia una sessione: `confirmImport` è
 * un endpoint HTTP come tutte le Server Action, e questi campi finiscono dentro
 * una RPC che scrive su `watch_entries`. Un solo valore fuori dai vincoli della
 * tabella (`rating between 1 and 10`) fa alzare la transazione, e con lei cade
 * tutto il blocco: la riga sbagliata si scarta e si conta fra le saltate.
 */
function isConfirmItem(raw: unknown): raw is ConfirmItem {
  if (typeof raw !== "object" || raw === null) return false;
  const item = raw as Record<string, unknown>;
  if (!isTmdbId(item.tmdbId)) return false;
  if (!isMediaType(item.kind)) return false;
  if (item.status !== "watched" && item.status !== "want") return false;
  if (item.rating != null && !isIntInRange(item.rating, 1, 10)) return false;
  if (item.season != null && !isIntInRange(item.season, 0, 1000)) return false;
  if (item.episode != null && !isIntInRange(item.episode, 0, 100_000)) return false;
  // diventa `${lastDate}T12:00:00Z`: se non è una data ISO nuda, il timestamp
  // che ne esce non è una data
  if (item.lastDate != null && !DATA_ISO.test(String(item.lastDate))) return false;
  return true;
}

/** `Promise.all` con al massimo `limit` promesse in volo. */
async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

/**
 * Scrive un blocco di entry confermate (max `CONFIRM_CHUNK_SIZE`), scartando le
 * righe che non superano `isConfirmItem` (contate fra le saltate). Non degrada
 * mai entrate esistenti: scrive solo dove il CSV è più avanti (`hasNewProgress`),
 * tenendo voto e `started_at`. Con `final` chiude l'import (riga `imports` +
 * revalidate).
 */
export async function confirmImport(
  items: ConfirmItem[],
  final: ConfirmFinal | null,
): Promise<ConfirmResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Non autenticato", written: 0, skipped: 0 };

  if (!Array.isArray(items)) {
    return { ok: false, error: "Blocco non valido", written: 0, skipped: 0 };
  }
  if (items.length === 0 && !final) {
    return { ok: false, error: "Nessun titolo selezionato", written: 0, skipped: 0 };
  }
  if (items.length > CONFIRM_CHUNK_SIZE) {
    return { ok: false, error: "Blocco troppo grande", written: 0, skipped: 0 };
  }

  let written = 0;
  let skipped = 0;

  // una riga fuori dai vincoli della tabella farebbe fallire la transazione e
  // con lei tutto il blocco: si scarta qui e si conta come saltata
  const validi = items.filter(isConfirmItem);
  skipped += items.length - validi.length;

  if (validi.length > 0) {
    const { data: existingRows } = await supabase
      .from("watch_entries")
      .select(
        "title_id, media_type, status, rating, season_number, episode_number, started_at",
      )
      .eq("user_id", user.id)
      .in(
        "title_id",
        validi.map((i) => i.tmdbId),
      );
    const existingMap = new Map(
      (existingRows ?? []).map((e) => [`${e.media_type}:${e.title_id}`, e]),
    );

    // prepara le righe: cache titolo (FK + transizione watched), poi scrittura
    // in blocco via RPC `import_watch_entries` (transazione unica con
    // zapp.skip_activities=true: l'import non genera attività nel feed)
    interface RpcEntry {
      title_id: number;
      media_type: "movie" | "tv";
      status: "watched" | "watching" | "want";
      season_number: number | null;
      episode_number: number | null;
      started_at: string | null;
      finished_at: string | null;
      rating: number | null;
      /** Ultima visione dal CSV: ordina "Continua a guardare" e la libreria. */
      last_watched_at: string | null;
    }

    const toFetch: ConfirmItem[] = [];
    for (const item of validi) {
      const existing = existingMap.get(`${item.kind}:${item.tmdbId}`);
      // la watchlist non torna mai sopra a qualcosa che è già in libreria
      if (item.status === "want" && existing) {
        skipped++;
        continue;
      }
      if (item.status !== "want" && existing && !hasNewProgress(existing, item)) {
        skipped++;
        continue;
      }
      toFetch.push(item);
    }

    const cachedTitles = await mapWithConcurrency(toFetch, CONFIRM_CONCURRENCY, (item) =>
      getOrFetchTitle(item.tmdbId, item.kind),
    );

    const rpcEntries: RpcEntry[] = [];
    toFetch.forEach((item, i) => {
      const cached = cachedTitles[i];
      if (!cached) {
        skipped++;
        return;
      }
      const existing = existingMap.get(`${item.kind}:${item.tmdbId}`);
      const finishedDate = item.lastDate ? `${item.lastDate}T12:00:00Z` : null;

      if (item.status === "want") {
        rpcEntries.push({
          title_id: item.tmdbId,
          media_type: item.kind,
          status: "want",
          season_number: null,
          episode_number: null,
          started_at: null,
          finished_at: null,
          rating: item.rating,
          last_watched_at: null,
        });
        return;
      }

      if (item.kind === "movie") {
        rpcEntries.push({
          title_id: item.tmdbId,
          media_type: "movie",
          status: "watched",
          season_number: null,
          episode_number: null,
          started_at: null,
          finished_at: finishedDate ?? new Date().toISOString(),
          rating: existing?.rating ?? item.rating,
          last_watched_at: finishedDate,
        });
        return;
      }

      const seasons = availableSeasons(cached.title.raw);
      const season = item.season ?? 1;
      const episode = item.episode ?? 1;
      const done = isLastEpisode(seasons, season, episode);
      rpcEntries.push({
        title_id: item.tmdbId,
        media_type: "tv",
        status: done ? "watched" : "watching",
        season_number: season,
        episode_number: episode,
        started_at: existing?.started_at ?? finishedDate ?? new Date().toISOString(),
        finished_at: done ? (finishedDate ?? new Date().toISOString()) : null,
        rating: existing?.rating ?? item.rating,
        last_watched_at: finishedDate,
      });
    });

    if (rpcEntries.length > 0) {
      const { data, error } = await supabase.rpc("import_watch_entries", {
        entries: rpcEntries as unknown as import("@/types/database").Json,
      });
      if (error) {
        return { ok: false, error: "Errore durante la scrittura.", written: 0, skipped };
      }
      written = data ?? 0;
      skipped += rpcEntries.length - written;
    }
  }

  if (final) {
    await lasciaPosto("import", user.id);

    await supabase.from("imports").insert({
      user_id: user.id,
      source: final.source,
      rows: final.totalRows,
      matched: final.writtenBefore + written,
    });

    revalidatePath("/");
    revalidatePath("/library");
    revalidatePath("/profile");
  }

  return { ok: true, written, skipped };
}
