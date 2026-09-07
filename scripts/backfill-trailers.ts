/**
 * Riempie `title_trailers` senza far aspettare il primo visitatore. Usa la stessa scala
 * dell'app (`computeTrailers`) con le dipendenze reali, e rispetta la quota: si ferma
 * dopo `--searches N` ricerche YouTube (default 80, sotto il tetto di 100 al giorno).
 * Riprendibile: salta le righe ancora fresche e quelle che hanno esaurito i tentativi.
 *
 * Il riquadro delle bande nere viene lasciato al frame intero: `sharp` e la cache dei
 * fotogrammi vivono dentro Next. È il valore di ripiego già previsto da `frame.ts`, la
 * banda resta corretta, e il riquadro esatto si calcola alla prima visita dopo la
 * scadenza della riga.
 *
 * Uso: pnpm tsx scripts/backfill-trailers.ts [--searches 80] [--limit 500]
 */
import { createClient } from "@supabase/supabase-js";
import { loadEnvFile } from "node:process";
import type { TmdbVideos } from "../src/lib/tmdb/types";
import { computeTrailers, type TrailerDeps } from "../src/lib/trailers/compute";
import { FULL_FRAME } from "../src/lib/trailers/frame-bars";
import { getVideoAuthorRaw, getVideoDetailsRaw, searchYouTubeRaw } from "./trailer-deps";

loadEnvFile(new URL("../.env.local", import.meta.url).pathname.replace(/^\//, ""));

function argOf(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const budget = Number(argOf("--searches") ?? 80);
const limit = Number(argOf("--limit") ?? 500);

const deps: TrailerDeps = {
  getVideoAuthor: getVideoAuthorRaw,
  getVideoDetails: getVideoDetailsRaw,
  searchYouTube: searchYouTubeRaw,
};

async function main() {
  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );

  // prima i titoli che qualcuno ha in libreria: sono quelli che si aprono davvero
  const { data: entries, error } = await db
    .from("watch_entries")
    .select("title_id, media_type")
    .order("last_watched_at", { ascending: false })
    .limit(limit);
  if (error) throw error;

  const wanted = new Map<string, { id: number; mediaType: "movie" | "tv" }>();
  for (const e of entries ?? []) {
    wanted.set(`${e.media_type}:${e.title_id}`, {
      id: e.title_id,
      mediaType: e.media_type as "movie" | "tv",
    });
  }

  let searches = 0;
  let written = 0;
  let skipped = 0;
  for (const { id, mediaType } of wanted.values()) {
    if (searches >= budget) {
      console.log(
        `\nquota giornaliera esaurita: restano ${wanted.size - written - skipped} titoli`,
      );
      break;
    }
    const { data: title } = await db
      .from("titles")
      .select("title, original_title, release_date, raw")
      .eq("id", id)
      .eq("media_type", mediaType)
      .maybeSingle();
    if (!title) continue;

    const { data: row } = await db
      .from("title_trailers")
      .select("checked_at, search_at, search_tries, trailers")
      .eq("title_id", id)
      .eq("media_type", mediaType)
      .eq("season_number", 0)
      .maybeSingle();
    if (row) {
      skipped += 1;
      continue;
    }

    const result = await computeTrailers(
      {
        videos: (title.raw as { videos?: TmdbVideos } | null)?.videos,
        identity: {
          title: title.title,
          originalTitle: title.original_title,
          mediaType,
          season: 0,
        },
        releaseDate: title.release_date,
        name: title.title,
        searchAt: null,
        searchTries: 0,
      },
      deps,
    );
    if (!result) continue;
    if (result.searched) searches += 1;

    const now = new Date().toISOString();
    const { error: writeError } = await db.from("title_trailers").upsert(
      {
        title_id: id,
        media_type: mediaType,
        season_number: 0,
        keys: result.keys,
        trailers: result.keys.map((key) => ({
          key,
          frame: FULL_FRAME,
          lang: result.lang,
        })),
        source: result.source,
        checked_at: now,
        search_at: result.searched ? now : null,
        search_tries: result.searched ? 1 : 0,
      },
      { onConflict: "title_id,media_type,season_number" },
    );
    if (writeError) {
      console.error(`errore su ${title.title}:`, writeError.message);
      continue;
    }
    written += 1;
    console.log(
      `${title.title} → ${result.source}/${result.lang} (${result.keys.length})`,
    );
  }
  console.log(
    `\nscritti ${written} titoli, gia' in cache ${skipped}, ricerche spese ${searches}`,
  );
}

void main();
