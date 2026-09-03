"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getOrFetchTitle } from "@/lib/tmdb/cache";
import {
  groupRows,
  matchCandidates,
  parseNetflixCsvText,
  type ImportProposal,
} from "@/lib/import/netflix";
import { availableSeasons, isLastEpisode } from "@/lib/watch/episodes";

const MAX_FILE_BYTES = 5 * 1024 * 1024;

export interface ParseResult {
  ok: boolean;
  error?: string;
  proposals: ImportProposal[];
  totalRows: number;
}

/** Parsing + matching in memoria: il CSV non viene mai salvato né loggato. */
export async function parseNetflixCsv(formData: FormData): Promise<ParseResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Non autenticato", proposals: [], totalRows: 0 };

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return { ok: false, error: "Nessun file", proposals: [], totalRows: 0 };
  }
  if (file.size > MAX_FILE_BYTES) {
    return { ok: false, error: "File oltre 5MB", proposals: [], totalRows: 0 };
  }

  const text = await file.text();
  const rows = parseNetflixCsvText(text);
  if (rows.length === 0) {
    return {
      ok: false,
      error: "CSV vuoto o formato non riconosciuto (attese colonne Title, Date).",
      proposals: [],
      totalRows: 0,
    };
  }

  const candidates = groupRows(rows);
  const proposals = await matchCandidates(candidates);
  return { ok: true, proposals, totalRows: rows.length };
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

/**
 * Scrive le entry confermate. Non degrada mai entrate esistenti:
 * salta chi ha già un voto, è già `watched`, o ha un progresso più avanti.
 */
export async function confirmNetflixImport(
  items: ConfirmItem[],
  totalRows: number,
): Promise<ConfirmResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Non autenticato", written: 0, skipped: 0 };

  if (items.length === 0) {
    return { ok: false, error: "Nessun titolo selezionato", written: 0, skipped: 0 };
  }

  const { data: existingRows } = await supabase
    .from("watch_entries")
    .select("title_id, media_type, status, rating, season_number, episode_number, started_at")
    .eq("user_id", user.id)
    .in("title_id", items.map((i) => i.tmdbId));
  const existingMap = new Map(
    (existingRows ?? []).map((e) => [`${e.media_type}:${e.title_id}`, e]),
  );

  let written = 0;
  let skipped = 0;

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

    // cache titolo (necessaria per la FK e per la transizione watched)
    const cached = await getOrFetchTitle(item.tmdbId, item.kind);
    if (!cached) {
      skipped++;
      continue;
    }

    const finishedDate = item.lastDate ? `${item.lastDate}T12:00:00Z` : null;

    if (item.kind === "movie") {
      const { error } = await supabase.from("watch_entries").upsert(
        {
          user_id: user.id,
          title_id: item.tmdbId,
          media_type: "movie",
          status: "watched",
          finished_at: finishedDate ?? new Date().toISOString(),
          rating: existing?.rating ?? null,
        },
        { onConflict: "user_id,title_id,media_type" },
      );
      if (!error) written++;
      else skipped++;
      continue;
    }

    const seasons = availableSeasons(cached.title.raw);
    const season = item.season ?? 1;
    const episode = item.episode ?? 1;
    const done = isLastEpisode(seasons, season, episode);

    const { error } = await supabase.from("watch_entries").upsert(
      {
        user_id: user.id,
        title_id: item.tmdbId,
        media_type: "tv",
        status: done ? "watched" : "watching",
        season_number: season,
        episode_number: episode,
        started_at: existing?.started_at ?? finishedDate ?? new Date().toISOString(),
        finished_at: done ? (finishedDate ?? new Date().toISOString()) : null,
        rating: existing?.rating ?? null,
      },
      { onConflict: "user_id,title_id,media_type" },
    );
    if (!error) written++;
    else skipped++;
  }

  await supabase.from("imports").insert({
    user_id: user.id,
    source: "netflix",
    rows: totalRows,
    matched: written,
  });

  revalidatePath("/");
  revalidatePath("/library");
  revalidatePath("/profile");
  return { ok: true, written, skipped };
}
