/** Codice di abbinamento della TV: sei cifre, dieci minuti di vita. */

export const CODICE_TTL_MS = 10 * 60 * 1000;

/** Sei cifre con gli zeri davanti: "000000" è un codice legittimo. */
export function generaCodice(casuale: () => number = Math.random): string {
  return String(Math.floor(casuale() * 1_000_000)).padStart(6, "0");
}

export function isCodiceValido(valore: unknown): valore is string {
  return typeof valore === "string" && /^[0-9]{6}$/.test(valore);
}

/** L'utente lo legge dalla TV e lo ribatte: spazi e trattini non sono errori. */
export function normalizzaCodice(valore: string): string {
  return valore.replace(/[\s-]/g, "");
}
