import Link from "next/link";
import { Suspense } from "react";
import { CinemaEntry } from "@/components/cinema/CinemaEntry";
import { TonightAtCinema } from "@/components/cinema/TonightAtCinema";
import { DiscoverSkeleton } from "@/components/discover/DiscoverSkeleton";
import { BecauseYouWatched } from "@/components/home/BecauseYouWatched";
import { ComingSoonRow } from "@/components/home/ComingSoonRow";
import { SagaShelf } from "@/components/sagas/SagaShelf";
import { ShortsShelf } from "@/components/shorts/ShortsShelf";
import { ContinueRow, ContinueRowSkeleton } from "@/components/home/ContinueRow";
import { ForYouShelf } from "@/components/home/ForYouShelf";
import { FriendsSection } from "@/components/home/FriendsSection";
import { HeroScrim } from "@/components/home/HeroScrim";
import { HomeGenres, HomeGenresSkeleton } from "@/components/home/HomeGenres";
import { HomePlatforms, HomePlatformsSkeleton } from "@/components/home/HomePlatforms";
import { HomeHero, HomeHeroSkeleton } from "@/components/home/HomeHero";
import { HomeTitle, HomeTypeGate, HomeTypeProvider } from "@/components/home/HomeType";
import { PlatformLauncher } from "@/components/home/PlatformLauncher";
import { PersonalRails } from "@/components/home/PersonalRails";
import { PreviewLayer } from "@/components/home/PreviewLayer";
import { RefreshOnFocus } from "@/components/home/RefreshOnFocus";
import { WatchingProvider } from "@/components/home/WatchingProvider";
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
import {
  HOME_SCOPE_VUOTO,
  scopeTitle,
  scopeVuoto,
  type HomeScope,
} from "@/lib/home/scope";

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
          <Link href="/import" className={`${PILL} glass hover:bg-white/[0.16]`}>
            Importa i tuoi dati
          </Link>
        </div>
      </div>
    </section>
  );
}

/**
 * Il muro della home vuota. Sta dietro un `Suspense` perché `getWallPosters()` parla
 * con TMDB (quattro liste): tenerlo nel corpo della pagina significava che il primo
 * utente — quello che non ha ancora niente in libreria, cioè quello a cui la home deve
 * fare la prima impressione — aspettava quelle chiamate prima di vedere *qualunque*
 * pezzo di HTML. Ora la pagina esce subito e le locandine arrivano dopo.
 */
async function EmptyHeroSection() {
  return <EmptyHero posters={await getWallPosters()} />;
}

type HomeData = Awaited<ReturnType<typeof getHomeData>>;
type TasteProfile = Awaited<ReturnType<typeof getTasteProfile>> | null;

async function FriendsHomeSection({ scope }: { scope: HomeScope }) {
  return (
    <FriendsSection recommendations={await getHomeRecommendations()} scope={scope} />
  );
}

