// Testo e frazione della barra per "riprendi dal minuto esatto" (fila "Continua a
// guardare"): il minutaggio arriva dall'estensione ZConnection su watch_entries.position_*.

/** Minuti interi, mai arrotondati per eccesso: "18 min" a 18:59. */
function minuti(ms: number): number {
  return Math.floor(ms / 60_000);
}

/** "18 min di 76", oppure "18 min" senza durata nota. */
export function resumeLabel(positionMs: number, durationMs: number | null): string {
  const m = minuti(positionMs);
  if (m < 1) return "appena iniziato";
  return durationMs ? `${m} min di ${minuti(durationMs)}` : `${m} min`;
}

/** Frazione per la barra; null quando non c'è una durata su cui calcolarla. */
export function resumeRatio(
  positionMs: number,
  durationMs: number | null,
): number | null {
  if (!durationMs || durationMs <= 0) return null;
  return Math.min(positionMs / durationMs, 1);
}
