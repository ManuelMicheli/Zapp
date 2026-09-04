import "server-only";

import { PROVIDERS } from "@/lib/config";
import { createServiceClient } from "@/lib/supabase/server";
import type { Tables } from "@/types/database";
import { getJustWatchOffers } from "./justwatch";

export type LinkSource = "manual" | "justwatch" | "wikidata" | "search";

export interface ResolvedLink {
  url: string;
  source: LinkSource;
}

/** Link diretti (justwatch/wikidata): validi 30 giorni. */
const DIRECT_TTL_MS = 30 * 24 * 60 * 60 * 1000;
/** I link `search` sono un ripiego: si ritentano ogni giorno. */
const SEARCH_RETRY_MS = 24 * 60 * 60 * 1000;
const WIKIDATA_TIMEOUT_MS = 3000;
const WIKIDATA_UA = "Zapp/1.0 (michelimanuel03.mm@gmail.com)";

type LinkRow = Tables<"title_provider_links">;

function ageMs(iso: string): number {
  return Date.now() - new Date(iso).getTime();
}

/** Una riga in cache è ancora buona? `manual` sempre, gli altri per TTL. */
function isUsable(row: LinkRow): boolean {
  const source = row.source as LinkSource;
  if (source === "manual") return true;
  const ttl = source === "search" ? SEARCH_RETRY_MS : DIRECT_TTL_MS;
  return ageMs(row.resolved_at) < ttl;
}

function searchFallback(
  title: Tables<"titles">,
  providerId: number,
): ResolvedLink | null {
  const provider = PROVIDERS[providerId];
  if (!provider) return null;
  return {
    url: provider.searchUrl.replace("{query}", encodeURIComponent(title.title)),
    source: "search",
  };
}

async function resolveViaWikidata(
  title: Tables<"titles">,
  providerId: number,
): Promise<ResolvedLink | null> {
  const provider = PROVIDERS[providerId];
  if (!provider?.wikidataProperty || !provider.titleUrl) return null;

  const externalIds = title.external_ids as { wikidata_id?: string | null } | null;
  const qid = externalIds?.wikidata_id;
  if (!qid) return null;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), WIKIDATA_TIMEOUT_MS);
    console.log(`[links] wikidata fetch ${qid} (${provider.name})`);
    const res = await fetch(
      `https://www.wikidata.org/wiki/Special:EntityData/${qid}.json`,
      {
        headers: { "User-Agent": WIKIDATA_UA, Accept: "application/json" },
        signal: controller.signal,
        next: { revalidate: 86400 },
      },
    );
    clearTimeout(timer);
    if (!res.ok) return null;

    const data = (await res.json()) as {
      entities?: Record<
        string,
        {
          claims?: Record<string, { mainsnak?: { datavalue?: { value?: unknown } } }[]>;
        }
      >;
    };
    const value =
      data.entities?.[qid]?.claims?.[provider.wikidataProperty]?.[0]?.mainsnak?.datavalue
        ?.value;
    if (typeof value !== "string" || value.length === 0) return null;

    return {
      url: provider.titleUrl.replace("{id}", encodeURIComponent(value)),
      source: "wikidata",
    };
  } catch {
    // timeout o errore di rete: si passa al fallback
    return null;
  }
}

/**
 * Risolve i link diretti alla pagina del titolo su più piattaforme in una volta.
 * Cascata per provider: manual (mai sovrascritto) → justwatch (una sola query
 * per titolo, qualunque provider) → wikidata (solo provider configurati) →
 * search (solo provider configurati). I risultati sono persistiti in
 * `title_provider_links` (diretti 30gg, search ritentato ogni giorno).
 * La mappa contiene solo i provider per cui esiste un link.
 */
export async function resolveProviderLinks(
  title: Tables<"titles">,
  providerIds: number[],
): Promise<Map<number, ResolvedLink>> {
  const ids = [...new Set(providerIds)];
  const result = new Map<number, ResolvedLink>();
  if (ids.length === 0) return result;

  const db = createServiceClient();
  const { data: rows } = await db
    .from("title_provider_links")
    .select("*")
    .eq("title_id", title.id)
    .eq("media_type", title.media_type)
    .in("provider_id", ids);

  const pending: number[] = [];
  for (const id of ids) {
    const row = rows?.find((r) => r.provider_id === id);
    if (row && isUsable(row)) {
      result.set(id, { url: row.url, source: row.source as LinkSource });
    } else {
      pending.push(id);
    }
  }
  if (pending.length === 0) return result;

  const offers = await getJustWatchOffers(title);
  const upserts: Tables<"title_provider_links">[] = [];
  const now = new Date().toISOString();

  await Promise.all(
    pending.map(async (id) => {
      const direct = offers.get(id);
      const resolved: ResolvedLink | null = direct
        ? { url: direct, source: "justwatch" }
        : ((await resolveViaWikidata(title, id)) ?? searchFallback(title, id));
      if (!resolved) return;
      result.set(id, resolved);
      upserts.push({
        title_id: title.id,
        media_type: title.media_type,
        provider_id: id,
        url: resolved.url,
        source: resolved.source,
        resolved_at: now,
      });
    }),
  );

  if (upserts.length > 0) {
    const { error } = await db
      .from("title_provider_links")
      .upsert(upserts, { onConflict: "title_id,media_type,provider_id" });
    if (error) console.error("[links] errore upsert:", error);
  }

  return result;
}

/** Variante per un singolo provider (vedi `resolveProviderLinks`). */
export async function resolveProviderLink(
  title: Tables<"titles">,
  providerId: number,
): Promise<ResolvedLink | null> {
  const links = await resolveProviderLinks(title, [providerId]);
  return links.get(providerId) ?? null;
}
