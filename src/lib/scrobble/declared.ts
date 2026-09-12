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

  // Stato incoerente: un solo fra i due campi valorizzato e' sospetto. Trattare
  // come se lo stato fosse corrotto, quindi scartare.
  if ((d.lastSeenAt === null) !== (d.lastPositionMs === null)) {
    return false;
  }

  // Non si e' ancora attribuito niente: valido se adesso >= consegna e entro la finestra.
  // Se adesso e' prima della consegna (logicamente impossibile, il lancio non è ancora avvenuto),
  // rigettare.
  if (d.lastSeenAt === null && d.lastPositionMs === null) {
    const consegna = Date.parse(d.deliveredAt);
    if (!Number.isFinite(consegna)) return false;
    const distanza = ora - consegna;
    if (distanza < 0) return false; // La consegna non e' ancora avvenuta
    return distanza <= FINESTRA_MS;
  }

  // Con storico: valido solo se l'ultimo avvistamento e' entro la finestra (in valore
  // assoluto per tollerare piccoli disallineamenti di orologio fra TV e server).
  const ultimo = Date.parse(d.lastSeenAt!);
  if (!Number.isFinite(ultimo)) return false;
  const distanza = ora - ultimo;
  // Tollerare fino a 30 secondi di retrocessione (orologio leggermente scorretto),
  // ma rigettare se il passato e' troppo (ore): non accade in una sessione di visione.
  if (distanza < -30_000) return false;
  if (Math.abs(distanza) > FINESTRA_MS) return false;

  // Tornati quasi a zero venendo da dentro la visione: e' un altro titolo.
  if (positionMs < INIZIO_MS && d.lastPositionMs! >= DENTRO_MS) return false;

  return true;
}
