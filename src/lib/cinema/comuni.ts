/**
 * Gli 7.904 comuni italiani con provincia e coordinate (`src/data/comuni-it.json`,
 * righe `[nome, sigla, lat, lng, popolazione]`, da ISTAT + coordinate ufficiali; i 48
 * comuni nati da fusioni recenti sono stati geocodificati una volta con Nominatim).
 *
 * Serve a far scegliere il posto **prima** di salvarlo: chi scrive "ossona" vede
 * "Ossona, MI" e tocca quello. Così la posizione non passa più da una ricerca a testo
 * libero (che su un nome ambiguo prendeva il primo risultato) e la provincia MyMovies
 * si sa già dalla sigla, senza chiamare nessuno.
 *
 * Niente `server-only`: sono funzioni pure con un elenco statico, testate con Vitest.
 */
import rows from "@/data/comuni-it.json";

export interface Comune {
  /** "Ossona" */
  name: string;
  /** "MI" */
  sigla: string;
  lat: number;
  lng: number;
  /** Abitanti: ordina i risultati (Milano prima di Milano Marittima). */
  population: number;
}

type Row = [string, string, number, number, number];

const COMUNI: Comune[] = (rows as Row[]).map(([name, sigla, lat, lng, population]) => ({
  name,
  sigla,
  lat,
  lng,
  population,
}));

/** Minuscolo senza accenti né punteggiatura: "Sant'Angelo" → "santangelo". */
export function normalizeComune(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const INDEX = COMUNI.map((c) => ({ c, key: normalizeComune(c.name) }));

/**
 * Comuni che iniziano per `q` (poi quelli che lo contengono), i più popolosi prima.
 * Con meno di due lettere non cerca: mezza Italia inizia per "a".
 */
export function searchComuni(q: string, limit = 8): Comune[] {
  const needle = normalizeComune(q);
  if (needle.length < 2) return [];
  const starts: { c: Comune; population: number }[] = [];
  const contains: { c: Comune; population: number }[] = [];
  for (const { c, key } of INDEX) {
    if (key.startsWith(needle)) starts.push({ c, population: c.population });
    else if (key.includes(needle)) contains.push({ c, population: c.population });
  }
  const byPop = (a: { population: number }, b: { population: number }) =>
    b.population - a.population;
  return [...starts.sort(byPop), ...contains.sort(byPop)].slice(0, limit).map((x) => x.c);
}

/** Il comune esatto (nome + sigla): l'unica versione di cui fidarsi lato server. */
export function findComune(name: string, sigla: string): Comune | null {
  const key = normalizeComune(name);
  const sg = sigla.toUpperCase();
  return (
    INDEX.find((x) => x.key === key && x.c.sigla === sg)?.c ??
    INDEX.find((x) => x.key === key)?.c ??
    null
  );
}

/** "Ossona, MI" */
export function comuneLabel(c: Comune): string {
  return `${c.name}, ${c.sigla}`;
}

/**
 * Comune più vicino a un punto: dalle coordinate del GPS si ricava la provincia senza
 * chiedere niente a nessuno (distanza euclidea sui gradi, corretta in longitudine col
 * coseno della latitudine — su distanze così corte basta e avanza).
 */
export function nearestComune(p: { lat: number; lng: number }): Comune | null {
  let best: Comune | null = null;
  let bestD = Infinity;
  const cos = Math.cos((p.lat * Math.PI) / 180);
  for (const c of COMUNI) {
    const dLat = c.lat - p.lat;
    const dLng = (c.lng - p.lng) * cos;
    const d = dLat * dLat + dLng * dLng;
    if (d < bestD) {
      bestD = d;
      best = c;
    }
  }
  return best;
}

/**
 * Sigla automobilistica → slug provincia MyMovies (generata dall'elenco ufficiale di
 * MyMovies il 2026-09-08). `null` solo per il Sud Sardegna, che per MyMovies non
 * esiste ancora: è rimasto diviso fra `carboniaiglesias` e `mediocampidano`, e lì la
 * provincia si deduce dalle sale vicine già note.
 */
export const PROVINCE_SLUG_BY_SIGLA: Record<string, string | null> = {
  AG: "agrigento",
  AL: "alessandria",
  AN: "ancona",
  AO: "aosta",
  AP: "ascolipiceno",
  AQ: "laquila",
  AR: "arezzo",
  AT: "asti",
  AV: "avellino",
  BA: "bari",
  BG: "bergamo",
  BI: "biella",
  BL: "belluno",
  BN: "benevento",
  BO: "bologna",
  BR: "brindisi",
  BS: "brescia",
  BT: "barlettaandriatrani",
  BZ: "bolzano",
  CA: "cagliari",
  CB: "campobasso",
  CE: "caserta",
  CH: "chieti",
  CL: "caltanissetta",
  CN: "cuneo",
  CO: "como",
  CR: "cremona",
  CS: "cosenza",
  CT: "catania",
  CZ: "catanzaro",
  EN: "enna",
  FC: "forlicesena",
  FE: "ferrara",
  FG: "foggia",
  FI: "firenze",
  FM: "fermo",
  FR: "frosinone",
  GE: "genova",
  GO: "gorizia",
  GR: "grosseto",
  IM: "imperia",
  IS: "isernia",
  KR: "crotone",
  LC: "lecco",
  LE: "lecce",
  LI: "livorno",
  LO: "lodi",
  LT: "latina",
  LU: "lucca",
  MB: "monzabrianza",
  MC: "macerata",
  ME: "messina",
  MI: "milano",
  MN: "mantova",
  MO: "modena",
  MS: "massacarrara",
  MT: "matera",
  NA: "napoli",
  NO: "novara",
  NU: "nuoro",
  OR: "oristano",
  PA: "palermo",
  PC: "piacenza",
  PD: "padova",
  PE: "pescara",
  PG: "perugia",
  PI: "pisa",
  PN: "pordenone",
  PO: "prato",
  PR: "parma",
  PT: "pistoia",
  PU: "pesaroeurbino",
  PV: "pavia",
  PZ: "potenza",
  RA: "ravenna",
  RC: "reggiocalabria",
  RE: "reggioemilia",
  RG: "ragusa",
  RI: "rieti",
  RM: "roma",
  RN: "rimini",
  RO: "rovigo",
  SA: "salerno",
  SI: "siena",
  SO: "sondrio",
  SP: "laspezia",
  SR: "siracusa",
  SS: "sassari",
  SU: null,
  SV: "savona",
  TA: "taranto",
  TE: "teramo",
  TN: "trento",
  TO: "torino",
  TP: "trapani",
  TR: "terni",
  TS: "trieste",
  TV: "treviso",
  UD: "udine",
  VA: "varese",
  VB: "verbanocusioossola",
  VC: "vercelli",
  VE: "venezia",
  VI: "vicenza",
  VR: "verona",
  VT: "viterbo",
  VV: "vibovalentia",
};

/** Slug MyMovies della provincia di un comune (`null` = da dedurre dalle sale note). */
export function provinceSlugForSigla(sigla: string): string | null {
  return PROVINCE_SLUG_BY_SIGLA[sigla.toUpperCase()] ?? null;
}
