/**
 * L'identikit del titolo di partenza, ricavato dal dettaglio TMDB già in cache
 * (`titles.raw`). Funzione pura: niente rete, niente database, tutto provato con
 * Vitest. È il primo passo del motore dei consigli — da qui nascono le
 * interrogazioni che generano i candidati (`candidates.ts`).
 */

import type { MediaType, Person, SeedKeyword, SeedProfile } from "./types";

/**
 * Keyword che non dicono niente sul filone: sono note di produzione o etichette
 * così vaste da accostare diecimila titoli scollegati. Se restassero, la ricerca
 * per keyword tornerebbe rumore e il punteggio le premierebbe come se fossero temi.
 *
 * `based on true story` e simili restano fuori dai *candidati* per lo stesso motivo,
 * ma sono comunque un buon motivo da mostrare quando due titoli le condividono:
 * per questo stanno in `WEAK_KEYWORDS` e non qui.
 */
export const NOISE_KEYWORDS = new Set([
  "aftercreditsstinger",
  "duringcreditsstinger",
  "woman director",
  "sequel",
  "prequel",
  "remake",
  "reboot",
  "imax",
  "3d",
  "live action",
  "based on novel or book",
  "based on comic",
  "based on young adult novel",
  "based on video game",
  "based on true story",
  "independent film",
  "feature film debut",
  "anime",
  // I luoghi si comportano come i generi: accostano migliaia di titoli che non hanno
  // niente in comune. "Stranger Things" pescava da "usa" e "indiana" (2026-09-07).
  "usa",
  "new york city",
  "los angeles",
  "california",
  "london",
  "paris",
  "italy",
  "japan",
  "texas",
  "chicago",
  "indiana",
]);

/** Quante keyword al massimo entrano nell'identikit. */
const MAX_KEYWORDS = 12;
/** Quanti attori contano come "volto" del titolo. */
const MAX_CAST = 6;

const WRITER_JOBS = new Set(["Screenplay", "Writer", "Story", "Novel"]);

interface RawKeyword {
  id?: unknown;
  name?: unknown;
}

/** I film rispondono `keywords.keywords`, le serie `keywords.results`. */
function rawKeywords(details: Record<string, unknown>): RawKeyword[] {
  const box = details.keywords as
    { keywords?: RawKeyword[]; results?: RawKeyword[] } | undefined;
  if (!box) return [];
  return box.keywords ?? box.results ?? [];
}

/**
 * Quanto una keyword promette di essere specifica, *prima* di sapere quanto è rara
 * (la rarità vera si misura solo interrogando TMDB, e le interrogazioni sono poche).
 * Un'etichetta di più parole dice quasi sempre una cosa più precisa di una sola:
 * "giant worm" e "space opera" contro "creature" e "planet". Su Dune, senza questo
 * ordine, le quattro keyword interrogate erano le più generiche che il titolo avesse.
 */
function specificity(name: string): number {
  const words = name.split(/\s+/).filter(Boolean).length;
  return words * 2 + (name.length >= 12 ? 1 : 0);
}

function cleanKeywords(list: RawKeyword[]): SeedKeyword[] {
  const out: SeedKeyword[] = [];
  const seen = new Set<number>();
  for (const raw of list) {
    const id = typeof raw.id === "number" ? raw.id : null;
    const name = typeof raw.name === "string" ? raw.name.trim().toLowerCase() : "";
    if (id == null || !name || NOISE_KEYWORDS.has(name) || seen.has(id)) continue;
    seen.add(id);
    out.push({ id, name });
  }
  // Le più promettenti davanti: chi interroga TMDB ne prende solo le prime.
  return out
    .sort((a, b) => specificity(b.name) - specificity(a.name))
    .slice(0, MAX_KEYWORDS);
}

function people(
  list: unknown,
  keep: (member: Record<string, unknown>) => boolean,
  max: number,
): Person[] {
  if (!Array.isArray(list)) return [];
  const out: Person[] = [];
  const seen = new Set<number>();
  for (const member of list as Record<string, unknown>[]) {
    if (out.length >= max) break;
    if (!keep(member)) continue;
    const id = typeof member.id === "number" ? member.id : null;
    const name = typeof member.name === "string" ? member.name.trim() : "";
    if (id == null || !name || seen.has(id)) continue;
    seen.add(id);
    out.push({ id, name });
  }
  return out;
}

/** Anno dai primi quattro caratteri di una data TMDB (`2024-02-27`). */
export function yearOf(date: unknown): number | null {
  if (typeof date !== "string" || date.length < 4) return null;
  const year = Number(date.slice(0, 4));
  return Number.isFinite(year) && year > 1870 ? year : null;
}

/**
 * L'identikit del seme. Ritorna `null` se il dettaglio non ha nemmeno un id: senza
 * quello non c'è niente da confrontare e chi chiama deve ripiegare sulla lista di
 * TMDB.
 */
export function seedProfile(
  details: Record<string, unknown> | null | undefined,
  mediaType: MediaType,
): SeedProfile | null {
  if (!details || typeof details.id !== "number") return null;

  const credits = (details.credits ?? {}) as Record<string, unknown>;
  const collection = details.belongs_to_collection as { id?: unknown } | null | undefined;
  const genres = Array.isArray(details.genres)
    ? (details.genres as { id?: unknown }[])
        .map((g) => (typeof g.id === "number" ? g.id : null))
        .filter((id): id is number => id != null)
    : [];

  // Una serie non ha un regista unico: l'autore è chi l'ha creata.
  const directors =
    mediaType === "tv"
      ? people(details.created_by, () => true, 3)
      : people(credits.crew, (m) => m.job === "Director", 3);

  return {
    id: details.id,
    mediaType,
    year: yearOf(mediaType === "movie" ? details.release_date : details.first_air_date),
    keywords: cleanKeywords(rawKeywords(details)),
    collectionId: collection && typeof collection.id === "number" ? collection.id : null,
    directors,
    writers: people(
      credits.crew,
      (m) => typeof m.job === "string" && WRITER_JOBS.has(m.job),
      3,
    ),
    cast: people(credits.cast, () => true, MAX_CAST),
    genreIds: genres,
  };
}

/**
 * Un titolo "ha un filone leggibile" se ha almeno due keyword vere o fa parte di una
 * saga. Serve alla home: un titolo senza filone non merita una pillola in "Perché
 * hai visto X", perché i suoi consigli sarebbero solo il suo genere.
 */
export function hasReadableLineage(seed: SeedProfile | null): boolean {
  if (!seed) return false;
  return seed.keywords.length >= 2 || seed.collectionId != null;
}
