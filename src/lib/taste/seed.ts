/**
 * La griglia del passo 2 dell'onboarding: "scegline almeno 3 che ti piacciono".
 *
 * Puro e testato: chi apre Zapp per la prima volta vede questa griglia e nient'altro,
 * quindi le regole (mai troppi titoli dello stesso genere, film e serie mescolati,
 * niente doppioni) devono essere verificabili senza database.
 */

/**
 * Da dove viene un candidato, in ordine di quanto è utile a capire un gusto.
 *
 * I **classici** vengono per primi (richiesta utente 2026-09-08): la griglia serviva a
 * indovinare i gusti di chi si iscrive e mostrava solo uscite di questa settimana —
 * "Project Hail Mary", "The Beekeeper", "Eternity". Con titoli che nessuno ha ancora
 * visto non si capisce niente di nessuno; con i più amati di sempre, sì.
 */
export type SeedFonte = "cercato" | "classico" | "epoca" | "classifica" | "tendenza";

const ORDINE_FONTE: Record<SeedFonte, number> = {
  // Cercato a mano: non passa mai dal selezionatore, ma se ci passasse verrebbe
  // prima di tutto — è l'unica riga che l'utente ha scelto lui.
  cercato: -1,
  classico: 0,
  // I più amati usciti negli anni formativi di chi si iscrive: subito dopo i classici
  // di sempre, perché sono la stessa cosa vista dalla sua generazione.
  epoca: 1,
  classifica: 2,
  tendenza: 3,
};

export interface SeedCandidate {
  id: number;
  mediaType: "movie" | "tv";
  title: string;
  posterPath: string;
  genreIds: number[];
  fonte: SeedFonte;
  /** Posizione in una classifica corrente; `null` fuori dalle classifiche. */
  rank: number | null;
  /** Voto 0-10: ZappScore dove c'è, altrimenti quello di TMDB. */
  score: number | null;
  /** Anno di uscita; `null` quando TMDB non lo dà. Serve a tarare la griglia sull'età. */
  year: number | null;
}

/** Quante copertine mostra la griglia: deve esserci di che scegliere. */
export const SEED_GRID_SIZE = 42;
export const SEED_MAX_PICKS = 10;
/** Quattro per genere: sotto, la griglia diventa monotona; sopra, si svuota. */
export const SEED_MAX_PER_GENRE = 4;

function ordina(candidates: SeedCandidate[]): SeedCandidate[] {
  return candidates
    .filter((c) => c.posterPath)
    .sort((a, b) => {
      // Prima i classici, poi chi è in classifica adesso, infine le tendenze: è
      // l'ordine in cui un titolo ha più probabilità di essere già stato visto.
      const fa = ORDINE_FONTE[a.fonte];
      const fb = ORDINE_FONTE[b.fonte];
      if (fa !== fb) return fa - fb;
      const ra = a.rank ?? Number.POSITIVE_INFINITY;
      const rb = b.rank ?? Number.POSITIVE_INFINITY;
      if (ra !== rb) return ra - rb;
      return (b.score ?? 0) - (a.score ?? 0);
    });
}

/**
 * Un raccoglitore che ricorda cosa ha già preso: doppioni e tetto per genere valgono
 * **fra una passata e l'altra**, altrimenti due secchi riempiti in momenti diversi si
 * ripeterebbero addosso e la griglia mostrerebbe lo stesso titolo due volte.
 */
function raccoglitore(ordinati: SeedCandidate[]) {
  const visti = new Set<string>();
  const perGenere = new Map<number, number>();

  return function prendi(
    accetta: (c: SeedCandidate) => boolean,
    tetto = Number.POSITIVE_INFINITY,
  ): SeedCandidate[] {
    const presi: SeedCandidate[] = [];
    for (const c of ordinati) {
      if (presi.length >= tetto) break;
      const chiave = `${c.mediaType}-${c.id}`;
      if (visti.has(chiave)) continue;
      if (!accetta(c)) continue;
      // il tetto vale sul primo genere, quello principale
      const genere = c.genreIds[0];
      if (genere !== undefined) {
        const n = perGenere.get(genere) ?? 0;
        if (n >= SEED_MAX_PER_GENRE) continue;
        perGenere.set(genere, n + 1);
      }
      visti.add(chiave);
      presi.push(c);
    }
    return presi;
  };
}

/**
 * Alternati: una griglia di soli film direbbe a metà degli utenti che Zapp non fa
 * per loro prima ancora di aver cominciato.
 */
function alterna(scelti: SeedCandidate[], size: number): SeedCandidate[] {
  const perTipo = { movie: [] as SeedCandidate[], tv: [] as SeedCandidate[] };
  for (const c of scelti) perTipo[c.mediaType].push(c);

  const out: SeedCandidate[] = [];
  const massimo = Math.max(perTipo.movie.length, perTipo.tv.length);
  for (let i = 0; i < massimo && out.length < size; i++) {
    if (perTipo.movie[i]) out.push(perTipo.movie[i]);
    if (out.length < size && perTipo.tv[i]) out.push(perTipo.tv[i]);
  }
  return out;
}

