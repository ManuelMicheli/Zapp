# Cinema gratis (MyMovies) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sostituire MovieGlu con fonti gratuite: cinema nel raggio, coordinate e programmazione di oggi da MyMovies; UI, piani e posizione esistenti invariati.

**Architecture:** Nuovo adapter `src/lib/cinema/mymovies/` (parser puri testati su fixture reali + client server-only con cache) dietro la facciata `showtimes.ts`; `source.ts` sceglie l'adapter (`mymovies` default, `mock`, `movieglu`, `off`). La provincia MyMovies dell'utente si calcola al salvataggio della posizione (Nominatim `county`) e si salva in `user_locations.province_slug`. Coordinate dei cinema in `cinema_venues` (30 g). Solo "oggi": `DayBar` rimossa.

**Tech Stack:** Next.js 15 App Router, TypeScript strict, Vitest, Supabase (RLS), MyMovies HTML (server-only), Nominatim.

**Spec:** `docs/superpowers/specs/2026-09-05-cinema-gratis-design.md`

## Global Constraints

- Nessuna chiamata a MyMovies/Nominatim/TMDB dal client: i moduli con fetch iniziano con `import "server-only"`; `parse.ts` è puro (nessun import di runtime) e testato con Vitest.
- MyMovies: User-Agent `Zapp/1.0 (+<NEXT_PUBLIC_APP_URL>)`, max 4 richieste/s, timeout 8 s, `null` su errore, cache: indice provincia 6 h, pagine programma 30 min (chiave con la data di Roma), mappa 30 g.
- Service client solo per `cinema_films`, `cinema_links`, `cinema_venues`; `user_locations` via client cookie-bound.
- Interfaccia pubblica di `showtimes.ts` invariata: `getNearbyCinemas(geo, n)`, `getFilmShowtimes(geo, filmId, filmName, date)`, `getCinemaProgramme(geo, cinema, date)`; `geo` diventa `CinemaGeo = LatLng & { provinceSlug?: string | null }`.
- `Cinema.id` = id MyMovies (o MovieGlu/mock nella sorgente legacy); `FilmSummary.sourceFilmId` (rinominato da `movieGluFilmId`) = id film nella sorgente.
- Copy e commenti in italiano; token, non hex; Prettier doppi apici, trailing comma, printWidth 90 (`pnpm prettier --check` sui file toccati: lint non lo copre).
- Verifica per task: `pnpm test && pnpm typecheck && pnpm lint`. Task finale: `pnpm build`.
- Lavoro nel worktree `D:\PROGETTI\Zapp-cinema2` (branch `feat/cinema-gratis` da `origin/main`). Mai `git stash/checkout/reset/clean`; `git add` solo dei file del task.

---

## File map

**Nuovi**
- `src/lib/cinema/mymovies/parse.ts` (+ `parse.test.ts`, fixture in `__fixtures__/` già presenti: `province-index.html`, `cinema-page.html`, `film-province.html`, `mappa.html`).
- `src/lib/cinema/mymovies/client.ts` — fetch + cache.
- `src/lib/cinema/mymovies/venues.ts` — cinema di una provincia con coordinate (`cinema_venues`).
- `src/lib/cinema/mymovies/showtimes.ts` — cinema vicini, orari film, programma cinema.
- `src/lib/cinema/mymovies/match.ts` — titolo TMDB ↔ film MyMovies, film MyMovies → TMDB.
- `src/lib/cinema/source.ts` — scelta sorgente, `isCinemaEnabled`.
- `src/lib/cinema/movieglu-showtimes.ts` — l'attuale `showtimes.ts` rinominato (legacy: MovieGlu + mock).
- `supabase/migrations/0012_cinema_free.sql`.

**Modificati**
- `src/lib/cinema/showtimes.ts` (facciata), `types.ts` (`CinemaGeo`, `Cinema.path?`, `sourceFilmId`), `formats.ts` (etichetta `vos`), `geocode.ts` (ritorna `county`/`city`), `location.ts` (province slug), `queries.ts` (`provinceSlug`), `match.ts` (rinomina campo), `movieglu.ts` (via `isCinemaEnabled`), `config.ts`, `.env.example`.
- `src/components/cinema/NearbyShowtimes.tsx`, `FilmsView.tsx`, `VenuesView.tsx`, `ShowtimesClient.tsx`, `TicketSheet.tsx` (campo rinominato), `src/app/(app)/cinema/page.tsx`; `DayBar.tsx` eliminato.
- `src/types/database.ts`, `README.md`, `CLAUDE.md`.

---

### Task 1: Parser MyMovies (puri, TDD su fixture)

**Files:**
- Create: `src/lib/cinema/mymovies/parse.ts`, `src/lib/cinema/mymovies/parse.test.ts`
- Modify: `src/lib/cinema/formats.ts` (etichetta `vos`)

**Interfaces:**
- Produces: `MmCinemaRef {id, name, town, path}`, `MmFilmRef {filmId, title}`, `MmShowing {format, time}`, `MmFilmProgramme {filmId, title, year, slug, showings}`, `MmCinemaProgramme {cinemaId, name, town, path, showings}`, `MmMappa {lat, lng, name, address, town}`; `parseProvinceIndex`, `parseNowShowing`, `parseCinemaPage`, `parseFilmProvincePage`, `parseMappa`, `slugify`, `formatFromLabel`, `normalizeTitle`.

- [ ] **Step 1: Test** `src/lib/cinema/mymovies/parse.test.ts`

