import { Skeleton } from "@/components/ui/Skeleton";
import { contextAt } from "@/lib/moment/context";
import { MOODS, pickMoment } from "@/lib/moment/recipes";
import { getMomentShelf, titoliDi } from "@/lib/moment/shelf";
import { getMeteo } from "@/lib/moment/weather";
import { MoodPills, MOMENT_BANNER_TOP } from "./MoodPills";

/**
 * La prima fila di consigli della home: quella che sa che ore sono, che giorno è e se
 * piove. Sta dentro il suo `Suspense` (vedi `page.tsx`), così il meteo non trattiene
 * una riga di HTML del resto della pagina.
 */

export async function MomentShelf({
  conSchede = true,
}: {
  /** `false` fuori dalla home, dove non c'è la pillola Film / Serie TV. */
  conSchede?: boolean;
} = {}) {
  const { meteo } = await getMeteo();
  const recipe = pickMoment(contextAt(new Date(), meteo));
  const data = await getMomentShelf(recipe);
  if (data.movie.length === 0 && data.tv.length === 0) return null;

  // Città e meteo restano nostri: servono a scegliere la fila, non si scrivono in
  // pagina (scelta utente 2026-09-08: la riga "Adesso a Milano · 32° e nuvoloso"
  // raccontava all'utente cosa sappiamo di lui).

  return (
    <MoodPills
      titoli={titoliDi(recipe)}
      data={data}
      moods={MOODS.map((m) => ({ key: m.key, pillola: m.pillola }))}
      conSchede={conSchede}
    />
  );
}

/**
 * Stessa geometria del banner vero, compreso lo spazio coperto dalla barra di ricerca:
 * senza, il margine negativo della barra (vedi `SearchClient`) si mangerebbe lo
 * scheletro e la pagina salterebbe quando arriva la fila.
 */
export function MomentShelfSkeleton() {
  return (
    <section
      className={`relative mt-[calc(-1*var(--search-bar-h,0px))] @container ${MOMENT_BANNER_TOP}`}
    >
      <Skeleton className="aspect-video min-h-[calc(56.25cqw+var(--banner-top))] w-full rounded-none lg:aspect-auto lg:h-[calc(64svh+var(--banner-top))] lg:max-h-[calc(680px+var(--banner-top))] lg:min-h-[calc(420px+var(--banner-top))]" />
      <div className="space-y-2 px-5 pt-3 lg:hidden">
        <Skeleton className="h-6 w-2/3" />
        <Skeleton className="h-4 w-1/4" />
      </div>
    </section>
  );
}
