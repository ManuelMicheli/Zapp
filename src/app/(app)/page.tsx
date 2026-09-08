import Link from "next/link";
import { Suspense } from "react";
import { CinemaEntry } from "@/components/cinema/CinemaEntry";
import { TonightAtCinema } from "@/components/cinema/TonightAtCinema";
import { DiscoverSkeleton } from "@/components/discover/DiscoverSkeleton";
import { BecauseYouWatched } from "@/components/home/BecauseYouWatched";
import { ComingSoonRow } from "@/components/home/ComingSoonRow";
import { ContinueRow, ContinueRowSkeleton } from "@/components/home/ContinueRow";
import { ForYouShelf } from "@/components/home/ForYouShelf";
import { FriendsSection } from "@/components/home/FriendsSection";
import { HeroScrim } from "@/components/home/HeroScrim";
import { HomeGenres, HomeGenresSkeleton } from "@/components/home/HomeGenres";
import { HomeHero, HomeHeroSkeleton } from "@/components/home/HomeHero";
import {
  HomeTypeGate,
  HomeTypeProvider,
  HomeTypeSwitch,
} from "@/components/home/HomeType";
import { PlatformLauncher } from "@/components/home/PlatformLauncher";
import { PreviewLayer } from "@/components/home/PreviewLayer";
import { TopRatedShelves } from "@/components/home/TopRatedShelves";
import { TopTen, TopTenSkeleton } from "@/components/home/TopTen";
import { WantSection } from "@/components/home/WantSection";
import { PosterWall } from "@/components/marketing/PosterWall";
import { getWallPosters } from "@/lib/tmdb/wall";
import { getHomeData } from "@/lib/watch/queries";
import { getHomeRecommendations } from "@/lib/social/queries";
import { getViewer } from "@/lib/auth/viewer";
import { getTasteProfile } from "@/lib/taste/queries";
import { MASSA_MINIMA } from "@/lib/rank/vector";

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
          <Link href="/search" className={`${PILL} glass-accent text-white`}>
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
  const [{ watching, want, watched }, recommendations, viewer] = await Promise.all([
    getHomeData(),
    getHomeRecommendations(),
    getViewer(),
  ]);
  const empty = watching.length === 0 && want.length === 0 && watched.length === 0;
  const wallPosters = watching.length > 0 ? [] : await getWallPosters();

  /**
   * L'ordine degli scaffali dipende da quanto Zapp sa dell'utente.
   *
   * Con un profilo pieno "Per te" e "Perché hai visto" vengono subito dopo "Continua a
   * guardare": sono le uniche due file che parlano di lui, e metterle decime dopo
   * quattro liste uguali per tutti era il modo più veloce di far sembrare la home un
   * catalogo. Con un profilo povero — un utente al primo giorno — succede il contrario:
   * prima le classifiche, che hanno qualcosa di vero da dire, e i consigli dopo.
   */
  const profilo = viewer ? await getTasteProfile(viewer.id).catch(() => null) : null;
  const profiloRicco = (profilo?.massa ?? 0) >= MASSA_MINIMA;

  return (
    <HomeTypeProvider>
      {/* Su desktop, il mouse fermo su una copertina apre l'anteprima col trailer */}
      <PreviewLayer>
        <main className="pb-16">
          {/* La scelta Tutto / Film / Serie TV vale per tutta la home, non solo per il carosello */}
          <HomeTypeSwitch />

          {/* Filtro per genere subito sotto la testata: fila scorrevole da lg,
            solo la scritta (che apre il foglio) sul telefono */}
          <Suspense fallback={<HomeGenresSkeleton />}>
            <HomeGenres />
          </Suspense>

          {/* Poi le card grandi a scorrimento */}
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
            {/* Il cinema dà solo film: sotto "Serie TV" queste due sezioni spariscono.
              Stanno in testa perché parlano di stasera: il conto alla rovescia per lo
              spettacolo e la programmazione di oggi invecchiano nel giro di ore, gli
              scaffali no. */}
            <HomeTypeGate type={["all", "movie"]}>
              <Suspense fallback={null}>
                <TonightAtCinema />
              </Suspense>
            </HomeTypeGate>

            <HomeTypeGate type={["all", "movie"]}>
              <Suspense fallback={null}>
                <CinemaEntry />
              </Suspense>
            </HomeTypeGate>

            {/* I due scaffali che parlano di te: "Per te" (motore di ranking, con
              l'affinità sulle copertine) e "Perché hai visto X". In testa quando il
              profilo ha qualcosa da dire, più in basso quando non ce l'ha. */}
            {profiloRicco && (
              <>
                <Suspense fallback={<DiscoverSkeleton shelves={1} />}>
                  <ForYouShelf />
                </Suspense>
                {watched.length > 0 && (
                  <Suspense fallback={<DiscoverSkeleton shelves={1} />}>
                    <BecauseYouWatched watched={watched} />
                  </Suspense>
                )}
              </>
            )}

            {/* Classifica settimanale: numeri grandi accanto alle copertine */}
            <Suspense fallback={<TopTenSkeleton />}>
              <TopTen />
            </Suspense>

            {/* Amici: cosa ti hanno consigliato e cosa stanno guardando, in una sezione sola */}
            <Suspense fallback={null}>
              <FriendsSection recommendations={recommendations} />
            </Suspense>

            {/* La tua lista e, sulle stesse pillole, le novità delle piattaforme */}
            <Suspense fallback={<DiscoverSkeleton shelves={1} />}>
              <WantSection want={want} />
            </Suspense>

            {!profiloRicco && (
              <>
                <Suspense fallback={<DiscoverSkeleton shelves={1} />}>
                  <ForYouShelf />
                </Suspense>
                {watched.length > 0 && (
                  <Suspense fallback={<DiscoverSkeleton shelves={1} />}>
                    <BecauseYouWatched watched={watched} />
                  </Suspense>
                )}
              </>
            )}

            {/* La classifica per ZappScore: il nome dice da dove viene il numero */}
            <Suspense fallback={<DiscoverSkeleton shelves={1} />}>
              <TopRatedShelves />
            </Suspense>

            {/* Ultimo scaffale, l'unico che parla di domani: card larghe con la data */}
            <Suspense fallback={null}>
              <ComingSoonRow />
            </Suspense>
          </div>
        </main>
      </PreviewLayer>
    </HomeTypeProvider>
  );
}
