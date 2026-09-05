import { createClient } from "@/lib/supabase/server";
import { getViewer } from "@/lib/auth/viewer";
import { PROVIDERS } from "@/lib/config";
import { resolveProviderLinks } from "@/lib/links/resolve";
import { getFriendsData } from "@/lib/social/queries";
import type { CachedTitle } from "@/lib/tmdb/cache";
import { availableSeasons, nextEpisode, type SeasonInfo } from "@/lib/watch/episodes";
import type { EntrySnapshot } from "@/lib/watch/actions";
import { TitleActionsBar, type ContinueLink } from "./TitleActionsBar";

/**
 * Barra azioni della scheda titolo.
 * Server component: risolve i link diretti alle piattaforme (stessa cascata di
 * "Dove guardarlo", deduplicata per render) e legge gli amici dal DB (l'entry
 * utente arriva già da TitleBody), poi delega alla barra client ottimistica.
 */
export async function TitleActions({
  cached,
  entry,
}: {
  cached: CachedTitle;
  entry: EntrySnapshot | null;
}) {
  const { title, providers } = cached;
  const supabase = await createClient();
  const user = await getViewer();
  if (!user) return null;

  const flatrate = providers.filter((p) => p.kind === "flatrate");
  const [links, { friends }] = await Promise.all([
    resolveProviderLinks(
      title,
      flatrate.map((p) => p.provider_id),
    ),
    getFriendsData(),
  ]);

  const seen = new Set<number>();
  const continueLinks: ContinueLink[] = [];
  for (const p of flatrate) {
    if (seen.has(p.provider_id)) continue;
    seen.add(p.provider_id);
    const url =
      links.get(p.provider_id)?.url ??
      PROVIDERS[p.provider_id]?.searchUrl.replace(
        "{query}",
        encodeURIComponent(title.title),
      );
    if (!url) continue;
    continueLinks.push({ providerName: p.provider_name, url });
  }

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
      friends={friends}
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
