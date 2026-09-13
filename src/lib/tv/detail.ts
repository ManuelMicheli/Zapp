import { formaDiLancio } from "@/lib/devices/launch";
import { availableSeasons, nextEpisode } from "@/lib/watch/episodes";
import type { Tables } from "@/types/database";
import type {
  ProviderOffer,
  SeasonSummary,
  TitleCard,
  TitleDetail,
  UserEntry,
} from "./dto";
import { annoDa } from "./map";

type TitleRow = Tables<"titles">;
type ProviderRow = Tables<"title_providers">;
type EntryRow = Pick<
  Tables<"watch_entries">,
  | "status"
  | "rating"
  | "season_number"
  | "episode_number"
  | "position_ms"
  | "position_season"
  | "position_episode"
>;

export interface DetailInput {
  title: TitleRow;
  providers: ProviderRow[];
  /** Link https per provider, gia' risolti (solo quelli trovati). */
  links: Map<number, { url: string }>;
  entry: EntryRow | null;
  trailerId: string | null;
  similar: TitleCard[];
  palette: { primary: string; secondary: string } | null;
  zapp: { score: number | null; votes: number } | null;
}

const KINDS: ProviderOffer["kind"][] = ["flatrate", "rent", "buy", "free", "ads"];

function raw(title: TitleRow): Record<string, unknown> {
  return typeof title.raw === "object" && title.raw !== null
    ? (title.raw as Record<string, unknown>)
    : {};
}

function cast(title: TitleRow): TitleDetail["cast"] {
  const credits = raw(title).credits as { cast?: unknown } | undefined;
  const lista = Array.isArray(credits?.cast) ? credits.cast : [];
  return lista.slice(0, 12).map((c) => {
    const p = c as { name?: unknown; character?: unknown; profile_path?: unknown };
    return {
      name: typeof p.name === "string" ? p.name : "",
      character: typeof p.character === "string" ? p.character : null,
      profilePath: typeof p.profile_path === "string" ? p.profile_path : null,
    };
  });
}

function genres(title: TitleRow): string[] {
  return Array.isArray(title.genres)
    ? title.genres
        .map((g) => (g as { name?: unknown }).name)
        .filter((n): n is string => typeof n === "string")
    : [];
}

function offerte(input: DetailInput): ProviderOffer[] {
  const viste = new Set<number>();
  const out: ProviderOffer[] = [];
  for (const kind of KINDS) {
    for (const p of input.providers) {
      if (p.kind !== kind || viste.has(p.provider_id)) continue;
      viste.add(p.provider_id);
      const url = input.links.get(p.provider_id)?.url ?? null;
      const forma = formaDiLancio(p.provider_id, url);
      out.push({
        id: p.provider_id,
        name: p.provider_name,
        logoPath: p.logo_path ?? null,
        kind,
        canLaunch: forma !== null,
        expected: forma?.esito ?? null,
        url,
      });
    }
  }
  return out;
}

/** Episodi visti in una stagione, dalla coppia "ultimo episodio finito" dell'entry. */
function vistiNella(n: number, count: number, entry: EntryRow | null): number {
  if (!entry || entry.season_number == null) return 0;
  if (entry.season_number > n) return count;
  if (entry.season_number === n) return Math.min(count, entry.episode_number ?? 0);
  return 0;
}

function stagioni(title: TitleRow, entry: EntryRow | null): SeasonSummary[] {
  const lista = Array.isArray(title.seasons) ? title.seasons : [];
  return lista
    .map(
      (s) =>
        s as {
          season_number?: unknown;
          name?: unknown;
          episode_count?: unknown;
          air_date?: unknown;
          poster_path?: unknown;
        },
    )
    .filter((s) => typeof s.season_number === "number" && s.season_number > 0)
    .map((s) => {
      const count = typeof s.episode_count === "number" ? s.episode_count : 0;
      return {
        number: s.season_number as number,
        name: typeof s.name === "string" ? s.name : `Stagione ${s.season_number}`,
        episodeCount: count,
        airDate: typeof s.air_date === "string" ? s.air_date : null,
        posterPath: typeof s.poster_path === "string" ? s.poster_path : null,
        watched: vistiNella(s.season_number as number, count, entry),
      };
    });
}

function utente(title: TitleRow, entry: EntryRow | null): UserEntry | null {
  if (!entry) return null;
  let next: UserEntry["next"] = null;
  if (
    title.media_type === "tv" &&
    entry.season_number != null &&
    entry.episode_number != null
  ) {
    const seasons = availableSeasons(title.seasons);
    const n = nextEpisode(seasons, entry.season_number, entry.episode_number);
    if (n) next = { season: n.season, episode: n.episode };
  }
  return {
    status: entry.status,
    rating: entry.rating,
    season: entry.season_number,
    episode: entry.episode_number,
    next,
  };
}

export function toTitleDetail(input: DetailInput): TitleDetail {
  const t = input.title;
  const r = raw(t);
  return {
    id: t.id,
    mediaType: t.media_type,
    name: t.title,
    year: annoDa(t.release_date),
    posterPath: t.poster_path,
    backdropPath: t.backdrop_path,
    zappScore: input.zapp?.score ?? null,
    zappVotes: input.zapp?.votes ?? 0,
    affinity: null,
    reason: null,
    providerIds: input.providers
      .filter((p) => p.kind === "flatrate")
      .map((p) => p.provider_id),
    originalName: t.original_title,
    overview: t.overview,
    tagline: typeof r.tagline === "string" && r.tagline ? r.tagline : null,
    genres: genres(t),
    runtimeMin: t.runtime,
    releaseDate: t.release_date,
    tmdbRating: t.vote_average,
    cast: cast(t),
    trailer: input.trailerId ? { youtubeId: input.trailerId } : null,
    providers: offerte(input),
    entry: utente(t, input.entry),
    seasons: t.media_type === "tv" ? stagioni(t, input.entry) : [],
    similar: input.similar,
    palette: input.palette,
  };
}
