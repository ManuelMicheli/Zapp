/** Un battito ogni 30 secondi: dopo tre battiti mancanti il live si spegne. */
export const PRESENCE_TTL_MS = 90_000;
export interface PresenceSample {
  state: string;
  at: string;
}
export function presenceState(sample: PresenceSample | null | undefined, now: number) {
  if (!sample) return null;
  const age = now - Date.parse(sample.at);
  if (!Number.isFinite(age) || age < 0 || age >= PRESENCE_TTL_MS) return null;
  return sample.state === "playing" || sample.state === "paused" ? sample.state : null;
}

/** Una persona una volta, senza confondere due amici sullo stesso titolo. */
export function visiblePresence<T extends PresenceSample & { userId: string }>(
  rows: T[],
  now: number,
): T[] {
  const seen = new Set<string>();
  return [...rows]
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
    .filter((row) => {
      if (seen.has(row.userId)) return false;
      seen.add(row.userId);
      return presenceState(row, now) !== null;
    });
}
