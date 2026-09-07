/**
 * Guarda coi propri occhi i consigli di un titolo.
 * Uso: pnpm tsx scripts/similar-check.ts [movie|tv:id ...]
 * Senza argomenti prova cinque casi scelti apposta (saga recente, autore,
 * genere puro, serie, classico).
 *
 * Perché esiste: la suite verde prova la formula, non la qualità dei consigli.
 * L'unico modo di sapere se "Simili" funziona è leggere la lista vera di un film
 * vero — la lezione della fase B, dove sette difetti gravi erano tutti invisibili
 * ai test. Lo script fa girare **il codice dell'app** (`collectCandidates`,
 * `rankCandidates`): le chiamate TMDB sono iniettate, quindi non c'è una copia
 * della logica che possa divergere.
 */
import { loadEnvFile } from "node:process";
import { collectCandidates, type TmdbSource } from "../src/lib/similar/candidates";
import { rankCandidates } from "../src/lib/similar/score";
import { seedProfile } from "../src/lib/similar/signals";
import type { MediaType } from "../src/lib/similar/types";
import type {
  TmdbCollectionDetails,
  TmdbMultiResult,
  TmdbPaginated,
  TmdbPersonMovieCredits,
  TmdbPersonTvCredits,
} from "../src/lib/tmdb/types";

loadEnvFile(new URL("../.env.local", import.meta.url).pathname.replace(/^\//, ""));

const TOKEN = process.env.TMDB_API_READ_ACCESS_TOKEN;
if (!TOKEN || TOKEN.startsWith("INSERISCI")) {
  console.error("Manca TMDB_API_READ_ACCESS_TOKEN in .env.local");
  process.exit(1);
}

const BASE = "https://api.themoviedb.org/3";

async function tmdb<T>(path: string, params: Record<string, string> = {}): Promise<T> {
  const url = new URL(`${BASE}/${path}`);
  url.searchParams.set("language", "it-IT");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${TOKEN}`, accept: "application/json" },
  });
  if (!res.ok) throw new Error(`${path}: ${res.status}`);
  return (await res.json()) as T;
}

function withType<T extends { results: unknown[] }>(page: T, type: MediaType): T {
  return {
    ...page,
    results: (page.results as Record<string, unknown>[]).map((r) => ({
      ...r,
      media_type: type,
    })),
  } as T;
}

/** Le stesse chiamate del client dell'app, senza la cache di Next. */
const source: TmdbSource = {
  async discoverByKeyword(type, keywordIds) {
    const page = await tmdb<TmdbPaginated<TmdbMultiResult>>(`discover/${type}`, {
      with_keywords: keywordIds.join(","),
      sort_by: "popularity.desc",
      "vote_count.gte": type === "movie" ? "50" : "20",
    });
    return withType(page, type);
  },
  getPersonMovieCredits: (id) =>
    tmdb<TmdbPersonMovieCredits>(`person/${id}/movie_credits`),
  getPersonTvCredits: (id) => tmdb<TmdbPersonTvCredits>(`person/${id}/tv_credits`),
  getCollection: (id) => tmdb<TmdbCollectionDetails>(`collection/${id}`),
  async getSimilar(type, id) {
    const page = await tmdb<TmdbPaginated<TmdbMultiResult>>(`${type}/${id}/similar`);
    return withType(page, type);
  },
};

/** Saga recente, autore riconoscibile, genere puro, serie, classico. */
const DEFAULTS = [
  "movie:693134", // Dune - Parte due
  "movie:872585", // Oppenheimer
  "movie:1022789", // Inside Out 2
  "tv:66732", // Stranger Things
  "movie:680", // Pulp Fiction
];

async function check(spec: string): Promise<void> {
  const [rawType, rawId] = spec.split(":");
  const mediaType = rawType === "tv" ? "tv" : "movie";
  const id = Number(rawId);

  const details = await tmdb<Record<string, unknown>>(`${mediaType}/${id}`, {
    append_to_response: "credits,keywords,recommendations",
  });
  const seed = seedProfile(details, mediaType);
  if (!seed) {
    console.log(`\n${spec}: nessun identikit`);
    return;
  }

  const name = (details.title ?? details.name) as string;
  console.log(`\n${"═".repeat(78)}`);
  console.log(`${name} (${seed.year ?? "?"}) — ${mediaType}`);
  console.log(`keyword: ${seed.keywords.map((k) => k.name).join(", ") || "nessuna"}`);
  console.log(
    `saga: ${seed.collectionId ?? "no"} · autore: ${seed.directors[0]?.name ?? "?"}`,
  );
  console.log("─".repeat(78));

  const collaborative =
    (details.recommendations as { results?: TmdbMultiResult[] })?.results ?? [] ?? [];
  const candidates = await collectCandidates(seed, source, collaborative);
  const items = rankCandidates(seed, candidates, { size: 12 });

  console.log(`candidati: ${candidates.length} → in classifica: ${items.length}`);
  for (const [i, item] of items.entries()) {
    const pos = String(i + 1).padStart(2);
    const year = item.year ?? "????";
    const score = item.score.toFixed(2).padStart(5);
    const title = item.title.slice(0, 40).padEnd(40);
    console.log(`${pos}. ${score}  ${title} ${year}  ${item.reason ?? ""}`);
  }

  // Il confronto che conta: cosa mostrava l'app prima di questo motore.
  const before = collaborative
    .filter((r) => r.media_type === mediaType)
    .slice(0, 6)
    .map((r) => {
      const asMovie = r as Extract<TmdbMultiResult, { media_type: "movie" }>;
      const asTv = r as Extract<TmdbMultiResult, { media_type: "tv" }>;
      const date = mediaType === "movie" ? asMovie.release_date : asTv.first_air_date;
      return `${(mediaType === "movie" ? asMovie.title : asTv.name) ?? "?"} (${date?.slice(0, 4) ?? "?"})`;
    });
  console.log(`\nprima (TMDB grezzo): ${before.join(" · ")}`);
}

async function main(): Promise<void> {
  const specs = process.argv.slice(2).length > 0 ? process.argv.slice(2) : DEFAULTS;
  for (const spec of specs) {
    await check(spec).catch((error) => console.error(`${spec}:`, error));
  }
}

void main();
