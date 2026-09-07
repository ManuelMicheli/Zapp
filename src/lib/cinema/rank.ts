// Quanto "conta" una sala: funzioni pure (test Vitest). Le liste mettono per primi i
// preferiti, poi le grandi catene nazionali (UCI, The Space, Notorious), poi le
// multisala e le catene regionali, poi le sale indipendenti; a parità di livello per
// distanza. Regola dell'utente (2026-09-07): a Milano centro le 10 sale più vicine sono
// tutte monosala e le catene, a 5-10 km, non comparivano mai.

import type { Cinema } from "./types";

/** 1 = grande catena nazionale, 2 = multisala / catena regionale, 3 = indipendente. */
export type VenueTier = 1 | 2 | 3;

const MAJOR_RE = /\buci\b|the\s*space|notorious/i;
const MULTIPLEX_RE =
  /cinelandia|arcadia|multiplex|multisala|cineplex|cinestar|megaplex|cin[eé]polis|starplex|multicinema|cinecity|cinema\s*city|movie\s*planet|moviplex|anteo|odeon|giraffe|cineland\b|cinema\s*teatro\s*nuovo/i;

export function venueTier(name: string): VenueTier {
  if (MAJOR_RE.test(name)) return 1;
  if (MULTIPLEX_RE.test(name)) return 2;
  return 3;
}

/** Nomi di catena senza sede: da soli non dicono quale sala è. */
const BARE_CHAIN_RE =
  /^(uci\s*cinemas?|the\s*space\s*cinema|notorious\s*cinemas?|cinelandia|multisala|multiplex|cinema|cinema\s*teatro|arcadia|cineteatro)$/i;

/**
 * Nome leggibile della sala: spazi doppi via, "CINEMA Eliseo" → "Cinema Eliseo",
 * "Uci Cinemas" → "UCI Cinemas"; un nome di sola catena ("The Space Cinema", due
 * volte in provincia di Milano) prende il comune: "The Space Cinema Rozzano". Il comune
 * nel nome serve anche al match con gli elenchi delle catene (Notorious per parole,
 * The Space per slug del comune).
 */
export function prettyVenueName(name: string, town: string | null | undefined): string {
  let out = name.replace(/\s+/g, " ").trim();
  out = out.replace(/^CINEMA\b/, "Cinema").replace(/\buci\b/i, "UCI");
  const t = (town ?? "").replace(/\s+/g, " ").trim();
  if (t && BARE_CHAIN_RE.test(out) && !out.toLowerCase().includes(t.toLowerCase())) {
    out = `${out} ${t}`;
  }
  return out;
}

/**
 * Nome corto per le righe strette (altre sale nella card film): via la parola di
 * catena ridondante — "UCI Cinemas Bicocca" → "UCI Bicocca", "The Space Cinema
 * Rozzano" → "The Space Rozzano", "Gloria Notorious Cinemas" → "Gloria Notorious".
 * Le sale che si chiamano "Cinema X" restano intere.
 */
export function shortVenueName(name: string): string {
  const out = name
    .replace(/\bnotorious cinemas\b/i, "Notorious")
    .replace(/\buci cinemas\b/i, "UCI")
    .replace(/\bthe space cinema\b/i, "The Space")
    .replace(/\s+/g, " ")
    .trim();
  return out || name;
}

/** Parole che non aiutano a trovare la sala su una mappa. */
const GENERIC_WORDS =
  /\b(cinema|cinemas|multisala|multiplex|notorious|uci|the|space|cinelandia|filmcenter|spaziocinema|di)\b/gi;

/**
 * Query per Nominatim quando mappa.asp non ha le coordinate: prima "Cinema <parte
 * distintiva>, <comune>" ("Cinema Troisi, San Donato Milanese"), poi la sola parte
 * distintiva col comune ("Merlata Bloom, Milano": il centro commerciale). Nominatim
 * non conosce "Multisala Troisi" né "Notorious Cinemas Merlata Bloom" (2026-09-07).
 */
export function venueGeocodeQueries(
  name: string,
  town: string | null | undefined,
): string[] {
  const t = (town ?? "").trim();
  const distinct = name
    .replace(/\s+/g, " ")
    .replace(GENERIC_WORDS, " ")
    .replace(/[-–]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const suffix = t ? `, ${t}` : "";
  const out: string[] = [];
  if (distinct) {
    out.push(`Cinema ${distinct}${suffix}`);
    if (t) out.push(`${distinct}${suffix}`);
  } else if (t) {
    out.push(`${name.trim()}${suffix}`);
  }
  return out.filter((q, i, a) => a.indexOf(q) === i);
}

/** Confronto fra due sale per le liste: livello, poi distanza. */
export function compareByTier(
  a: Pick<Cinema, "name" | "distanceKm">,
  b: Pick<Cinema, "name" | "distanceKm">,
): number {
  const ta = venueTier(a.name);
  const tb = venueTier(b.name);
  if (ta !== tb) return ta - tb;
  return a.distanceKm - b.distanceKm;
}
