import "server-only";

import { TMDB_IMAGE_BASE, backdropUrl, providerLogoUrl } from "@/lib/config";
import { providerHref } from "@/lib/links/go";
import { getSeason } from "@/lib/tmdb/client";
import {
  availableSeasons,
  episodesWatched,
  nextEpisode,
  totalEpisodes,
} from "./episodes";
import type { EntryWithTitle } from "./queries";

/** Una tessera della fila "Continua a guardare". */
export interface ContinueItem {
  entryId: string;
  titleId: number;
  mediaType: "movie" | "tv";
  name: string;
  /** Fotogramma dell'episodio da riprendere (serie) o backdrop (film), taglia `original`. */
  imageUrl: string | null;
  /** "S1:E5", solo per le serie. */
  episodeLabel: string | null;
  /** Titolo dell'episodio da riprendere. */
  episodeName: string | null;
  /** "48 min" / "1h 52m". */
  runtimeLabel: string | null;
  /** Avanzamento sulla serie (episodi visti / totali). */
  progressPct: number | null;
  providerLogoUrl: string | null;
  providerName: string | null;
  /** Link diretto alla piattaforma (o `/go/...` che lo risolve al volo). */
  providerUrl: string | null;
}

function formatRuntime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h}h ${m}m` : `${m} min`;
}

/** Primo provider flatrate: logo, nome e link diretto dal DB. */
function provider(entry: EntryWithTitle) {
  const title = entry.title;
  const first = title?.title_providers.find((p) => p.kind === "flatrate");
  if (!title || !first) return { logo: null, name: null, url: null };
  return {
    logo: providerLogoUrl(first.logo_path),
    name: first.provider_name,
    url: providerHref(
      title.media_type,
      title.id,
      first.provider_id,
      title.title_provider_links,
    ),
  };
}

/**
 * Episodio da riprendere: il successivo all'ultimo visto. Se la serie è finita
 * (o non si sa dove si è arrivati) resta l'ultimo visto, altrimenti il primo.
 */
function targetEpisode(entry: EntryWithTitle) {
  const seasons = availableSeasons(entry.title?.seasons);
  const season = entry.season_number;
  const episode = entry.episode_number;
  if (season == null || episode == null) {
    const first = seasons[0];
    return first ? { season: first.season, episode: 1, pct: 0 } : null;
  }
  const total = totalEpisodes(seasons);
  const pct = total > 0 ? episodesWatched(seasons, season, episode) / total : null;
  const next = nextEpisode(seasons, season, episode);
  return {
    season: next?.season ?? season,
    episode: next?.episode ?? episode,
    pct,
  };
}

/**
 * Tessere della fila "Continua a guardare": per ogni serie una `getSeason`
 * (throttle + memo del client TMDB, cache Next 1 h) per il fotogramma e la durata
 * dell'episodio da riprendere. I film usano backdrop e durata del titolo.
 */
export async function getContinueItems(
  entries: EntryWithTitle[],
): Promise<ContinueItem[]> {
  return Promise.all(entries.map(continueItem));
}

async function continueItem(entry: EntryWithTitle): Promise<ContinueItem> {
  const title = entry.title;
  const info = provider(entry);
  const base: ContinueItem = {
    entryId: entry.id,
    titleId: entry.title_id,
    mediaType: entry.media_type,
    name: title?.title ?? "",
    imageUrl: backdropUrl(title?.backdrop_path ?? null, "original"),
    episodeLabel: null,
    episodeName: null,
    runtimeLabel: title?.runtime ? formatRuntime(title.runtime) : null,
    progressPct: null,
    providerLogoUrl: info.logo,
    providerName: info.name,
    providerUrl: info.url,
  };
  if (entry.media_type !== "tv") return base;

  const target = targetEpisode(entry);
  if (!target) return base;

  const season = await getSeason(entry.title_id, target.season).catch(() => null);
  const episode = season?.episodes.find((e) => e.episode_number === target.episode);
  return {
    ...base,
    imageUrl: episode?.still_path
      ? `${TMDB_IMAGE_BASE}/original${episode.still_path}`
      : base.imageUrl,
    episodeLabel: `S${target.season}:E${target.episode}`,
    episodeName: episode?.name ?? null,
    runtimeLabel: episode?.runtime ? formatRuntime(episode.runtime) : null,
    progressPct: target.pct,
  };
}
