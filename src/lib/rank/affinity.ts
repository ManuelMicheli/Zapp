import { runtimeBucket, decadeOf } from "@/lib/taste/profile";
import { fama, qualitaDi } from "./fame";
import { mappaDi, type TasteVector } from "./vector";
import type { Affinita, Contributo, Dimensione, PesiGusto, RankCandidate } from "./types";

/**
 * L'affinità: quanto un titolo è **per questo utente**, e grazie a cosa.
 *
 * Funzione pura, tutta la formula in un file. Moltiplicativa come
 * `src/lib/similar/score.ts`: nessun blocco può vincere da solo, così un capolavoro
 * fuori gusto non arriva primo, un titolo perfettamente in gusto ma brutto nemmeno, e
 * — da qui in avanti — nemmeno un titolo bello e in gusto che però non ha visto nessuno.
 *
 *     punteggio = gusto^0,55 × qualità^0,25 × fama^0,20 × bonusAmici × freschezza
 *
 * La **fama** è il fattore aggiunto il 2026-09-15 e l'unico che risponde alla domanda
 * "questo titolo lo conosce qualcuno?". Prima non c'era da nessuna parte se non come
 * soglia di ammissione, e la conseguenza si leggeva in home: misurando i candidati veri
 * del motore, un film del 2026 con 307 voti e media 9,17 (fan entusiasti al primo
 * weekend) batteva Il Padrino. Vedi `fame.ts`.
 */

/**
 * Peso di ogni dimensione dentro il "gusto", **di partenza**. Si rinormalizzano su
 * quelle presenti, e per un utente con abbastanza campione li sposta `tuneWeights`
 * (`tune.ts`): questi restano il punto da cui si parte e quello a cui si torna quando
 * non c'è niente da cui imparare.
 */
export const PESI_BASE: PesiGusto = {
  generi: 0.4,
  persone: 0.2,
  provider: 0.12,
  decenni: 0.1,
  tipo: 0.08,
  runtime: 0.05,
  lingua: 0.05,
};

/**
 * Le dimensioni dove **l'assenza è informazione**.
 *
 * Il vocabolario di un genere, di un decennio, di una lingua o di una piattaforma è
 * piccolo e chiuso: un profilo pieno le conosce quasi tutte, quindi se nessuna chiave
 * del titolo compare vuol dire davvero "questa roba non la guardi". `persone` è
 * l'opposto: nessun profilo contiene la maggior parte degli attori del mondo, e punire
 * un film perché il suo cast non è nel tuo profilo vorrebbe dire punire quasi tutto.
 *
 * Fino al 2026-09-15 **tutte** le dimensioni si comportavano come `persone`: la
 * dimensione usciva dal conto e i pesi si rinormalizzavano sulle altre. Risultato: un
 * titolo che non c'entrava niente col gusto dell'utente non veniva punito, veniva
 * *ignorato*, e finiva in mezzo alla lista con un punteggio da "non lo so". È metà del
 * difetto che l'utente ha descritto come "film che non c'entrano nulla con me".
 */
const DIMENSIONI_CHIUSE: ReadonlySet<Dimensione> = new Set<Dimensione>([
  "generi",
  "decenni",
  "provider",
  "tipo",
  "runtime",
  "lingua",
]);

/**
 * Quanto vale una dimensione chiusa che il titolo tocca senza corrispondenze.
 *
 * Non zero: zero è il valore di un rifiuto esplicito, e "non è nel tuo profilo" non è
 * "l'hai scartato" — i rifiuti stanno già nella mappa col segno negativo e pesano molto
 * di più di così.
 */
export const MISS = 0.1;

/** Quanto pesano gusto, qualità e fama nel prodotto finale. Sommano a 1. */
export const ESP_GUSTO = 0.55;
export const ESP_QUALITA = 0.25;
export const ESP_FAMA = 0.2;

/**
 * La spinta degli amici (fase E). Non è un'ottava dimensione del gusto: gli amici non
 * sono un gusto, sono una spinta, e per questo moltiplicano il punteggio invece di
 * entrare nella media.
 *
 * Un amico solo dà +8%, tre danno +24%, dieci danno sempre +25%: oltre, non è più "lo
 * guardano i tuoi amici", è "lo guardano tutti", e quello lo dicono già le classifiche.
 */
const BONUS_PER_AMICO = 0.08;
const BONUS_MAX = 0.25;
/** Da questo voto medio in giù la spinta non si applica affatto. */
const VOTO_AMICI_BASSO = 4;

/** Il moltiplicatore sociale di un candidato, 1 se non c'è niente da dire. */
export function bonusAmici(c: RankCandidate): number {
  const f = c.friends;
  if (!f || f.amici <= 0) return 1;
  // Che tre amici l'abbiano visto e non gli sia piaciuto non è una raccomandazione.
  if (f.votoMedio !== null && f.votoMedio <= VOTO_AMICI_BASSO) return 1;
  return 1 + Math.min(BONUS_MAX, BONUS_PER_AMICO * f.amici);
}

/** Le chiavi che il candidato tocca in una dimensione. */
export function chiaviDi(c: RankCandidate, d: Dimensione): string[] {
  switch (d) {
    case "generi":
      return c.genreIds.map(String);
    case "persone":
      return c.people;
    case "provider":
      return c.providerIds.map(String);
    case "decenni": {
      const k = decadeOf(c.year ? Number(c.year) || null : null);
      return k ? [k] : [];
    }
    case "tipo":
      return [c.mediaType];
    case "runtime": {
      const k = runtimeBucket(c.runtime);
      return k ? [k] : [];
    }
    case "lingua":
      return c.originalLanguage ? [c.originalLanguage] : [];
  }
}

