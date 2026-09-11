import "server-only";

import { backdropUrl, providerLogoUrl, PROVIDERS } from "@/lib/config";
import { providerHref } from "@/lib/links/go";
import { pickRotating, rankBackdrops } from "@/lib/tmdb/backdrops";
import { getSeason, getTitleImages, getProviderList } from "@/lib/tmdb/client";
import {
  availableSeasons,
  episodesWatched,
  nextEpisode,
  totalEpisodes,
} from "./episodes";
import type { WatchedPlatform } from "./platforms";
import type { LiveSession } from "./live";
import { resumeEpisode, resumeLabel, resumeRatio, samePlayingEpisode } from "./progress";
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
  /**
   * "18 min di 76": solo quando ZConnection ha mandato il minuto esatto per
   * *questo* episodio (o film). Se non combacia resta `null` e la card e' quella
   * di sempre — chi non usa l'estensione non vede alcuna differenza.
   */
  resumeLabel: string | null;
  /** Frazione per la barra, dallo stesso minutaggio; `null` = niente barra. */
  resumeRatio: number | null;
  /** Misure del solo film/episodio mostrato, mantenute anche senza sessione live. */
  resumePositionMs: number | null;
  resumeDurationMs: number | null;
  /**
   * Stagione ed episodio **che questa tessera sta mostrando** (null per un
   * film). Servono al client per riconoscere se la sessione in corso su un
   * dispositivo collegato è proprio questa: un altro episodio della stessa
   * serie è un'altra cosa, e il suo minutaggio non va scritto qui.
   */
  shownSeason: number | null;
  shownEpisode: number | null;
  providerLogoUrl: string | null;
  /** Il provider proviene dalla visione effettiva, non da una semplice offerta. */
  providerRecorded: boolean;
  providerName: string | null;
  /** ID TMDB della piattaforma: serve ad aprire l'app nativa (vedi `AppLink`). */
  providerId: number | null;
  /** Link diretto alla piattaforma (o `/go/...` che lo risolve al volo). */
  providerUrl: string | null;
}

