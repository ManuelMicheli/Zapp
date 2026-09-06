import Link from "next/link";
import { Suspense } from "react";
import { PosterCard } from "@/components/ui/PosterCard";
import { CinemaEntry } from "@/components/cinema/CinemaEntry";
import { TonightAtCinema } from "@/components/cinema/TonightAtCinema";
import { DiscoverSections } from "@/components/discover/DiscoverSections";
import { DiscoverSkeleton } from "@/components/discover/DiscoverSkeleton";
import { HorizontalShelf } from "@/components/discover/HorizontalShelf";
import { ContinueRow, ContinueRowSkeleton } from "@/components/home/ContinueRow";
import { HeroScrim } from "@/components/home/HeroScrim";
import { HomeHero, HomeHeroSkeleton } from "@/components/home/HomeHero";
import { PlatformLauncher } from "@/components/home/PlatformLauncher";
import { PosterWall } from "@/components/marketing/PosterWall";
import { getWallPosters } from "@/lib/tmdb/wall";
import { getHomeData, type EntryWithTitle } from "@/lib/watch/queries";
import { getHomeRecommendations } from "@/lib/social/queries";
import { RecommendationsSection } from "@/components/home/RecommendationsSection";

function providerBadges(entry: EntryWithTitle) {
  const title = entry.title;
  if (!title) return [];
  const seen = new Set<number>();
  return title.title_providers
    .filter((p) => p.kind === "flatrate")
    .filter((p) => (seen.has(p.provider_id) ? false : (seen.add(p.provider_id), true)))
    .map((p) => ({ id: p.provider_id, name: p.provider_name, logoPath: p.logo_path }));
}

/** Fila di tessere vuote mentre arrivano i loghi delle piattaforme. */
function LauncherSkeleton() {
  return (
    <div className="mt-6 flex gap-3 overflow-hidden">
      {Array.from({ length: 5 }, (_, i) => (
        <div key={i} className="flex w-[76px] shrink-0 flex-col items-center gap-2">
          <div className="size-[64px] rounded-[20px] bg-white/[0.08]" />
          <div className="h-3 w-12 rounded-full bg-white/[0.06]" />
        </div>
      ))}
    </div>
  );
}

const PILL =
  "inline-flex h-11 items-center justify-center gap-2 rounded-full px-5 text-[15px] font-semibold transition-colors";

/**
 * Blocco quando non c'è nulla in corso: muro di locandine dietro, davanti l'accesso
 * rapido alle piattaforme. Sta sotto il carosello in testa, quindi niente quota nav.
 */
function EmptyHero({ posters }: { posters: string[] }) {
  return (
    <section className="relative overflow-hidden">
      <div className="absolute inset-0 overflow-hidden">
        <PosterWall
          posters={posters}
          height={760}
          blur={10}
          opacity={0.45}
          speed="slow"
          className="lg:hidden"
        />
        {/* Desktop: il muro copre tutta la larghezza del contenuto */}
        <PosterWall
          posters={posters}
          columns={20}
          width="calc(100% + 140px)"
          height={760}
          blur={10}
          opacity={0.45}
          speed="slow"
          className="hidden lg:block"
        />
        <HeroScrim />
      </div>

      <div className="relative px-5 pb-8 pt-10 text-center lg:px-10 lg:pb-12">
        <p className="text-[13px] font-medium text-accent-soft">Le tue piattaforme</p>
        <h1 className="mt-2 text-[34px] font-bold leading-none tracking-[-0.045em] lg:text-[48px]">
          Cosa guardi stasera?
        </h1>
        <p className="mx-auto mt-3 max-w-[420px] text-pretty text-[15px] text-white/70">
          Apri una piattaforma con un tocco, oppure cerca un titolo e tienine traccia qui.
        </p>

        <Suspense fallback={<LauncherSkeleton />}>
          <PlatformLauncher className="mt-6" />
        </Suspense>

        <div className="mt-7 flex flex-wrap justify-center gap-2.5">
          <Link
            href="/search"
            className={`${PILL} bg-accent text-white shadow-[var(--shadow-accent)] hover:bg-accent-strong`}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.8}
              strokeLinecap="round"
              aria-hidden="true"
            >
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3.5-3.5" />
            </svg>
            Cerca un titolo
          </Link>
          <Link href="/import/netflix" className={`${PILL} glass hover:bg-white/[0.16]`}>
            Importa da Netflix
          </Link>
        </div>
      </div>
    </section>
  );
}

export default async function HomePage() {
  const [{ watching, want, watched }, recommendations] = await Promise.all([
    getHomeData(),
    getHomeRecommendations(),
  ]);
  const empty = watching.length === 0 && want.length === 0 && watched.length === 0;
  const wallPosters = watching.length > 0 ? [] : await getWallPosters();

  return (
    <main className="pb-16">
      {/* Prima cosa in alto: titolo, Film / Serie TV e le card grandi a scorrimento */}
      <Suspense fallback={<HomeHeroSkeleton />}>
        <HomeHero />
      </Suspense>

      {watching.length > 0 ? (
        <div className="mt-8">
          {/* Cosa stai guardando e devi riprendere: fotogramma dell'episodio successivo */}
          <Suspense fallback={<ContinueRowSkeleton />}>
            <ContinueRow entries={watching} />
          </Suspense>
        </div>
      ) : (
        <div className="mt-8">
          <EmptyHero posters={wallPosters} />
        </div>
      )}

      <div className={`${empty ? "mt-2" : "mt-8"} space-y-8`}>
        <Suspense fallback={null}>
          <TonightAtCinema />
        </Suspense>

        {/* ingresso alla sezione cinema: sempre visibile, sopra gli scaffali */}
        <Suspense fallback={null}>
          <CinemaEntry />
        </Suspense>

        {empty ? (
          <RecommendationsSection items={recommendations} />
        ) : (
          <>
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

        {/* Scaffali Scopri (TMDB): novità, popolari, più amati, per genere */}
        <Suspense fallback={<DiscoverSkeleton shelves={3} />}>
          <DiscoverSections />
        </Suspense>
      </div>
    </main>
  );
}
