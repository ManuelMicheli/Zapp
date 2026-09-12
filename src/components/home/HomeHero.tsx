import { Skeleton } from "@/components/ui/Skeleton";
import { getHomeHero } from "@/lib/home/hero";
import { HeroCarousel } from "./HeroCarousel";

/**
 * Quanto della cima del banner è coperto da quel che gli sta sopra, e di quanto il
 * banner risale per finirci sotto: il fondale **si estende verso l'alto** di tanto e
 * comincia a filo pagina, con "Home" e la nav sulla copertina in trasparenza — come la
 * barra di ricerca in Cerca (richiesta utente 2026-09-12).
 *
 * Due misure, perché la nav cambia posto e con lei quel che sta in `HomeTitle`:
 * - sotto `lg` la nav è in basso e sotto "Home" c'è la pillola corta Tutto / Film /
 *   Serie TV: 20 (pt) + 40 (h1) + 8 (mt) + 36 (pillola) + 12 (pb) = 116;
 * - da `lg` la nav è in alto, dentro `--nav-top`, e la pillola sta sotto il banner:
 *   32 (pt) + 40 (h1) + 16 (pb) = 88.
 * A entrambe si somma la safe area e la fascia della nav.
 *
 * Costanti scritte a mano: misurarle a runtime farebbe saltare il fondale al primo
 * render. Da rifare i conti se cambiano le altezze di `HomeTitle`.
 */
export const HOME_BANNER_TOP =
  "[--banner-top:calc(env(safe-area-inset-top,0px)+var(--nav-top)+116px)] " +
  "lg:[--banner-top:calc(env(safe-area-inset-top,0px)+var(--nav-top)+88px)] " +
  "mt-[calc(-1*var(--banner-top))]";

/**
 * Carosello in testa alla home. "Home" gli sta sopra (`HomeTitle`, fuori dal Suspense:
 * si vede subito), la pillola Tutto / Film / Serie TV e i generi sotto.
 * Sta dietro un Suspense: legge TMDB (cache Next 1h, chiamate condivise con Scopri)
 * e la libreria per i gusti; il resto della pagina non l'aspetta.
 */
export async function HomeHero() {
  const { movie, tv, all } = await getHomeHero();
  return <HeroCarousel movie={movie} tv={tv} all={all} bannerTop={HOME_BANNER_TOP} />;
}

/**
 * Stessa geometria del carosello vero: banner a tutta altezza (più lo spazio coperto
 * dai comandi in cima), righe di testo **dentro** il banner e puntini.
 */
export function HomeHeroSkeleton() {
  return (
    <section className={`relative @container ${HOME_BANNER_TOP}`}>
      <div className="relative h-[calc(52svh+var(--banner-top))] max-h-[calc(500px+var(--banner-top))] min-h-[calc(360px+var(--banner-top))] overflow-hidden lg:h-[calc(64svh+var(--banner-top))] lg:max-h-[calc(680px+var(--banner-top))] lg:min-h-[calc(420px+var(--banner-top))]">
        <Skeleton className="size-full rounded-none" />
        <div className="absolute inset-x-0 bottom-0 space-y-2 px-5 pb-11 lg:max-w-[46%] lg:px-10 lg:pb-7">
          <Skeleton className="h-6 w-2/3 lg:h-12" />
          <Skeleton className="h-4 w-1/4" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
        </div>
      </div>
      <div className="absolute inset-x-0 bottom-4 flex justify-center gap-1.5 lg:inset-x-auto lg:bottom-8 lg:right-10">
        {Array.from({ length: 6 }, (_, i) => (
          <div
            key={i}
            className={`h-1.5 rounded-full bg-white/20 ${i === 0 ? "w-5" : "w-1.5"}`}
          />
        ))}
      </div>
    </section>
  );
}
