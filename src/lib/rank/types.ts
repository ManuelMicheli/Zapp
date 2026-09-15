import type { SupabaseClient } from "@supabase/supabase-js";
import type { HomeScope } from "@/lib/home/scope";
import type { Database } from "@/types/database";

/**
 * Tipi del motore di ranking (fase C). Stanno a parte perché li usano sia le funzioni
 * pure (`vector`, `affinity`, `diversity`, `explain`, provate con Vitest) sia i moduli
 * che parlano con TMDB e col database: nessuno dei due deve importare l'altro solo per
 * un'interfaccia. Stessa divisione di `src/lib/similar/types.ts`.
 */

export type MediaType = "movie" | "tv";

/** La posizione in classifica di un candidato, quando ce l'ha. */
export interface InChart {
  /** Id TMDB della piattaforma che pubblica la classifica. */
  providerId: number;
  rank: number;
  /** `true` solo per il Top 10 ufficiale di Netflix; il resto è una stima. */
  official: boolean;
}

/**
 * I pesi delle sette dimensioni del gusto. Sono un **parametro** e non una costante
 * perché la taratura per utente (`tune.ts`) li sposta: chi si fa convincere dai registi
 * finisce con `persone` più alto di chi si fa convincere dai generi. I pesi di partenza
 * stanno in `PESI_BASE` (`affinity.ts`) e valgono per chi non ha ancora campione.
 */
export type PesiGusto = Record<Dimensione, number>;

/** Un titolo che può finire nei consigli, con tutto ciò che serve a pesarlo. */
export interface RankCandidate {
  id: number;
  mediaType: MediaType;
  title: string;
  posterPath: string;
  /** Serve al carosello in testa alla home, che è a tutta larghezza. */
  backdropPath: string | null;
  overview: string | null;
  year: string | null;
  genreIds: number[];
  /** Minuti; `null` per quasi tutte le serie. */
  runtime: number | null;
  originalLanguage: string | null;
  providerIds: number[];
  /**
   * Etichette `Regia:Nome` / `Cast:Nome`, nella stessa forma di `user_taste.persone`.
   * Vuoto per i titoli non ancora in cache: leggerne i crediti costerebbe `titles.raw`
   * per centinaia di righe (vedi §6 della spec).
   */
  people: string[];
  /**
   * ZappScore **0-10** (fase B), quando c'è. La scala è quella: `title_ratings.zapp_score`
   * vale 9.2 per il titolo più alto del catalogo, non 92 — scritto qui perché darlo per
   * 0-100 divideva la qualità per dieci senza che nulla si rompesse (visto il 2026-09-07
   * interrogando la tabella, non da un test).
   */
  zappScore: number | null;
  /** Voto TMDB 0-10, ripiego. */
  voteAverage: number | null;
  /**
   * Quanti voti su TMDB. **Non è un dettaglio del voto: è la fama.** È l'unica misura di
   * "quanta gente l'ha visto" che abbiamo per ogni titolo, si accumula per anni e non
   * torna indietro — al contrario di `popularity`, che conta le visite alla pagina TMDB
   * di questa settimana e quindi premia proprio le uscite che nessuno conosce ancora.
   * Vedi `fame.ts`.
   */
  voteCount: number | null;
  /**
   * La posizione in classifica in Italia **adesso** (`title_charts`, finestra corrente),
   * quando c'è. Alza la fama a `FAMA_IN_CLASSIFICA` e scrive il motivo sotto la
   * copertina: senza, una serie uscita martedì — duecento voti su TMDB e mezza Italia
   * davanti — resterebbe in fondo alla lista proprio mentre è la cosa più "del momento"
   * che esista.
   */
  inChart: InChart | null;
  /**
   * Quanto il titolo è già stato mostrato senza essere mai aperto, da 0 a 1: 1 = mai
   * visto, valori più bassi = "questa copertina te l'ho già fatta scorrere davanti".
   * Moltiplica il punteggio. Vedi `stanchezza` in `candidates.ts`.
   */
  freschezza: number;
  /**
   * Quanti amici l'hanno visto e come l'hanno votato (fase E). `null` quando nessuno
   * degli amici lo ha in libreria — che è il caso della maggior parte dei titoli.
   */
  friends: SocialSignal | null;
}

