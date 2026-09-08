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
  const { meteo, citta, etichetta } = await getMeteo();
  const recipe = pickMoment(contextAt(new Date(), meteo));
  const data = await getMomentShelf(recipe);
  if (data.movie.length === 0 && data.tv.length === 0) return null;

  // La città è l'etichetta che l'utente ha già scelto per il cinema: mai le coordinate.
  // L'etichetta del meteo porta sempre i gradi ("31° e sereno"): una riga che dicesse
  // "piove" con trenta gradi si vedrebbe subito, e infatti e' cosi' che e' venuta fuori.
  const eyebrow = citta && etichetta ? `Adesso a ${citta} · ${etichetta}` : null;

  return (
    <MoodPills
      titoli={titoliDi(recipe)}
      eyebrow={eyebrow}
      data={data}
      moods={MOODS.map((m) => ({ key: m.key, pillola: m.pillola }))}
      conSchede={conSchede}
    />
  );
}
