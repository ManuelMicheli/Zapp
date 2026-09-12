/**
 * Per quanto un lancio continua a dare il nome a cio' che la TV riferisce.
 *
 * Netflix, Prime e l'app Apple TV mandano posizione e stato perfetti e **nessun
 * titolo**: l'unico modo di sapere cosa sta suonando e' che sia stata Zapp ad
 * aprirlo. Questa funzione decide quando quella deduzione vale ancora.
 *
 * La regola e' severa di proposito. Un titolo attribuito male scrive in libreria
 * una visione che non c'e' stata, e lo fa in silenzio; una dichiarazione che cade
 * lascia una sessione anonima, che si vede.
 */
export interface Dichiarazione {
  titleId: number;
  mediaType: "movie" | "tv";
  /** Quando la TV ha ritirato il comando. */
  deliveredAt: string;
  /** Ultima posizione attribuita a questa dichiarazione, se ce n'e' stata una. */
  lastPositionMs: number | null;
  lastSeenAt: string | null;
}

/** Oltre questo silenzio la dichiarazione non vale piu'. */
export const FINESTRA_MS = 30 * 60 * 1000;

/**
 * Sotto questa posizione si e' "all'inizio": se prima eravamo ben oltre, non e'
 * un riavvolgimento, e' un altro titolo.
 */
const INIZIO_MS = 2 * 60 * 1000;
/** Sopra questa posizione eravamo "dentro" la visione. */
const DENTRO_MS = 10 * 60 * 1000;

export function dichiarazioneValida(
  d: Dichiarazione,
  positionMs: number,
  adesso: string,
): boolean {
  const ora = Date.parse(adesso);
  if (!Number.isFinite(ora)) return false;

  // Non si e' ancora attribuito niente: vale la distanza dal lancio.
  if (d.lastSeenAt === null || d.lastPositionMs === null) {
    const consegna = Date.parse(d.deliveredAt);
    return Number.isFinite(consegna) && ora - consegna <= FINESTRA_MS;
  }

  const ultimo = Date.parse(d.lastSeenAt);
  if (!Number.isFinite(ultimo) || ora - ultimo > FINESTRA_MS) return false;

  // Tornati quasi a zero venendo da dentro la visione: e' un altro titolo.
  if (positionMs < INIZIO_MS && d.lastPositionMs > DENTRO_MS) return false;

  return true;
}
