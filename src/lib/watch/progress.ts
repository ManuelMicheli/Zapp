// Testo e frazione della barra per "riprendi dal minuto esatto" (fila "Continua a
// guardare"): il minutaggio arriva dall'estensione ZConnection su watch_entries.position_*.

/** Minuti interi, mai arrotondati per eccesso: "18 min" a 18:59. */
function minuti(ms: number): number {
  return Math.floor(ms / 60_000);
}

/** "18 min di 76", oppure "18 min" senza durata nota. */
export function resumeLabel(positionMs: number, durationMs: number | null): string {
  const m = minuti(positionMs);
  if (m < 1) return "appena iniziato";
  return durationMs ? `${m} min di ${minuti(durationMs)}` : `${m} min`;
}

/** Frazione per la barra; null quando non c'è una durata su cui calcolarla. */
export function resumeRatio(
  positionMs: number,
  durationMs: number | null,
): number | null {
  if (!durationMs || durationMs <= 0) return null;
  return Math.min(positionMs / durationMs, 1);
}

/** Stagione ed episodio di una tessera o di una riproduzione; null = film. */
export interface EpisodeRef {
  season: number | null;
  episode: number | null;
}

/**
 * La riproduzione in corso è **proprio** l'episodio che la tessera mostra?
 *
 * La stagione va confrontata con tolleranza in una direzione sola. Su Netflix
 * il numero di stagione è esposto **solo** dal pannello di pausa
 * (`pause-ad-title-display`): guardando normalmente non c'è da nessuna parte, e
 * `parseMedia` non lo inventa — quindi `position_season` resta `null` mentre la
 * tessera sa benissimo di mostrare la stagione 1. Pretendendo l'uguaglianza,
 * `null === 1` è falso e per **ogni serie** il minutaggio vero non compariva
 * mai: restava la durata dell'episodio, che è un'altra cosa. Perciò: episodio
 * uguale sempre, stagione uguale **oppure sconosciuta**.
 *
 * La tolleranza vale solo per lo sconosciuto, mai per il diverso: una stagione
 * 2 dichiarata non combacia con una tessera della stagione 1. Il rischio che
 * resta è l'episodio con lo stesso numero in un'altra stagione, guardato senza
 * mai mettere in pausa; in cambio, senza tolleranza, non funzionava niente.
 */
export function samePlayingEpisode(shown: EpisodeRef, live: EpisodeRef): boolean {
  // Film: nessuno dei due deve avere un episodio.
  if (shown.episode === null) return live.episode === null;
  if (live.episode !== shown.episode) return false;
  return live.season === null || live.season === shown.season;
}
