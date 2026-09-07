# Consigli sullo stesso filone — piano di implementazione

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** "Simili" e "Perché hai visto X" smettono di essere la lista grezza di TMDB e diventano consigli dello stesso filone, pesati per qualità ed età.

**Architecture:** Nuovo modulo `src/lib/similar/` con il cuore in funzioni pure (`signals`, `score`, `taste`) e un solo punto che parla con TMDB (`candidates`). La facciata `getSimilarTitles` è DB-first su una nuova tabella `title_similar`, come già fanno i trailer. La classifica salvata è impersonale e condivisa; il ri-ordino sul gusto avviene in memoria, per utente, sulla home.

**Tech Stack:** Next 15 App Router (Server Components), TypeScript strict, Supabase (service client per i dati di sistema), TMDB v3, Vitest per le funzioni pure.

**Spec:** `docs/superpowers/specs/2026-09-07-simili-filone-design.md`

## Global Constraints

- Commenti in italiano, UI in italiano. Nessuna keyword inglese mostrata all'utente.
- Nessuna chiamata TMDB dal client: tutto passa da `src/lib/tmdb/client.ts` (`server-only`).
- Moduli server iniziano con `import "server-only"`; le funzioni pure non lo hanno mai (Vitest le importa).
- Prettier: virgolette doppie, printWidth 90.
- Migration applicata **via MCP Supabase**, non `supabase db push`; poi rigenerare `src/types/database.ts`.
- Build di verifica sempre con `NEXT_DIST_DIR` dedicata: il tree è condiviso con altre sessioni.
- Nessun errore di questo modulo può rompere una pagina: ogni fonte che cade va gestita con `.catch(() => null)` e il ripiego finale è `raw.recommendations`.

---

### Task 1: Identikit del seme (`signals.ts`)

**Files:**
- Create: `src/lib/similar/types.ts`
- Create: `src/lib/similar/signals.ts`
- Create: `src/lib/similar/signals.test.ts`
- Modify: `src/lib/tmdb/types.ts` (aggiungere `TmdbKeywords`, `belongs_to_collection`, `keywords` ai dettagli)
- Modify: `src/lib/tmdb/client.ts:176-179` (`DETAILS_APPEND_MOVIE`, `DETAILS_APPEND_TV`)
- Modify: `src/lib/config.ts:14` (`TITLE_CACHE_EPOCH`)

**Interfaces:**
- Produces: `SeedProfile`, `SimilarItem`, `Candidate` (in `types.ts`); `seedProfile(details, mediaType): SeedProfile | null`, `NOISE_KEYWORDS`.

- [ ] **Step 1: Scrivere il test che fallisce**

```ts
// src/lib/similar/signals.test.ts
import { describe, expect, it } from "vitest";
import { seedProfile } from "./signals";

const movie = {
  id: 1,
  title: "Dune - Parte due",
  release_date: "2024-02-27",
  genres: [{ id: 878, name: "Fantascienza" }],
  belongs_to_collection: { id: 726871, name: "Dune (collezione)" },
  keywords: { keywords: [{ id: 1, name: "desert" }, { id: 2, name: "sequel" }] },
  credits: {
    cast: [{ id: 10, name: "Timothée Chalamet", character: null, profile_path: null, order: 0 }],
    crew: [{ id: 20, name: "Denis Villeneuve", job: "Director", profile_path: null }],
  },
};

it("tiene le keyword vere e butta il rumore di produzione", () => {
  const seed = seedProfile(movie, "movie")!;
  expect(seed.keywords.map((k) => k.name)).toEqual(["desert"]);
});

it("legge saga, regista, cast e anno", () => {
  const seed = seedProfile(movie, "movie")!;
  expect(seed.collectionId).toBe(726871);
  expect(seed.directors).toEqual([{ id: 20, name: "Denis Villeneuve" }]);
  expect(seed.cast[0].id).toBe(10);
  expect(seed.year).toBe(2024);
});

it("una serie prende i creatori come autori", () => {
  const seed = seedProfile(
    { id: 2, name: "Dark", first_air_date: "2017-12-01", genres: [], created_by: [{ id: 5, name: "Baran bo Odar" }] },
    "tv",
  )!;
  expect(seed.directors).toEqual([{ id: 5, name: "Baran bo Odar" }]);
});
```

- [ ] **Step 2: Eseguire e vederlo fallire**

Run: `cd /d/PROGETTI/Zapp-simili && pnpm exec vitest run src/lib/similar/signals.test.ts`
Expected: FAIL — modulo inesistente.

- [ ] **Step 3: Tipi del modulo**

