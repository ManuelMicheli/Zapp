import { createClient } from "@/lib/supabase/server";
import { PROVIDERS } from "@/lib/config";
import type { CachedTitle } from "@/lib/tmdb/cache";
import { availableSeasons, nextEpisode, type SeasonInfo } from "@/lib/watch/episodes";
import type { EntrySnapshot } from "@/lib/watch/actions";
import { TitleActionsBar, type ContinueLink } from "./TitleActionsBar";

/**
 * Barra azioni della scheda titolo (Fase 3).
 * Server component: legge entry utente e link provider dal DB, nessuna
 * chiamata esterna, poi delega alla barra client ottimistica.
 */
export async function TitleActions({ cached }: { cached: CachedTitle }) {
  const { title, providers } = cached;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const [{ data: entryRow }, { data: linkRows }] = await Promise.all([
    supabase
      .from("watch_entries")
      .select("*")
      .eq("user_id", user.id)
      .eq("title_id", title.id)
      .eq("media_type", title.media_type)
      .maybeSingle(),
    supabase
      .from("title_provider_links")
      .select("provider_id, url")
      .eq("title_id", title.id)
      .eq("media_type", title.media_type),
  ]);

  const linkByProvider = new Map((linkRows ?? []).map((l) => [l.provider_id, l.url]));
  const seen = new Set<number>();
  const continueLinks: ContinueLink[] = [];
  for (const p of providers.filter((p) => p.kind === "flatrate")) {
    if (seen.has(p.provider_id)) continue;
    seen.add(p.provider_id);
    const config = PROVIDERS[p.provider_id];
    if (!config) continue;
    const url =
      linkByProvider.get(p.provider_id) ??
      config.searchUrl.replace("{query}", encodeURIComponent(title.title));
    continueLinks.push({ providerName: p.provider_name, url });
  }

  const entry: EntrySnapshot | null = entryRow
    ? {
        status: entryRow.status,
        rating: entryRow.rating,
        season_number: entryRow.season_number,
        episode_number: entryRow.episode_number,
        is_private: entryRow.is_private,
        started_at: entryRow.started_at,
        finished_at: entryRow.finished_at,
      }
    : null;

  const seasons: SeasonInfo[] =
    title.media_type === "tv" ? availableSeasons(title.raw) : [];
  const next =
    entry?.season_number != null && entry.episode_number != null
      ? nextEpisode(seasons, entry.season_number, entry.episode_number)
      : seasons.length > 0
        ? { season: seasons[0].season, episode: 1 }
        : null;

  return (
    <TitleActionsBar
      titleId={title.id}
      mediaType={title.media_type}
      titleName={title.title}
      initialEntry={entry}
      continueLinks={continueLinks}
      isSeries={title.media_type === "tv"}
      nextEpisodeLabel={
        next && entry?.season_number != null
          ? `S${entry.season_number}E${entry.episode_number} → S${next.season}E${next.episode}`
          : next
            ? `S${next.season}E${next.episode}`
            : null
      }
    />
  );
}
