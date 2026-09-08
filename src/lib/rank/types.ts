import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

/**
 * Tipi del motore di ranking (fase C). Stanno a parte perché li usano sia le funzioni
 * pure (`vector`, `affinity`, `diversity`, `explain`, provate con Vitest) sia i moduli
 * che parlano con TMDB e col database: nessuno dei due deve importare l'altro solo per
 * un'interfaccia. Stessa divisione di `src/lib/similar/types.ts`.
 */

export type MediaType = "movie" | "tv";

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
  voteCount: number | null;
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
}
