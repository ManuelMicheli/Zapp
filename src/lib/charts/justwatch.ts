import "server-only";

import { PROVIDERS } from "@/lib/config";
import { JW_QUERY_COUNTRY, JW_QUERY_LANGUAGE, jwPost } from "@/lib/links/justwatch";
import { getOrFetchTitle } from "@/lib/tmdb/cache";
import { discoverNewOnStreaming } from "@/lib/tmdb/client";
import type { ChartInput } from "./store";

/** Codici pacchetto di JustWatch per i provider che ci interessano. */
const JW_PACKAGE: Record<number, string> = {
  8: "nfx", // Netflix
  119: "amp", // Prime Video
  337: "dnp", // Disney+
  350: "atp", // Apple TV+
};

const CHART_SIZE = 10;
/** La classifica cambia ogni giorno: cache Next di sei ore. */
const JW_REVALIDATE_S = 6 * 60 * 60;

const CHART_QUERY = `
query ZappProviderChart($country: Country!, $language: Language!, $first: Int!, $filter: TitleFilter) {
  popularTitles(country: $country, first: $first, filter: $filter) {
    edges {
      node {
        objectType
        content(country: $country, language: $language) {
          title
          externalIds { tmdbId }
        }
      }
    }
  }
}`;

interface ChartResponse {
  data?: {
    popularTitles?: {
      edges?: {
        node: {
          content: {
            title: string | null;
            externalIds: { tmdbId: string | number | null } | null;
          } | null;
        };
      }[];
    };
  };
}

/**
 * Classifiche per piattaforma.
 *
 * Prime Video, Disney+ e Apple TV+ **non pubblicano** una Top 10 come fa Netflix:
 * questa è una stima, e resta dichiarata come tale — la riga porta `source` diverso da
 * `netflix_tudum` e la UI dice "i più visti", non "classifica ufficiale".
 *
 * Prima si prova JustWatch, che ha una popolarità vera per provider in Italia **e
 * restituisce già il `tmdbId`**: quelle righe nascono risolte e saltano
 * `resolvePending`. Se JustWatch non risponde si ripiega su TMDB `discover` filtrato
 * per provider e la riga viene scritta con `source = 'tmdb'`, così l'origine del dato
 * resta sempre leggibile.
 */
export async function fetchProviderChart(
  providerId: number,
  mediaType: "movie" | "tv",
): Promise<ChartInput[]> {
  const period = new Date().toISOString().slice(0, 10);
  const name = PROVIDERS[providerId]?.name ?? String(providerId);

  const fromJustWatch = await popularOnJustWatch(providerId, mediaType);
  if (fromJustWatch.length > 0) {
    return fromJustWatch.map((item, i) => ({
      source: "justwatch" as const,
      providerId,
      mediaType,
      period,
      rank: i + 1,
      rawTitle: item.title,
      rawSeason: null,
      weeksInChart: null,
      titleId: item.tmdbId,
    }));
  }

  console.log(`[charts] JustWatch muto per ${name}: ripiego su TMDB discover`);
  const page = await discoverNewOnStreaming(mediaType, [providerId]).catch(() => null);
  const results = (page?.results ?? []).slice(0, CHART_SIZE);
  const out: ChartInput[] = [];
  for (const r of results) {
    if (r.media_type !== mediaType) continue;
    const title = r.media_type === "tv" ? r.name : r.title;
    if (!title) continue;
    // `title_id` esige la riga in `titles`: la scarichiamo prima di scriverla
    const cached = await getOrFetchTitle(r.id, mediaType);
    out.push({
      source: "tmdb",
      providerId,
      mediaType,
      period,
      rank: out.length + 1,
      rawTitle: title,
      rawSeason: null,
      weeksInChart: null,
      titleId: cached ? r.id : null,
    });
  }
  return out;
}

/**
 * I titoli più popolari su un provider in Italia. Ritorna solo quelli con un `tmdbId`
 * che siamo riusciti a mettere in cache: senza la riga in `titles` la chiave esterna
 * di `title_charts` rifiuterebbe l'id.
 */
async function popularOnJustWatch(
  providerId: number,
  mediaType: "movie" | "tv",
): Promise<{ title: string; tmdbId: number }[]> {
  const pkg = JW_PACKAGE[providerId];
  if (!pkg) return [];

  const json = await jwPost<ChartResponse>(
    CHART_QUERY,
    {
      country: JW_QUERY_COUNTRY,
      language: JW_QUERY_LANGUAGE,
      first: CHART_SIZE,
      filter: {
        packages: [pkg],
        objectTypes: [mediaType === "tv" ? "SHOW" : "MOVIE"],
      },
    },
    JW_REVALIDATE_S,
  );

  const out: { title: string; tmdbId: number }[] = [];
  for (const edge of json?.data?.popularTitles?.edges ?? []) {
    const content = edge.node.content;
    const tmdbId = Number(content?.externalIds?.tmdbId);
    if (!content?.title || !Number.isInteger(tmdbId) || tmdbId <= 0) continue;
    const cached = await getOrFetchTitle(tmdbId, mediaType);
    if (!cached) continue;
    out.push({ title: content.title, tmdbId });
  }
  return out;
}
