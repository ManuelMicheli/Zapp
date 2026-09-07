import "server-only";

import { romeDateString } from "./dates";
import { getDayProgramme, type DayProgramme } from "./day";

export type TodayProgramme = DayProgramme;

/**
 * Programmazione di oggi vicino all'utente, condivisa da `/cinema` e dal banner
 * "Al cinema oggi" in home. Vedi `getDayProgramme` in `day.ts`.
 */
export function getTodayProgramme(): Promise<TodayProgramme> {
  return getDayProgramme(romeDateString());
}
