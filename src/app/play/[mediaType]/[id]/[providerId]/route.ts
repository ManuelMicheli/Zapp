import { NextResponse } from "next/server";
import { getViewer } from "@/lib/auth/viewer";
import { rateLimit } from "@/lib/rate-limit";
import { getPreparedPlayback } from "@/lib/links/playback-prepare";
import { getOrFetchTitle } from "@/lib/tmdb/cache";
import { resolveProviderLink } from "@/lib/links/resolve";
import { isSafeExternalUrl, isTmdbId, isIntInRange } from "@/lib/validate";

export const dynamic = "force-dynamic";

/** Il target arriva dalla card: non ricalcolarlo come "prossimo episodio" al clic. */
async function handle(
  req: Request,
  ctx: { params: Promise<{ mediaType: string; id: string; providerId: string }> },
  prepare: boolean,
) {
  const viewer = await getViewer();
  if (!viewer) return new NextResponse("Not found", { status: 404 });
  const { mediaType, id, providerId } = await ctx.params;
  const query = new URL(req.url).searchParams;
  const season = query.has("season") ? Number(query.get("season")) : null;
  const episode = query.has("episode") ? Number(query.get("episode")) : null;
  if (
    (mediaType !== "movie" && mediaType !== "tv") ||
    !/^\d+$/.test(id) ||
    !isTmdbId(Number(id)) ||
    !["8", "39", "119", "337"].includes(providerId) ||
    (mediaType === "tv" &&
      (!isIntInRange(season, 1, 999) || !isIntInRange(episode, 1, 9999)))
  ) {
    return new NextResponse("Not found", { status: 404 });
  }
  // TMDB + JustWatch: limite per utente, anche con parametri diversi a ogni clic.
  const rateKey = prepare ? `play-prepare:${viewer.id}` : `play:${viewer.id}`;
  const rateMax = prepare ? 60 : 30;
  if (!(await rateLimit(rateKey, rateMax, 60)))
    return new NextResponse("Riprova tra poco", { status: 429 });
  const targetSeason = mediaType === "tv" ? season : null;
  const targetEpisode = mediaType === "tv" ? episode : null;
  let destination = await getPreparedPlayback({
    mediaType,
    titleId: Number(id),
    providerId: Number(providerId),
    season: targetSeason,
    episode: targetEpisode,
  });
  // La preparazione conserva solo URL player esatti. Il vecchio ripiego resta
  // sul click e non puo' avvelenare per 24 ore la cache di un episodio.
  if (!destination && !prepare) {
    const cached = await getOrFetchTitle(Number(id), mediaType);
    destination = cached
      ? ((await resolveProviderLink(cached.title, Number(providerId)))?.url ?? null)
      : null;
  }
  if (!destination || !isSafeExternalUrl(destination))
    return new NextResponse("Not found", { status: 404 });
  if (prepare) {
    return NextResponse.json(
      { href: destination },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  }
  return NextResponse.redirect(destination, { status: 302 });
}

export function GET(
  req: Request,
  ctx: { params: Promise<{ mediaType: string; id: string; providerId: string }> },
) {
  return handle(req, ctx, false);
}

export function POST(
  req: Request,
  ctx: { params: Promise<{ mediaType: string; id: string; providerId: string }> },
) {
  return handle(req, ctx, true);
}
