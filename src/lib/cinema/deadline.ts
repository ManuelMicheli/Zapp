/**
 * Tempo massimo che una sezione cinema può prendersi prima di arrendersi.
 * Le sorgenti sono siti pubblici di terzi (MyMovies, JSON delle catene): a freddo,
 * fra timeout e limitatore a 4/s, una sala lenta può prendersi secondi. Senza un
 * tetto quel ritardo diventa il ritardo di tutta la sezione — e, sopra il limite
 * della funzione, un errore in pagina invece della programmazione.
 */
export const PROGRAMME_DEADLINE_MS = 7000;

/**
 * `work` se arriva entro `ms`, altrimenti `fallback`. Il lavoro non viene annullato:
 * continua e riempie la cache, così la richiesta successiva lo trova pronto.
 */
export function withDeadline<T>(work: Promise<T>, ms: number, fallback: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const guard = new Promise<T>((resolve) => {
    timer = setTimeout(() => resolve(fallback), ms);
  });
  return Promise.race([
    work.then(
      (v) => v,
      () => fallback,
    ),
    guard,
  ]).finally(() => clearTimeout(timer));
}