```ts
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  formatFromLabel,
  normalizeTitle,
  parseCinemaPage,
  parseFilmProvincePage,
  parseMappa,
  parseNowShowing,
  parseProvinceIndex,
  slugify,
} from "./parse";

const fixture = (name: string) =>
  readFileSync(new URL(`./__fixtures__/${name}`, import.meta.url), "utf8");

describe("parseProvinceIndex", () => {
  it("elenca i cinema con id, nome, comune e path", () => {
    const refs = parseProvinceIndex(fixture("province-index.html"));
    expect(refs).toHaveLength(4);
    expect(refs[0]).toEqual({
      id: 20721,
      name: "Arcadia Multiplex",
      town: "Bellinzago Lombardo",
      path: "/cinema/milano/bellinzagolombardo/20721/",
    });
    expect(refs[3]).toEqual({
      id: 5452,
      name: "Multiplex Arcadia",
      town: "Melzo",
      path: "/cinema/milano/melzo/5452/",
    });
  });
  it("torna vuoto su HTML senza cinema", () => {
    expect(parseProvinceIndex("<html></html>")).toEqual([]);
  });
});

describe("parseNowShowing", () => {
  it("estrae i film in programmazione con id e titolo (senza ' a <città>')", () => {
    expect(parseNowShowing(fixture("province-index.html"))).toEqual([
      { filmId: 119782, title: "Coyote Vs. Acme" },
      { filmId: 105402, title: "Oceania" },
      { filmId: 118923, title: "Sunny Dancer" },
    ]);
  });
});

describe("parseCinemaPage", () => {
  it("estrae i film con anno, slug, id e orari per formato", () => {
    const films = parseCinemaPage(fixture("cinema-page.html"));
    expect(films).toHaveLength(2);
    expect(films[0]).toEqual({
      filmId: 117059,
      title: "Spider-Man - Brand New Day",
      year: 2026,
      slug: "spiderman-brand-new-day",
      showings: [{ format: "vos", time: "21:30" }],
    });
    expect(films[1].filmId).toBe(119820);
    expect(films[1].title).toBe("Tony - Diario di un giovane cuoco");
    expect(films[1].showings).toEqual([
      { format: "standard", time: "15:00" },
      { format: "standard", time: "18:30" },
      { format: "standard", time: "19:20" },
      { format: "vos", time: "12:50" },
      { format: "vos", time: "17:10" },
      { format: "vos", time: "21:30" },
    ]);
  });
});

describe("parseFilmProvincePage", () => {
  it("estrae i cinema che danno il film con i loro orari", () => {
    const cinemas = parseFilmProvincePage(fixture("film-province.html"));
    expect(cinemas.map((c) => c.cinemaId)).toEqual([5431, 22629, 20360]);
    expect(cinemas[0]).toEqual({
      cinemaId: 5431,
      name: "Anteo Palazzo del Cinema",
      town: "Milano",
      path: "/cinema/milano/5431/",
      showings: [{ format: "vos", time: "21:30" }],
    });
    expect(cinemas[2].showings).toEqual([
      { format: "standard", time: "16:00" },
      { format: "standard", time: "19:10" },
      { format: "standard", time: "22:15" },
    ]);
  });
});

describe("parseMappa", () => {
  it("legge coordinate, nome, indirizzo e comune dall'iframe", () => {
    expect(parseMappa(fixture("mappa.html"))).toEqual({
      lat: 45.479714,
      lng: 9.187763,
      name: "Anteo Palazzo del Cinema",
      address: "Via Milazzo 9",
      town: "Milano",
    });
  });
  it("decodifica Latin-1, '+' e '_' come spazi", () => {
    const html =
      'src="https://www.mymovies.it/ajax/mappe/googlemaps.asp?lat=45.545743&lng=9.454024&nomecinema=Arcadia+Multiplex&indirizzo=Strada+Padana+Superiore%2C+154+%2D+Localit%E0+Villa+Fornaci&local=Bellinzago%5FLombardo&altezza=450"';
    expect(parseMappa(html)).toEqual({
      lat: 45.545743,
      lng: 9.454024,
      name: "Arcadia Multiplex",
      address: "Strada Padana Superiore, 154 - Località Villa Fornaci",
      town: "Bellinzago Lombardo",
    });
    expect(parseMappa("<html></html>")).toBeNull();
  });
});

describe("helper", () => {
  it("slugify come MyMovies", () => {
    expect(slugify("Sesto San Giovanni")).toBe("sestosangiovanni");
    expect(slugify("Monza e Brianza")).toBe("monzaebrianza");
    expect(slugify("Forlì-Cesena")).toBe("forlicesena");
  });
  it("formatFromLabel", () => {
    expect(formatFromLabel("Versione originale con sottotitoli")).toBe("vos");
    expect(formatFromLabel("3D")).toBe("3d");
    expect(formatFromLabel("IMAX 3D")).toBe("imax3d");
    expect(formatFromLabel("Sala Energia")).toBe("salaenergia");
  });
  it("normalizeTitle per il confronto con TMDB", () => {
    expect(normalizeTitle("Spider-Man - Brand New Day")).toBe("spidermanbrandnewday");
    expect(normalizeTitle("Coyote Vs. Acme")).toBe(normalizeTitle("Coyote vs Acme"));
    expect(normalizeTitle("Oceania 2")).toBe("oceania2");
  });
});
```

- [ ] **Step 2: Run** `pnpm test src/lib/cinema/mymovies` → FAIL (modulo mancante).

- [ ] **Step 3: Implementa** `src/lib/cinema/mymovies/parse.ts`

