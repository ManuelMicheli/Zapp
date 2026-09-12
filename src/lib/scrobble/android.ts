import { parseDisneyMedia } from "./providers/disney";
import { parseNowMedia } from "./providers/now";
import type { ParsedMedia, PlaybackState, Site } from "./types";

/** Prima che la libreria si muova: due minuti di riproduzione continua. */
export const SOGLIA_ANTEPRIMA_MS = 120_000;
/** Sotto i cinque minuti non è un film né un episodio: è una clip. */
export const DURATA_MINIMA_MS = 300_000;

/** Cosa la TV ha visto, senza interpretazioni. */
export interface AndroidEvent {
  id: string;
  at: string;
  package: string;
  state: PlaybackState;
  position_ms: number;
  duration_ms: number | null;
  /** `MediaMetadata.TITLE`. Nullo su Netflix, Prime e Apple TV (sonda 12/09). */
  title: string | null;
}

const SITI: Record<string, Site> = {
  "com.netflix.ninja": "netflix",
  "com.netflix.mediaclient": "netflix",
  "com.amazon.firebat": "prime",
  "com.amazon.avod": "prime",
  "com.amazon.avod.thirdpartyclient": "prime",
  "com.disney.disneyplus": "disney",
  "com.nowtv.it": "now",
};

export function siteFromPackage(pkg: string): Site | null {
  return SITI[pkg] ?? null;
}

/**
 * Titolo dai metadati della `MediaSession`.
 *
 * Solo NOW e Disney+ li pubblicano (sonda 12/09): per gli altri si torna `null`
 * e l'identità la dichiara Zapp lanciando il titolo.
 *
 * **Instrada sui parser di piattaforma già esistenti**, quelli che usa il
 * browser: una seconda definizione di "come NOW nomina le cose" divergerebbe
 * dalla prima al primo ritocco. Sulla TV il dettaglio non c'è mai (la
 * `MediaSession` espone un titolo solo), quindi `detailText` è sempre `null`:
 * in quel caso quei parser deducono `kind: "movie"`, che resta un'ipotesi —
 * `matchTitle` prova da solo l'altro tipo se non trova niente.
 */
export function parseAndroidEvent(ev: AndroidEvent): ParsedMedia | null {
  const site = siteFromPackage(ev.package);
  const titolo = ev.title?.trim();
  if (!titolo) return null;
  if (site === "now") return parseNowMedia({ titleText: titolo, detailText: null });
  if (site === "disney") return parseDisneyMedia({ titleText: titolo, detailText: null });
  // Netflix, Prime e Apple TV non pubblicano metadati: qui non si indovina.
  return null;
}

/**
 * Vero solo se ciò che suona merita di toccare la libreria: Netflix e Prime
 * riproducono le anteprime del catalogo come sessioni indistinguibili da un
 * film, e su una TV non c'è un titolo che le smentisca.
 */
export function riproduzioneVera(
  ev: Pick<AndroidEvent, "position_ms" | "duration_ms" | "state">,
): boolean {
  if (ev.state !== "playing") return false;
  if (ev.position_ms < SOGLIA_ANTEPRIMA_MS) return false;
  if (ev.duration_ms !== null && ev.duration_ms < DURATA_MINIMA_MS) return false;
  return true;
}
