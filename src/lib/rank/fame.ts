import { SOURCE_CALIBRATION } from "@/lib/ratings/score";
import type { MediaType, RankCandidate } from "./types";

export type { InChart } from "./types";

/**
 * La fama: **quanta gente ha visto questo titolo**, e se lo sta guardando adesso.
 *
 * È il pezzo che mancava al punteggio della fase C. Senza, un film del 2026 con 307
 * voti di fan entusiasti batteva Il Padrino: misurato il 2026-09-15 chiedendo a TMDB
 * gli stessi parametri del motore (`vote_count.gte=300`, `popularity.desc`), dove fra i
 * primi venti candidati di "Azione" ce n'erano otto con meno di mille voti e una data
 * di uscita di questo mese.
 *
 * **`popularity` di TMDB non è fama** ed è per questo che non compare qui: misura le
 * visite alla pagina TMDB di questa settimana, quindi premia esattamente ciò che
 * disturba — le uscite recenti di cui nessuno ha ancora sentito parlare. I voti, invece,
 * si accumulano per anni e non tornano indietro.
 *
 * Funzione pura, niente `server-only`: è la metà dell'algoritmo che si deve poter
 * leggere in un test.
 */

/**
 * Il numero di voti che vale "lo conoscono tutti", per tipo. Le serie hanno un ordine di
 * grandezza in meno su TMDB (Breaking Bad ~15.000, Il Padrino ~23.000): con la stessa
 * scala dei film nessuna serie arriverebbe mai in cima.
 */
export const RIF_FAMA: Record<MediaType, number> = {
  movie: 50_000,
  tv: 15_000,
};

/**
 * Sotto questi voti un titolo non si consiglia affatto.
 *
 * La vecchia soglia (300 film / 100 serie) non escludeva niente di ciò che disturbava:
 * trecento voti su TMDB è un film che non conosce nessuno. Le eccezioni — classifica,
 * amici, persone preferite — le decide `passaIlPavimento`, e sono tutte cose che
 * sappiamo noi e TMDB non sa.
 */
export const PAVIMENTO_VOTI: Record<MediaType, number> = {
  movie: 800,
  tv: 200,
};

/**
 * La fama di chi sta in classifica adesso.
 *
 * Alta apposta, e apposta **non 1**: una serie uscita martedì che mezza Italia sta
 * guardando ha duecento voti su TMDB, e senza questa riga il motore la ucciderebbe
 * proprio mentre è la cosa più "del momento" che esista. Resta però sotto un classico
 * con trentamila voti, perché essere nella Top 10 di questa settimana non è ancora
 * essere Il Padrino.
 */
export const FAMA_IN_CLASSIFICA = 0.85;

/** Fama di un titolo di cui non sappiamo i voti: né premiato né punito. */
export const FAMA_NEUTRA = 0.5;

/** Qualità di un titolo senza alcun voto: né premiato né punito. */
export const QUALITA_NEUTRA = 0.6;

/**
 * Quante sessioni con la copertina davanti e mai un tocco bastano a stancare, e quante
 * bastano a far sparire il titolo.
 *
 * Non è un doppione dello skip della fase A: quello cambia il **profilo** (impara che
 * quel genere non ti interessa) e si applica al prossimo giro del job; questo cambia
 * **quel titolo** e si applica subito. Senza, la stessa copertina resta in cima alla
 * stessa fila finché non la apri — cioè per sempre, se non ti interessa.
 */
export const STANCA_DA = 3;
export const SPARISCE_DA = 6;
/** Quanto scende un titolo stanco: abbastanza da farlo scavalcare, non da cancellarlo. */
export const FRESCHEZZA_STANCA = 0.6;

/** Da quante sessioni l'utente l'ha ignorato a quanto vale ancora mostrarlo, 0..1. */
export function freschezzaDi(sessioniIgnorate: number | undefined): number {
  if (!sessioniIgnorate || sessioniIgnorate < STANCA_DA) return 1;
  if (sessioniIgnorate >= SPARISCE_DA) return 0;
  return FRESCHEZZA_STANCA;
}

