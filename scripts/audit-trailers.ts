/**
 * Controllo indipendente dei trailer salvati: per ogni riga di `title_trailers` chiede a
 * YouTube (oEmbed, nessuna chiave, nessuna quota) il nome vero del video e lo confronta
 * col titolo. Stampa solo i sospetti; a fine corsa il conteggio.
 *
 * Le regole sono le stesse del codice (`compute.ts`): un video trovato con la ricerca
 * deve corrispondere al titolo, punto; un video preso da TMDB e marcato `official` si
 * accetta senza discutere (TMDB lo associa al titolo e il canale è ufficiale: il nome
 * YouTube può essere quello originale, "Bloodhounds" per "I segugi"); una voce TMDB non
 * ufficiale deve almeno non smentire il titolo.
 *
 * Uso: pnpm tsx scripts/audit-trailers.ts
 */
import { createClient } from "@supabase/supabase-js";
import { loadEnvFile } from "node:process";
import type { TmdbVideo } from "../src/lib/tmdb/types";
import {
  videoContradictsTitle,
  videoMatchesTitle,
  type TitleIdentity,
} from "../src/lib/trailers/match";
import { getVideoAuthorRaw } from "./trailer-deps";

loadEnvFile(new URL("../.env.local", import.meta.url).pathname.replace(/^\//, ""));

interface Row {
  title_id: number;
  media_type: "movie" | "tv";
  season_number: number;
  source: string;
  trailers: { key: string; lang: string }[] | null;
}

async function main() {
  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
  const { data, error } = await db
    .from("title_trailers")
    .select("title_id, media_type, season_number, source, trailers");
  if (error) throw error;
  const rows = (data ?? []) as unknown as Row[];

  let checked = 0;
  let suspect = 0;
  let dead = 0;
  for (const row of rows) {
    const first = row.trailers?.[0];
    if (!first) continue;
    const { data: title } = await db
      .from("titles")
      .select("title, original_title, raw")
      .eq("id", row.title_id)
      .eq("media_type", row.media_type)
      .maybeSingle();
    if (!title) continue;

    // il video è fra quelli che TMDB associa al titolo, ed è marcato ufficiale?
    const tmdbVideos = ((title.raw as { videos?: { results?: TmdbVideo[] } } | null)
      ?.videos?.results ?? []) as TmdbVideo[];
    const official = tmdbVideos.some((v) => v.key === first.key && v.official);

    const author = await getVideoAuthorRaw(first.key);
    if (!author?.title) {
      dead += 1;
      console.log(`MORTO    ${title.title} → ${first.key}`);
      continue;
    }
    checked += 1;
    const identity: TitleIdentity = {
      title: title.title,
      originalTitle: title.original_title,
      mediaType: row.media_type,
      season: row.season_number,
    };
    const channel = author.authorName ?? null;
    const ok =
      row.source === "youtube"
        ? videoMatchesTitle(author.title, identity, channel)
        : official || !videoContradictsTitle(author.title, identity, channel);
    if (!ok) {
      suspect += 1;
      console.log(
        `SOSPETTO ${title.title} (s${row.season_number}, ${row.source}) → "${author.title}" [${channel}]`,
      );
    }
  }
  console.log(`\ncontrollati ${checked}, sospetti ${suspect}, video morti ${dead}`);
}

void main();
