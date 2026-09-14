import "server-only";
import { unstable_cache } from "next/cache";
import type { PortraitSourceEntry } from "./match";

/**
 * Ritratti dei personaggi degli anime da AniList (GraphQL pubblico, senza
 * chiave). TVmaze per gli anime ha pochi personaggi (Death Note: 5 su 11);
 * AniList li ha tutti, col doppiatore giapponese, che è il nome che TMDB
 * elenca nel cast. Jikan/MyAnimeList sarebbe equivalente ma il 2026-09-14
 * rispondeva 504. Cache 7 giorni per serie.
 *
 * Due pagine di personaggi (25 è il massimo per pagina): con una sola, Death
 * Note perdeva Soichiro Yagami e Watari. Del doppiatore si tengono nome
 * romanizzato **e nativo**: TMDB in italiano scrive alcuni doppiatori in
 * kanji (佐々木望 per Nozomu Sasaki).
 */

const ANILIST = "https://graphql.anilist.co";
const WEEK = 7 * 86400;

const CHARACTERS = `
  edges {
    role
    node { name { full } image { large } }
    voiceActors(language: JAPANESE) { name { full native } }
  }`;

const QUERY = `
query ($search: String) {
  Page(perPage: 3) {
    media(search: $search, type: ANIME, sort: POPULARITY_DESC) {
      id
      format
      c1: characters(sort: [ROLE, RELEVANCE], page: 1, perPage: 25) { ${CHARACTERS} }
      c2: characters(sort: [ROLE, RELEVANCE], page: 2, perPage: 25) { ${CHARACTERS} }
    }
  }
}`;

interface AnilistEdge {
  role?: string;
  node?: { name?: { full?: string | null }; image?: { large?: string | null } };
  voiceActors?: { name?: { full?: string | null; native?: string | null } }[];
}

interface AnilistMedia {
  id: number;
  format?: string | null;
  c1?: { edges?: AnilistEdge[] };
  c2?: { edges?: AnilistEdge[] };
}

function edgesOf(media: AnilistMedia | null): AnilistEdge[] {
  return [...(media?.c1?.edges ?? []), ...(media?.c2?.edges ?? [])];
}

async function search(title: string): Promise<AnilistMedia | null> {
  const res = await fetch(ANILIST, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ query: QUERY, variables: { search: title } }),
    cache: "no-store",
    signal: AbortSignal.timeout(6000),
  });
  // un guasto (5xx, 429) deve propagarsi per non finire in cache; un 4xx è un valore
  if (res.status >= 500 || res.status === 429) throw new Error(`AniList ${res.status}`);
  if (!res.ok) return null;
  const json = (await res.json()) as { data?: { Page?: { media?: AnilistMedia[] } } };
  const media = json.data?.Page?.media ?? [];
  // una serie, non un film o uno speciale, quando c'è
  return media.find((m) => m.format === "TV" || m.format === "ONA") ?? media[0] ?? null;
}

/**
 * Dentro `unstable_cache` un errore non si cachea, un valore sì: un guasto di
 * rete si propaga e lo cattura il wrapper, così non resta congelato 7 giorni.
 */
const cachedAnilistCharacters = unstable_cache(
  async (name: string, originalName: string | null): Promise<PortraitSourceEntry[]> => {
    const titles = [...new Set([originalName, name].filter((t): t is string => !!t))];
    let media: AnilistMedia | null = null;
    for (const t of titles) {
      media = await search(t);
      if (edgesOf(media).length > 0) break;
    }
    return edgesOf(media)
      .filter((e) => e.node?.name?.full && e.node.image?.large)
      .map((e) => {
        const va = e.voiceActors?.[0]?.name;
        return {
          personName: va?.full ?? "",
          personNames: va?.native ? [va.native] : [],
          characterName: e.node!.name!.full!,
          image: e.node!.image!.large!,
        };
      });
  },
  ["anilist-characters"],
  { revalidate: WEEK },
);

/** I personaggi AniList della serie, cercata per titolo originale poi per titolo. */
export async function getAnilistCharacters(
  name: string,
  originalName: string | null,
): Promise<PortraitSourceEntry[]> {
  try {
    return await cachedAnilistCharacters(name, originalName);
  } catch (e) {
    console.error("getAnilistCharacters", name, e);
    return [];
  }
}
