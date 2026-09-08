import type { Meteo } from "./context";

/**
 * La parte pura del meteo. Sta fuori da `weather.ts` perché quello dichiara
 * `server-only` e Vitest non potrebbe importarlo: stessa divisione fra
 * `rate-limit.ts` e `rate-limit-window.ts`.
 */

/** Sopra questa temperatura fa "caldo", sotto l'altra fa "freddo". */
const CALDO = 28;
const FREDDO = 4;
/** Oltre questa copertura il cielo si racconta come "nuvoloso". */
const NUVOLE = 70;

/** Quello che Open-Meteo dice del posto in questo momento. */
export interface Osservazione {
  /** Codice WMO. È una *previsione di zona*, non una misura: vedi sotto. */
  code: number;
  temperatura: number | null;
  /** Millimetri caduti nell'ultimo quarto d'ora. La misura vera. */
  precipitazione: number | null;
  /** Copertura nuvolosa in percentuale. Serve solo all'etichetta. */
  nuvole: number | null;
}

function nevica(code: number): boolean {
  return (code >= 71 && code <= 77) || code === 85 || code === 86;
}

/**
 * L'osservazione → una delle categorie che le ricette conoscono.
 *
 * **Comanda la pioggia misurata, non il codice.** Il 2026-09-08 a Ossona Open-Meteo
 * rispondeva `weather_code: 80` ("rovesci") con `precipitation: 0.0` e 30,8 °C: la fila
 * diceva "piove" mentre fuori c'erano trenta gradi e il sole. Il codice WMO descrive la
 * situazione prevista sulla cella, la precipitazione è quanto è caduto davvero — e su
 * quello che sta succedendo adesso ha ragione la seconda.
 *
 * Quindi: niente pioggia e niente neve con zero millimetri, qualunque cosa dica il
 * codice. Il codice serve solo a distinguere la neve dalla pioggia quando qualcosa
 * *sta* cadendo.
 */
export function meteoDa(o: Osservazione): Meteo | null {
  if (!Number.isFinite(o.code)) return null;
  const cade = (o.precipitazione ?? 0) > 0;
  if (cade) return nevica(o.code) ? "neve" : "pioggia";
  if (o.temperatura !== null && o.temperatura >= CALDO) return "caldo";
  if (o.temperatura !== null && o.temperatura <= FREDDO) return "freddo";
  return "sereno";
}

/**
 * Come si racconta all'utente: **i gradi ci sono sempre**, così una riga come
 * "30° e piove" non può più uscire senza che si veda subito che è sbagliata.
 * `null` quando manca perfino la temperatura: meglio niente che una mezza verità.
 */
export function etichettaMeteo(o: Osservazione): string | null {
  if (o.temperatura === null || !Number.isFinite(o.temperatura)) return null;
  const gradi = `${Math.round(o.temperatura)}°`;
  const cade = (o.precipitazione ?? 0) > 0;
  if (cade) return `${gradi} e ${nevica(o.code) ? "nevica" : "piove"}`;
  if (o.nuvole !== null && o.nuvole >= NUVOLE) return `${gradi} e nuvoloso`;
  return `${gradi} e sereno`;
}

/**
 * Coordinata arrotondata a 0,1° (~11 km): è la chiave della cache del meteo. Senza,
 * il costo verso Open-Meteo crescerebbe col numero di utenti invece che col numero di
 * città.
 */
export function cella(v: number): number {
  return Math.round(v * 10) / 10;
}
