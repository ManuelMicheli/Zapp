import { runtimeBucket, decadeOf } from "@/lib/taste/profile";
import { mappaDi, type TasteVector } from "./vector";
import type { Affinita, Contributo, Dimensione, RankCandidate } from "./types";

/**
 * L'affinità: quanto un titolo è **per questo utente**, e grazie a cosa.
 *
 * Funzione pura, tutta la formula in un file. Moltiplicativa come
 * `src/lib/similar/score.ts`: nessun blocco può vincere da solo, così un capolavoro
 * fuori gusto non arriva primo e un titolo perfettamente in gusto ma brutto nemmeno.
 */

/** Peso di ogni dimensione dentro il "gusto". Si rinormalizzano su quelle presenti. */
const PESI: Record<Dimensione, number> = {
  generi: 0.4,
  persone: 0.2,
  provider: 0.12,
  decenni: 0.1,
  tipo: 0.08,
  runtime: 0.05,
  lingua: 0.05,
};

/** Qualità di un titolo senza voti: né premiato né punito. */
const QUALITA_NEUTRA = 0.6;
/** Quanto pesano gusto e qualità nel prodotto finale. */
const ESP_GUSTO = 0.65;
const ESP_QUALITA = 0.35;

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
function chiaviDi(c: RankCandidate, d: Dimensione): string[] {
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

/** 0..1 dal voto: ZappScore se c'è, altrimenti TMDB, altrimenti neutro. */
export function qualitaDi(c: RankCandidate): number {
  // 0-10, come `title_ratings.zapp_score` e come il voto TMDB: la stessa scala.
  if (c.zappScore !== null && Number.isFinite(c.zappScore)) {
    return Math.min(1, Math.max(0, c.zappScore / 10));
  }
  if (c.voteAverage !== null && Number.isFinite(c.voteAverage) && c.voteAverage > 0) {
    return Math.min(1, Math.max(0, c.voteAverage / 10));
  }
  return QUALITA_NEUTRA;
}

export function affinity(v: TasteVector, c: RankCandidate): Affinita {
  const contributi: Contributo[] = [];
  let somma = 0;
  let pesoTotale = 0;

  for (const d of Object.keys(PESI) as Dimensione[]) {
    const mappa = mappaDi(v, d);
    if (mappa.size === 0) continue;
    const chiavi = chiaviDi(c, d);
    if (chiavi.length === 0) continue;

    // Una dimensione che il profilo non conosce affatto (nessuna chiave del titolo vi
    // compare) non è "gusto zero": è assenza di informazione, e va lasciata fuori dal
    // conto, altrimenti un titolo in una lingua mai vista verrebbe punito due volte.
    const valori = chiavi.map((k) => mappa.get(k)).filter((x): x is number => x != null);
    if (valori.length === 0) continue;

    // media dei generi toccati (un titolo ne ha più d'uno), massimo per le altre
    const valore =
      d === "generi" || d === "persone"
        ? valori.reduce((a, b) => a + b, 0) / valori.length
        : Math.max(...valori);

    const peso = PESI[d];
    somma += valore * peso;
    pesoTotale += peso;

    const migliore = chiavi
      .map((k) => [k, mappa.get(k)] as const)
      .filter((e): e is readonly [string, number] => e[1] != null)
      .sort((a, b) => b[1] - a[1])[0];
    contributi.push({ dimensione: d, chiave: migliore[0], valore: valore * peso });
  }

  // Nessuna dimensione utilizzabile: gusto neutro, decide la qualità.
  const gusto = pesoTotale > 0 ? clamp01(somma / pesoTotale) : 0.5;

  // Con un profilo povero l'affinità tende al neutro: a decidere resta l'ordine
  // pubblico della fase B. È il motivo per cui la fase A calcola `massa`.
  const gustoEffettivo = clamp01(gusto * v.fiducia + 0.5 * (1 - v.fiducia));

  const qualita = qualitaDi(c);
  const bonus = bonusAmici(c);
  // Il tetto a 1 tiene la percentuale dentro il 100%: un consiglio non può essere
  // "per te 112%".
  const punteggio = clamp01(
    Math.pow(gustoEffettivo, ESP_GUSTO) * Math.pow(qualita, ESP_QUALITA) * bonus,
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
    percentuale: v.abbastanza ? Math.round(100 * punteggio) : null,
    contributi,
  };
}

function clamp01(x: number): number {
  if (!Number.isFinite(x)) return 0;
  return Math.min(1, Math.max(0, x));
}
