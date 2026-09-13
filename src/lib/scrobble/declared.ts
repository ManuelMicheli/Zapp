/**
 * La dichiarazione: "su questa TV, su questa piattaforma, sta andando questo
 * titolo perche' l'ha lanciato Zapp". Serve alle piattaforme che non pubblicano
 * il titolo nei metadati (Netflix, Prime, app Apple TV: sonda del 12/09/2026).
 *
 * Pura. La riga sta in `device_commands` (`delivered_at`, `last_position_ms`,
 * `last_seen_at`); chi la legge e' l'ingest di `/api/scrobble` (Task 13).
 */
export interface Dichiarazione {
  titleId: number;
  mediaType: "movie" | "tv";
  deliveredAt: string;
  lastPositionMs: number | null;
  lastSeenAt: string | null;
}

/** Trenta minuti dall'ultimo evento attribuito (o dalla consegna). */
export const FINESTRA_MS = 30 * 60 * 1000;

/**
 * Un riavvolgimento sotto questa quota e' ancora lo stesso titolo; una posizione
 * che torna vicino a zero da molto piu' avanti e' un altro titolo scelto a mano
 * (l'episodio successivo su Netflix riparte da zero: la serie e' la stessa, e
 * l'ingest lo gestisce per stagione/episodio, non qui).
 */
const RIAVVOLGIMENTO_MAX_MS = 10 * 60 * 1000;

export function dichiarazioneValida(
  d: Dichiarazione,
  positionMs: number,
  adesso: string,
): boolean {
  const riferimento = Date.parse(d.lastSeenAt ?? d.deliveredAt);
  const ora = Date.parse(adesso);
  if (!Number.isFinite(riferimento) || !Number.isFinite(ora)) return false;
  if (ora - riferimento > FINESTRA_MS) return false;
  if (d.lastPositionMs != null && d.lastPositionMs - positionMs > RIAVVOLGIMENTO_MAX_MS) {
    return false;
  }
  return true;
}