```ts
// src/lib/similar/types.ts
export type MediaType = "movie" | "tv";

export interface SeedKeyword {
  id: number;
  name: string;
}

export interface Person {
  id: number;
  name: string;
}

/** Identikit del titolo di partenza: cosa *è*, non cosa TMDB gli accosta. */
export interface SeedProfile {
  id: number;
  mediaType: MediaType;
  year: number | null;
  keywords: SeedKeyword[];
  collectionId: number | null;
  directors: Person[];
  writers: Person[];
  cast: Person[];
  genreIds: number[];
}
```

`Candidate` e `SimilarItem` arrivano nel Task 2 (`score.ts` ne è il proprietario).

- [ ] **Step 4: Implementare `signals.ts`**

Regole: keyword in minuscolo, scarta `NOISE_KEYWORDS`, massimo 12; registi = `crew` con `job === "Director"` (film) o `created_by` (serie); sceneggiatori = `job` in `Screenplay|Writer|Story`; cast = primi 6 per `order`; anno dai primi 4 caratteri di `release_date`/`first_air_date`.

- [ ] **Step 5: Verificare che il test passi**

Run: `pnpm exec vitest run src/lib/similar/signals.test.ts` → PASS

- [ ] **Step 6: Portare le keyword dentro `titles.raw`**

`DETAILS_APPEND_MOVIE` e `DETAILS_APPEND_TV` prendono `,keywords`; `TITLE_CACHE_EPOCH` sale a `2026-09-08T00:00:00Z` con il commento del perché. Aggiungere a `types.ts` di TMDB:

```ts
export interface TmdbKeywords {
  /** I film rispondono `keywords`, le serie `results`: TMDB non è coerente. */
  keywords?: { id: number; name: string }[];
  results?: { id: number; name: string }[];
}
```
e i campi `keywords?: TmdbKeywords`, `belongs_to_collection?: { id: number; name: string } | null` sui due dettagli.

- [ ] **Step 7: Commit**

```bash
git add src/lib/similar src/lib/tmdb/types.ts src/lib/tmdb/client.ts src/lib/config.ts
git commit -m "feat(simili): identikit del titolo dalle keyword TMDB"
```

---

### Task 2: La formula (`score.ts`)

**Files:**
- Create: `src/lib/similar/score.ts`
- Create: `src/lib/similar/score.test.ts`
- Create: `src/lib/similar/keyword-labels.ts`

**Interfaces:**
- Consumes: `SeedProfile` (Task 1).
- Produces: `rankCandidates(seed, candidates, opts): SimilarItem[]`, `keywordIdf(totalResults)`, `ageMultiplier(seedYear, year, recentSeed)`, `qualityMultiplier(score)`, tipi `Candidate` e `SimilarItem`.

```ts
export interface Candidate {
  id: number;
  mediaType: MediaType;
  title: string;
  posterPath: string | null;
  year: number | null;
  voteAverage: number | null;
  voteCount: number;
  genreIds: number[];
  adult: boolean;
  releaseDate: string | null;
  /** Da quali keyword è arrivato, con la rarità già misurata. */
  keywordHits: { id: number; name: string; idf: number; strong: boolean }[];
  fromCollection: boolean;
  fromDirector: boolean;
  fromWriter: boolean;
  castHits: Person[];
  /** Posizione in `recommendations`/`similar`, `null` se non c'era. */
  collabRank: number | null;
}

export interface SimilarItem {
  id: number;
  mediaType: MediaType;
  title: string;
  posterPath: string | null;
  year: number | null;
  score: number;
  reason: string | null;
  /** Serve solo al ri-ordino personale della home. */
  directorId: number | null;
  keywordIds: number[];
  genreIds: number[];
}
```

- [ ] **Step 1: Scrivere i test che falliscono**

```ts
it("il filone batte il genere", () => {
  const seed = { ...base, keywords: [{ id: 1, name: "heist" }], genreIds: [28] };
  const perFilone = cand({ id: 2, keywordHits: [{ id: 1, name: "heist", idf: 0.8, strong: true }] });
  const perGenere = cand({ id: 3, genreIds: [28], collabRank: 0 });
  const out = rankCandidates(seed, [perGenere, perFilone], opts);
  expect(out[0].id).toBe(2);
});

it("per un film nuovo un titolo di trent'anni fa scende sotto uno recente a pari filone", () => {
  const seed = { ...base, year: 2026 };
  const vecchio = cand({ id: 2, year: 1995, keywordHits: [hit] });
  const nuovo = cand({ id: 3, year: 2024, keywordHits: [hit] });
  expect(rankCandidates(seed, [vecchio, nuovo], opts)[0].id).toBe(3);
});

it("ma un filone fortissimo tiene dentro il capostipite", () => {
  const seed = { ...base, year: 2026 };
  const capostipite = cand({ id: 2, year: 1979, fromCollection: true, keywordHits: [hit, hit2] });
  const recenteDebole = cand({ id: 3, year: 2025, genreIds: [28] });
  expect(rankCandidates(seed, [recenteDebole, capostipite], opts)[0].id).toBe(2);
});

it("una keyword rara pesa più di una generica", () => {
  expect(keywordIdf(200)).toBeGreaterThan(keywordIdf(20000));
});

it("scarta chi ha pochi voti, chi non è uscito, chi non ha locandina", () => { /* ... */ });

it("al massimo due titoli della stessa saga", () => { /* ... */ });

it("l'ordine è deterministico a pari punteggio", () => { /* ... */ });

it("il motivo dice la cosa più forte", () => {
  expect(rankCandidates(seed, [cand({ fromCollection: true })], opts)[0].reason).toBe("Stessa saga");
});
```

