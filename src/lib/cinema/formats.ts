// Formati di proiezione: chiave MovieGlu → valore normalizzato → etichetta badge.

export function normalizeFormat(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]/g, "");
}

const LABELS: Record<string, string> = {
  "3d": "3D",
  imax: "IMAX",
  imax3d: "IMAX 3D",
};

/** `null` per lo standard (nessun badge). */
export function formatLabel(format: string): string | null {
  if (format === "standard") return null;
  return LABELS[format] ?? format.toUpperCase();
}