/** Quanto è conosciuto, da 0 a 1, solo in base ai voti. */
export function famaDaVoti(voti: number | null, type: MediaType): number {
  if (voti === null || !Number.isFinite(voti) || voti <= 0) return FAMA_NEUTRA;
  // Logaritmica: lineare farebbe valere zero tutto ciò che non è Avatar.
  const scala = Math.log10(1 + voti) / Math.log10(1 + RIF_FAMA[type]);
  return Math.min(1, Math.max(0, scala));
}

/** La fama di un candidato: la più alta fra i voti accumulati e la classifica di oggi. */
export function fama(
  c: Pick<RankCandidate, "mediaType" | "voteCount" | "inChart">,
): number {
  const daiVoti = famaDaVoti(c.voteCount, c.mediaType);
  return c.inChart ? Math.max(daiVoti, FAMA_IN_CLASSIFICA) : daiVoti;
}

/**
 * Il voto TMDB **tirato** verso la media della fonte, come fa la fase B per lo
 * ZappScore: `(voti·R + m·C) / (voti + m)`.
 *
 * Senza questo tiraggio un 9,17 con 307 voti valeva 0,92 di qualità, più del Padrino.
 * La calibrazione non si riscrive qui: è la stessa riga `SOURCE_CALIBRATION.tmdb` che la
 * fase B usa da sempre, e due calibrazioni diverse dello stesso numero divergerebbero
 * alla prima taratura.
 */
export function qualitaTirata(voto: number | null, voti: number | null): number | null {
  if (voto === null || !Number.isFinite(voto) || voto <= 0) return null;
  const { m, c } = SOURCE_CALIBRATION.tmdb;
  const n = voti !== null && Number.isFinite(voti) && voti > 0 ? voti : 0;
  const tirato = (n * voto + m * c) / (n + m);
  return Math.min(1, Math.max(0, tirato / 10));
}

/**
 * 0..1 dal voto: ZappScore se c'è (è già tirato), altrimenti il voto TMDB tirato,
 * altrimenti neutro.
 *
 * `zapp_score` è su **0-10**, non 0-100: trattarlo come percentuale divideva per dieci
 * la qualità di ogni candidato letto dal database e le liste restavano plausibili lo
 * stesso. È pinnato da un test apposta.
 */
export function qualitaDi(
  c: Pick<RankCandidate, "zappScore" | "voteAverage" | "voteCount">,
): number {
  if (c.zappScore !== null && Number.isFinite(c.zappScore)) {
    return Math.min(1, Math.max(0, c.zappScore / 10));
  }
  return qualitaTirata(c.voteAverage, c.voteCount) ?? QUALITA_NEUTRA;
}

/**
 * `true` se il candidato ha abbastanza seguito per essere consigliato.
 *
 * Le tre esenzioni sono le tre cose che sappiamo noi e TMDB no: è in classifica in
 * Italia adesso, l'ha visto e apprezzato un amico, o porta una persona che l'utente ha
 * messo fra i preferiti a mano. Un titolo con zero voti dichiarati (i candidati letti
 * dal database prima di `arricchisci`) non viene bocciato qui: passa, e sarà la fama
 * neutra a non premiarlo.
 */
export function passaIlPavimento(
  c: Pick<RankCandidate, "mediaType" | "voteCount" | "inChart" | "friends" | "people">,
  preferiti: ReadonlySet<string> = new Set(),
): boolean {
  if (c.inChart) return true;
  if (c.friends && c.friends.amici > 0) return true;
  if (preferiti.size > 0 && c.people.some((p) => preferiti.has(p))) return true;
  const voti = c.voteCount;
  if (voti === null || !Number.isFinite(voti) || voti <= 0) return true;
  return voti >= PAVIMENTO_VOTI[c.mediaType];
}
