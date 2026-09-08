import type { RankedItem } from "./types";

/**
 * La lista finale, senza ripetizioni.
 *
 * Dieci titoli dello stesso genere non sono una lista di consigli: sono un genere.
 * Chi sfora un tetto non viene però buttato — scende in coda e rientra se la lista non
 * si riempie: una lista corta di roba giusta è meglio di una lunga tutta uguale, ma una
 * lista mezza vuota è peggio di entrambe.
 */

export const MAX_PER_GENERE = 3;
export const MAX_PER_PROVIDER = 4;
export const MAX_PER_PERSONA = 2;

/**
 * `perGenere` si alza dentro una lista che **è** un genere (le pillole della home):
 * lì il tetto di tre per genere rimanderebbe in coda quasi tutti i titoli, cioè non
 * diversificherebbe niente e in cambio complicherebbe l'ordine. Persone e piattaforme
 * restano come sono: dieci film dello stesso regista non sono una lista neanche dentro
 * un genere.
 */
export function diversify(
  items: readonly RankedItem[],
  size: number,
  opzioni: { perGenere?: number } = {},
): RankedItem[] {
  const maxPerGenere = opzioni.perGenere ?? MAX_PER_GENERE;
  const scelti: RankedItem[] = [];
  const rimandati: RankedItem[] = [];

  const perGenere = new Map<number, number>();
  const perProvider = new Map<number, number>();
  const perPersona = new Map<string, number>();

  const conta = <K>(m: Map<K, number>, k: K) => m.get(k) ?? 0;

  for (const item of items) {
    if (scelti.length >= size) {
      rimandati.push(item);
      continue;
    }
    const genere = item.genreIds[0];
    // Solo la prima persona: è il regista, o comunque il nome che si nota.
    const persona = item.people[0];

    const sforaGenere = genere !== undefined && conta(perGenere, genere) >= maxPerGenere;
    const sforaProvider = item.providerIds.some(
      (p) => conta(perProvider, p) >= MAX_PER_PROVIDER,
    );
    const sforaPersona =
      persona !== undefined && conta(perPersona, persona) >= MAX_PER_PERSONA;

    if (sforaGenere || sforaProvider || sforaPersona) {
      rimandati.push(item);
      continue;
    }

    scelti.push(item);
    if (genere !== undefined) perGenere.set(genere, conta(perGenere, genere) + 1);
    for (const p of item.providerIds) perProvider.set(p, conta(perProvider, p) + 1);
    if (persona !== undefined) perPersona.set(persona, conta(perPersona, persona) + 1);
  }

  // I rimandati sono già in ordine di punteggio: riempiono senza rimescolare nulla.
  for (const item of rimandati) {
    if (scelti.length >= size) break;
    scelti.push(item);
  }
  return scelti;
}
