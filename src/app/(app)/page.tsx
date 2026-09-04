import Link from "next/link";
import { EmptyState } from "@/components/ui/EmptyState";
import { PosterCard } from "@/components/ui/PosterCard";
import { HorizontalShelf } from "@/components/discover/HorizontalShelf";
import { HeroScrim, HeroWatching } from "@/components/home/HeroWatching";
import { WatchingCard } from "@/components/home/WatchingCard";
import { PosterWall } from "@/components/marketing/PosterWall";
import { PROVIDERS, posterUrl, providerLogoUrl } from "@/lib/config";
import { getWallPosters } from "@/lib/tmdb/wall";
import { getHomeData, type EntryWithTitle } from "@/lib/watch/queries";
import { getHomeRecommendations } from "@/lib/social/queries";
import { RecommendationsSection } from "@/components/home/RecommendationsSection";
import { availableSeasons, episodesWatched, totalEpisodes } from "@/lib/watch/episodes";

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

/** Avanzamento di una serie: etichetta breve, estesa e frazione di episodi visti. */
function progressOf(entry: EntryWithTitle) {
  const empty = { short: null, long: null, pct: null };
  if (entry.media_type !== "tv" || !entry.title) return empty;
  const season = entry.season_number;
  const episode = entry.episode_number;
  if (season == null || episode == null) return empty;
  const seasons = availableSeasons(entry.title.raw);
  const total = totalEpisodes(seasons);
  return {
    short: `S${season} E${episode}`,
    long: `Stagione ${season}, episodio ${episode}`,
    pct: total > 0 ? episodesWatched(seasons, season, episode) / total : null,
  };
}

/** Muro di locandine al posto dell'hero quando non c'è nulla in corso. */
function WallHero({ posters }: { posters: string[] }) {
  return (
    <div className="relative h-[420px] overflow-hidden lg:h-[520px]">
      <PosterWall posters={posters} height={700} blur={10} opacity={0.45} speed="slow" />
      <HeroScrim />
    </div>
  );
}

const CTA_BASE =
  "inline-flex h-[54px] items-center justify-center rounded-full px-6 text-[17px] font-semibold transition-colors";

export default async function HomePage() {
  const [{ watching, want, watched }, recommendations] = await Promise.all([
    getHomeData(),
    getHomeRecommendations(),
  ]);
  const empty = watching.length === 0 && want.length === 0 && watched.length === 0;
  const hero = watching[0];
  const rest = watching.slice(1);
  const wallPosters = hero ? [] : await getWallPosters();
  const heroProgress = hero ? progressOf(hero) : null;

  return (
    <main className="pb-36">
      {hero && heroProgress ? (
        <HeroWatching
          entry={hero}
          info={continueInfo(hero)}
          progressLabel={heroProgress.long}
          progressPct={heroProgress.pct}
          isSeries={hero.media_type === "tv"}
        />
      ) : (
        <WallHero posters={wallPosters} />
      )}

      <div className="mt-8 space-y-8">
        {empty ? (
          <>
            <RecommendationsSection items={recommendations} />
            <div className="px-5 lg:px-10">
              <EmptyState
                title="Non stai guardando nulla"
                description="Cerca un titolo per iniziare, o importa il tuo storico Netflix."
                action={
                  <div className="flex flex-col gap-2.5">
                    <Link
                      href="/search"
                      className={`${CTA_BASE} bg-accent text-white shadow-[var(--shadow-accent)] hover:bg-accent-strong`}
                    >
                      Cerca un titolo
                    </Link>
                    <Link href="/import/netflix" className={`${CTA_BASE} glass`}>
                      Importa da Netflix
                    </Link>
                  </div>
                }
              />
            </div>
          </>
        ) : (
          <>
            {rest.length > 0 && (
              <HorizontalShelf title="In corso" seeAllHref="/library?status=watching">
                {rest.map((entry) => {
                  const info = continueInfo(entry);
                  const progress = progressOf(entry);
                  return (
                    <WatchingCard
                      key={entry.id}
                      titleId={entry.title_id}
                      mediaType={entry.media_type}
                      name={entry.title?.title ?? ""}
                      posterUrl={posterUrl(entry.title?.poster_path ?? null, "w342")}
                      providerLogoUrl={info.logo}
                      providerName={info.name}
                      progressLabel={progress.short}
                      progressPct={progress.pct}
                    />
                  );
                })}
              </HorizontalShelf>
            )}

            {/* Consigliati da amici, sopra "Da vedere" */}
            <RecommendationsSection items={recommendations} />

            {want.length > 0 && (
              <HorizontalShelf title="Da vedere" seeAllHref="/library?status=want">
                {want.map((entry) => (
                  <PosterCard
                    key={entry.id}
                    className="w-28 shrink-0 lg:w-[140px]"
                    title={entry.title?.title ?? ""}
                    posterPath={entry.title?.poster_path ?? null}
                    providers={providerBadges(entry)}
                    href={`/title/${entry.media_type}/${entry.title_id}`}
                  />
                ))}
              </HorizontalShelf>
            )}

            {watched.length > 0 && (
              <HorizontalShelf
                title="Visti di recente"
                seeAllHref="/library?status=watched"
              >
                {watched.map((entry) => (
                  <PosterCard
                    key={entry.id}
                    className="w-28 shrink-0 lg:w-[140px]"
                    title={entry.title?.title ?? ""}
                    posterPath={entry.title?.poster_path ?? null}
                    rating={entry.rating}
                    showNoRating
                    href={`/title/${entry.media_type}/${entry.title_id}`}
                  />
                ))}
              </HorizontalShelf>
            )}
          </>
        )}
      </div>
    </main>
  );
}