function formatRuntime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h}h ${m}m` : `${m} min`;
}

/** Piattaforma della visione; le offerte restano un ripiego solo per il link. */
function provider(entry: EntryWithTitle, watchedId?: number) {
  const title = entry.title;
  const offer =
    watchedId !== undefined
      ? title?.title_providers.find((p) => p.provider_id === watchedId)
      : title?.title_providers.find((p) => p.kind === "flatrate");
  const id = watchedId ?? offer?.provider_id;
  if (id === undefined)
    return { logo: null, name: null, url: null, id: null, recorded: false };
  return {
    logo: providerLogoUrl(offer?.logo_path ?? null),
    name: PROVIDERS[id]?.name ?? offer?.provider_name ?? null,
    id,
    recorded: watchedId !== undefined,
    url: providerHref(
      entry.media_type,
      entry.title_id,
      id,
      title?.title_provider_links ?? [],
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
  live: LiveSession[] = [],
  platforms: WatchedPlatform[] = [],
): Promise<ContinueItem[]> {
  if (!entries.length) return [];
  const seed = visits++;
  const items = Promise.all(
    entries.map((entry) => continueItem(entry, seed, live, platforms)),
  );
  // La lista loghi e' gia' condivisa/cacheata con PlatformLauncher.
  const catalog =
    platforms.length || live.some((s) => s.providerId !== undefined)
      ? getProviderList().catch(() => [])
      : Promise.resolve([]);
  const [cards, logos] = await Promise.all([items, catalog]);
  return cards.map((card) => {
    const info = logos.find((p) => p.provider_id === card.providerId);
    return {
      ...card,
      providerLogoUrl: card.providerLogoUrl ?? providerLogoUrl(info?.logo_path ?? null),
      providerName: card.providerName ?? info?.provider_name ?? null,
    };
  });
}

/**
 * L'episodio che la tessera deve mostrare.
 *
 * Normalmente è quello **da riprendere**, cioè il successivo all'ultimo finito.
 * Ma se un dispositivo collegato sta riproducendo proprio questa serie, quello
 * che conta è l'episodio che si sta guardando **adesso**: `episode_number`
 * avanza solo a episodio completato, quindi su una serie appena cominciata era
 * ancora nullo e la tessera proponeva S1E1 mentre l'utente era all'episodio 23 —
 * due cose diverse, e il minutaggio vero non aveva a cosa attaccarsi.
 *
 * La stagione della riproduzione può essere sconosciuta (Netflix la espone solo
 * dal pannello di pausa): in quel caso si tiene quella che la tessera aveva già,
 * che è la migliore ipotesi disponibile. L'avanzamento sulla serie resta quello
 * calcolato sugli episodi visti: è un'altra misura e non dipende da dove si è
 * dentro l'episodio.
 */
function episodioDaMostrare(entry: EntryWithTitle, live: LiveSession | undefined) {
  return resumeEpisode(targetEpisode(entry), entry, live);
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

async function continueItem(
  entry: EntryWithTitle,
  seed: number,
  live: LiveSession[],
  platforms: WatchedPlatform[],
): Promise<ContinueItem> {
  const title = entry.title;
  const sameTitle = (s: { titleId: number; mediaType: string }) =>
    s.titleId === entry.title_id && s.mediaType === entry.media_type;
  const watchedId =
    live.find(sameTitle)?.providerId ?? platforms.find(sameTitle)?.providerId;
  const info = provider(entry, watchedId);
  // grafiche e stagione partono insieme: sono le due sole chiamate della tessera
  const cover = coverUrl(
    entry,
    seed,
    backdropUrl(title?.backdrop_path ?? null, "original"),
  );
  const inCorso = live.find(
    (s) => s.titleId === entry.title_id && s.mediaType === entry.media_type,
  );
  const target = entry.media_type === "tv" ? episodioDaMostrare(entry, inCorso) : null;
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
    resumeLabel: null,
    resumeRatio: null,
    resumePositionMs: null,
    resumeDurationMs: null,
    shownSeason: null,
    shownEpisode: null,
    providerLogoUrl: info.logo,
    providerRecorded: info.recorded,
    providerName: info.name,
    providerId: info.id,
    providerUrl: info.url,
  };
  // Un film non ha episodi: il minutaggio dell'estensione riguarda sempre lui.
  // Una serie senza episodio da riprendere non ha niente da confrontare.
  if (!target) return withResume(base, entry, entry.media_type !== "tv");

  const episode = (await season)?.episodes.find(
    (e) => e.episode_number === target.episode,
  );
  // Stagione con tolleranza: Netflix la espone solo dal pannello di pausa, e
  // pretendendo l'uguaglianza il minutaggio vero non compariva mai per nessuna
  // serie (`null === 1`). La regola sta in `samePlayingEpisode`, con i test.
  const matchesShownEpisode = samePlayingEpisode(
    { season: target.season, episode: target.episode },
    { season: entry.position_season, episode: entry.position_episode },
  );
  return withResume(
    {
      ...base,
      episodeLabel: `S${target.season}:E${target.episode}`,
      episodeName: episode?.name ?? null,
      runtimeLabel: episode?.runtime ? formatRuntime(episode.runtime) : null,
      progressPct: target.pct,
      shownSeason: target.season,
      shownEpisode: target.episode,
    },
    entry,
    matchesShownEpisode,
  );
}

/**
 * Aggiunge il minuto esatto solo se `position_ms` c'e' **e** si riferisce
 * all'episodio (o al film) che questa tessera sta mostrando: la distinzione fra
 * `season_number`/`episode_number` (l'ultimo finito) e `position_season`/
 * `position_episode` (dove sei ora, che puo' essere piu' avanti) regge tutta la
 * funzione. Nessun minutaggio scritto ancora per nessuno -> sempre `null` qui,
 * quindi la card resta quella di sempre.
 */
function withResume(
  item: ContinueItem,
  entry: EntryWithTitle,
  matchesShownEpisode: boolean,
): ContinueItem {
  if (!matchesShownEpisode || entry.position_ms == null) return item;
  return {
    ...item,
    resumePositionMs: entry.position_ms,
    resumeDurationMs: entry.position_duration_ms,
    resumeLabel: resumeLabel(entry.position_ms, entry.position_duration_ms),
    resumeRatio: resumeRatio(entry.position_ms, entry.position_duration_ms),
  };
}
