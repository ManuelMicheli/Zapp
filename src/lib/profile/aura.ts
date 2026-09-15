import { PROGRESSION_LEVELS, type ProgressionCounts } from "./progression";
import { buildProgression } from "./progression";

/**
 * Aura del percorso: il colore che il profilo prende in base al livello.
 *
 * Perche' una scala fredda -> calda invece del solo viola dell'app: con otto
 * livelli, cambiare solo l'intensita' di un'unica tinta li rende quasi
 * indistinguibili fra uno e il successivo. Qui si parte dal grigio-azzurro di una
 * sala spenta e si arriva all'oro, passando dal viola del marchio a meta' strada,
 * cosi' la salita si vede davvero. Nei livelli centrali l'alfa resta bassa: la
 * testata non deve mettersi a litigare col viola del marchio.
 *
 * Le tinte sono in componenti (`"110 140 190"`), non in esadecimale: servono
 * dentro `rgb(... / alfa)` e come variabile CSS, dove l'alfa cambia da sola.
 */
export interface Aura {
  rgb: string;
  /** opacita' dell'alone in testata; attorno alla fascia si usa piu' bassa */
  alpha: number;
}

const SCALA: readonly Aura[] = [
  { rgb: "110 140 190", alpha: 0.16 },
  { rgb: "104 158 186", alpha: 0.22 },
  { rgb: "116 150 200", alpha: 0.28 },
  { rgb: "142 132 214", alpha: 0.34 },
  { rgb: "176 128 198", alpha: 0.4 },
  { rgb: "214 138 156", alpha: 0.46 },
  { rgb: "236 160 110", alpha: 0.54 },
  { rgb: "255 186 104", alpha: 0.62 },
];

/** Aura del rango (indice in `PROGRESSION_LEVELS`), estremi compresi. */
export function auraForRank(rank: number): Aura {
  const i = Math.min(SCALA.length - 1, Math.max(0, Math.trunc(rank)));
  return SCALA[i];
}

/** Indice del livello dentro `PROGRESSION_LEVELS` (-1 se il nome non esiste). */
export function rankForLevelName(name: string): number {
  return PROGRESSION_LEVELS.findIndex((level) => level.name === name);
}

/** Aura dei conteggi: `null` quando il percorso non e' disponibile. */
export function auraForCounts(counts: ProgressionCounts | null): Aura | null {
  if (!counts) return null;
  const rank = rankForLevelName(buildProgression(counts).level.name);
  return rank < 0 ? null : auraForRank(rank);
}