/**
 * Quanto vale una dimensione per questo titolo, o `null` se non c'è niente da dire.
 *
 * Esportata perché la usa anche la taratura (`tune.ts`): il valore che ha spinto un
 * consiglio e quello che si misura a posteriori devono venire dalla stessa riga di
 * codice, altrimenti il ciclo chiuso imparerebbe su un modello diverso da quello che ha
 * fatto la proposta.
 */
export function valoreDimensione(
  v: TasteVector,
  c: RankCandidate,
  d: Dimensione,
): { valore: number; chiave: string } | null {
  const mappa = mappaDi(v, d);
  if (mappa.size === 0) return null;
  const chiavi = chiaviDi(c, d);
  if (chiavi.length === 0) return null;

  const trovati = chiavi
    .map((k) => [k, mappa.get(k)] as const)
    .filter((e): e is readonly [string, number] => e[1] != null);

  if (trovati.length === 0) {
    // Dimensione aperta: nessuna informazione, fuori dal conto.
    if (!DIMENSIONI_CHIUSE.has(d)) return null;
    // Dimensione chiusa: l'assenza *è* l'informazione.
    return { valore: MISS, chiave: chiavi[0] };
  }

  const migliore = [...trovati].sort((a, b) => b[1] - a[1])[0];

  // I generi si mediano su **tutte** le chiavi del titolo, non solo su quelle trovate:
  // un Dramma+Horror per chi ama il dramma e rifiuta l'horror deve scendere, e se
  // l'horror nel profilo è negativo deve affondare. Mediando solo sulle corrispondenze
  // il genere sbagliato spariva e restava il voto del genere giusto.
  if (d === "generi") {
    const somma = chiavi.reduce((acc, k) => acc + (mappa.get(k) ?? MISS), 0);
    return { valore: somma / chiavi.length, chiave: migliore[0] };
  }

  // Le persone si mediano fra quelle conosciute (un cast di quattro nomi di cui uno è
  // il tuo preferito non deve valere un quarto); le altre prendono il massimo.
  const valori = trovati.map(([, val]) => val);
  const valore =
    d === "persone"
      ? valori.reduce((a, b) => a + b, 0) / valori.length
      : Math.max(...valori);
  return { valore, chiave: migliore[0] };
}

export function affinity(
  v: TasteVector,
  c: RankCandidate,
  pesi: PesiGusto = PESI_BASE,
): Affinita {
  const contributi: Contributo[] = [];
  let somma = 0;
  let pesoTotale = 0;

  for (const d of Object.keys(pesi) as Dimensione[]) {
    const esito = valoreDimensione(v, c, d);
    if (!esito) continue;
    const peso = pesi[d];
    somma += esito.valore * peso;
    pesoTotale += peso;
    contributi.push({ dimensione: d, chiave: esito.chiave, valore: esito.valore * peso });
  }

  // Nessuna dimensione utilizzabile: gusto neutro, decidono qualità e fama.
  const gusto = pesoTotale > 0 ? clamp01(somma / pesoTotale) : 0.5;

  // Con un profilo povero l'affinità tende al neutro: a decidere resta l'ordine
  // pubblico della fase B. È il motivo per cui la fase A calcola `massa`.
  const gustoEffettivo = clamp01(gusto * v.fiducia + 0.5 * (1 - v.fiducia));

  const qualita = qualitaDi(c);
  const notorieta = fama(c);
  const bonus = bonusAmici(c);
  // Il tetto a 1 tiene il punteggio confrontabile fra liste diverse.
  const punteggio = clamp01(
    Math.pow(gustoEffettivo, ESP_GUSTO) *
      Math.pow(qualita, ESP_QUALITA) *
      Math.pow(notorieta, ESP_FAMA) *
      bonus *
      c.freschezza,
  );

  contributi.sort((a, b) => b.valore - a.valore);

  // Il contributo sociale va in testa, non in ordine di peso: "Visto da Marco" dice
  // più di "Perché guardi molto dramma", ed è vero in un modo che l'utente può
  // verificare aprendo il profilo dell'amico.
  if (bonus > 1 && c.friends) {
    contributi.unshift({
      dimensione: "amici",
      chiave: String(c.friends.amici),
      valore: bonus - 1,
    });
  }

  return {
    punteggio,
    /**
     * La percentuale mostrata è quella del **gusto**, non del punteggio.
     *
     * "Per te 92%" deve dire quanto il titolo somiglia a te. Col punteggio pieno, che
     * da oggi contiene anche la fama, un capolavoro arcinoto mostrerebbe una
     * percentuale alta a chiunque — e un numero che vale per tutti non è "per te".
     */
    percentuale: v.abbastanza ? Math.round(100 * gustoEffettivo) : null,
    contributi,
  };
}

/**
 * Ri-esportata da `fame.ts`, dove la qualità è passata quando ha smesso di essere il
 * voto TMDB crudo. Chi la importava da qui non deve cambiare riga.
 */
export { qualitaDi } from "./fame";

function clamp01(x: number): number {
  if (!Number.isFinite(x)) return 0;
  return Math.min(1, Math.max(0, x));
}
