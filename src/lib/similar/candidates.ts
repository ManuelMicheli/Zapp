import type {
  TmdbCollectionDetails,
  TmdbMultiResult,
  TmdbPaginated,
  TmdbPersonMovieCredits,
  TmdbPersonTvCredits,
} from "@/lib/tmdb/types";
import { keywordIdf } from "./score";
import { yearOf } from "./signals";
import type { Candidate, KeywordHit, MediaType, Person, SeedProfile } from "./types";

/**
 * Da dove nascono i candidati. È l'unico modulo del motore che parla con TMDB.
 *
 * La differenza con prima sta tutta qui: non si parte dalla lista che TMDB accosta
 * al titolo, si parte da **cosa il titolo è** — le sue keyword, la sua saga, il suo
 * autore, i suoi volti — e si chiede a TMDB chi altro condivide quelle cose. Le
 * raccomandazioni di TMDB restano, ma come uno dei segnali, non come la risposta.
 *
 * Costo: un giro di chiamate in parallelo più una, tutte con cache Next di un
 * giorno, e il risultato finisce comunque in `title_similar`. Un titolo si paga una
 * volta sola, per tutti gli utenti.
 *
 * Le chiamate arrivano da fuori (`TmdbSource`), come in `trailers/compute.ts`: così
 * questo modulo non è `server-only` e `scripts/similar-check.mjs` può far girare il
 * codice vero contro TMDB, invece di una copia che diverge.
 */

/** Le chiamate TMDB che servono ai candidati. In app le passa `similar.ts`. */
export interface TmdbSource {
  discoverByKeyword(
    type: MediaType,
    keywordIds: readonly number[],
  ): Promise<TmdbPaginated<TmdbMultiResult>>;
  getPersonMovieCredits(personId: number): Promise<TmdbPersonMovieCredits>;
  getPersonTvCredits(personId: number): Promise<TmdbPersonTvCredits>;
  getCollection(collectionId: number): Promise<TmdbCollectionDetails>;
  getSimilar(type: MediaType, id: number): Promise<TmdbPaginated<TmdbMultiResult>>;
}

/**
 * Quante keyword del seme diventano un'interrogazione a sé. Sei e non quattro: le
 * keyword di TMDB arrivano in ordine arbitrario e la loro rarità si conosce solo
 * dopo averle chieste, quindi allargare la finestra è il modo più economico per non
 * perdere quella buona. Sono chiamate in parallelo, con cache di un giorno, e il
 * risultato finisce comunque in `title_similar`.
 */
const KEYWORD_QUERIES = 6;
/** Quanti risultati si tengono per fonte: oltre, è solo popolarità. */
const PER_SOURCE = 20;
/** Quanti titoli di `recommendations`/`similar` contano come segnale collaborativo. */
const COLLAB_DEPTH = 20;

interface Raw {
  result: TmdbMultiResult;
  keywordHit?: KeywordHit;
  fromCollection?: boolean;
  director?: Person;
  writer?: Person;
  castHit?: Person;
  collabRank?: number;
}

function isTitle(r: TmdbMultiResult): boolean {
  return r.media_type === "movie" || r.media_type === "tv";
}

function baseCandidate(result: TmdbMultiResult, mediaType: MediaType): Candidate {
  const asMovie = result as Extract<TmdbMultiResult, { media_type: "movie" }>;
  const asTv = result as Extract<TmdbMultiResult, { media_type: "tv" }>;
  const releaseDate =
    (mediaType === "movie" ? asMovie.release_date : asTv.first_air_date) ?? null;
  return {
    id: result.id,
    mediaType,
    title: (mediaType === "movie" ? asMovie.title : asTv.name) ?? "",
    posterPath: result.poster_path ?? null,
    year: yearOf(releaseDate),
    voteAverage: result.vote_average ?? null,
    voteCount: result.vote_count ?? 0,
    genreIds: result.genre_ids ?? [],
    adult: (result as { adult?: boolean }).adult === true,
    releaseDate,
    keywordHits: [],
    fromCollection: false,
    director: null,
    writer: null,
    castHits: [],
    collabRank: null,
  };
}

/**
 * Fonde i risultati di tutte le fonti in un candidato per titolo, accumulando i
 * segnali: lo stesso film può arrivare dalla keyword, dal regista e dai consigli di
 * TMDB, e ognuna di quelle strade aggiunge punteggio.
 */
function merge(rows: Raw[], mediaType: MediaType): Candidate[] {
  const byId = new Map<number, Candidate>();
  for (const row of rows) {
    if (!isTitle(row.result) || typeof row.result.id !== "number") continue;
    let candidate = byId.get(row.result.id);
    if (!candidate) {
      candidate = baseCandidate(row.result, mediaType);
      byId.set(row.result.id, candidate);
    }
    if (row.keywordHit) {
      const existing = candidate.keywordHits.find((k) => k.id === row.keywordHit!.id);
      if (!existing) candidate.keywordHits.push({ ...row.keywordHit });
      // Stessa keyword ritrovata dalla ricerca in AND: quel titolo è il nucleo del
      // filone e la keyword gli vale il doppio.
      else if (row.keywordHit.strong) existing.strong = true;
    }
    if (row.fromCollection) candidate.fromCollection = true;
    if (row.director) candidate.director = row.director;
    if (row.writer) candidate.writer = row.writer;
    if (row.castHit && !candidate.castHits.some((p) => p.id === row.castHit!.id)) {
      candidate.castHits.push(row.castHit);
    }
    if (row.collabRank != null) {
      candidate.collabRank =
        candidate.collabRank == null
          ? row.collabRank
          : Math.min(candidate.collabRank, row.collabRank);
    }
  }
  return [...byId.values()];
}