- [ ] **Step 2: Eseguire e vederli fallire**

Run: `pnpm exec vitest run src/lib/similar/score.test.ts` → FAIL

- [ ] **Step 3: Implementare `score.ts`**

Pesi della spec: keyword `2,2 × idf` (`× 2` se `strong`), saga `+3,0`, regista `+1,6`, sceneggiatore `+0,8`, attore `+0,5` (max 2), generi `Jaccard × 0,6`, collaborativo `+0,4 × (1 − rank/20)`.
`keywordIdf(total) = 1 / Math.log10(Math.max(total, 10))`.
`qualityMultiplier(score0a10) = 0,75 + 0,5 × clamp(score/10, 0, 1)`, `1` se il voto manca.
`ageMultiplier`: `k = semeRecente && candidatoPiùVecchio ? 0,5 : 0,25`, `mult = max(0,5, 1 − k × max(0, |gap| − 5) / 40)`.
Igiene e cap come da spec; motivo tramite `keyword-labels.ts` (dizionario `Record<string, string>` delle keyword comuni: `heist → "Rapina"`, `time loop → "Loop temporale"`, …; senza traduzione, niente motivo da keyword).

- [ ] **Step 4: Verificare**

Run: `pnpm exec vitest run src/lib/similar/score.test.ts` → PASS

- [ ] **Step 5: Commit**

```bash
git commit -am "feat(simili): punteggio di filone, qualità ed età"
```

---

### Task 3: I candidati da TMDB (`candidates.ts`)

**Files:**
- Modify: `src/lib/tmdb/client.ts` (nuove fetch)
- Create: `src/lib/similar/candidates.ts`

**Interfaces:**
- Consumes: `SeedProfile`, `Candidate`.
- Produces: `collectCandidates(seed, recommendations): Promise<Candidate[]>`.

Nuove fetch nel client (tutte `revalidate: 86400`, `media_type` riattaccato come già fa `discoverByGenre`):

```ts
export async function discoverByKeyword(type, keywordIds: number[], page = 1)
export async function discoverByCrew(personId: number)      // solo film
export async function discoverByCast(personId: number)      // solo film
export async function getPersonTvCredits(personId: number)  // serie
export async function getCollection(collectionId: number)
export async function getSimilar(type, id: number)
```

