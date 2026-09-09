import type { PlaybackState } from "./types";

// Regole pure di completamento e minutaggio (spec §7.5, §11, §11-bis). La RPC
// `scrobble_apply` (Task 6) le applica lato server: se cambi una soglia qui,
// cambiala anche li'.

/** Oltre questa frazione della durata, l'episodio e' visto. */
export const COMPLETE_RATIO = 0.9;
/** Alla chiusura della sessione basta un po' meno: i titoli di coda contano. */
export const CLOSE_RATIO = 0.85;
/** Una sessione senza heartbeat da piu' di 4 ore e' orfana: si chiude. */
export const SESSION_STALE_MS = 4 * 60 * 60 * 1000;

export interface SessionState {
  positionMs: number;
  durationMs: number | null;
  lastAt: string;
}

export interface Intent {
  session: { state: PlaybackState; positionMs: number; durationMs: number | null };
  /** true = l'episodio o il film e' finito: si segna visto e si azzera il punto. */
  completed: boolean;
  /** dove riprendere; null quando e' completato (non c'e' piu' un "riprendi"). */
  progress: { positionMs: number; durationMs: number | null } | null;
  /** valorizzato quando non si scrive niente, e perche'. */
  ignore: "stale" | "no-duration" | null;
}

/**
 * Dato lo stato precedente della sessione e un nuovo evento, decide cosa
 * scrivere. Puro: non tocca DB ne' rete, lo fa la RPC `scrobble_apply`.
 *
 * Regole:
 * - un evento con `at` piu' vecchio dell'ultimo visto si scarta (heartbeat
 *   fuori ordine); un riavvolgimento con un `at` piu' recente resta legittimo;
 * - completo oltre COMPLETE_RATIO, oppure alla chiusura della sessione oltre
 *   CLOSE_RATIO (`closing: true`);
 * - durata sconosciuta: mai completamento automatico, ma il minuto si salva
 *   comunque (`ignore` resta null finche' c'e' una posizione valida);
 * - a completamento il punto di ripresa si azzera (`progress: null`).
 */
export function decide(input: {
  previous: SessionState | null;
  state: PlaybackState;
  at: string;
  positionMs: number | null;
  durationMs: number | null;
  closing: boolean;
}): Intent {
  const { previous, state, at, positionMs, durationMs, closing } = input;

  if (positionMs === null || !Number.isFinite(positionMs) || positionMs < 0) {
    return {
      session: {
        state,
        positionMs: previous?.positionMs ?? 0,
        durationMs: durationMs ?? previous?.durationMs ?? null,
      },
      completed: false,
      progress: null,
      ignore: "no-duration",
    };
  }

  if (previous && Date.parse(at) < Date.parse(previous.lastAt)) {
    return {
      session: { state, positionMs: previous.positionMs, durationMs: previous.durationMs },
      completed: false,
      progress: null,
      ignore: "stale",
    };
  }

  const ratio = durationMs && durationMs > 0 ? positionMs / durationMs : null;
  const soglia = closing ? CLOSE_RATIO : COMPLETE_RATIO;
  const completed = ratio !== null && ratio >= soglia;

  return {
    session: { state, positionMs, durationMs },
    completed,
    progress: completed ? null : { positionMs, durationMs },
    ignore: null,
  };
}
