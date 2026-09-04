import "server-only";
import { getTrending } from "@/lib/tmdb/client";
import { createServiceClient } from "@/lib/supabase/server";

const WALL_SIZE = 16;

/**
 * Locandine per il muro di sfondo (login, onboarding, profilo):
 * sempre i titoli più nuovi e popolari, da TMDB trending settimanale.
 * Fallback: ultime locandine in cache locale.
 */
export async function getWallPosters(): Promise<string[]> {
  try {
    const trending = await getTrending();
    const paths = trending.results
      .filter((r) => (r.media_type === "movie" || r.media_type === "tv") && r.poster_path)
      .map((r) => r.poster_path as string)
      .slice(0, WALL_SIZE);
    if (paths.length >= 8) return paths;
  } catch {
    // TMDB non raggiungibile: si usa la cache
  }
  const supabase = createServiceClient();
  const { data } = await supabase
    .from("titles")
    .select("poster_path")
    .not("poster_path", "is", null)
    .order("fetched_at", { ascending: false })
    .limit(WALL_SIZE);
  return (data ?? []).map((t) => t.poster_path as string);
}