/** Il segnale sociale su un titolo: chi, quanti, e se gli è piaciuto. */
export interface SocialSignal {
  amici: number;
  /** Media dei voti che gli amici gli hanno dato, `null` se nessuno l'ha votato. */
  votoMedio: number | null;
  /** Al massimo tre nomi, e servono solo al motivo sotto la copertina. */
  nomi: string[];
}

/** Le dimensioni su cui si misura il gusto: l'ordine non conta, i nomi sì. */
export type Dimensione =
  "generi" | "decenni" | "provider" | "persone" | "tipo" | "runtime" | "lingua";

/**
 * Le dimensioni che possono fare da **motivo** sotto una copertina: quelle del gusto,
 * più gli amici. `amici` non è una dimensione del gusto — gli amici non sono un gusto,
 * sono una spinta — e per questo non entra in `TasteVector` né nei pesi dell'affinità.
 */
export type MotivoDimensione = Dimensione | "amici";

/** Quanto una singola dimensione ha spinto (o frenato) questo titolo. */
export interface Contributo {
  dimensione: MotivoDimensione;
  /** La chiave che ha vinto dentro quella dimensione: `28`, `Regia:Nolan`, `2010`… */
  chiave: string;
  /** Quota normalizzata, da −1 a 1. */
  valore: number;
}

export interface Affinita {
  /** 0..1, l'ordinamento interno. */
  punteggio: number;
  /** 0-100 da mostrare, oppure `null` se il profilo non la giustifica ancora. */
  percentuale: number | null;
  /** In ordine di peso decrescente. */
  contributi: Contributo[];
}

/** Un candidato dopo il passaggio nel motore. */
export interface RankedItem extends RankCandidate {
  punteggio: number;
  percentuale: number | null;
  contributi: Contributo[];
  /** Il motivo già scritto in italiano, o `null` se non c'è niente da dire. */
  motivo: string | null;
}

/**
 * Il client Supabase usato dal motore. È un parametro e non un import fisso perché in
 * pagina arriva quello legato ai cookie (RLS attiva) e nello script di collaudo quello
 * di servizio: il motore legge solo catalogo e voti, che sono uguali per tutti.
 */
export type Db = SupabaseClient<Database>;

/** Ciò che il motore deve sapere dell'utente senza andarselo a prendere da solo. */
export interface RankContext {
  db: Db;
  /** Serve al segnale sociale: le entry degli amici si leggono con le policy di lui. */
  userId: string;
  /** Chiavi `tipo-id` dei titoli già in libreria: non si consigliano. */
  inLibreria: ReadonlySet<string>;
  /** Generi dedotti dalla libreria, usati finché il profilo della fase A è povero. */
  generiDiRipiego: number[];
  /**
   * Le persone che l'utente ha messo fra i preferiti a mano, nella forma di
   * `title_people` (`Cast:Pedro Pascal`). Arrivano **come parametro** e non da
   * `getViewer()`: il motore deve poter girare fuori da una richiesta HTTP, che è
   * l'unico modo di leggerne le liste da riga di comando. Il 2026-09-14 una lettura
   * nascosta dentro `rankFor` ha rotto `scripts/rank-dump.ts` per un giorno intero e
   * nessun test se n'è accorto.
   */
  preferiti: ReadonlySet<string>;
  /**
   * Quante sessioni distinte, negli ultimi giorni, hanno mostrato una copertina senza
   * che venisse mai aperta. Chiave `tipo-id`. Vedi `freschezzaDi`.
   */
  mostratiSenzaApertura: ReadonlyMap<string, number>;
  /** Seme della rotazione giornaliera dei classici: id utente + giorno. */
  seme: number;
}

export interface CandidateOptions {
  /** La home mantiene il segnale sociale; un profilo condiviso non appartiene al viewer. */
  includeSocial?: boolean;
  /** La home filtrata per genere e/o piattaforma: cambia da dove vengono i candidati. */
  scope?: HomeScope;
}
