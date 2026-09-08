import { contextAt, type Meteo } from "@/lib/moment/context";
import { MOODS, pickMoment } from "@/lib/moment/recipes";
import { getMomentShelf, titoliDi } from "@/lib/moment/shelf";
import { getMeteo } from "@/lib/moment/weather";
import { MoodPills } from "./MoodPills";

/**
 * La prima fila di consigli della home: quella che sa che ore sono, che giorno è e se
 * piove. Sta dentro il suo `Suspense` (vedi `page.tsx`), così il meteo non trattiene
 * una riga di HTML del resto della pagina.
 */

const ETICHETTA: Record<Meteo, string> = {
  pioggia: "piove",
  neve: "nevica",
  sereno: "sereno",
  caldo: "caldo",
  freddo: "freddo",
};

export async function MomentShelf({
  conSchede = true,
}: {
  /** `false` fuori dalla home, dove non c'è la pillola Film / Serie TV. */
  conSchede?: boolean;
} = {}) {
  const { meteo, citta } = await getMeteo();
  const recipe = pickMoment(contextAt(new Date(), meteo));
  const data = await getMomentShelf(recipe);
  if (data.movie.length === 0 && data.tv.length === 0) return null;

  // La città è l'etichetta che l'utente ha già scelto per il cinema: mai le coordinate.
  const eyebrow = citta && meteo ? `Adesso a ${citta} · ${ETICHETTA[meteo]}` : null;

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
