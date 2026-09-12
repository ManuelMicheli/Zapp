import { Skeleton } from "@/components/ui/Skeleton";
import { getHomeHero } from "@/lib/home/hero";
import { HeroCarousel } from "./HeroCarousel";

/**
 * Quanto della cima del banner è coperto dalla testata sovrapposta, cioè
 * `HomeTypeSwitch` + `HomeGenres` (li dispone `page.tsx`, in un `absolute` sopra il
 * carosello). Il banner comincia a filo pagina e il fondale ci cresce sotto: nessuna
 * fascia nera in cima, i comandi restano al loro posto e trasparenti come la nav
 * (richiesta utente 2026-09-12).
 *
 * Sono costanti scritte a mano perché misurarle a runtime farebbe saltare il fondale
 * al primo render. Da rifare i conti se cambiano quelle altezze:
 * - sotto `lg`: 20 (pt) + 40 (h1) + 12 (gap) + 40 (pillola) + 16 (pb) + 36 (generi) + 20 (pb)
 * - da `lg`: 32 (pt) + 40 (riga titolo+pillola) + 16 (pb) + 36 (pillole generi) + 24 (pb)
 */
export const HOME_BANNER_TOP =
  "[--banner-top:calc(env(safe-area-inset-top,0px)+var(--nav-top)+184px)] " +
  "lg:[--banner-top:calc(env(safe-area-inset-top,0px)+var(--nav-top)+148px)]";

/**
 * Carosello in testa alla home (il titolo e la pillola Tutto / Film / Serie TV stanno
 * fuori dal Suspense, in `HomeTypeSwitch`).
 * Sta dietro un Suspense: legge TMDB (cache Next 1h, chiamate condivise con Scopri)
 * e la libreria per i gusti; il resto della pagina non l'aspetta.
 */
export async function HomeHero() {
  const { movie, tv, all } = await getHomeHero();
  return <HeroCarousel movie={movie} tv={tv} all={all} bannerTop={HOME_BANNER_TOP} />;
}

/**
 * Stessa geometria del carosello vero: fondale a tutta larghezza che comincia a filo
 * pagina (16:9 più lo spazio coperto dalla testata), le righe di testo sotto e i
 * puntini. Banner a tutta altezza da `lg`.
 */
export function HomeHeroSkeleton() {
  return (
    <section className={`relative @container ${HOME_BANNER_TOP}`}>
      <div className="overflow-hidden">
        <Skeleton className="aspect-video min-h-[calc(56.25cqw+var(--banner-top))] w-full rounded-none lg:aspect-auto lg:h-[64svh] lg:max-h-[680px] lg:min-h-[420px]" />
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
