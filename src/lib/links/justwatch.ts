import "server-only";

import { cache } from "react";
import type { Tables } from "@/types/database";

/**
 * Link diretti alle pagine titolo via JustWatch (la stessa fonte dei dati
 * `watch/providers` di TMDB: i `packageId` coincidono con i `provider_id` TMDB).
 * Una sola query per titolo: si cerca per nome, si sceglie il risultato con lo
 * stesso `tmdbId` e si raccolgono le offerte IT per piattaforma.
 */

const JW_ENDPOINT = "https://apis.justwatch.com/graphql";
const JW_TIMEOUT_MS = 4000;
const JW_UA = "Zapp/1.0 (michelimanuel03.mm@gmail.com)";
const JW_COUNTRY = "IT";
const JW_LANGUAGE = "it";

const QUERY = `
query ZappOffers($country: Country!, $language: Language!, $first: Int!, $filter: TitleFilter) {
  popularTitles(country: $country, first: $first, filter: $filter) {
    edges {
      node {
        objectType
        content(country: $country, language: $language) {
          externalIds { tmdbId }
        }
        offers(country: $country, platform: WEB) {
          monetizationType
          presentationType
          standardWebURL
          package { packageId }
        }
      }
    }
  }
}`;

interface JwOffer {
  monetizationType: string | null;
  presentationType: string | null;
  standardWebURL: string | null;
  package: { packageId: number } | null;
}

interface JwNode {
  objectType: string;
  content: { externalIds: { tmdbId: string | number | null } | null } | null;
  offers: JwOffer[] | null;
}

interface JwResponse {
  data?: { popularTitles?: { edges?: { node: JwNode }[] } };
  errors?: unknown[];
}

/** Parametri di tracking/affiliazione che JustWatch aggiunge agli URL. */
const STRIP_PARAMS = new Set([
  "at",
  "ct",
  "itscg",
  "itsct",
  "playableId",
  "searchReferral",
  "autoplay",
  "cmp",
  "tag",
]);

/**
 * Pulisce l'URL di un'offerta: via i parametri di tracking, locale italiano
 * su HBO Max. Ritorna null per gli URL che non puntano a un titolo (home).
 */
export function cleanOfferUrl(raw: string): string | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;
  // link "generici" (home della piattaforma) non sono deep link
  if (url.pathname.replace(/\/+$/, "").length === 0 && url.search.length === 0) {
    return null;
  }
  if (url.hostname === "click.justwatch.com") return null;

  for (const key of [...url.searchParams.keys()]) {
    if (STRIP_PARAMS.has(key) || key.startsWith("utm_")) {
      url.searchParams.delete(key);
    }
  }
  if (url.hostname.endsWith("hbomax.com")) {
    url.pathname = url.pathname.replace(/^\/it\/en\//, "/it/it/");
  }
  url.hash = "";
  return url.toString();
}

const PRESENTATION_RANK: Record<string, number> = { HD: 0, _4K: 1, SD: 2 };
const MONETIZATION_RANK: Record<string, number> = {
  FLATRATE: 0,
  FREE: 1,
  ADS: 2,
  RENT: 3,
  BUY: 4,
};

/** Punteggio di un'offerta: più basso è meglio. Evita le versioni "with ASL". */
function offerScore(offer: JwOffer, url: string): number {
  let score = 0;
  if (/[-_]asl\b|with-asl/i.test(url)) score += 100;
  score += (MONETIZATION_RANK[offer.monetizationType ?? ""] ?? 5) * 10;
  score += PRESENTATION_RANK[offer.presentationType ?? ""] ?? 3;
  return score;
}

async function searchJustWatch(
  query: string,
  objectType: "MOVIE" | "SHOW",
): Promise<JwNode[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), JW_TIMEOUT_MS);
  try {
    const res = await fetch(JW_ENDPOINT, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json",
        "user-agent": JW_UA,
      },
      body: JSON.stringify({
        query: QUERY,
        variables: {
          country: JW_COUNTRY,
          language: JW_LANGUAGE,
          first: 10,
          filter: { searchQuery: query, objectTypes: [objectType] },
        },
      }),
      signal: controller.signal,
      next: { revalidate: 86400 },
    });
    if (!res.ok) return [];
    const json = (await res.json()) as JwResponse;
    return (json.data?.popularTitles?.edges ?? []).map((e) => e.node);
  } catch {
    // timeout o rete: nessuna offerta, si passa ai fallback
    return [];
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Offerte JustWatch (IT, web) del titolo, indicizzate per `packageId`
 * (= `provider_id` TMDB). URL già pulito. Deduplicata per render con `cache`.
 */
export const getJustWatchOffers = cache(
  async (title: Tables<"titles">): Promise<Map<number, string>> => {
    const objectType = title.media_type === "movie" ? "MOVIE" : "SHOW";
    const queries = [title.title, title.original_title]
      .filter((q): q is string => typeof q === "string" && q.trim().length > 0)
      .filter((q, i, arr) => arr.indexOf(q) === i);

    let match: JwNode | null = null;
    for (const q of queries) {
      const nodes = await searchJustWatch(q, objectType);
      match =
        nodes.find((n) => Number(n.content?.externalIds?.tmdbId) === title.id) ?? null;
      if (match) break;
    }
    if (!match) {
      console.log(`[links] justwatch: nessun match per ${title.media_type}/${title.id}`);
      return new Map();
    }

    const best = new Map<number, { url: string; score: number }>();
    for (const offer of match.offers ?? []) {
      const packageId = offer.package?.packageId;
      if (!packageId || !offer.standardWebURL) continue;
      const url = cleanOfferUrl(offer.standardWebURL);
      if (!url) continue;
      const score = offerScore(offer, url);
      const current = best.get(packageId);
      if (!current || score < current.score) best.set(packageId, { url, score });
    }
    console.log(
      `[links] justwatch ${title.media_type}/${title.id}: ${best.size} piattaforme`,
    );
    return new Map([...best].map(([id, { url }]) => [id, url]));
  },
);
