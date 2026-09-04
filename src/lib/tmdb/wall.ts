import "server-only";
import { getTrending } from "@/lib/tmdb/client";
import { createServiceClient } from "@/lib/supabase/server";

/** Pagine di trending lette (20 titoli l'una): 40 poster bastano per 10 colonne tutte diverse */
const WALL_PAGES = 2;
const WALL_SIZE = 20 * WALL_PAGES;

/**
 * Locandine per il muro di sfondo (login, onboarding, profilo):
 * sempre i titoli più nuovi e popolari, da TMDB trending settimanale.
 * La pagina 1 è la stessa `fetch` delle sezioni Scopri (cache Next condivisa);
 * se una pagina fallisce si usano le altre. Fallback: ultime locandine in cache locale.
 */
export async function getWallPosters(): Promise<string[]> {
  const pages = await Promise.allSettled(
    Array.from({ length: WALL_PAGES }, (_, i) => getTrending(i + 1)),
  );
  const seen = new Set<string>();
  const paths: string[] = [];
  for (const page of pages) {
    if (page.status !== "fulfilled") continue;
    for (const r of page.value.results) {
      if (r.media_type !== "movie" && r.media_type !== "tv") continue;
      if (!r.poster_path || seen.has(r.poster_path)) continue;
      seen.add(r.poster_path);
      paths.push(r.poster_path);
    }
  }
  if (paths.length >= 8) return paths.slice(0, WALL_SIZE);

  // TMDB non raggiungibile: si usa la cache
  const supabase = createServiceClient();
  const { data } = await supabase
    .from("titles")
    .select("poster_path")
    .not("poster_path", "is", null)
    .order("fetched_at", { ascending: false })
    .limit(WALL_SIZE);
  return (data ?? []).map((t) => t.poster_path as string);
}