```ts
// Parser puri delle pagine pubbliche di MyMovies (nessun fetch, nessun import di runtime).
// Le forme HTML sono quelle verificate il 2026-09-05 (fixture in __fixtures__/):
// se MyMovies cambia layout i parser tornano vuoti e la UI degrada.

export interface MmCinemaRef {
  id: number;
  name: string;
  town: string;
  /** "/cinema/milano/melzo/5452/" */
  path: string;
}
export interface MmFilmRef {
  filmId: number;
  title: string;
}
export interface MmShowing {
  /** "standard" | "vos" | "3d" | "imax" | … */
  format: string;
  /** "HH:MM" */
  time: string;
}
export interface MmFilmProgramme {
  filmId: number;
  title: string;
  year: number | null;
  slug: string;
  showings: MmShowing[];
}
export interface MmCinemaProgramme extends MmCinemaRef {
  cinemaId: number;
  showings: MmShowing[];
}
export interface MmMappa {
  lat: number;
  lng: number;
  name: string;
  address: string;
  town: string;
}

const ENTITIES: Record<string, string> = { "&amp;": "&", "&#39;": "'", "&quot;": '"', "&nbsp;": " " };
function decodeEntities(s: string): string {
  return s.replace(/&#(\d+);|&[a-z]+;/g, (m, code) =>
    code ? String.fromCharCode(Number(code)) : (ENTITIES[m] ?? m),
  ).trim();
}

/** "Sesto San Giovanni" → "sestosangiovanni" (slug MyMovies: solo a-z0-9). */
export function slugify(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

/** Titoli confrontabili: minuscolo, senza accenti, punteggiatura né spazi. */
export function normalizeTitle(s: string): string {
  return slugify(s);
}

/** Etichetta MyMovies ("Versione originale con sottotitoli") → formato dell'app. */
export function formatFromLabel(label: string): string {
  const l = label.toLowerCase();
  if (l.includes("originale") || l.includes("sottotitol")) return "vos";
  const compact = slugify(label);
  if (compact === "3d") return "3d";
  if (compact === "imax3d") return "imax3d";
  if (compact === "imax") return "imax";
  return compact || "standard";
}

const CINEMA_LINK =
  /<a class="link-19"[^>]*href="(?:https?:)?\/\/www\.mymovies\.it(\/cinema\/[a-z0-9]+(?:\/[a-z0-9]+)?\/(\d+)\/)"[^>]*>[\s\S]*?font-weight:600;">([^<]+)<\/div>[\s\S]*?<span class="mm-small">([^<]+)<\/span>/g;

/** Voci cinema (indice provincia e pagina film-in-provincia hanno la stessa forma). */
function cinemaEntries(html: string): { ref: MmCinemaRef; end: number; start: number }[] {
  const out: { ref: MmCinemaRef; end: number; start: number }[] = [];
  const seen = new Set<number>();
  for (const m of html.matchAll(CINEMA_LINK)) {
    const id = Number(m[2]);
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({
      ref: { id, name: decodeEntities(m[3]), town: decodeEntities(m[4]), path: m[1] },
      start: m.index ?? 0,
      end: (m.index ?? 0) + m[0].length,
    });
  }
  return out;
}

export function parseProvinceIndex(html: string): MmCinemaRef[] {
  return cinemaEntries(html).map((e) => e.ref);
}

const FILM_LINK = /provincia\/\?f=(\d+)"[^>]*title="([^"]+)"/g;

/** Film in programmazione (link "Titolo a Città"): l'ultimo " a " separa la città. */
export function parseNowShowing(html: string): MmFilmRef[] {
  const out: MmFilmRef[] = [];
  const seen = new Set<number>();
  for (const m of html.matchAll(FILM_LINK)) {
    const filmId = Number(m[1]);
    if (seen.has(filmId)) continue;
    seen.add(filmId);
    const raw = decodeEntities(m[2]);
    const cut = raw.lastIndexOf(" a ");
    out.push({ filmId, title: cut > 0 ? raw.slice(0, cut) : raw });
  }
  return out;
}

const TOKEN = /font-weight:400;">([^<]+):<\/div>|mm-weight-700">(\d{2}:\d{2})</g;

/** Orari in ordine di pagina; un'etichetta vale per gli orari che la seguono. */
function showingsIn(chunk: string): MmShowing[] {
  const out: MmShowing[] = [];
  let format = "standard";
  for (const m of chunk.matchAll(TOKEN)) {
    if (m[1]) format = formatFromLabel(decodeEntities(m[1]));
    else if (m[2]) out.push({ format, time: m[2] });
  }
  return out;
}

const TITLE_LINK =
  /<a href="https:\/\/www\.mymovies\.it\/film\/(\d{4})\/([a-z0-9-]+)\/" title="([^"]+)">/;

export function parseCinemaPage(html: string): MmFilmProgramme[] {
  const parts = html.split('<div class="schedine-titolo">').slice(1);
  const out: MmFilmProgramme[] = [];
  for (const chunk of parts) {
    const t = TITLE_LINK.exec(chunk);
    const id = /id="mappa_\d+_(\d+)"/.exec(chunk);
    if (!t || !id) continue;
    out.push({
      filmId: Number(id[1]),
      title: decodeEntities(t[3]),
      year: Number(t[1]) || null,
      slug: t[2],
      showings: showingsIn(chunk),
    });
  }
  return out;
}

export function parseFilmProvincePage(html: string): MmCinemaProgramme[] {
  const entries = cinemaEntries(html);
  return entries.map((e, i) => {
    const next = entries[i + 1]?.start ?? html.length;
    return { ...e.ref, cinemaId: e.ref.id, showings: showingsIn(html.slice(e.end, next)) };
  });
}

/** Query string di googlemaps.asp: Latin-1 con %XX, "+" spazio, "_" spazio nel comune. */
function decodeLatin1(s: string, underscoreIsSpace = false): string {
  const decoded = s
    .replace(/\+/g, " ")
    .replace(/%([0-9A-Fa-f]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
  return (underscoreIsSpace ? decoded.replace(/_/g, " ") : decoded).trim();
}

export function parseMappa(html: string): MmMappa | null {
  const m =
    /lat=(-?[0-9.]+)&lng=(-?[0-9.]+)&nomecinema=([^&"]*)&indirizzo=([^&"]*)&local=([^&"]*)/.exec(
      html,
    );
  if (!m) return null;
  const lat = Number(m[1]);
  const lng = Number(m[2]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return {
    lat,
    lng,
    name: decodeLatin1(m[3]),
    address: decodeLatin1(m[4]),
    town: decodeLatin1(m[5], true),
  };
}
```

In `src/lib/cinema/formats.ts` aggiungi a `LABELS`: `vos: "V.O. sott."`.

- [ ] **Step 4: Run** `pnpm test` → PASS (tutti, incluse le suite esistenti). `pnpm typecheck && pnpm lint`, `pnpm prettier --write src/lib/cinema/mymovies/*.ts src/lib/cinema/formats.ts` + `--check`.

- [ ] **Step 5: Commit** `feat(cinema): parser MyMovies con test su pagine reali` (stage `src/lib/cinema/mymovies/` incluse le fixture e `formats.ts`).

