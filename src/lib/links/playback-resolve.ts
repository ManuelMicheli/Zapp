import "server-only";
import { jwPost } from "./justwatch";
import { pickPlaybackUrl, type PlaybackOffer } from "./playback";

const SEARCH = `query ZappPlayback($filter: TitleFilter!) {
  popularTitles(country: IT, first: 10, filter: $filter) {
    edges { node {
      content(country: IT, language: it) { externalIds { tmdbId } }
      ... on Movie { offers(country: IT, platform: WEB) {
        deeplinkURL(platform: WEB) monetizationType package { packageId }
      } }
      ... on Show { seasons { id content(country: IT, language: it) { seasonNumber } } }
    } }
  }
}`;
const SEASON = `query ZappPlaybackSeason($id: ID!) {
  node(id: $id) { ... on Season {
    content(country: IT, language: it) { seasonNumber }
    episodes {
      content(country: IT, language: it) { episodeNumber }
      offers(country: IT, platform: WEB) {
        deeplinkURL(platform: WEB) monetizationType package { packageId }
      }
    }
  } }
}`;
interface Node {
  content: { externalIds: { tmdbId: string | number | null } | null } | null;
  seasons?: { id: string; content: { seasonNumber: number } | null }[];
  offers?: PlaybackOffer[];
}
interface SearchResponse {
  errors?: unknown[];
  data?: { popularTitles?: { edges?: { node: Node }[] } };
}
interface SeasonResponse {
  errors?: unknown[];
  data?: {
    node?: {
      content: { seasonNumber: number } | null;
      episodes?: {
        content: { episodeNumber: number } | null;
        offers?: PlaybackOffer[];
      }[];
    };
  };
}

/** Due richieste cacheate: identita TMDB -> sola stagione richiesta -> episodio esatto.
 * Chiamato dal redirect autenticato e limitato, mai durante il render della home.
 */
export async function resolvePlayback(
  title: {
    id: number;
    media_type: "movie" | "tv";
    title: string;
    original_title: string | null;
  },
  providerId: number,
  season: number | null,
  episode: number | null,
): Promise<string | null> {
  if (![8, 39, 119, 337].includes(providerId)) return null;
  if (title.media_type === "tv" && (!season || !episode)) return null;
  const queries = [
    ...new Set([title.title, title.original_title].filter((q): q is string => !!q)),
  ];
  for (const query of queries) {
    const result = await jwPost<SearchResponse>(
      SEARCH,
      {
        filter: {
          searchQuery: query,
          objectTypes: [title.media_type === "movie" ? "MOVIE" : "SHOW"],
        },
      },
      86400,
    );
    if (!result || result.errors?.length) return null;
    const nodes =
      result.data?.popularTitles?.edges
        ?.map((e) => e.node)
        .filter((n) => Number(n.content?.externalIds?.tmdbId) === title.id) ?? [];
    if (!nodes.length) continue;
    if (nodes.length !== 1) return null;
    const match = nodes[0];
    if (title.media_type === "movie")
      return pickPlaybackUrl(match.offers ?? [], providerId);
    const seasons =
      match.seasons?.filter((s) => s.content?.seasonNumber === season) ?? [];
    if (seasons.length !== 1) return null;
    const detail = await jwPost<SeasonResponse>(SEASON, { id: seasons[0].id }, 86400);
    if (
      !detail ||
      detail.errors?.length ||
      detail.data?.node?.content?.seasonNumber !== season
    )
      return null;
    const episodes =
      detail.data.node.episodes?.filter((e) => e.content?.episodeNumber === episode) ??
      [];
    return episodes.length === 1
      ? pickPlaybackUrl(episodes[0].offers ?? [], providerId)
      : null;
  }
  return null;
}
