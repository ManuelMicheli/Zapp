import "server-only";

import { PROVIDERS } from "@/lib/config";
import { createServiceClient } from "@/lib/supabase/server";
import type { Tables } from "@/types/database";

export type LinkSource = "manual" | "wikidata" | "search";

export interface ResolvedLink {
  url: string;
  source: LinkSource;
}

const WIKIDATA_TTL_MS = 30 * 24 * 60 * 60 * 1000;
/** I link `search` si ritentano prima: Wikidata potrebbe essere stato aggiornato. */
const SEARCH_RETRY_MS = 7 * 24 * 60 * 60 * 1000;
const WIKIDATA_TIMEOUT_MS = 3000;
const WIKIDATA_UA = "Zapp/1.0 (michelimanuel03.mm@gmail.com)";

function ageMs(iso: string): number {
  return Date.now() - new Date(iso).getTime();
}

function searchFallback(title: Tables<"titles">, providerId: number): ResolvedLink | null {
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
          claims?: Record<
            string,
            { mainsnak?: { datavalue?: { value?: unknown } } }[]
          >;
        }
      >;
    };
    const value =
      data.entities?.[qid]?.claims?.[provider.wikidataProperty]?.[0]?.mainsnak
        ?.datavalue?.value;
    if (typeof value !== "string" || value.length === 0) return null;

    return {
      url: provider.titleUrl.replace("{id}", encodeURIComponent(value)),
      source: "wikidata",
    };
  } catch {
    // timeout o errore di rete: si passa al fallback search
    return null;
  }
}

/**
 * Risolve il link diretto alla pagina del titolo su una piattaforma.
 * Cascata: manual (mai sovrascritto) → wikidata → search (non fallisce mai
 * per i provider configurati). Il risultato è persistito in
 * `title_provider_links` con TTL 30gg (search ritentato a 7gg).
 * Ritorna null solo per provider non presenti in PROVIDERS.
 */
export async function resolveProviderLink(
  title: Tables<"titles">,
  providerId: number,
): Promise<ResolvedLink | null> {
  if (!PROVIDERS[providerId]) return null;

  const db = createServiceClient();
  const { data: existing } = await db
    .from("title_provider_links")
    .select("*")
    .eq("title_id", title.id)
    .eq("media_type", title.media_type)
    .eq("provider_id", providerId)
    .maybeSingle();

  if (existing) {
    const source = existing.source as LinkSource;
    if (source === "manual") {
      return { url: existing.url, source };
    }
    const age = ageMs(existing.resolved_at);
    const ttl = source === "wikidata" ? WIKIDATA_TTL_MS : SEARCH_RETRY_MS;
    if (age < ttl) {
      return { url: existing.url, source };
    }
  }

  const resolved =
    (await resolveViaWikidata(title, providerId)) ??
    searchFallback(title, providerId);
  if (!resolved) return null;

  const { error } = await db.from("title_provider_links").upsert(
    {
      title_id: title.id,
      media_type: title.media_type,
      provider_id: providerId,
      url: resolved.url,
      source: resolved.source,
      resolved_at: new Date().toISOString(),
    },
    { onConflict: "title_id,media_type,provider_id" },
  );
  if (error) {
    console.error("[links] errore upsert:", error);
  }

  return resolved;
}
