import type { Meteo, MomentContext } from "./context";

/**
 * I momenti e i mood sono **dati**, non codice: quale fila compare in home e come si
 * chiama è una scelta di prodotto, e va letta in un file solo (stessa ragione per cui
 * `src/lib/rank/rails.ts` è puro e testato).
 *
 * Gli id dei generi sono quelli TMDB **dei film**; `genreIdsFor` li traduce per le
 * serie al momento della `discover`.
 */

export interface Recipe {
  /** Chiave stabile: entra nell'URL del mood e nei test. */
  key: string;
  /** Il titolo della fila, in italiano. */
  titolo: string;
  /** Generi in **or** fra loro. */
  generi: number[];
  /** Generi esclusi: una domenica di pioggia non è un horror. */
  senzaGeneri?: number[];
  /** Keyword TMDB: un di più, mai la spina dorsale (vedi la spec, §3). */
  keyword?: number[];
  runtimeMax?: number;
  runtimeMin?: number;
  /** Vero per i momenti che non hanno senso per una serie. */
  soloFilm?: boolean;
}

export interface Mood extends Recipe {
  /** Il testo della pillola. */
  pillola: string;
}

interface Momento {
  quando: (c: MomentContext) => boolean;
  recipe: Recipe;
}

const bagnato = (m: Meteo | null) => m === "pioggia" || m === "neve";

/** Fascia oraria `[da, a)`, che sa scavalcare la mezzanotte (23 → 5). */
const fra = (ora: number, da: number, a: number) =>
  da <= a ? ora >= da && ora < a : ora >= da || ora < a;

/**
 * L'ordine è la priorità: **meteo forte > fascia oraria speciale > giorno > sera**.
 * La prima corrispondenza vince, quindi spostare una riga cambia il prodotto.
 */
export const MOMENTI: Momento[] = [
  {
    quando: (c) => c.giorno === 0 && bagnato(c.meteo),
    recipe: {
      key: "domenica-pioggia",
      titolo: "Per una domenica di pioggia",
      generi: [10751, 14, 35, 18],
      senzaGeneri: [27, 53],
    },
  },
  {
    quando: (c) => bagnato(c.meteo) && fra(c.ora, 12, 19),
    recipe: {
      key: "pioggia-pomeriggio",
      titolo: "Fuori piove",
      generi: [12, 14, 10751, 16],
    },
  },
  {
    quando: (c) => bagnato(c.meteo) && fra(c.ora, 19, 23),
    recipe: {
      key: "pioggia-sera",
      titolo: "Una sera di pioggia",
      generi: [18, 9648, 14],
    },
  },
  {
    quando: (c) => fra(c.ora, 23, 5),
    recipe: { key: "notte-fonda", titolo: "Notte fonda", generi: [27, 53, 9648] },
  },
  {
    quando: (c) => c.giorno >= 1 && c.giorno <= 5 && fra(c.ora, 12, 15),
    recipe: {
      key: "pausa-pranzo",
      titolo: "Pausa pranzo",
      generi: [35, 99],
      runtimeMax: 100,
    },
  },
  {
    quando: (c) => c.giorno === 5 && fra(c.ora, 17, 21),
    recipe: {
      key: "aperitivo-venerdi",
      titolo: "Aperitivo del venerdì",
      generi: [35, 10749],
      runtimeMax: 105,
    },
  },
  {
    quando: (c) => (c.giorno === 0 || c.giorno === 6) && fra(c.ora, 8, 12),
    recipe: { key: "mattina-weekend", titolo: "Mattina pigra", generi: [16, 10751, 35] },
  },
  {
    quando: (c) => c.giorno === 6 && fra(c.ora, 20, 24),
    recipe: { key: "sabato-sera", titolo: "Sabato sera", generi: [28, 12, 878, 14] },
  },
  {
    quando: (c) =>
      c.mese >= 6 &&
      c.mese <= 8 &&
      fra(c.ora, 20, 24) &&
      (c.meteo === "caldo" || c.meteo === "sereno"),
    recipe: { key: "sera-estate", titolo: "Sera d'estate", generi: [12, 28, 35] },
  },
  {
    quando: (c) => (c.mese === 12 || c.mese <= 2) && c.meteo === "freddo",
    recipe: { key: "freddo-inverno", titolo: "Freddo fuori", generi: [18, 10749, 14] },
  },
  {
    quando: (c) => fra(c.ora, 19, 23),
    recipe: { key: "sera", titolo: "Film della sera", generi: [18, 53, 80, 9648] },
  },
];

/** Il ripiego finale: la fila non sparisce mai, così non c'è una home "senza fila". */
export const SEMPRE: Recipe = {
  key: "sempre",
  titolo: "Da vedere adesso",
  generi: [18, 35, 28, 878],
};

export function pickMoment(c: MomentContext): Recipe {
  return MOMENTI.find((m) => m.quando(c))?.recipe ?? SEMPRE;
}

/**
 * I sei mood. Vincono su qualunque momento, e durano quanto la sessione: un mood è uno
 * stato d'animo di stasera, non un gusto, e non entra in `user_taste`.
 */
export const MOODS: Mood[] = [
  {
    key: "leggero",
    pillola: "Leggero",
    titolo: "Qualcosa di leggero",
    generi: [35, 10751, 16],
    senzaGeneri: [27, 53, 10752],
    runtimeMax: 110,
  },
  { key: "triste", pillola: "Triste", titolo: "Da piangerci sopra", generi: [18, 10749] },
  { key: "carico", pillola: "Carico", titolo: "Carica adrenalina", generi: [28, 53, 12] },
  {
    key: "cuore-infranto",
    pillola: "Cuore infranto",
    titolo: "Cuore infranto",
    generi: [10749, 18],
    keyword: [34265],
  },
  { key: "paura", pillola: "Paura", titolo: "Voglia di paura", generi: [27, 9648] },
  {
    key: "cervello-acceso",
    pillola: "Cervello acceso",
    titolo: "Cervello acceso",
    generi: [878, 9648, 53],
    keyword: [362567],
  },
];

/**
 * Il mood arriva da un parametro di query, cioè da chiunque: si confronta con l'elenco
 * e non si interpola da nessuna parte. Sconosciuto → `null`, che la rotta traduce in 400.
 */
export function moodByKey(key: unknown): Mood | null {
  if (typeof key !== "string") return null;
  return MOODS.find((m) => m.key === key) ?? null;
}
