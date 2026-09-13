import { getViewer } from "@/lib/auth/viewer";
import { PROVIDERS } from "@/lib/config";
import { resolveProviderLinks } from "@/lib/links/resolve";
import { getFriendsData } from "@/lib/social/queries";
import { getMyLists } from "@/lib/lists/queries";
import type { CachedTitle } from "@/lib/tmdb/cache";
import { availableSeasons, nextEpisode, type SeasonInfo } from "@/lib/watch/episodes";
import type { EntrySnapshot } from "@/lib/watch/actions";
import { createServiceClient } from "@/lib/supabase/server";
import { tvCollegate } from "@/lib/devices/queries";
import { formaDiLancio, PROVIDER_LANCIABILI } from "@/lib/devices/launch";
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
  const user = await getViewer();
  if (!user) return null;

  const flatrate = providers.filter((p) => p.kind === "flatrate");
  const [links, { friends }, lists, tv] = await Promise.all([
    resolveProviderLinks(
      title,
      flatrate.map((p) => p.provider_id),
    ),
    getFriendsData(),
    getMyLists(),
    tvCollegate(),
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
    continueLinks.push({
      providerName: p.provider_name,
      providerId: p.provider_id,
      url,
    });
  }

  const seasons: SeasonInfo[] =
    title.media_type === "tv" ? availableSeasons(title.raw) : [];
  const next =
    entry?.season_number != null && entry.episode_number != null
      ? nextEpisode(seasons, entry.season_number, entry.episode_number)
      : seasons.length > 0
        ? { season: seasons[0].season, episode: 1 }
        : null;

  // Verifica se il lancio sulla TV è possibile: serve una TV collegata e un link
  // valido per una piattaforma lanciabile.
  let tvLanciabile = false;
  let tvPerIlLancio: { id: string; name: string }[] = [];
  let providerIdPerTv = 0;

  if (tv.length > 0) {
    // Identifica i provider lanciabili fra quelli disponibili per questo titolo.
    //
    // Si guarda l'**elenco** delle piattaforme lanciabili, non `formaDiLancio`
    // con un link nullo: quella funzione, senza link, non puo' che rispondere
    // "no" per Netflix, Prime e Disney+ — a tutte e tre serve un id preso
    // dall'URL. Chiedendoglielo qui, l'unica piattaforma che passava era NOW
    // (l'unica che non voleva un link), e quindi sulla scheda il bottone
    // compariva **solo** sui titoli che stanno anche su NOW, mai su un titolo
    // Netflix. Il guasto e' rimasto nascosto finche' NOW e' stata lanciabile.
    // Qui si fa una cernita grossolana per sapere quali link chiedere al
    // database; a decidere davvero e' il ciclo qui sotto, che i link ce li ha.
    const providerLanciabili = flatrate
      .filter((p) => PROVIDER_LANCIABILI.includes(p.provider_id))
      .map((p) => p.provider_id);

    if (providerLanciabili.length > 0) {
      // Una query sola per tutti i provider lanciabili, poi scegli in memoria
      const service = await createServiceClient();
      const { data: links } = await service
        .from("title_provider_links")
        .select("provider_id, url")
        .eq("title_id", title.id)
        .eq("media_type", title.media_type)
        .in("provider_id", providerLanciabili);

      // Cerca il primo provider lanciabile con un link valido (ordine flatrate)
      for (const provider of flatrate) {
        if (!providerLanciabili.includes(provider.provider_id)) continue;
        const link = links?.find((l) => l.provider_id === provider.provider_id);
        if (formaDiLancio(provider.provider_id, link?.url ?? null)) {
          tvLanciabile = true;
          tvPerIlLancio = tv;
          providerIdPerTv = provider.provider_id;
          break;
        }
      }
    }
  }

  return (
    <TitleActionsBar
      titleId={title.id}
      mediaType={title.media_type}
      titleName={title.title}
      initialEntry={entry}
      continueLinks={continueLinks}
      isSeries={title.media_type === "tv"}
      friends={friends}
      lists={lists}
      tv={tvLanciabile ? tvPerIlLancio : []}
      providerId={tvLanciabile ? providerIdPerTv : 0}
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
