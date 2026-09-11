// Testo e frazione della barra per "riprendi dal minuto esatto" (fila "Continua a
// guardare"): il minutaggio arriva dall'estensione ZConnection su watch_entries.position_*.

import { presenceState } from "./presence";

/** Stima solo visiva a velocita' normale; ogni misura nuova sostituisce la base. */
export function projectedPosition(
  sample: { state: string; at: string; positionMs: number; durationMs: number | null },
  now: number,
): number {
  const elapsed =
    presenceState(sample, now) === "playing" ? now - Date.parse(sample.at) : 0;
  const position = Math.max(0, sample.positionMs) + elapsed;
  return sample.durationMs !== null && sample.durationMs > 0
    ? Math.min(sample.durationMs, position)
    : position;
}

/** Punto di ripresa effettivo, con precisione al secondo. */
export function resumeLabel(positionMs: number, _durationMs?: number | null): string {
  void _durationMs; // la durata non sostituisce mai il punto di ripresa
  const seconds = Math.max(0, Math.floor(positionMs / 1000));
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = String(seconds % 60).padStart(2, "0");
  return `Riprendi da ${h ? `${h}:${String(m).padStart(2, "0")}` : m}:${s}`;
}

/** Il punto salvato sopravvive alla sessione live e all'ultimo episodio finito. */
export function resumeEpisode(
  base: { season: number; episode: number; pct: number | null } | null,
  saved: {
    position_ms: number | null;
    position_season: number | null;
    position_episode: number | null;
  },
  live?: { seasonNumber: number | null; episodeNumber: number | null },
) {
  const episode =
    live?.episodeNumber ?? (saved.position_ms !== null ? saved.position_episode : null);
  if (episode == null) return base;
  return {
    season: live?.seasonNumber ?? saved.position_season ?? base?.season ?? 1,
    episode,
    pct: base?.pct ?? null,
  };
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

/** Minutaggio misurato per i due estremi della linea, senza durata inventata. */
export function playbackTime(valueMs: number | null): string | null {
  if (valueMs === null || !Number.isFinite(valueMs) || valueMs < 0) return null;
  const seconds = Math.floor(valueMs / 1000);
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = String(seconds % 60).padStart(2, "0");
  return `${h ? `${h}:${String(m).padStart(2, "0")}` : m}:${s}`;
}
