import type { Dimensione } from "@/lib/rank/types";
import { mappaDi, type TasteVector } from "@/lib/rank/vector";

/**
 * I generi della home sono **dati curati**, non l'elenco di TMDB.
 *
 * L'elenco di TMDB è una tassonomia da archivio: contiene "Film TV", "Musica" e
 * "Storia", che nessuno sceglie di sera, e non contiene niente di ciò che la gente
 * cerca davvero — i classici, gli anime, i supereroi, le storie vere. Qui ogni voce è
 * una lista che qualcuno aprirebbe, con la sua ricetta TMDB scritta accanto: i generi
 * in **or**, le esclusioni, la keyword quando il genere da solo non basta, la finestra
 * di anni e la lingua originale.
 *
 * Le `chiavi` tengono insieme genere e gusto: dicono su quali dimensioni del profilo
 * (fase A) si misura l'affinità di questa voce e con quali valori. Servono a ordinare
 * le pillole — chi guarda thriller trova "Thriller" per primo — e non hanno niente a
 * che vedere con la ricetta.
 *
 * Gli id dei generi sono quelli **dei film**: `genreIdsFor` li traduce per le serie
 * (28 → 10759…), tranne dove la voce porta un suo `tv.generi`.
 */

export type MediaType = "movie" | "tv";

/** Come si chiede a TMDB la lista di una voce, per un tipo. */
export interface GenreRecipe {
  /** Generi in **or** fra loro. Vuoto = qualunque genere (decidono anni e soglie). */
  generi: number[];
  /** Generi esclusi: dentro "Classici" un documentario del 1970 è fuori tema. */
  senzaGeneri?: number[];
  /**
   * Keyword TMDB. Con `soloConKeyword` la keyword **è** la definizione della voce
   * (Supereroi, Storie vere) e senza di essa il titolo non entra; altrimenti è una
   * spinta e chi la porta resta davanti agli altri.
   */
  keyword?: number[];
  soloConKeyword?: boolean;
  /** Lingua originale (`ja` per gli anime, `it` per la commedia italiana). */
  lingua?: string;
  /** Finestra di uscita, estremi inclusi. */
  annoMin?: number;
  annoMax?: number;
  runtimeMin?: number;
  runtimeMax?: number;
  /** Soglie proprie: un classico ha molti più voti di una novità. */
  votiMin?: number;
  votoMin?: number;
}

/** Su quale dimensione del gusto si misura questa voce, e con che chiave. */
export interface ChiaveGusto {
  dimensione: Dimensione;
  chiave: string;
}

export interface GenreEntry {
  /** Va nell'URL (`/discover?g=thriller`) e nel file dei titoli curati. */
  key: string;
  /** Il testo della pillola. */
  pillola: string;
  /** Il titolo della pagina. */
  titolo: string;
  /** La riga sotto il titolo: dice cosa c'è dentro, non ripete il nome. */
  sottotitolo: string;
  movie: GenreRecipe;
  /**
   * La ricetta per le serie: `null` quando la voce non ha senso per una serie, un
   * oggetto parziale quando cambia qualcosa (i generi si traducono da soli).
   */
  tv: Partial<GenreRecipe> | null;
  chiavi: ChiaveGusto[];
}

const g = (id: number): ChiaveGusto => ({ dimensione: "generi", chiave: String(id) });
const decennio = (d: number): ChiaveGusto => ({
  dimensione: "decenni",
  chiave: String(d),
});
const lingua = (l: string): ChiaveGusto => ({ dimensione: "lingua", chiave: l });

/** Keyword TMDB usate dal catalogo. */
export const KEYWORD_STORIA_VERA = 9672;
export const KEYWORD_SUPEREROI = 9715;
export const KEYWORD_ROMANCE = 9840;
export const KEYWORD_HORROR = 315058;

/**
 * Generi esclusi ovunque non siano il tema: documentario, musica e film per la TV
 * riempiono le liste di roba che nessuno stava cercando.
 */
