/**
 * Fra i risultati di una ricerca, quale titolo intendeva chi ha condiviso.
 * Funzione pura (nessuna rete, nessun `server-only`): decide solo sui dati che
 * il risolutore le passa.
 *
 * Due risposte in una: `sure` e' il titolo su cui si puo' aprire la scheda
 * senza chiedere niente — se manca, `shortlist` sono le proposte della pagina
 * "Quale intendevi?". Nel dubbio non si sceglie: aprire la scheda sbagliata
 * costa piu' di un tocco in piu'.
 */
import { normalizeTitle } from "@/lib/text/similarity";

export type Candidate = {
  id: number;
  mediaType: "movie" | "tv";
  title: string;
  originalTitle?: string | null;
  year: number | null;
  popularity?: number;
};

/** Quante proposte mostra al massimo la pagina "Quale intendevi?". */
const MAX_SHORTLIST = 5;

/**
 * Forma di confronto: la stessa dell'import e dei trailer (minuscole, senza
 * accenti, senza punteggiatura, senza articolo iniziale), con la `&` letta
 * come "e" perche' una scheda scrive "Fast & Furious" e un testo condiviso
 * "Fast e Furious".
 */
function normalized(s: string): string {
  return normalizeTitle(s.replace(/&/g, " e "));
}

/** I nomi con cui un candidato puo' presentarsi: quello italiano e l'originale. */
function namesOf(candidate: Candidate): string[] {
  return [candidate.title, candidate.originalTitle]
    .filter((n): n is string => typeof n === "string" && n.trim().length > 0)
    .map(normalized)
    .filter((n) => n.length > 0);
}

function isExact(candidate: Candidate, query: string): boolean {
  return namesOf(candidate).some((name) => name === query);
}

function contains(candidate: Candidate, query: string): boolean {
  return query.length > 0 && namesOf(candidate).some((name) => name.includes(query));
}

function popularityOf(candidate: Candidate): number {
  return typeof candidate.popularity === "number" ? candidate.popularity : 0;
}

/** Un anno chiesto e uno di catalogo combaciano a meno di un anno di scarto. */
function yearMatches(candidate: Candidate, year: number | null): boolean {
  if (year === null) return true;
  if (candidate.year === null) return false;
  return Math.abs(year - candidate.year) <= 1;
}

/** Prima gli uguali, poi chi contiene la query, poi il resto; a pari merito il piu' popolare. */
function rank(candidate: Candidate, query: string): number {
  if (isExact(candidate, query)) return 0;
  return contains(candidate, query) ? 1 : 2;
}

export function chooseCandidate(
  query: string,
  year: number | null,
  candidates: Candidate[],
): { sure: Candidate | null; shortlist: Candidate[] } {
  if (candidates.length === 0) return { sure: null, shortlist: [] };
  const q = normalized(query);

  const shortlist = [...candidates]
    .sort((a, b) => rank(a, q) - rank(b, q) || popularityOf(b) - popularityOf(a))
    .slice(0, MAX_SHORTLIST);

  // Un solo risultato: non c'e' niente fra cui sbagliare.
  if (candidates.length === 1) return { sure: candidates[0], shortlist };

  const exact = candidates
    .filter((c) => isExact(c, q) && yearMatches(c, year))
    .sort((a, b) => popularityOf(b) - popularityOf(a));
  if (exact.length === 1) return { sure: exact[0], shortlist };
  // Piu' omonimi con l'anno compatibile: si sceglie solo se uno stacca
  // nettamente gli altri, altrimenti decide la persona.
  if (exact.length > 1 && popularityOf(exact[1]) < popularityOf(exact[0]) / 2) {
    return { sure: exact[0], shortlist };
  }
  return { sure: null, shortlist };
}