async function HomeSections({
  homeData,
  tasteProfile,
  scope,
}: {
  homeData: Promise<HomeData>;
  tasteProfile: Promise<TasteProfile>;
  scope: HomeScope;
}) {
  const [{ watching, want, watched }, profilo] = await Promise.all([
    homeData,
    tasteProfile,
  ]);
  const empty = watching.length === 0 && want.length === 0 && watched.length === 0;
  // Nella home filtrata non c'è cinema (non è una piattaforma né un genere), non ci sono
  // le saghe (un catalogo intero) e non c'è il blocco della home vuota: se nell'ambito
  // non c'è niente in corso, la fila non compare e basta.
  const intera = scopeVuoto(scope);

  /**
   * L'ordine degli scaffali dipende da quanto Zapp sa dell'utente.
   *
   * Con un profilo pieno "Per te" e "Perché hai visto" vengono subito dopo "Continua a
   * guardare": sono le uniche due file che parlano di lui, e metterle decime dopo
   * quattro liste uguali per tutti era il modo più veloce di far sembrare la home un
   * catalogo. Con un profilo povero — un utente al primo giorno — succede il contrario:
   * prima le classifiche, che hanno qualcosa di vero da dire, e i consigli dopo.
   */
  const profiloRicco = (profilo?.massa ?? 0) >= MASSA_MINIMA;

  return (
    <>
      {watching.length > 0 ? (
        <div className="mt-8">
          {/* Cosa stai guardando e devi riprendere: fotogramma dell'episodio successivo */}
          <Suspense fallback={<ContinueRowSkeleton />}>
            <ContinueRow entries={watching} scope={scope} />
          </Suspense>
        </div>
      ) : intera ? (
        <div className="mt-8">
          <Suspense fallback={<EmptyHero posters={[]} />}>
            <EmptyHeroSection />
          </Suspense>
        </div>
      ) : null}

      <div className={`${empty && intera ? "mt-2" : "mt-8"} space-y-8`}>
        {/* Il cinema dà solo film: sotto "Serie TV" queste due sezioni spariscono.
              Stanno in testa perché parlano di stasera: il conto alla rovescia per lo
              spettacolo e la programmazione di oggi invecchiano nel giro di ore, gli
              scaffali no. */}
        {intera && (
          <HomeTypeGate type={["all", "movie"]}>
            <Suspense fallback={null}>
              <TonightAtCinema />
            </Suspense>
          </HomeTypeGate>
        )}

        {intera && (
          <HomeTypeGate type={["all", "movie"]}>
            <Suspense fallback={null}>
              <CinemaEntry />
            </Suspense>
          </HomeTypeGate>
        )}

        {/* I due scaffali che parlano di te: "Per te" (motore di ranking, con
              l'affinità sulle copertine) e "Perché hai visto X". In testa quando il
              profilo ha qualcosa da dire, più in basso quando non ce l'ha. */}
        {profiloRicco && (
          <>
            <Suspense fallback={<DiscoverSkeleton shelves={1} />}>
              <ForYouShelf scope={scope} />
            </Suspense>

            {intera && <SagaShelf />}
            {/* I corti stanno accanto alle saghe: due scaffali di catalogo curato,
                nessuno dei due dipende da cosa hai visto. Sono dentro un Suspense
                perche' leggono lo stato dei corti dell'utente. */}
            {intera && (
              <Suspense fallback={<DiscoverSkeleton shelves={1} />}>
                <ShortsShelf />
              </Suspense>
            )}
            {/* "Ancora con X" dice qualcosa che l'utente non sapeva di aver detto:
                  resta accanto a "Per te". Dal 2026-09-15 e' l'**unico** rail: "Perche'
                  ami la fantascienza" ripeteva le pillole "Per genere" che stanno in
                  cima a questa stessa pagina, e "Il meglio degli anni 2000" era il meno
                  specifico di tutti. Meno file, ma ognuna dice qualcosa. */}
            <Suspense fallback={<DiscoverSkeleton shelves={1} />}>
              <PersonalRails dimensioni={["persone"]} scope={scope} />
            </Suspense>
            {watched.length > 0 && (
              <Suspense fallback={<DiscoverSkeleton shelves={1} />}>
                <BecauseYouWatched watched={watched} scope={scope} />
              </Suspense>
            )}
          </>
        )}

        {/* Classifica settimanale: numeri grandi accanto alle copertine */}
        <Suspense fallback={<TopTenSkeleton />}>
          <TopTen scope={scope} />
        </Suspense>

        {/* Amici: cosa ti hanno consigliato e cosa stanno guardando, in una sezione sola */}
        <Suspense fallback={null}>
          <FriendsHomeSection scope={scope} />
        </Suspense>

        {/* La tua lista e, sulle stesse pillole, le novità delle piattaforme */}
        <Suspense fallback={<DiscoverSkeleton shelves={1} />}>
          <WantSection want={want} scope={scope} />
        </Suspense>

        {!profiloRicco && (
          <>
            <Suspense fallback={<DiscoverSkeleton shelves={1} />}>
              <ForYouShelf scope={scope} />
            </Suspense>

            {intera && <SagaShelf />}
            {intera && (
              <Suspense fallback={<DiscoverSkeleton shelves={1} />}>
                <ShortsShelf />
              </Suspense>
            )}
            {watched.length > 0 && (
              <Suspense fallback={<DiscoverSkeleton shelves={1} />}>
                <BecauseYouWatched watched={watched} scope={scope} />
              </Suspense>
            )}
          </>
        )}

        {/* La classifica per ZappScore: il nome dice da dove viene il numero */}
        <Suspense fallback={<DiscoverSkeleton shelves={1} />}>
          <TopRatedShelves scope={scope} />
        </Suspense>

        {/* Ultimo scaffale, l'unico che parla di domani: card larghe con la data */}
        <Suspense fallback={null}>
          <ComingSoonRow scope={scope} />
        </Suspense>
      </div>
    </>
  );
}

