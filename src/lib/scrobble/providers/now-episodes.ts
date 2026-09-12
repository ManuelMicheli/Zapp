/**
 * Da un nome di episodio alla serie, per NOW.
 *
 * Sulla TV NOW pubblica nella `MediaSession` il nome dell'**episodio**, non
 * quello della serie, e nessun numero (misurato sulla Fire TV il 12/09/2026:
 * guardando *Atomic* diceva `Al Britani`). Cercare quel testo su TMDB come se
 * fosse un'opera trova, nel migliore dei casi, un omonimo sbagliato.
 *
 * L'indice lo costruisce `scripts/build-now-episodes.ts` scorrendo le stagioni
 * del catalogo NOW Italia, e tiene fuori i nomi che non distinguono niente
 * (`Episodio 4`) e quelli ambigui fra serie diverse.
 *
 * **La regola che conta: nel dubbio non si risolve.** Un episodio indovinato
 * male scrive in libreria qualcosa che l'utente non ha guardato, e lo fa in
 * silenzio; un episodio non riconosciuto finisce in `pending_scrobbles`, dove
 * si vede.
 */

import indiceGenerato from "@/data/now-episodes.json";

/** Una collocazione possibile per un nome di episodio. */
export interface VoceNow {
  /** id TMDB della serie */
  s: number;
  /** stagione */
  n: number;
  /** episodio */
  e: number;
  /** durata in minuti secondo TMDB, quando la conosce */
  d: number | null;
}

export type IndiceNow = Record<string, VoceNow[]>;

/**
 * Quanto puo' discostarsi la durata dello stream da quella di TMDB. Due minuti:
 * su *Atomic* NOW diceva 46,2 minuti e TMDB 46, ma le sigle e i riassunti
 * iniziali spostano facilmente un minuto in su o in giu'.
 */
const TOLLERANZA_MIN = 2;

/** Senza accenti, senza punteggiatura, minuscolo: come nell'indice. */
export function normalizzaNome(nome: string): string {
  return nome
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function risolviEpisodioNow(
  nome: string,
  durataMs: number | null,
  indice: IndiceNow = indiceGenerato as IndiceNow,
): { titleId: number; season: number; episode: number } | null {
  const chiave = normalizzaNome(nome);
  if (!chiave) return null;

  const voci = indice[chiave];
  if (!voci || voci.length === 0) return null;
  if (voci.length === 1) return collocazione(voci[0]);

  // Piu' di una collocazione: decide la durata, e solo lei. Senza, si rinuncia.
  if (durataMs === null || !Number.isFinite(durataMs) || durataMs <= 0) return null;
  const minuti = durataMs / 60_000;

  const vicine = voci.filter(
    (v) => v.d !== null && Math.abs(v.d - minuti) <= TOLLERANZA_MIN,
  );
  // Zero: nessuna somiglia. Piu' d'una: somigliano in troppe, e sceglierne una
  // sarebbe tirare a indovinare.
  return vicine.length === 1 ? collocazione(vicine[0]) : null;
}

function collocazione(v: VoceNow) {
  return { titleId: v.s, season: v.n, episode: v.e };
}
