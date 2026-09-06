"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getOrFetchTitle } from "@/lib/tmdb/cache";
import {
  groupRows,
  matchCandidates,
  parseNetflixCsvText,
  type ImportCandidate,
  type ImportProposal,
} from "@/lib/import/netflix";
import { availableSeasons, isLastEpisode } from "@/lib/watch/episodes";
import { CSV_INVALID_MESSAGE } from "./messages";
import { CONFIRM_CHUNK_SIZE, MATCH_CHUNK_SIZE } from "./limits";

const MAX_FILE_BYTES = 5 * 1024 * 1024;

/** Quante `getOrFetchTitle` in parallelo dentro un blocco (il client TMDB ha già il throttle). */
const CONFIRM_CONCURRENCY = 5;

export interface ParseResult {
  ok: boolean;
  error?: string;
  candidates: ImportCandidate[];
  totalRows: number;
}

/**
 * Solo parsing + raggruppamento, in memoria: il CSV non viene mai salvato né
 * loggato. Il riconoscimento su TMDB avviene a blocchi con `matchNetflixCandidates`.
 */
export async function parseNetflixCsv(formData: FormData): Promise<ParseResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Non autenticato", candidates: [], totalRows: 0 };

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return { ok: false, error: "Nessun file", candidates: [], totalRows: 0 };
  }
  if (file.size > MAX_FILE_BYTES) {
    return { ok: false, error: "File oltre 5MB", candidates: [], totalRows: 0 };
  }

  const text = await file.text();
  const rows = parseNetflixCsvText(text);
  if (rows.length === 0) {
    return {
      ok: false,
      error: CSV_INVALID_MESSAGE,
      candidates: [],
      totalRows: 0,
    };
  }

  return { ok: true, candidates: groupRows(rows), totalRows: rows.length };
}

export interface MatchResult {
  ok: boolean;
  error?: string;
  proposals: ImportProposal[];
}

/** Riconosce su TMDB un blocco di candidati (max `MATCH_CHUNK_SIZE`). */
export async function matchNetflixCandidates(
  candidates: ImportCandidate[],
): Promise<MatchResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Non autenticato", proposals: [] };
  if (candidates.length > MATCH_CHUNK_SIZE) {
    return { ok: false, error: "Blocco troppo grande", proposals: [] };
  }
  return { ok: true, proposals: await matchCandidates(candidates) };
}

export interface ConfirmItem {
  tmdbId: number;
  kind: "movie" | "tv";
  season: number | null;
  episode: number | null;
  lastDate: string | null;
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
 * Scrive un blocco di entry confermate (max `CONFIRM_CHUNK_SIZE`). Non degrada
 * mai entrate esistenti: salta chi ha già un voto, è già `watched`, o ha un
 * progresso più avanti. Con `final` chiude l'import (riga `imports` + revalidate).
 */
export async function confirmNetflixImport(
  items: ConfirmItem[],
  final: ConfirmFinal | null,
): Promise<ConfirmResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Non autenticato", written: 0, skipped: 0 };

  if (items.length === 0 && !final) {
    return { ok: false, error: "Nessun titolo selezionato", written: 0, skipped: 0 };
  }
  if (items.length > CONFIRM_CHUNK_SIZE) {
    return { ok: false, error: "Blocco troppo grande", written: 0, skipped: 0 };
  }

  let written = 0;
  let skipped = 0;

  if (items.length > 0) {
    const { data: existingRows } = await supabase
      .from("watch_entries")
      .select(
        "title_id, media_type, status, rating, season_number, episode_number, started_at",
      )
      .eq("user_id", user.id)
      .in(
        "title_id",
        items.map((i) => i.tmdbId),
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
      status: "watched" | "watching";
      season_number: number | null;
      episode_number: number | null;
      started_at: string | null;
      finished_at: string | null;
      rating: number | null;
      /** Ultima visione dal CSV: ordina "Continua a guardare" e la libreria. */
      last_watched_at: string | null;
    }

    const toFetch: ConfirmItem[] = [];
    for (const item of items) {
      const existing = existingMap.get(`${item.kind}:${item.tmdbId}`);
      if (existing) {
        const moreAdvanced =
          item.kind === "tv" &&
          existing.season_number != null &&
          (existing.season_number > (item.season ?? 0) ||
            (existing.season_number === item.season &&
              (existing.episode_number ?? 0) >= (item.episode ?? 0)));
        if (existing.rating != null || existing.status === "watched" || moreAdvanced) {
          skipped++;
          continue;
        }
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

      if (item.kind === "movie") {
        rpcEntries.push({
          title_id: item.tmdbId,
          media_type: "movie",
          status: "watched",
          season_number: null,
          episode_number: null,
          started_at: null,
          finished_at: finishedDate ?? new Date().toISOString(),
          rating: existing?.rating ?? null,
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
        rating: existing?.rating ?? null,
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
    await supabase.from("imports").insert({
      user_id: user.id,
      source: "netflix",
      rows: final.totalRows,
      matched: final.writtenBefore + written,
    });

    revalidatePath("/");
    revalidatePath("/library");
    revalidatePath("/profile");
  }

  return { ok: true, written, skipped };
}