/**
 * La home, intera o filtrata. `scope` è l'ambito (`src/lib/home/scope.ts`): senza
 * filtri è la home di sempre; con un genere e/o una piattaforma è **la stessa pagina**
 * — stesse sezioni, stesso ordine, stesso motore — ristretta a quell'ambito, con le
 * pillole in testa che segnano cosa è scelto. La rotta `/` la rende vuota, la rotta
 * `/home/[...filtri]` con l'ambito letto dal percorso.
 */
export function Home({ scope = HOME_SCOPE_VUOTO }: { scope?: HomeScope }) {
  const homeData = getHomeData();
  const tasteProfile = getViewer().then((viewer) =>
    viewer ? getTasteProfile(viewer.id).catch(() => null) : null,
  );

  return (
    <HomeTypeProvider>
      {/* Cosa sta andando adesso sui dispositivi collegati: fa scorrere il
          minutaggio di "Continua a guardare" e rifà la pagina quando cambia
          il titolo, cioè quando cambia anche l'ordine della fila */}
      <WatchingProvider>
        {/* Su desktop, il mouse fermo su una copertina apre l'anteprima col trailer */}
        <PreviewLayer>
          <main className="pb-16">
            {/* ZConnection scrive in libreria mentre guardi Netflix: al ritorno su Zapp
              la home si rilegge da sola, senza ricaricare la pagina */}
            <RefreshOnFocus />
            {/* La pillola Tutto / Film / Serie TV e poi il banner (la scritta "Home" è
                stata tolta il 2026-09-14). Sotto `lg` il banner risale sotto la pillola
                (`HOME_BANNER_TOP`) e comincia a filo pagina: la nav è in basso, la cima
                è libera. Da `lg` la nav è in alto, quindi la pillola si tiene la sua riga
                nera e il banner comincia sotto. La pillola sta sempre dentro `HomeTitle`,
                appena sotto la nav, non più in fondo al banner coi generi (richiesta
                utente 2026-09-12). `HomeTitle` sta fuori dal Suspense del carosello: si
                vede subito. */}
            <HomeTitle titolo={scopeTitle(scope) ?? "Home"} />

            <Suspense fallback={<HomeHeroSkeleton />}>
              <HomeHero scope={scope} />
            </Suspense>

            {/* Sotto il banner: i due filtri, per genere e per piattaforma (fila
                scorrevole da lg, solo la scritta che apre il foglio sul telefono).
                Le piattaforme stanno sotto i generi per richiesta utente
                (2026-09-15): prima cosa guardi, poi dove. Le pillole cambiano l'ambito
                della home, e quelle attive lo mostrano. */}
            <div className="mt-4">
              <Suspense fallback={<HomeGenresSkeleton />}>
                <HomeGenres scope={scope} />
              </Suspense>
              <Suspense fallback={<HomePlatformsSkeleton />}>
                <HomePlatforms scope={scope} />
              </Suspense>
            </div>

            <Suspense fallback={null}>
              <HomeSections
                homeData={homeData}
                tasteProfile={tasteProfile}
                scope={scope}
              />
            </Suspense>
          </main>
        </PreviewLayer>
      </WatchingProvider>
    </HomeTypeProvider>
  );
}
