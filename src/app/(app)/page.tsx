import Link from "next/link";
import { TopBar } from "@/components/layout/TopBar";
import { EmptyState } from "@/components/ui/EmptyState";
import { PosterCard } from "@/components/ui/PosterCard";
import { HorizontalShelf } from "@/components/discover/HorizontalShelf";
import { WatchingCard } from "@/components/home/WatchingCard";
import { PROVIDERS, posterUrl, providerLogoUrl } from "@/lib/config";
import { getHomeData, type EntryWithTitle } from "@/lib/watch/queries";
import { getHomeRecommendations } from "@/lib/social/queries";
import { RecommendationsSection } from "@/components/home/RecommendationsSection";
import { NotificationsBell } from "@/components/social/NotificationsBell";
import {
  availableSeasons,
  episodesWatched,
  totalEpisodes,
} from "@/lib/watch/episodes";

/** Primo provider flatrate configurato: logo + link diretto dal DB (o ricerca). */
function continueInfo(entry: EntryWithTitle) {
  const title = entry.title;
  if (!title) return { logo: null, name: null, url: null };
  const flatrate = title.title_providers.filter((p) => p.kind === "flatrate");
  const links = new Map(title.title_provider_links.map((l) => [l.provider_id, l.url]));
  for (const p of flatrate) {
    const config = PROVIDERS[p.provider_id];
    if (!config) continue;
    const url =
      links.get(p.provider_id) ??
      config.searchUrl.replace("{query}", encodeURIComponent(title.title));
    return { logo: providerLogoUrl(p.logo_path), name: p.provider_name, url };
  }
  const first = flatrate[0];
  return first
    ? { logo: providerLogoUrl(first.logo_path), name: first.provider_name, url: null }
    : { logo: null, name: null, url: null };
}

function providerBadges(entry: EntryWithTitle) {
  const title = entry.title;
  if (!title) return [];
  const seen = new Set<number>();
  return title.title_providers
    .filter((p) => p.kind === "flatrate")
    .filter((p) => (seen.has(p.provider_id) ? false : (seen.add(p.provider_id), true)))
    .map((p) => ({ id: p.provider_id, name: p.provider_name, logoPath: p.logo_path }));
}

export default async function HomePage() {
  const [{ watching, want, watched }, recommendations] = await Promise.all([
    getHomeData(),
    getHomeRecommendations(),
  ]);
  const empty = watching.length === 0 && want.length === 0 && watched.length === 0;

  return (
    <>
      <TopBar title="Zapp" action={<NotificationsBell />} />
      <main className="pb-28">
        {empty && recommendations.length > 0 && (
          <div className="mb-6">
            <RecommendationsSection items={recommendations} />
          </div>
        )}
        {empty ? (
          <div className="px-4">
            <EmptyState
              title="Non stai guardando nulla"
              description="Cerca un titolo per iniziare, o importa il tuo storico Netflix."
              action={
                <div className="flex gap-2">
                  <Link
                    href="/search"
                    className="rounded-xl bg-accent px-5 py-2.5 text-sm font-semibold text-white"
                  >
                    Cerca un titolo
                  </Link>
                  <Link
                    href="/import/netflix"
                    className="rounded-xl border border-border bg-surface px-5 py-2.5 text-sm font-semibold"
                  >
                    Importa da Netflix
                  </Link>
                </div>
              }
            />
          </div>
        ) : (
          <div className="space-y-8">
            {watching.length > 0 && (
              <section>
                <h2 className="mb-2 px-4 text-base font-bold">Continua a guardare</h2>
                <div className="scrollbar-none flex gap-3 overflow-x-auto px-4 pb-1">
                  {watching.map((entry) => {
                    const info = continueInfo(entry);
                    let progressLabel: string | null = null;
                    let progressPct: number | null = null;
                    if (entry.media_type === "tv" && entry.title) {
                      const seasons = availableSeasons(entry.title.raw);
                      if (entry.season_number != null && entry.episode_number != null) {
                        progressLabel = `S${entry.season_number}E${entry.episode_number}`;
                        const total = totalEpisodes(seasons);
                        if (total > 0) {
                          progressPct =
                            episodesWatched(
                              seasons,
                              entry.season_number,
                              entry.episode_number,
                            ) / total;
                        }
                      }
                    }
                    return (
                      <WatchingCard
                        key={entry.id}
                        titleId={entry.title_id}
                        mediaType={entry.media_type}
                        name={entry.title?.title ?? ""}
                        posterUrl={posterUrl(entry.title?.poster_path ?? null, "w342")}
                        providerLogoUrl={info.logo}
                        providerName={info.name}
                        continueUrl={info.url}
                        progressLabel={progressLabel}
                        progressPct={progressPct}
                      />
                    );
                  })}
                </div>
              </section>
            )}

            {/* Consigliati da amici, sopra "Da vedere" */}
            <RecommendationsSection items={recommendations} />

            {want.length > 0 && (
              <HorizontalShelf title="Da vedere" seeAllHref="/library?status=want">
                {want.map((entry) => (
                  <PosterCard
                    key={entry.id}
                    className="w-28 shrink-0"
                    title={entry.title?.title ?? ""}
                    posterPath={entry.title?.poster_path ?? null}
                    providers={providerBadges(entry)}
                    href={`/title/${entry.media_type}/${entry.title_id}`}
                  />
                ))}
              </HorizontalShelf>
            )}

            {watched.length > 0 && (
              <HorizontalShelf title="Visti di recente" seeAllHref="/library?status=watched">
                {watched.map((entry) => (
                  <PosterCard
                    key={entry.id}
                    className="w-28 shrink-0"
                    title={
                      entry.rating != null
                        ? `★ ${entry.rating} · ${entry.title?.title ?? ""}`
                        : (entry.title?.title ?? "")
                    }
                    posterPath={entry.title?.poster_path ?? null}
                    href={`/title/${entry.media_type}/${entry.title_id}`}
                  />
                ))}
              </HorizontalShelf>
            )}
          </div>
        )}
      </main>
    </>
  );
}