/**
 * I titoli di una persona in quel ruolo. Per la regia si filtra `job === "Director"`:
 * la filmografia di troupe elenca anche produzioni e ringraziamenti, e prenderli per
 * "film del regista" portava in classifica opere che non ha diretto.
 */
async function byPerson(
  source: TmdbSource,
  type: MediaType,
  personId: number,
  role: "cast" | "crew",
): Promise<TmdbMultiResult[]> {
  const credits =
    type === "movie"
      ? await source.getPersonMovieCredits(personId).catch(() => null)
      : await source.getPersonTvCredits(personId).catch(() => null);
  const list =
    role === "cast"
      ? (credits?.cast ?? [])
      : (credits?.crew ?? []).filter((c) => c.job === "Director");
  return [...list]
    .sort((a, b) => (b.vote_count ?? 0) - (a.vote_count ?? 0))
    .slice(0, PER_SOURCE)
    .map((r) => ({ ...r, media_type: type }) as TmdbMultiResult);
}

/**
 * I candidati per un seme. Ogni fonte che cade sparisce da sola (`catch`): con TMDB
 * a metà servizio si consiglia peggio, non si rompe la pagina.
 *
 * `collaborative` sono le raccomandazioni già presenti in `titles.raw`, che quindi
 * non costano una chiamata.
 */
export async function collectCandidates(
  seed: SeedProfile,
  source: TmdbSource,
  collaborative: readonly TmdbMultiResult[] = [],
): Promise<Candidate[]> {
  const type = seed.mediaType;
  const keywords = seed.keywords.slice(0, KEYWORD_QUERIES);
  const director = seed.directors[0] ?? null;
  const actor = seed.cast[0] ?? null;

  // --- Giro 1: una chiamata per keyword, più saga, autore, volto e "simili" ---
  const [keywordPages, collection, byDirector, byActor, similar] = await Promise.all([
    Promise.all(
      keywords.map(async (keyword) => {
        const page = await source.discoverByKeyword(type, [keyword.id]).catch(() => null);
        return page ? { keyword, page } : null;
      }),
    ),
    seed.collectionId != null && type === "movie"
      ? source.getCollection(seed.collectionId).catch(() => null)
      : Promise.resolve(null),
    director
      ? byPerson(source, type, director.id, "crew")
      : Promise.resolve([] as TmdbMultiResult[]),
    actor
      ? byPerson(source, type, actor.id, "cast")
      : Promise.resolve([] as TmdbMultiResult[]),
    source
      .getSimilar(type, seed.id)
      .then((p) => p.results)
      .catch(() => []),
  ]);

  const rows: Raw[] = [];

  // La rarità di ogni keyword arriva gratis: `total_results` dice quanti titoli la
  // portano. È la misura che poi pesa il tema nel punteggio.
  const idfById = new Map<number, number>();
  for (const entry of keywordPages) {
    if (!entry) continue;
    const idf = keywordIdf(entry.page.total_results ?? 0);
    idfById.set(entry.keyword.id, idf);
    for (const result of entry.page.results.slice(0, PER_SOURCE)) {
      rows.push({
        result,
        keywordHit: {
          id: entry.keyword.id,
          name: entry.keyword.name,
          idf,
          strong: false,
        },
      });
    }
  }

  // --- Giro 2: le due keyword più rare in AND, cioè il nucleo del filone ---
  const rarest = [...idfById.entries()].sort((a, b) => b[1] - a[1]).slice(0, 2);
  if (rarest.length === 2) {
    const page = await source
      .discoverByKeyword(
        type,
        rarest.map(([id]) => id),
      )
      .catch(() => null);
    for (const result of page?.results.slice(0, PER_SOURCE) ?? []) {
      for (const [id, idf] of rarest) {
        const keyword = keywords.find((k) => k.id === id);
        if (!keyword) continue;
        rows.push({
          result,
          keywordHit: { id, name: keyword.name, idf, strong: true },
        });
      }
    }
  }

  for (const part of collection?.parts?.slice(0, PER_SOURCE) ?? []) {
    rows.push({
      result: { ...part, media_type: "movie" } as TmdbMultiResult,
      fromCollection: true,
    });
  }
  if (director) {
    for (const result of byDirector.slice(0, PER_SOURCE)) {
      rows.push({ result, director });
    }
  }
  if (actor) {
    for (const result of byActor.slice(0, PER_SOURCE)) {
      rows.push({ result, castHit: actor });
    }
  }
  const collab = [...collaborative, ...similar].filter(isTitle);
  collab.slice(0, COLLAB_DEPTH * 2).forEach((result, i) => {
    rows.push({ result, collabRank: Math.min(i, COLLAB_DEPTH) });
  });

  return merge(rows, type);
}
