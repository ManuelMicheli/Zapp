import { timingSafeEqual } from "node:crypto";

/** Sotto questa lunghezza il segreto non è un segreto: rifiutato a prescindere. */
const MIN_LENGTH = 32;

/**
 * Confronto in tempo costante fra il segreto dell'header e quello configurato.
 * Le lunghezze diverse escono subito — `timingSafeEqual` alza un'eccezione su buffer
 * di misura diversa, e la differenza di lunghezza non è comunque un'informazione utile
 * a chi attacca. Il segreto non passa mai dalla query string: finirebbe nei log.
 */
export function secretMatches(
  given: string | null,
  expected: string | undefined,
): boolean {
  if (!given || !expected) return false;
  if (expected.length < MIN_LENGTH) return false;
  const a = Buffer.from(given, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