const RUMORE = [99, 10402, 10770];

/**
 * L'ordine qui è quello di ripiego (utente nuovo, profilo vuoto): prima i generi che
 * più gente cerca, poi le voci curate. Con un profilo pieno decide `orderGenres`.
 */
export const GENRES: GenreEntry[] = [
  {
    key: "azione",
    pillola: "Azione",
    titolo: "Azione",
    sottotitolo: "Inseguimenti, sparatorie e gente che non si ferma mai",
    movie: { generi: [28], senzaGeneri: RUMORE },
    tv: {},
    chiavi: [g(28), g(10759)],
  },
  {
    key: "commedia",
    pillola: "Commedia",
    titolo: "Commedia",
    sottotitolo: "Da ridere davvero, non solo sulla carta",
    movie: { generi: [35], senzaGeneri: [99, 10770] },
    tv: {},
    chiavi: [g(35)],
  },
  {
    key: "thriller",
    pillola: "Thriller",
    titolo: "Thriller",
    sottotitolo: "Tensione dall'inizio alla fine",
    movie: { generi: [53], senzaGeneri: RUMORE },
    // 53 non esiste fra i generi delle serie: lì la tensione sta in mistero e crime.
    // L'asticella è più alta della norma perché quella coppia di generi, senza, si
    // riempie di polizieschi da rete generalista (Blue Bloods, FBI, Chicago P.D.).
    tv: { generi: [9648, 80], votiMin: 300, votoMin: 7.5 },
    chiavi: [g(53), g(9648)],
  },
  {
    key: "horror",
    pillola: "Horror",
    titolo: "Horror",
    sottotitolo: "Per chi vuole avere paura sul serio",
    movie: { generi: [27], senzaGeneri: RUMORE },
    // Nemmeno 27 esiste fra le serie, e mistero + fantascienza da soli davano Colombo,
    // Perry Mason e CSI: Miami (dump del 2026-09-08). Per le serie la keyword è
    // **obbligatoria**: meglio una lista corta di horror vero che una lunga di gialli.
    tv: {
      generi: [9648, 10765, 18],
      keyword: [KEYWORD_HORROR],
      soloConKeyword: true,
      votiMin: 60,
    },
    chiavi: [g(27)],
  },
  {
    key: "fantascienza",
    pillola: "Fantascienza",
    titolo: "Fantascienza",
    sottotitolo: "Futuri possibili, spazio profondo, domande grosse",
    movie: { generi: [878], senzaGeneri: RUMORE },
    tv: {},
    chiavi: [g(878), g(10765)],
  },
  {
    key: "crime",
    pillola: "Crime",
    titolo: "Crime",
    sottotitolo: "Rapine, indagini e gente che sbaglia mestiere",
    movie: { generi: [80], senzaGeneri: RUMORE },
    tv: {},
    chiavi: [g(80)],
  },
  {
    key: "dramma",
    pillola: "Dramma",
    titolo: "Dramma",
    sottotitolo: "Storie che restano addosso",
    movie: { generi: [18], senzaGeneri: RUMORE },
    tv: {},
    chiavi: [g(18)],
  },
  {
    key: "fantasy",
    pillola: "Fantasy",
    titolo: "Fantasy",
    sottotitolo: "Mondi che non esistono, e ci si sta benissimo",
    movie: { generi: [14], senzaGeneri: RUMORE },
    tv: {},
    chiavi: [g(14), g(10765)],
  },
  {
    key: "romantico",
    pillola: "Romantico",
    titolo: "Romantico",
    sottotitolo: "Amori che finiscono bene, o male, ma finiscono forte",
    movie: { generi: [10749], senzaGeneri: RUMORE },
    // 10749 non esiste fra le serie: restano dramma e commedia, tenute in tema dalla
    // keyword e dai titoli curati. Fuori l'animazione: senza, la coda diventava un
    // elenco di anime romantici (dump del 2026-09-08), che è un'altra cosa e ha già
    // la sua pillola.
    tv: {
      generi: [18, 35],
      senzaGeneri: [16],
      keyword: [KEYWORD_ROMANCE],
      soloConKeyword: true,
    },
    chiavi: [g(10749)],
  },
  {
    key: "avventura",
    pillola: "Avventura",
    titolo: "Avventura",
    sottotitolo: "Viaggi, imprese e film che riempiono lo schermo",
    movie: { generi: [12], senzaGeneri: RUMORE },
    tv: {},
    chiavi: [g(12), g(10759)],
  },
  {
    key: "animazione",
    pillola: "Animazione",
    titolo: "Animazione",
    sottotitolo: "Disegnati, e non solo per i bambini",
    movie: { generi: [16], senzaGeneri: [99, 10770] },
    tv: {},
    chiavi: [g(16)],
  },
  {
    key: "classici",
    pillola: "Classici",
    titolo: "Classici",
    sottotitolo: "Quelli che bisognerebbe aver visto almeno una volta",
    // Nessun genere: un classico lo fanno gli anni e quanta gente lo ha votato
    movie: {
      generi: [],
      senzaGeneri: RUMORE,
      annoMax: 1989,
      votiMin: 1500,
      votoMin: 7.2,
    },
    tv: { annoMax: 1999, votiMin: 300, votoMin: 7.5 },
    chiavi: [decennio(1960), decennio(1970), decennio(1980)],
  },
  {
    key: "anime",
    pillola: "Anime",
    titolo: "Anime",
    sottotitolo: "Animazione giapponese, dai Ghibli alle serie di adesso",
    movie: { generi: [16], lingua: "ja", senzaGeneri: [99], votiMin: 150 },
    tv: { generi: [16], lingua: "ja", votiMin: 80 },
    chiavi: [g(16), lingua("ja")],
  },
  {
    key: "supereroi",
    pillola: "Supereroi",
    titolo: "Supereroi",
    sottotitolo: "Mantelli, poteri e squadre che si mettono insieme",
    movie: {
      generi: [28, 12, 878, 14],
      keyword: [KEYWORD_SUPEREROI],
      soloConKeyword: true,
    },
    tv: { generi: [10759, 10765], votiMin: 80 },
    chiavi: [g(28), g(878)],
  },
  {
    key: "storie-vere",
    pillola: "Storie vere",
    titolo: "Storie vere",
    sottotitolo: "È successo davvero, ed è il motivo per cui fa effetto",
    movie: {
      generi: [18, 36, 80, 53],
      keyword: [KEYWORD_STORIA_VERA],
      soloConKeyword: true,
    },
    tv: { generi: [18, 80], votiMin: 80 },
    chiavi: [g(18), g(36), g(80)],
  },
  {
    key: "commedia-italiana",
    pillola: "Commedia italiana",
    titolo: "Commedia italiana",
    sottotitolo: "Da Sordi a oggi, quella che parla la nostra lingua",
    movie: { generi: [35], lingua: "it", votiMin: 80, votoMin: 5.8 },
    tv: { generi: [35], lingua: "it", votiMin: 20, votoMin: 5.8 },
    chiavi: [g(35), lingua("it")],
  },
  {
    key: "cult-anni-80",
    pillola: "Cult anni 80",
    titolo: "Cult anni 80",
    sottotitolo: "Il decennio che non smette di tornare",
    movie: {
      generi: [],
      senzaGeneri: RUMORE,
      annoMin: 1980,
      annoMax: 1989,
      votiMin: 800,
      votoMin: 6.5,
    },
    tv: { annoMin: 1980, annoMax: 1989, votiMin: 100, votoMin: 6.8 },
    chiavi: [decennio(1980)],
  },
  {
    key: "documentari",
    pillola: "Documentari",
    titolo: "Documentari",
    sottotitolo: "Il mondo com'è, raccontato bene",
    movie: { generi: [99], votiMin: 100 },
    tv: { generi: [99], votiMin: 50 },
    chiavi: [g(99)],
  },
];