- [ ] **Step 1: Aggiungere le fetch al client** — parametri: `with_keywords` (virgola = AND), `with_crew`, `with_cast`, `sort_by=popularity.desc`, `vote_count.gte=50` (film) / `20` (serie).
- [ ] **Step 2: Implementare `collectCandidates`** — giro 1 in `Promise.all` (fino a 4 keyword singole + saga + autore + volto + `similar`), giro 2 con la coppia più rara in AND; ogni fonte `.catch(() => null)`; fusione per `id` che accumula `keywordHits`, `fromCollection`, `fromDirector`, `castHits`, `collabRank`.
- [ ] **Step 3: Verifica manuale** con lo script del Task 7 (non c'è test unitario: è il solo modulo di rete).
- [ ] **Step 4: Commit**

```bash
git commit -am "feat(simili): candidati generati dal filone, non dalla lista di TMDB"
```

---

### Task 4: Tabella e cache (`store.ts`, migration)

**Files:**
- Create: `supabase/migrations/0024_title_similar.sql`
- Create: `src/lib/similar/store.ts`
- Create: `src/lib/similar/store.test.ts` (solo `parseSimilar`)
- Modify: `src/types/database.ts` (rigenerato)

**Interfaces:**
- Produces: `readSimilar(id, mediaType)`, `writeSimilar(id, mediaType, items, seed)`, `parseSimilar(json): SimilarItem[] | null`, `SIMILAR_TTL_MS`, `SIMILAR_EMPTY_TTL_MS`.

- [ ] **Step 1: Test di `parseSimilar`** — forma giusta → lista; campo mancante o tipo sbagliato → `null` (che significa "ricalcola").
- [ ] **Step 2: Migration** (SQL nella spec) applicata **via MCP** `apply_migration`.
- [ ] **Step 3: Rigenerare i tipi** — `mcp__claude_ai_Supabase__generate_typescript_types` → `src/types/database.ts`.
- [ ] **Step 4: Implementare `store.ts`** con `createServiceClient()`; TTL 30 giorni pieno, 3 giorni vuoto; errori loggati e mai propagati.
- [ ] **Step 5: Commit**

---

### Task 5: Facciata (`similar.ts`) e scheda titolo

**Files:**
- Create: `src/lib/similar/similar.ts`
- Modify: `src/components/title/RecommendationsShelf.tsx`
- Modify: `src/components/title/TitleBody.tsx:173`
- Modify: `src/components/ui/PosterCard.tsx` (prop `reason`)

**Interfaces:**
- Produces: `getSimilarTitles(id, mediaType, opts?): Promise<SimilarItem[]>` (React `cache()`).

- [ ] **Step 1:** `getSimilarTitles` DB-first: riga fresca → ritorna; altrimenti `getOrFetchTitle` → `seedProfile` → `collectCandidates` → `getRatings` → `rankCandidates` → `writeSimilar`. Ripiego su `raw.recommendations` se il calcolo non produce niente.
- [ ] **Step 2:** `PosterCard` prende `reason?: string | null` e la rende sotto anno in `text-[11px] text-muted` con `line-clamp-1`.
- [ ] **Step 3:** `RecommendationsShelf` riceve `items: SimilarItem[]`; `TitleBody` diventa `<Suspense>` con `<SimilarSection titleId media />` server.
- [ ] **Step 4:** `pnpm typecheck && pnpm lint`.
- [ ] **Step 5: Commit**

---

### Task 6: Home — sorgenti scelte e ri-ordino sul gusto

**Files:**
- Create: `src/lib/similar/taste.ts`, `src/lib/similar/taste.test.ts`
- Modify: `src/lib/home/shelves-rank.ts` (`pickBecauseSources`), `src/lib/home/shelves-rank.test.ts`
- Modify: `src/lib/home/shelves.ts` (`getBecauseShelf`)
- Modify: `src/components/home/BecauseYouWatched.tsx`, `src/components/home/BecauseShelf.tsx`

**Interfaces:**
- Produces: `tasteProfile(seeds): TasteProfile`, `applyTaste(items, taste, owned): SimilarItem[]`.

- [ ] **Step 1: Test di `pickBecauseSources`** — esclude `status` diverso da `watched`, esclude voto < 6, esclude chi non ha filone (flag passata dal chiamante), tiene l'ordine cronologico, niente doppioni.
- [ ] **Step 2: Test di `taste.ts`** — regista ricorrente in 2 semi → boost; keyword ricorrente → boost proporzionale all'idf; titoli in libreria esclusi; nessun profilo → lista invariata.
- [ ] **Step 3: Implementare** e collegare: `getBecauseShelf` usa `getSimilarTitles` + `applyTaste`.
- [ ] **Step 4:** `BecauseShelf` passa `reason` a `PosterCard`.
- [ ] **Step 5: Commit**

---

### Task 7: Verifica sull'output vero

**Files:**
- Create: `scripts/similar-check.mjs`

- [ ] **Step 1:** Script che, dato un elenco di `movie/tv id`, stampa i primi 12 simili con punteggio e motivo, chiamando TMDB direttamente con `TMDB_API_READ_ACCESS_TOKEN` (nessun DB: deve girare senza Supabase).
- [ ] **Step 2:** Farlo girare su cinque casi scelti: film di saga recente, film d'autore, film di genere puro, serie, titolo vecchio. **Leggere l'output** e tarare i pesi se una lista non convince.
- [ ] **Step 3:** `pnpm test && pnpm typecheck && pnpm lint`.
- [ ] **Step 4:** `NEXT_DIST_DIR=.next-simili pnpm build`.
- [ ] **Step 5: Commit finale e push su `main`** (deploy automatico Vercel).

---

## Self-review

- Copertura della spec: identikit (T1), formula e motivi (T2), candidati e rarità (T3), tabella/TTL/parse (T4), facciata + Simili (T5), sorgenti filtrate + gusto (T6), verifica reale (T7). Tutte le sezioni hanno un task.
- Nomi coerenti fra i task: `SeedProfile`, `Candidate`, `SimilarItem`, `rankCandidates`, `collectCandidates`, `getSimilarTitles`, `applyTaste`.
- Nessun passo rimandato: i pesi, le soglie e i TTL sono numeri, non "da decidere".
