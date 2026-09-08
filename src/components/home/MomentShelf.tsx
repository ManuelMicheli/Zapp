import { contextAt } from "@/lib/moment/context";
import { MOODS, pickMoment } from "@/lib/moment/recipes";
import { getMomentShelf, titoliDi } from "@/lib/moment/shelf";
import { getMeteo } from "@/lib/moment/weather";
import { MoodPills } from "./MoodPills";

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
