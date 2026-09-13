import "server-only";

import { getViewer } from "@/lib/auth/viewer";
import { getPosterPalette } from "@/lib/colors/palette";
import { resolveProviderLinks } from "@/lib/links/resolve";
import { ratingKey, scoreMap } from "@/lib/ratings/cards";
import { getSimilarTitles } from "@/lib/similar/similar";
import { createClient } from "@/lib/supabase/server";
import { getTitleCached } from "@/lib/tmdb/get-title";
import type { TmdbVideos } from "@/lib/tmdb/types";
import { getOfficialTrailers } from "@/lib/trailers/official";
import { toTitleDetail } from "./detail";
import type { MediaType, TitleDetail } from "./dto";
import { cardFromSimilar } from "./map";

function hex([r, g, b]: [number, number, number]): string {
  return (
    "#" +
    [r, g, b]
      .map((v) =>
        Math.max(0, Math.min(255, Math.round(v)))
          .toString(16)
          .padStart(2, "0"),
      )
      .join("")
  );
}

/** Gli stessi loader della pagina scheda (`TitleBody.tsx`), in parallelo. */
export async function loadTitleDetail(
  id: number,
  mediaType: MediaType,
): Promise<TitleDetail | null> {
  const cached = await getTitleCached(id, mediaType, true);
  if (!cached) return null;
  const viewer = await getViewer();
  const supabase = await createClient();

  const providerIds = cached.providers.map((p) => p.provider_id);
  const [links, entry, trailers, similar, palette, voti] = await Promise.all([
    resolveProviderLinks(cached.title, providerIds).catch(() => new Map()),
    viewer
      ? supabase
          .from("watch_entries")
          .select(
            "status, rating, season_number, episode_number, position_ms, position_season, position_episode",
          )
          .eq("user_id", viewer.id)
          .eq("title_id", id)
          .eq("media_type", mediaType)
          .maybeSingle()
          .then((r) => r.data ?? null)
      : Promise.resolve(null),
    getOfficialTrailers({
      videos: (cached.title.raw as { videos?: TmdbVideos } | null)?.videos,
      titleId: id,
      mediaType,
      name: cached.title.title,
      originalTitle: cached.title.original_title,
      releaseDate: cached.title.release_date,
    }).catch(() => []),
    getSimilarTitles(id, mediaType, 12).catch(() => []),
    getPosterPalette(cached.title.poster_path).catch(() => null),
    scoreMap([{ id, mediaType }]).catch(() => new Map()),
  ]);

  const voto = voti.get(ratingKey(id, mediaType));
  return toTitleDetail({
    title: cached.title,
    providers: cached.providers,
    links,
    entry,
    trailerId: trailers[0]?.key ?? null,
    similar: similar.map(cardFromSimilar),
    palette: palette
      ? { primary: hex(palette.primary), secondary: hex(palette.secondary) }
      : null,
    zapp: voto ? { score: voto.score, votes: voto.votes } : null,
  });
}