export function pickSeedGrid(
  candidates: SeedCandidate[],
  size = SEED_GRID_SIZE,
): SeedCandidate[] {
  return alterna(
    raccoglitore(ordina(candidates))(() => true),
    size,
  );
}

/** Gli anni in cui un film "segna": quelli fra i 10 e i 25 anni di chi guarda. */
export const ETA_FORMATIVA_DA = 10;
export const ETA_FORMATIVA_A = 25;
/** Un terzo della griglia resta ai grandi classici, a qualunque età. */
const QUOTA_CLASSICI = 1 / 3;
/** Ogni due titoli della sua epoca, un classico. */
const EPOCA_PER_CLASSICO = 2;

/**
 * Quanti anni deve avere un titolo per contare come "della sua epoca".
 *
 * Senza questo margine la finestra di un ventenne finisce a oggi, e "i più votati"
 * diventa l'uscita di questo mese con duemila voti entusiasti: misurato il 2026-09-15,
 * la finestra 2015-2026 rendeva "Swapped", "Michael", "Dutton Ranch" — cioè
 * esattamente i titoli-che-non-conosce-nessuno che questa griglia doveva togliere.
 * Con due anni di sedimentazione la stessa fascia rende Parasite, Your Name,
 * Spider-Man: Un nuovo universo.
 */
const ANNI_DI_SEDIMENTAZIONE = 2;

/** La finestra di uscita dei titoli con cui uno è cresciuto. */
export function finestraFormativa(
  birthYear: number,
  annoCorrente = new Date().getFullYear(),
): { da: number; a: number } {
  const da = birthYear + ETA_FORMATIVA_DA;
  return {
    da,
    // Chi ha meno di 25 anni non ha una finestra che finisce nel futuro; e chi ne ha
    // appena 14 deve comunque avere una finestra larga almeno un anno.
    a: Math.max(
      da,
      Math.min(birthYear + ETA_FORMATIVA_A, annoCorrente - ANNI_DI_SEDIMENTAZIONE),
    ),
  };
}

/**
 * La stessa griglia, tarata sull'età di chi si iscrive: **principalmente** titoli
 * usciti nei suoi anni formativi, **con** i grandi classici sempre presenti.
 *
 * I classici si raccolgono per primi, ma solo per la loro quota: passano quando il
 * tetto per genere è ancora intero, altrimenti "grandi classici" finirebbe per
 * significare quattro drammi e nient'altro (i più votati di sempre sono quasi tutti
 * drammi). Poi viene l'epoca, poi il resto come riempitivo.
 *
 * Senza anno di nascita — o con candidati privi di anno di uscita — si ricade
 * esattamente sulla griglia di prima: il passo non si rompe mai per una data mancante.
 */
export function pickSeedGridForAge(
  candidates: SeedCandidate[],
  birthYear: number | null,
  size = SEED_GRID_SIZE,
  annoCorrente = new Date().getFullYear(),
): SeedCandidate[] {
  if (birthYear === null) return pickSeedGrid(candidates, size);

  const { da, a } = finestraFormativa(birthYear, annoCorrente);
  const prendi = raccoglitore(ordina(candidates));
  const classici = prendi(
    (c) => c.fonte === "classico",
    Math.round(size * QUOTA_CLASSICI),
  );
  const epoca = prendi((c) => c.year !== null && c.year >= da && c.year <= a);
  const resto = prendi(() => true);

  return alterna(intreccia(epoca, classici, resto), size);
}

/** Due della sua epoca, poi un classico; quel che avanza chiude la fila. */
function intreccia(
  epoca: SeedCandidate[],
  classici: SeedCandidate[],
  resto: SeedCandidate[],
): SeedCandidate[] {
  const out: SeedCandidate[] = [];
  let i = 0;
  let j = 0;
  while (i < epoca.length || j < classici.length) {
    for (let k = 0; k < EPOCA_PER_CLASSICO && i < epoca.length; k++) out.push(epoca[i++]);
    if (j < classici.length) out.push(classici[j++]);
  }
  return [...out, ...resto];
}

/** `movie-603` → riga da scrivere. Scarta qualunque cosa storta. */
export function parseSeedKey(
  key: string,
): { titleId: number; mediaType: "movie" | "tv" } | null {
  const taglio = key.indexOf("-");
  if (taglio < 0) return null;
  const tipo = key.slice(0, taglio);
  const id = key.slice(taglio + 1);
  if (tipo !== "movie" && tipo !== "tv") return null;
  if (!/^\d+$/.test(id)) return null;
  return { titleId: Number(id), mediaType: tipo };
}
