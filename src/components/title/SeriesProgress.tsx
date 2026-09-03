import { createClient } from "@/lib/supabase/server";
import type { CachedTitle } from "@/lib/tmdb/cache";
import { availableSeasons, remainingEpisodes } from "@/lib/watch/episodes";
import { ProgressControls } from "./ProgressControls";

/** Riga progresso nella scheda serie: "Sei a S2E5 · 18 episodi rimasti" + controlli. */
export async function SeriesProgress({ cached }: { cached: CachedTitle }) {
  const { title } = cached;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: entry } = await supabase
    .from("watch_entries")
    .select("status, season_number, episode_number")
    .eq("user_id", user.id)
    .eq("title_id", title.id)
    .eq("media_type", "tv")
    .maybeSingle();

  if (!entry || entry.status !== "watching") return null;

  const seasons = availableSeasons(title.raw);
  if (seasons.length === 0) return null;

  const season = entry.season_number ?? seasons[0].season;
  const episode = entry.episode_number ?? 0;
  const remaining = remainingEpisodes(seasons, season, episode);

  return (
    <ProgressControls
      titleId={title.id}
      seasons={seasons}
      season={season}
      episode={episode}
      remaining={remaining}
    />
  );
}