/**
 * Quante pillole si riordinano in testa. Tutte no: la fila diventerebbe una classifica
 * del gusto e al secondo colpo d'occhio non si troverebbe più niente dov'era.
 */
export const TESTA_PERSONALE = 4;

/** La voce di una chiave, o `null`: la chiave arriva dall'URL, cioè da chiunque. */
export function genreByKey(key: unknown): GenreEntry | null {
  if (typeof key !== "string") return null;
  return GENRES.find((e) => e.key === key) ?? null;
}

/**
 * La voce che copre un id di genere TMDB. Serve **solo** ai vecchi link
 * `/discover?genre=28`, che circolavano prima del catalogo (e possono stare in una
 * cronologia o in un link condiviso): si prende la prima voce che dichiara quell'id,
 * cioè il genere puro, mai un sottogenere. Nessuna corrispondenza → `null`, e la pagina
 * torna a Scopri.
 */
export function genreByTmdbId(id: number): GenreEntry | null {
  if (!Number.isInteger(id)) return null;
  return (
    GENRES.find(
      (e) =>
        e.movie.generi.includes(id) ||
        (Array.isArray(e.tv?.generi) && e.tv.generi.includes(id)),
    ) ?? null
  );
}

/** Le voci che hanno senso per un tipo: sotto "Serie TV" spariscono quelle solo film. */
export function genresFor(type: MediaType): GenreEntry[] {
  return type === "movie" ? GENRES : GENRES.filter((e) => e.tv !== null);
}