---

### Task 2: Migrazione `0012_cinema_free.sql`, tipi, config, sorgente

**Files:**
- Create: `supabase/migrations/0012_cinema_free.sql`, `src/lib/cinema/source.ts`
- Modify: `src/types/database.ts` (patch a mano, vedi sotto), `src/lib/config.ts`, `.env.example`, `src/lib/cinema/movieglu.ts`, `src/lib/cinema/match.ts`, `src/lib/cinema/types.ts` e tutti i consumatori di `movieGluFilmId`

**Interfaces:**
- Produces: tabella `cinema_venues`, `cinema_films.mymovies_film_id`, `user_locations.province_slug`; `CINEMA_RADIUS_KM`, `MYMOVIES_BASE`, `MYMOVIES_INDEX_TTL_S`, `MYMOVIES_PAGE_TTL_S`, `MYMOVIES_MAPPA_TTL_S`; `getCinemaSource(): "mymovies" | "movieglu" | "mock" | "off"`, `isCinemaEnabled()`; `FilmSummary.sourceFilmId`; `CinemaGeo`; `Cinema.path?`.

- [ ] **Step 1: Migrazione** (il controller la applica al DB via MCP e patcha `database.ts`; l'implementer scrive solo il file)

```sql
-- Zapp — migration 0010: cinema con fonte gratuita (MyMovies)

-- cinema di una provincia con coordinate (dati di sistema: solo service role)
create table public.cinema_venues (
  mymovies_id integer primary key,
  province_slug text not null,
  path text not null,
  name text not null,
  town text not null,
  address text,
  lat double precision,
  lng double precision,
  fetched_at timestamptz not null default now()
);
create index cinema_venues_province_idx on public.cinema_venues (province_slug);
alter table public.cinema_venues enable row level security;

-- id film MyMovies accanto a quello MovieGlu
alter table public.cinema_films add column mymovies_film_id integer;
create index cinema_films_mymovies_idx on public.cinema_films (mymovies_film_id);

-- provincia MyMovies calcolata al salvataggio della posizione
alter table public.user_locations add column province_slug text;
```

`database.ts`: aggiungi `cinema_venues` (Row: `address: string | null; fetched_at: string; lat: number | null; lng: number | null; mymovies_id: number; name: string; path: string; province_slug: string; town: string;` Insert con `address?/fetched_at?/lat?/lng?` opzionali; `Relationships: []`), `mymovies_film_id: number | null` (Insert/Update `?`) in `cinema_films`, `province_slug: string | null` (Insert/Update `?`) in `user_locations`.

- [ ] **Step 2: Config** (`src/lib/config.ts`, in coda)

```ts
/** Cinema entro questo raggio dalla posizione dell'utente. */
export const CINEMA_RADIUS_KM = 25;
/** MyMovies: pagine pubbliche lette lato server (vedi src/lib/cinema/mymovies). */
export const MYMOVIES_BASE = "https://www.mymovies.it";
export const MYMOVIES_INDEX_TTL_S = 6 * 60 * 60;
export const MYMOVIES_PAGE_TTL_S = 30 * 60;
export const MYMOVIES_MAPPA_TTL_S = 30 * 24 * 60 * 60;
```

`.env.example`: sostituisci il blocco MovieGlu con:

```
# cinema: fonte orari. Default "mymovies" (gratis, nessuna chiave). Altri valori:
# "mock" (3 cinema finti di Milano), "movieglu" (richiede le 3 env sotto), "off".
CINEMA_SOURCE=
MOVIEGLU_CLIENT=
MOVIEGLU_API_KEY=
MOVIEGLU_AUTHORIZATION=
```

- [ ] **Step 3: `source.ts`**

```ts
// Sorgente dei dati cinema: MyMovies (gratis, default), mock, MovieGlu (chiave), off.

export type CinemaSource = "mymovies" | "movieglu" | "mock" | "off";

export function getCinemaSource(): CinemaSource {
  const s = process.env.CINEMA_SOURCE;
  if (s === "off" || s === "movieglu" || s === "mock" || s === "mymovies") return s;
  if (process.env.MOVIEGLU_MOCK === "1") return "mock";
  return "mymovies";
}

/** La UI cinema esiste solo se una sorgente è attiva. */
export function isCinemaEnabled(): boolean {
  return getCinemaSource() !== "off";
}
```

In `movieglu.ts`: `isMock()` diventa `return getCinemaSource() === "mock";` (import da `./source`); rimuovi `isCinemaEnabled` da lì e aggiorna gli import in `NearbyShowtimes.tsx` e `cinema/page.tsx` a `@/lib/cinema/source`.

- [ ] **Step 4: Tipi** (`src/lib/cinema/types.ts`): `FilmSummary.movieGluFilmId` → `sourceFilmId` (rinomina in tutto `src/` con grep: `match.ts`, `NearbyShowtimes.tsx`, `cinema/page.tsx`, `FilmsView.tsx`, `VenuesView.tsx`, `ShowtimesClient.tsx`, `TicketSheet.tsx`); aggiungi `path?: string` a `Cinema` (percorso pagina MyMovies) e

```ts
/** Posizione dell'utente con la provincia MyMovies (assente per le sorgenti legacy). */
export type CinemaGeo = LatLng & { provinceSlug?: string | null };
```

(`LatLng` importato da `./geo`).

- [ ] **Step 5: Verifica e commit** `pnpm typecheck && pnpm lint && pnpm test`; commit `feat(cinema): sorgente dati configurabile, migrazione 0010, tipi`.

---

### Task 3: Client MyMovies, venues, provincia nella posizione

**Files:**
- Create: `src/lib/cinema/mymovies/client.ts`, `src/lib/cinema/mymovies/venues.ts`
- Modify: `src/lib/cinema/geocode.ts`, `src/lib/cinema/location.ts`, `src/lib/cinema/queries.ts`, `src/lib/cinema/mymovies/parse.ts` (nessuna modifica prevista), `src/components/cinema/LocationPrompt.tsx` (copy)

**Interfaces:**
- Produces: `mymovies.provinceIndex(prov)`, `mymovies.cinemaPage(path)`, `mymovies.filmProvincePage(prov, filmId)`, `mymovies.mappa(id)` (tutte `Promise<string | null>`); `getProvinceVenues(prov): Promise<Cinema[]>` (distanceKm 0); `ensureVenue(prov, ref): Promise<Cinema | null>`; `resolveProvinceSlug(county, city): Promise<string | null>`; `ViewerLocation.provinceSlug: string | null`; `reverseGeocode` → `{ label, county, city } | null`, `geocodeQuery` → `{ lat, lng, label, county, city } | null`.

- [ ] **Step 1: `client.ts`**

```ts
import "server-only";

import { unstable_cache } from "next/cache";
import {
  MYMOVIES_BASE,
  MYMOVIES_INDEX_TTL_S,
  MYMOVIES_MAPPA_TTL_S,
  MYMOVIES_PAGE_TTL_S,
} from "@/lib/config";
import { romeDateString } from "../dates";

const USER_AGENT = `Zapp/1.0 (+${process.env.NEXT_PUBLIC_APP_URL ?? "https://zapp-mu.vercel.app"})`;
const TIMEOUT_MS = 8000;

// Massimo 2 richieste al secondo verso MyMovies (stesso schema di tmdb/client.ts).
const WINDOW_MS = 1000;
const MAX_PER_WINDOW = 2;
let windowStart = Date.now();
let windowCount = 0;
async function throttle(): Promise<void> {
  for (;;) {
    const now = Date.now();
    if (now - windowStart >= WINDOW_MS) {
      windowStart = now;
      windowCount = 0;
    }
    if (windowCount < MAX_PER_WINDOW) {
      windowCount += 1;
      return;
    }
    await new Promise((r) => setTimeout(r, WINDOW_MS - (now - windowStart) + 5));
  }
}

/** GET di una pagina pubblica: `null` su errore o timeout, mai un'eccezione. */
async function fetchText(path: string): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  await throttle();
  console.log(`[mymovies] fetch ${path}`);
  try {
    const res = await fetch(`${MYMOVIES_BASE}${path}`, {
      headers: { "User-Agent": USER_AGENT, "Accept-Language": "it" },
      signal: controller.signal,
      cache: "no-store",
    });
    if (!res.ok) {
      console.error(`[mymovies] ${res.status} su ${path}`);
      return null;
    }
    return await res.text();
  } catch (e) {
    console.error("[mymovies] errore di rete:", e);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Le pagine programma cambiano ogni giorno: la data di Roma entra nella chiave. */
export const mymovies = {
  provinceIndex(prov: string): Promise<string | null> {
    return unstable_cache(() => fetchText(`/cinema/${prov}/provincia/`), ["mm-index", prov], {
      revalidate: MYMOVIES_INDEX_TTL_S,
    })();
  },
  cinemaPage(path: string): Promise<string | null> {
    return unstable_cache(() => fetchText(path), ["mm-cinema", path, romeDateString()], {
      revalidate: MYMOVIES_PAGE_TTL_S,
    })();
  },
  filmProvincePage(prov: string, filmId: number): Promise<string | null> {
    return unstable_cache(
      () => fetchText(`/cinema/${prov}/provincia/?f=${filmId}`),
      ["mm-film", prov, String(filmId), romeDateString()],
      { revalidate: MYMOVIES_PAGE_TTL_S },
    )();
  },
  mappa(cinemaId: number): Promise<string | null> {
    return unstable_cache(
      () => fetchText(`/ajax/mappe/mappa.asp?sala=${cinemaId}`),
      ["mm-mappa", String(cinemaId)],
      { revalidate: MYMOVIES_MAPPA_TTL_S },
    )();
  },
};
```

- [ ] **Step 2: `venues.ts`**

```ts
import "server-only";

import { MYMOVIES_MAPPA_TTL_S } from "@/lib/config";
import { createServiceClient } from "@/lib/supabase/server";
import type { Tables } from "@/types/database";
import type { Cinema } from "../types";
import { mymovies } from "./client";
import { parseMappa, parseProvinceIndex, type MmCinemaRef } from "./parse";

type VenueRow = Tables<"cinema_venues">;

function isFresh(row: VenueRow): boolean {
  return Date.now() - new Date(row.fetched_at).getTime() < MYMOVIES_MAPPA_TTL_S * 1000;
}

function toCinema(row: VenueRow): Cinema | null {
  if (row.lat == null || row.lng == null) return null;
  return {
    id: row.mymovies_id,
    name: row.name,
    address: row.address ?? "",
    city: row.town,
    lat: row.lat,
    lng: row.lng,
    distanceKm: 0,
    logoUrl: null,
    path: row.path,
  };
}

/** Coordinate da mappa.asp, salvate in `cinema_venues` (30 giorni). */
async function fetchVenue(prov: string, ref: MmCinemaRef): Promise<VenueRow> {
  const html = await mymovies.mappa(ref.id);
  const m = html ? parseMappa(html) : null;
  return {
    mymovies_id: ref.id,
    province_slug: prov,
    path: ref.path,
    name: ref.name,
    town: m?.town || ref.town,
    address: m?.address ?? null,
    lat: m?.lat ?? null,
    lng: m?.lng ?? null,
    fetched_at: new Date().toISOString(),
  };
}

/** Cinema noti per una lista di riferimenti: cache DB, altrimenti mappa.asp + upsert. */
export async function venuesFor(prov: string, refs: MmCinemaRef[]): Promise<Cinema[]> {
  if (refs.length === 0) return [];
  const db = createServiceClient();
  const { data: rows } = await db
    .from("cinema_venues")
    .select("*")
    .in(
      "mymovies_id",
      refs.map((r) => r.id),
    );
  const known = new Map((rows ?? []).map((r) => [r.mymovies_id, r]));

  const upserts: VenueRow[] = [];
  const result: VenueRow[] = [];
  for (const ref of refs) {
    const row = known.get(ref.id);
    if (row && isFresh(row) && row.lat != null) {
      result.push(row);
      continue;
    }
    const fresh = await fetchVenue(prov, ref);
    upserts.push(fresh);
    result.push(fresh);
  }
  if (upserts.length > 0) {
    const { error } = await db
      .from("cinema_venues")
      .upsert(upserts, { onConflict: "mymovies_id" });
    if (error) console.error("[cinema] errore upsert cinema_venues:", error);
  }
  return result.map(toCinema).filter((c): c is Cinema => c !== null);
}

/** Tutti i cinema con programmazione oggi nella provincia, con coordinate. */
export async function getProvinceVenues(prov: string): Promise<Cinema[]> {
  const html = await mymovies.provinceIndex(prov);
  if (!html) return [];
  return venuesFor(prov, parseProvinceIndex(html));
}

/**
 * Slug provincia MyMovies da Nominatim: "Monza e Brianza" → prova "monzaebrianza",
 * "monza", poi la città. Gli slug sbagliati rispondono 200 con zero cinema: conta.
 */
export async function resolveProvinceSlug(
  county: string | null,
  city: string | null,
): Promise<string | null> {
  const { slugify } = await import("./parse");
  const candidates = [
    county ? slugify(county) : "",
    county ? slugify(county.split(/\s+/)[0]) : "",
    city ? slugify(city) : "",
  ].filter((s, i, a) => s.length > 1 && a.indexOf(s) === i);
  for (const slug of candidates) {
    const html = await mymovies.provinceIndex(slug);
    if (html && parseProvinceIndex(html).length > 0) return slug;
  }
  return null;
}
```

(Usa un import statico di `slugify` invece del dinamico: `import { parseMappa, parseProvinceIndex, slugify, type MmCinemaRef } from "./parse";` — il dinamico sopra è solo per compattezza del piano.)

- [ ] **Step 3: `geocode.ts`** — `reverseGeocode` ritorna `{ label, county, city } | null` con `county: a.county ?? a.state_district ?? null`, `city: a.city ?? a.town ?? a.village ?? null` (estendi `NominatimAddress` in `geo.ts` con `county?`, `state_district?`); `geocodeQuery` aggiunge gli stessi due campi.

- [ ] **Step 4: `location.ts`** — `save(userId, lat, lng, label, provinceSlug: string | null)` scrive anche `province_slug`. `setLocation`: fa sempre il reverse geocoding (rate limit) per avere la provincia; `label = input.label?.trim() || geo?.label || "Posizione attuale"`; `provinceSlug = await resolveProvinceSlug(geo?.county ?? null, geo?.city ?? null)`. `setLocationByQuery`: idem con i campi di `geocodeQuery`. `queries.ts`: `ViewerLocation` gains `provinceSlug: string | null`, select `lat, lng, label, province_slug`.

- [ ] **Step 5: Verifica e commit** `pnpm typecheck && pnpm lint && pnpm test`; commit `feat(cinema): client MyMovies, cinema con coordinate, provincia nella posizione`.

---

### Task 4: Match film e orari MyMovies; facciata `showtimes.ts`

**Files:**
- Create: `src/lib/cinema/mymovies/match.ts`, `src/lib/cinema/mymovies/showtimes.ts`, `src/lib/cinema/movieglu-showtimes.ts` (= attuale `showtimes.ts`, `git mv`)
- Modify: `src/lib/cinema/showtimes.ts` (facciata), `src/lib/cinema/match.ts` (`getSourceFilmId`), `src/lib/tmdb/client.ts` (`searchMovie`)

**Interfaces:**
- Produces: `searchMovie(query, year?)`; `getMyMoviesFilmId(title, prov)`, `filmSummaryForMyMovies(ref)`; `getSourceFilmId(title, geo)`; facciata con firme invariate (`geo: CinemaGeo`).

- [ ] **Step 1: TMDB** `searchMovie` in `src/lib/tmdb/client.ts` (dopo `searchMulti`):

```ts
/** Ricerca film per titolo (e anno se noto), regione IT: per abbinare i titoli MyMovies. */
export async function searchMovie(
  query: string,
  year?: number | null,
): Promise<TmdbPaginated<TmdbMovieResult>> {
  const params: Record<string, string> = { query, region: TMDB_REGION, include_adult: "false" };
  if (year) params.year = String(year);
  const data = await tmdbFetch<TmdbPaginated<Omit<TmdbMovieResult, "media_type">>>(
    "search/movie",
    { params, revalidate: 86400 },
  );
  return {
    ...data,
    results: data.results.map((r) => ({ ...r, media_type: "movie" }) as TmdbMovieResult),
  };
}
```

- [ ] **Step 2: `mymovies/match.ts`**

```ts
import "server-only";

import { CINEMA_FILM_MATCH_TTL_MS } from "@/lib/config";
import { createServiceClient } from "@/lib/supabase/server";
import { searchMovie } from "@/lib/tmdb/client";
import type { TitleRow } from "@/lib/tmdb/mappers";
import type { FilmSummary } from "../types";
import { mymovies } from "./client";
import { normalizeTitle, parseNowShowing, type MmFilmProgramme } from "./parse";

/**
 * Id MyMovies del film TMDB: dal titolo (italiano o originale) confrontato con i film
 * in programmazione nella provincia; salvato in `cinema_films` per un giorno.
 */
export async function getMyMoviesFilmId(title: TitleRow, prov: string): Promise<number | null> {
  const db = createServiceClient();
  const { data: row } = await db
    .from("cinema_films")
    .select("mymovies_film_id, fetched_at")
    .eq("tmdb_id", title.id)
    .maybeSingle();
  if (
    row?.mymovies_film_id != null &&
    Date.now() - new Date(row.fetched_at).getTime() < CINEMA_FILM_MATCH_TTL_MS
  ) {
    return row.mymovies_film_id;
  }

  const html = await mymovies.provinceIndex(prov);
  if (!html) return row?.mymovies_film_id ?? null;
  const wanted = new Set(
    [title.title, title.original_title].filter(Boolean).map((t) => normalizeTitle(t!)),
  );
  const hit = parseNowShowing(html).find((f) => wanted.has(normalizeTitle(f.title)));
  if (!hit) return null;

  const { error } = await db.from("cinema_films").upsert({
    tmdb_id: title.id,
    mymovies_film_id: hit.filmId,
    title: title.title,
    poster_path: title.poster_path,
    backdrop_path: title.backdrop_path,
    fetched_at: new Date().toISOString(),
  });
  if (error) console.error("[cinema] errore upsert cinema_films:", error);
  return hit.filmId;
}

/** Film MyMovies → riassunto con id/poster TMDB (cache in `cinema_films`, poi ricerca). */
export async function filmSummaryForMyMovies(
  film: Pick<MmFilmProgramme, "filmId" | "title" | "year">,
): Promise<FilmSummary> {
  const db = createServiceClient();
  const { data: row, error: readError } = await db
    .from("cinema_films")
    .select("*")
    .eq("mymovies_film_id", film.filmId)
    .order("fetched_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (readError) console.error("[cinema] errore lettura cinema_films:", readError);
  if (row) {
    return {
      tmdbId: row.tmdb_id,
      sourceFilmId: film.filmId,
      title: row.title ?? film.title,
      posterPath: row.poster_path,
      backdropPath: row.backdrop_path,
    };
  }

  const found = await searchMovie(film.title, film.year).catch(() => null);
  const wanted = normalizeTitle(film.title);
  const hit =
    found?.results.find((r) => normalizeTitle(r.title) === wanted) ?? found?.results[0];
  if (hit) {
    const { error } = await db.from("cinema_films").upsert({
      tmdb_id: hit.id,
      mymovies_film_id: film.filmId,
      title: hit.title,
      poster_path: hit.poster_path ?? null,
      backdrop_path: hit.backdrop_path ?? null,
      fetched_at: new Date().toISOString(),
    });
    if (error) console.error("[cinema] errore upsert cinema_films:", error);
    return {
      tmdbId: hit.id,
      sourceFilmId: film.filmId,
      title: hit.title,
      posterPath: hit.poster_path ?? null,
      backdropPath: hit.backdrop_path ?? null,
    };
  }
  return { tmdbId: null, sourceFilmId: film.filmId, title: film.title, posterPath: null, backdropPath: null };
}
```

- [ ] **Step 3: `mymovies/showtimes.ts`**

```ts
import "server-only";

import { CINEMA_RADIUS_KM } from "@/lib/config";
import { romeDateString, romeIso } from "../dates";
import { distanceKm, type LatLng } from "../geo";
import { bookingFallback, resolveBookingLinks, resolveCinemaSites } from "../links";
import type { Cinema, CinemaShowtimes, ProgrammeFilm, Showing } from "../types";
import { mymovies } from "./client";
import { filmSummaryForMyMovies } from "./match";
import { parseCinemaPage, parseFilmProvincePage, type MmShowing } from "./parse";
import { getProvinceVenues, venuesFor } from "./venues";

function withDistance(geo: LatLng, venues: Cinema[]): Cinema[] {
  return venues
    .map((c) => ({ ...c, distanceKm: distanceKm(geo, c) }))
    .filter((c) => c.distanceKm <= CINEMA_RADIUS_KM)
    .sort((a, b) => a.distanceKm - b.distanceKm);
}

/** MyMovies pubblica solo il programma di oggi: nessuna fine spettacolo. */
function toShowings(showings: MmShowing[], bookingUrl: string): Showing[] {
  const today = romeDateString();
  return showings
    .map((s) => ({ start: romeIso(today, s.time), end: null, format: s.format, bookingUrl }))
    .sort((a, b) => a.start.localeCompare(b.start));
}

export async function nearbyCinemas(geo: LatLng, prov: string, n: number): Promise<Cinema[]> {
  return withDistance(geo, await getProvinceVenues(prov)).slice(0, n);
}

export async function filmShowtimes(
  geo: LatLng,
  prov: string,
  filmId: number,
  filmName: string,
): Promise<CinemaShowtimes[]> {
  const html = await mymovies.filmProvincePage(prov, filmId);
  if (!html) return [];
  const entries = parseFilmProvincePage(html).filter((e) => e.showings.length > 0);
  const venues = withDistance(geo, await venuesFor(prov, entries));
  const links = await resolveBookingLinks(
    venues.map((c) => ({ id: c.id, name: c.name })),
    filmName,
  );
  return venues.map((cinema) => ({
    cinema,
    showings: toShowings(
      entries.find((e) => e.cinemaId === cinema.id)?.showings ?? [],
      links.get(cinema.id) ?? bookingFallback(cinema.name, filmName),
    ),
  }));
}

export async function cinemaProgramme(cinema: Cinema): Promise<ProgrammeFilm[]> {
  if (!cinema.path) return [];
  const html = await mymovies.cinemaPage(cinema.path);
  if (!html) return [];
  const sites = await resolveCinemaSites([{ id: cinema.id, name: cinema.name }]);
  const site = sites.get(cinema.id) ?? null;
  const films = await Promise.all(
    parseCinemaPage(html).map(async (f) => ({
      film: await filmSummaryForMyMovies(f),
      showings: toShowings(f.showings, site ?? bookingFallback(cinema.name, f.title)),
    })),
  );
  return films.filter((f) => f.showings.length > 0);
}
```

`resolveCinemaSites` per MyMovies: `movieglu.cinemaDetails` non ha senso qui. In `links.ts` la ricerca del sito via MovieGlu va condizionata a `getCinemaSource() === "movieglu"`; per le altre sorgenti la riga `cinema_links` `movieglu` con `url: null` viene comunque scritta (così non si ritenta) — mantieni la logica, salta solo la chiamata.

- [ ] **Step 4: Facciata** — `git mv src/lib/cinema/showtimes.ts src/lib/cinema/movieglu-showtimes.ts` (aggiorna i suoi import relativi), poi nuovo `showtimes.ts`:

```ts
import "server-only";

import * as legacy from "./movieglu-showtimes";
import * as mm from "./mymovies/showtimes";
import { getCinemaSource } from "./source";
import type { Cinema, CinemaGeo, CinemaShowtimes, ProgrammeFilm } from "./types";

/**
 * Facciata: stessa interfaccia per tutte le sorgenti. Con MyMovies `filmId` è l'id
 * film MyMovies e `date` è ignorata (solo oggi); serve `geo.provinceSlug`.
 */
function useMyMovies(geo: CinemaGeo): geo is CinemaGeo & { provinceSlug: string } {
  return getCinemaSource() === "mymovies" && !!geo.provinceSlug;
}

export async function getNearbyCinemas(geo: CinemaGeo, n = 10): Promise<Cinema[]> {
  if (getCinemaSource() === "mymovies") {
    return geo.provinceSlug ? mm.nearbyCinemas(geo, geo.provinceSlug, n) : [];
  }
  return legacy.getNearbyCinemas(geo, n);
}

export async function getFilmShowtimes(
  geo: CinemaGeo,
  filmId: number,
  filmName: string,
  date: string,
): Promise<CinemaShowtimes[]> {
  if (getCinemaSource() === "mymovies") {
    return useMyMovies(geo) ? mm.filmShowtimes(geo, geo.provinceSlug, filmId, filmName) : [];
  }
  return legacy.getFilmShowtimes(geo, filmId, filmName, date);
}

export async function getCinemaProgramme(
  geo: CinemaGeo,
  cinema: Cinema,
  date: string,
): Promise<ProgrammeFilm[]> {
  if (getCinemaSource() === "mymovies") return mm.cinemaProgramme(cinema);
  return legacy.getCinemaProgramme(geo, cinema, date);
}
```

- [ ] **Step 5: `match.ts`** — aggiungi la facciata (esporta anche `recentlyReleased`):

```ts
/** Id del film nella sorgente attiva; MyMovies richiede la provincia dell'utente. */
export async function getSourceFilmId(
  title: TitleRow,
  geo: CinemaGeo | null,
): Promise<number | null> {
  if (getCinemaSource() === "mymovies") {
    return geo?.provinceSlug ? getMyMoviesFilmId(title, geo.provinceSlug) : null;
  }
  return getMovieGluFilmId(title);
}
```

- [ ] **Step 6: Verifica e commit** `pnpm typecheck && pnpm lint && pnpm test`; commit `feat(cinema): orari da MyMovies dietro la facciata showtimes`.

---

### Task 5: UI solo "oggi", provincia, copy; docs

**Files:**
- Modify: `src/components/cinema/NearbyShowtimes.tsx`, `src/app/(app)/cinema/page.tsx`, `src/components/cinema/FilmsView.tsx` (copy), `README.md`, `CLAUDE.md`
- Delete: `src/components/cinema/DayBar.tsx`

- [ ] **Step 1: `NearbyShowtimes.tsx`** — nuova logica:

```tsx
export async function NearbyShowtimes({ title }: { title: TitleRow }) {
  if (!isCinemaEnabled()) return null;
  const location = await getViewerLocation();
  // Senza posizione non sappiamo se il film è in sala: prompt solo per le uscite recenti.
  if (!location) {
    return recentlyReleased(title) ? <Section label={null}><LocationPrompt /></Section> : null;
  }
  const filmId = await getSourceFilmId(title, location).catch(() => null);
  if (filmId == null) return null;
  const [items, { friends }] = await Promise.all([
    getFilmShowtimes(location, filmId, title.title, romeDateString()).catch(() => []),
    getFriendsData(),
  ]);
  …
}
```

Testata "Oggi al cinema vicino a te" + `LocationChip`; niente `DayBar`; vuoto → "Nessuno spettacolo vicino a te oggi."; link `/cinema?film=<id>`. Se `location.provinceSlug` è null: testo "Zona non coperta: MyMovies non ha cinema per la tua provincia." al posto della lista. Togli la prop `day` da `TitleBody` e dalla pagina film (`searchParams` non serve più).

- [ ] **Step 2: `cinema/page.tsx`** — rimuovi `DayBar`, `nextDays`, `day`; `today = romeDateString()`; `getSourceFilmId(t, location)`; `getNearbyCinemas(location, 10)`; `getCinemaProgramme(location, cinema, today)`; `LocationChip` in `TopBar`; `provinceSlug` null → `EmptyState` "Zona non coperta". `FilmsView`: chiave `film.sourceFilmId`. Elimina `DayBar.tsx`.

- [ ] **Step 3: Docs** — README: bullet cinema riscritto (MyMovies gratis, `CINEMA_SOURCE`, solo oggi, migrazione 0010 già applicata). CLAUDE.md "### Cinema": sorgenti, `mymovies/` (parser + fixture, client, venues, match, showtimes), `cinema_venues`, `user_locations.province_slug`, regola "mai più di 4 req/s verso MyMovies, mai dal client".

- [ ] **Step 4: Verifica** `pnpm test && pnpm typecheck && pnpm lint && pnpm build`; commit `feat(cinema): UI solo oggi con MyMovies, docs`.

---

### Task 6: Verifica reale e deploy (controller)

- Applicazione migrazione 0010 (fatta dal controller nel Task 2), `CINEMA_SOURCE` non serve in Vercel (default mymovies); rimuovere `MOVIEGLU_MOCK=1` da `.env.local` per la prova reale.
- Prova con utente di test: posizione "Milano" → `/cinema` mostra cinema reali con orari di oggi; scheda di un film in sala mostra la sezione; screenshot mobile/desktop.
- Merge fast-forward su main e push; deploy Vercel lanciato dall'utente.

## Self-review

- Spec coverage: fonte/parser (T1), DB/config/sorgente (T2), client/venues/provincia (T3), match/orari/facciata (T4), UI solo oggi + docs (T5), verifica/deploy (T6).
- Tipi: `sourceFilmId` rinominato ovunque (T2) prima dell'uso in T4/T5; `CinemaGeo` (T2) usato da facciata (T4) e da `ViewerLocation` (T3, strutturalmente compatibile: ha `lat`, `lng`, `provinceSlug`).
- Nessun placeholder: ogni step ha il codice o l'edit preciso.
