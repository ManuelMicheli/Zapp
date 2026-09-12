import { Skeleton } from "@/components/ui/Skeleton";
import { getHomeHero } from "@/lib/home/hero";
import { HeroCarousel } from "./HeroCarousel";

/**
 * Quanto della cima del banner è coperto da quel che gli sta sopra, e di quanto il
 * banner risale per finirci sotto.
 *
 * **Sotto `lg`** ci sta solo "Home" (`HomeTitle`): la nav è in basso e la cima è libera,
 * quindi la scritta va sull'immagine — 20 (pt) + 40 (h1) + 12 (pb) = 72, più safe area
 * e fascia nav. Il margine negativo fa risalire il banner esattamente di tanto, così
 * comincia a filo pagina, e il fondale cresce della stessa misura: il 16:9 resta tutto
 * visibile sotto la scritta.
 *
 * **Da `lg`** vale `0px`: la nav è in alto, "Home" resta su una riga nera sopra il
 * banner e il banner comincia sotto di lei (richiesta utente 2026-09-12). A zero il
 * margine negativo, la crescita del fondale e il velo si annullano da soli — una leva
 * sola, nessun ramo.
 *
 * Costanti scritte a mano: misurarle a runtime farebbe saltare il fondale al primo
 * render. Da rifare i conti se cambiano le altezze di `HomeTitle`.
 */
export const HOME_BANNER_TOP =
  "[--banner-top:calc(env(safe-area-inset-top,0px)+var(--nav-top)+72px)] " +
  "mt-[calc(-1*var(--banner-top))] lg:[--banner-top:0px]";

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
 * Stessa geometria del carosello vero: 16:9 più lo spazio coperto da "Home" sotto `lg`,
 * banner a tutta altezza da `lg`, righe di testo sotto e puntini.
 */
export function HomeHeroSkeleton() {
  return (
    <section className={`relative @container ${HOME_BANNER_TOP}`}>
      <div className="overflow-hidden">
        <Skeleton className="aspect-video min-h-[calc(56.25cqw+var(--banner-top))] w-full rounded-none lg:aspect-auto lg:h-[calc(64svh+var(--banner-top))] lg:max-h-[calc(680px+var(--banner-top))] lg:min-h-[calc(420px+var(--banner-top))]" />
        <div className="space-y-2 px-5 pt-3 lg:hidden">
          <Skeleton className="h-6 w-2/3" />
          <Skeleton className="h-4 w-1/4" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
        </div>
      </div>
      <div className="mt-3 flex justify-center gap-1.5 lg:absolute lg:bottom-8 lg:right-10 lg:mt-0">
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