/**
 * La ricetta risolta per un tipo: la base dei film, con sopra le differenze dichiarate
 * per le serie. I generi restano quelli dei film quando `tv` non li riscrive — li
 * traduce chi chiama, con `genreIdsFor`.
 */
export function recipeFor(entry: GenreEntry, type: MediaType): GenreRecipe | null {
  if (type === "movie") return entry.movie;
  if (entry.tv === null) return null;
  return { ...entry.movie, ...entry.tv };
}

/**
 * L'affinità di una voce col profilo: il massimo fra le sue chiavi, sulle dimensioni
 * che dichiara. Un profilo che non conosce nessuna di quelle chiavi vale 0 — non
 * negativo: "non lo so" non è "non gli piace".
 */
export function genreAffinity(v: TasteVector, entry: GenreEntry): number {
  let max = 0;
  for (const c of entry.chiavi) {
    const valore = mappaDi(v, c.dimensione).get(c.chiave);
    if (valore != null && valore > max) max = valore;
  }
  return max;
}

/**
 * Le pillole nell'ordine giusto per questo utente: davanti i generi che guarda di più,
 * dietro tutti gli altri **nell'ordine del catalogo** (che è una scelta di prodotto,
 * non un caso). Profilo povero o assente → l'ordine del catalogo, identico per tutti.
 *
 * Stabile: a parità di affinità decide la posizione in `GENRES`, così la fila non balla
 * fra due render.
 */
export function orderGenres(
  type: MediaType,
  v: TasteVector | null,
  quante = TESTA_PERSONALE,
): GenreEntry[] {
  const elenco = genresFor(type);
  if (!v || !v.abbastanza) return elenco;
  const posizione = new Map(elenco.map((e, i) => [e.key, i]));
  const forti = elenco
    .map((e) => ({ e, a: genreAffinity(v, e) }))
    .filter((x) => x.a > 0)
    .sort((a, b) => b.a - a.a || posizione.get(a.e.key)! - posizione.get(b.e.key)!)
    .slice(0, quante)
    .map((x) => x.e);
  const scelte = new Set(forti.map((e) => e.key));
  return [...forti, ...elenco.filter((e) => !scelte.has(e.key))];
}
