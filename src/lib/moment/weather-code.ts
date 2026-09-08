import type { Meteo } from "./context";

/**
 * La parte pura del meteo. Sta fuori da `weather.ts` perché quello dichiara
 * `server-only` e Vitest non potrebbe importarlo: stessa divisione fra
 * `rate-limit.ts` e `rate-limit-window.ts`.
 */

/** Sopra questa temperatura una serata è "caldo", sotto l'altra è "freddo". */
const CALDO = 28;
const FREDDO = 4;

/**
 * Codice WMO di Open-Meteo → una delle categorie che le ricette conoscono.
 * La temperatura corregge **solo** il sereno: sotto la pioggia il termometro non conta.
 */
export function meteoFromWmo(code: number, temperatura: number | null): Meteo | null {
  if (!Number.isFinite(code)) return null;
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return "neve";
  if (
    (code >= 51 && code <= 67) ||
    (code >= 80 && code <= 82) ||
    (code >= 95 && code <= 99)
  ) {
    return "pioggia";
  }
  const sereno = (code >= 0 && code <= 3) || code === 45 || code === 48;
  if (!sereno) return null;
  if (temperatura !== null && temperatura >= CALDO) return "caldo";
  if (temperatura !== null && temperatura <= FREDDO) return "freddo";
  return "sereno";
}

/**
 * Coordinata arrotondata a 0,1° (~11 km): è la chiave della cache del meteo. Senza,
 * il costo verso Open-Meteo crescerebbe col numero di utenti invece che col numero di
 * città.
 */
export function cella(v: number): number {
  return Math.round(v * 10) / 10;
}
