import "server-only";

import { TITLE_CACHE_EPOCH, TITLE_CACHE_TTL_MS } from "@/lib/config";
import { createServiceClient } from "@/lib/supabase/server";
import { extractItProviders, getMovie, getTv } from "./client";
import {
  mapMovieToTitleInsert,
  mapProvidersToInserts,
  mapTvToTitleInsert,
  type TitleRow,
} from "./mappers";
import type { Tables } from "@/types/database";

export type TitleProviderRow = Tables<"title_providers">;

export interface CachedTitle {
  title: TitleRow;
  providers: TitleProviderRow[];
}

function isFresh(fetchedAt: string): boolean {
  return Date.now() - new Date(fetchedAt).getTime() < TITLE_CACHE_TTL_MS;
}

function hasFullDetails(raw: unknown, fetchedAt: string): boolean {
  return (
    typeof raw === "object" &&
    raw !== null &&
    "credits" in (raw as Record<string, unknown>) &&
    new Date(fetchedAt).getTime() >= TITLE_CACHE_EPOCH
  );
}

/**
 * Legge un titolo dalla cache locale; se assente o più vecchio di 7 giorni
 * lo scarica da TMDB e fa upsert di `titles` + `title_providers`.
 * Con `requireFull` rifetcha anche se la riga cache non contiene
 * credits/videos/recommendations (righe salvate prima della Fase 2) o è stata
 * scaricata prima di `TITLE_CACHE_EPOCH` (payload cambiato, es. lingue dei video).
 */
export async function getOrFetchTitle(
  id: number,
  mediaType: "movie" | "tv",
  options: { requireFull?: boolean } = {},
): Promise<CachedTitle | null> {
  const db = createServiceClient();

  const { data: cached } = await db
    .from("titles")
    .select("*")
    .eq("id", id)
    .eq("media_type", mediaType)
    .maybeSingle();

  const cacheUsable =
    cached != null &&
    isFresh(cached.fetched_at) &&
    (!options.requireFull || hasFullDetails(cached.raw, cached.fetched_at));

  if (cached && cacheUsable) {
    const { data: providers } = await db
      .from("title_providers")
      .select("*")
      .eq("title_id", id)
      .eq("media_type", mediaType);
    console.log(`[cache] hit ${mediaType}/${id}`);
    return { title: cached, providers: providers ?? [] };
  }

  try {
    const details = mediaType === "movie" ? await getMovie(id) : await getTv(id);
    const titleInsert =
      mediaType === "movie"
        ? mapMovieToTitleInsert(details as Awaited<ReturnType<typeof getMovie>>)
        : mapTvToTitleInsert(details as Awaited<ReturnType<typeof getTv>>);

    const itProviders = extractItProviders(details["watch/providers"]);
    const providerInserts = mapProvidersToInserts(id, mediaType, itProviders);

    const { data: title, error: titleError } = await db
      .from("titles")
      .upsert(titleInsert, { onConflict: "id,media_type" })
      .select()
      .single();
    if (titleError) throw titleError;

    // Rimuove i provider non più presenti, poi upsert dei correnti
    await db
      .from("title_providers")
      .delete()
      .eq("title_id", id)
      .eq("media_type", mediaType);
    if (providerInserts.length > 0) {
      const { error: provError } = await db
        .from("title_providers")
        .insert(providerInserts);
      if (provError) throw provError;
    }

    return {
      title,
      providers: providerInserts.map((p) => ({
        ...p,
        logo_path: p.logo_path ?? null,
        fetched_at: p.fetched_at ?? new Date().toISOString(),
      })),
    };
  } catch (error) {
    console.error(`[cache] errore fetch ${mediaType}/${id}:`, error);
    // Se TMDB fallisce ma abbiamo una copia stantia, usala
    if (cached) {
      const { data: providers } = await db
        .from("title_providers")
        .select("*")
        .eq("title_id", id)
        .eq("media_type", mediaType);
      return { title: cached, providers: providers ?? [] };
    }
    return null;
  }
}
