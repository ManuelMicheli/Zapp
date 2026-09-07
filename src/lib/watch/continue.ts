import "server-only";

import { backdropUrl, providerLogoUrl } from "@/lib/config";
import { providerHref } from "@/lib/links/go";
import { pickRotating, rankBackdrops } from "@/lib/tmdb/backdrops";
import { getSeason, getTitleImages } from "@/lib/tmdb/client";
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
  /** Grafica ufficiale del titolo (mai il fotogramma dell'episodio), taglia `original`. */
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
 * Quante volte la fila è stata resa: fa da seme alla rotazione delle grafiche,
 * così a ogni visita le card mostrano un'altra immagine ufficiale del titolo.
 */
let visits = 0;

/**
 * Tessere della fila "Continua a guardare": per ogni titolo una `getTitleImages`
 * (cache Next 7 g) per le grafiche ufficiali e, per le serie, una `getSeason`
 * (cache 1 h) per numero, nome e durata dell'episodio da riprendere. Entrambe
 * passano per throttle e memo del client TMDB.
 */
export async function getContinueItems(
  entries: EntryWithTitle[],
): Promise<ContinueItem[]> {
  const seed = visits++;
  return Promise.all(entries.map((entry) => continueItem(entry, seed)));
}

/**
 * Copertina della tessera: una delle grafiche ufficiali del titolo, a rotazione.
 * Senza `/images` (o senza grafiche) resta il backdrop già in cache nel DB.
 */
async function coverUrl(
  entry: EntryWithTitle,
  seed: number,
  fallback: string | null,
): Promise<string | null> {
  const images = await getTitleImages(entry.media_type, entry.title_id).catch(() => null);
  const ranked = rankBackdrops(images?.backdrops ?? []);
  const chosen = pickRotating(ranked, seed + entry.title_id);
  return chosen ? backdropUrl(chosen, "original") : fallback;
}

async function continueItem(entry: EntryWithTitle, seed: number): Promise<ContinueItem> {
  const title = entry.title;
  const info = provider(entry);
  // grafiche e stagione partono insieme: sono le due sole chiamate della tessera
  const cover = coverUrl(
    entry,
    seed,
    backdropUrl(title?.backdrop_path ?? null, "original"),
  );
  const target = entry.media_type === "tv" ? targetEpisode(entry) : null;
  const season = target
    ? getSeason(entry.title_id, target.season).catch(() => null)
    : null;

  const base: ContinueItem = {
    entryId: entry.id,
    titleId: entry.title_id,
    mediaType: entry.media_type,
    name: title?.title ?? "",
    imageUrl: await cover,
    episodeLabel: null,
    episodeName: null,
    runtimeLabel: title?.runtime ? formatRuntime(title.runtime) : null,
    progressPct: null,
    providerLogoUrl: info.logo,
    providerName: info.name,
    providerUrl: info.url,
  };
  if (!target) return base;

  const episode = (await season)?.episodes.find(
    (e) => e.episode_number === target.episode,
  );
  return {
    ...base,
    episodeLabel: `S${target.season}:E${target.episode}`,
    episodeName: episode?.name ?? null,
    runtimeLabel: episode?.runtime ? formatRuntime(episode.runtime) : null,
    progressPct: target.pct,
  };
}
