import type { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getSeason } from "@/lib/tmdb/client";
import { getTitleCached } from "@/lib/tmdb/get-title";
import { isIntInRange, isTmdbId } from "@/lib/validate";
import { tvJson, withBearer } from "@/lib/tv/bearer";
import { toSeasonDetail } from "@/lib/tv/season";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; n: string }> },
) {
  const { id, n } = await params;
  const tvId = Number(id);
  const numero = Number(n);
  if (!isTmdbId(tvId) || !isIntInRange(numero, 1, 200)) {
    return tvJson({ error: "Richiesta non valida" }, { status: 400 });
  }
  return withBearer(request, async (ctx) => {
    const cached = await getTitleCached(tvId, "tv", false);
    if (!cached) return tvJson({ error: "Titolo non trovato" }, { status: 404 });
    const supabase = await createClient();
    let season: Awaited<ReturnType<typeof getSeason>> | null = null;
    let seasonError: unknown = null;
    const [, { data: entry }] = await Promise.all([
      getSeason(tvId, numero)
        .then((s) => {
          season = s;
        })
        .catch((e) => {
          seasonError = e;
        }),
      supabase
        .from("watch_entries")
        .select(
          "status, rating, season_number, episode_number, position_ms, position_season, position_episode",
        )
        .eq("user_id", ctx.userId)
        .eq("title_id", tvId)
        .eq("media_type", "tv")
        .maybeSingle(),
    ]);
    if (!season) {
      if (seasonError instanceof Error) {
        const statusMatch = seasonError.message.match(/TMDB (\d+)/);
        const status = statusMatch ? Number(statusMatch[1]) : 0;
        if (status === 404) {
          return tvJson({ error: "Stagione non trovata" }, { status: 404 });
        }
        console.error("[tv] season", seasonError.message);
        return tvJson({ error: "Non è riuscito, riprova." }, { status: 502 });
      }
      return tvJson({ error: "Stagione non trovata" }, { status: 404 });
    }
    return tvJson(toSeasonDetail(season, entry ?? null));
  });
}

export const dynamic = "force-dynamic";
