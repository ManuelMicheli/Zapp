/**
 * Che momento è, per l'utente: ora, giorno e mese nel fuso italiano, più il meteo
 * quando c'è. Puro apposta — è la funzione che decide quale fila vede l'utente, e va
 * provata a ore e date scelte, non a quelle dell'orologio di chi lancia i test.
 */

export type Meteo = "pioggia" | "neve" | "sereno" | "caldo" | "freddo";

/** Zapp è in italiano, per l'Italia: il fuso è uno solo (vedi la regola in CLAUDE.md). */
export const FUSO = "Europe/Rome";

export interface MomentContext {
  /** 0-23, nel fuso di Roma. */
  ora: number;
  /** 0 = domenica, 6 = sabato. */
  giorno: number;
  /** 1-12. */
  mese: number;
  meteo: Meteo | null;
}

const GIORNI: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

/**
 * **L'ora non è quella del server.** Le funzioni girano in `fra1` con orologio UTC:
 * alle 23:40 italiane `new Date().getHours()` risponde 21, e "Notte fonda" non sarebbe
 * uscita mai mentre "Pausa pranzo" sarebbe comparsa alle 14 vere.
 */
export function contextAt(now: Date, meteo: Meteo | null = null): MomentContext {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: FUSO,
    hour: "2-digit",
    hour12: false,
    weekday: "short",
    month: "numeric",
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return {
    // `hour12: false` può rendere "24" a mezzanotte in alcune implementazioni di ICU
    ora: Number(get("hour")) % 24,
    giorno: GIORNI[get("weekday")] ?? 0,
    mese: Number(get("month")),
    meteo,
  };
}
