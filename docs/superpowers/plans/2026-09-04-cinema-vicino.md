# Cinema vicino a te — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Per i film in sala, mostrare i cinema più vicini all'utente con gli orari del giorno e un flow corto verso l'acquisto del biglietto (deep link), "Ci vado" e invito agli amici.

**Architecture:** Adapter server-only `src/lib/cinema/` verso MovieGlu (cinema vicini, orari) con cache Next 15 min per cella geografica, match TMDB↔MovieGlu via IMDb id persistito in `cinema_films`, resolver link biglietteria a cascata (manual → sito cinema → catena → Google). Posizione salvata in `profiles`. UI: sezione `NearbyShowtimes` nella scheda film, pagina `/cinema`, `TicketSheet`, card "Stasera al cinema" in home. Mock (`MOVIEGLU_MOCK=1`) per sviluppare senza chiave.

**Tech Stack:** Next.js 15 App Router, TypeScript strict, Tailwind 4 (token in `globals.css`), Framer Motion, Supabase (RLS), MovieGlu API v2, Nominatim (OSM), Vitest (nuovo, solo per funzioni pure).

**Spec:** `docs/superpowers/specs/2026-09-04-cinema-vicino-design.md`

## Global Constraints

- Nessuna chiamata a MovieGlu/Nominatim/TMDB dal client: tutti i moduli in `src/lib/cinema/` che fanno fetch iniziano con `import "server-only"`. Le funzioni pure testate con Vitest stanno in file **senza** `server-only` (`geo.ts`, `dates.ts`, `formats.ts`, `chains.ts`, `films.ts`).
- Nessuna libreria UI, nessuna libreria di icone: SVG inline `strokeWidth={1.8}` `currentColor`.
- Token, non valori grezzi: `bg-surface`, `bg-surface-2`, `text-muted`, `text-muted-2`, `accent`, `accent-pale`, `.glass`; card `rounded-[20px] border border-border bg-surface`.
- Copy in italiano, commenti nel codice in italiano. Prettier: doppi apici, trailing comma, printWidth 90.
- CSP invariata (nessun nuovo origin lato client). `Permissions-Policy` passa a `geolocation=(self)`.
- Service client solo per `cinema_films` / `cinema_links` (dati di sistema). `profiles` e `cinema_plans` sempre via client cookie-bound (RLS).
- Cache orari: `SHOWTIME_CACHE_TTL_MS = 15 * 60 * 1000`. Chiave cella: 3 decimali (~110 m) — più fine dello 0,01° della spec per non falsare la distanza mostrata.
- Verifica finale di ogni task: `pnpm typecheck && pnpm lint` (e `pnpm test` dove esistono test). Prima del task finale: `pnpm build`.
- Fuori scope: posti in sala live, mappa, prezzi, checkout in-app, attività nel feed.

---

## File map

**Nuovi**
- `vitest.config.ts` — config test (alias `@` → `src`).
- `src/lib/cinema/geo.ts` (+ `geo.test.ts`) — lat/lng, cella cache, distanze, indicazioni, label Nominatim.
- `src/lib/cinema/dates.ts` (+ `dates.test.ts`) — fuso Europe/Rome, giorni, formati, countdown.
- `src/lib/cinema/formats.ts` (+ `formats.test.ts`) — normalizzazione formati sala.
- `src/lib/cinema/chains.ts` (+ `chains.test.ts`) — catene italiane, url Google biglietti.
- `src/lib/cinema/films.ts` (+ `films.test.ts`) — match film per IMDb id (puro).
- `src/lib/cinema/types.ts` — tipi raw MovieGlu + tipi pubblici `Cinema`, `Showing`, `FilmSummary`.
- `src/lib/cinema/movieglu.ts` — client MovieGlu (server-only, throttle, cache, mock switch).
- `src/lib/cinema/mock.ts` — dati finti (3 cinema Milano, film da TMDB now_playing).
- `src/lib/cinema/match.ts` — TMDB ↔ MovieGlu via `cinema_films`.
- `src/lib/cinema/links.ts` — resolver link biglietteria + `cinema_links`.
- `src/lib/cinema/showtimes.ts` — `getNearbyCinemas`, `getFilmShowtimes`, `getCinemaProgramme`.
- `src/lib/cinema/geocode.ts` — Nominatim (server-only).
- `src/lib/cinema/location.ts` — Server Actions posizione.
- `src/lib/cinema/plans.ts` — Server Actions "Ci vado".
- `src/lib/cinema/queries.ts` — letture: `getViewerLocation`, `getUpcomingPlan`.
- `src/components/cinema/LocationPrompt.tsx`, `LocationChip.tsx`, `DayBar.tsx`, `ShowtimeChip.tsx`, `CinemaCard.tsx`, `ShowtimesClient.tsx`, `TicketSheet.tsx`, `NearbyShowtimes.tsx`, `FilmsView.tsx`, `VenuesView.tsx`, `TonightAtCinema.tsx`, `PlanCard.tsx`, `icons.tsx`.
- `src/app/(app)/cinema/page.tsx`, `loading.tsx`.
- `supabase/migrations/0006_cinema.sql`.
- `scripts/set-cinema-link.ts`.

**Modificati**
- `package.json` (vitest, script `test`), `.env.example`, `README.md`, `CLAUDE.md`.
- `next.config.ts:44` (Permissions-Policy).
- `src/lib/config.ts` (costanti cinema), `src/lib/tmdb/client.ts` (`findByImdb`).
- `src/types/database.ts` (rigenerato).
- `src/components/title/TitleBody.tsx`, `src/app/(app)/title/movie/[id]/page.tsx`.
- `src/components/title/RecommendSheet.tsx` (`initialMessage`).
- `src/components/discover/DiscoverSections.tsx` (link "Vedi tutti" → `/cinema`).
- `src/app/(app)/page.tsx` (card home).

---

### Task 1: Vitest + helper puri `geo.ts` e `dates.ts`

**Files:**
- Create: `vitest.config.ts`, `src/lib/cinema/geo.ts`, `src/lib/cinema/geo.test.ts`, `src/lib/cinema/dates.ts`, `src/lib/cinema/dates.test.ts`
- Modify: `package.json`

**Interfaces:**
- Produces: `LatLng`, `isValidLatLng`, `cellKey`, `roundToCell`, `milesToKm`, `distanceKm`, `formatDistance`, `walkingMinutes`, `directionsUrl`, `labelFromAddress`; `romeDateString`, `romeIso`, `nextDays`, `formatShowingDate`, `formatTime`, `minutesUntil`, `formatCountdown`, `DayOption`.

- [ ] **Step 1: Installa vitest e aggiungi lo script**

```bash
pnpm add -D vitest
```

In `package.json` → `scripts` aggiungi `"test": "vitest run"`.

Crea `vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
});
```

- [ ] **Step 2: Scrivi i test di `geo.ts`**

`src/lib/cinema/geo.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  cellKey,
  directionsUrl,
  distanceKm,
  formatDistance,
  isValidLatLng,
  labelFromAddress,
  milesToKm,
  roundToCell,
  walkingMinutes,
} from "./geo";

describe("geo", () => {
  it("valida le coordinate", () => {
    expect(isValidLatLng(45.46, 9.19)).toBe(true);
    expect(isValidLatLng(91, 0)).toBe(false);
    expect(isValidLatLng(0, 181)).toBe(false);
    expect(isValidLatLng(Number.NaN, 0)).toBe(false);
  });

  it("arrotonda alla cella di 3 decimali", () => {
    expect(roundToCell({ lat: 45.46421, lng: 9.19163 })).toEqual({ lat: 45.464, lng: 9.192 });
    expect(cellKey({ lat: 45.46421, lng: 9.19163 })).toBe("45.464,9.192");
  });

  it("converte miglia in km", () => {
    expect(milesToKm(1)).toBeCloseTo(1.609, 3);
  });

  it("calcola la distanza haversine (Duomo → Bicocca ≈ 6,6 km)", () => {
    const km = distanceKm({ lat: 45.4642, lng: 9.19 }, { lat: 45.5228, lng: 9.2131 });
    expect(km).toBeGreaterThan(6.3);
    expect(km).toBeLessThan(6.9);
  });

  it("formatta la distanza all'italiana", () => {
    expect(formatDistance(0.85)).toBe("850 m");
    expect(formatDistance(1.234)).toBe("1,2 km");
    expect(formatDistance(12.6)).toBe("13 km");
  });

  it("stima i minuti a piedi a 5 km/h", () => {
    expect(walkingMinutes(1.25)).toBe(15);
    expect(walkingMinutes(0.1)).toBe(1);
  });

  it("costruisce il link indicazioni", () => {
    expect(directionsUrl({ lat: 45.5, lng: 9.2 }, false)).toBe(
      "https://maps.google.com/?q=45.5,9.2",
    );
    expect(directionsUrl({ lat: 45.5, lng: 9.2 }, true)).toBe(
      "https://maps.apple.com/?daddr=45.5,9.2",
    );
  });

  it("compone l'etichetta da un indirizzo Nominatim", () => {
    expect(labelFromAddress({ suburb: "Porta Romana", city: "Milano" })).toBe(
      "Porta Romana, Milano",
    );
    expect(labelFromAddress({ town: "Monza" })).toBe("Monza");
    expect(labelFromAddress({ quarter: "Centro", village: "Erba" })).toBe("Centro, Erba");
    expect(labelFromAddress({})).toBeNull();
  });
});
```

- [ ] **Step 3: Esegui: deve fallire**

Run: `pnpm test`
Expected: FAIL — `Cannot find module './geo'`.

- [ ] **Step 4: Implementa `geo.ts`**

```ts
// Helper geografici puri (nessun fetch): usabili sia lato server sia lato client.

export interface LatLng {
  lat: number;
  lng: number;
}

export function isValidLatLng(lat: number, lng: number): boolean {
  return (
    Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180
  );
}

/** Cella di ~110 m: chiave di cache condivisa da chi sta nello stesso isolato. */
export function roundToCell(p: LatLng): LatLng {
  return { lat: Math.round(p.lat * 1000) / 1000, lng: Math.round(p.lng * 1000) / 1000 };
}

export function cellKey(p: LatLng): string {
  const c = roundToCell(p);
  return `${c.lat},${c.lng}`;
}

export function milesToKm(miles: number): number {
  return miles * 1.609344;
}

/** Distanza in km sulla sfera terrestre (haversine). */
export function distanceKm(a: LatLng, b: LatLng): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** "850 m" sotto il km, "1,2 km" fino a 10, poi "13 km". */
export function formatDistance(km: number): string {
  if (km < 1) return `${Math.round(km * 100) * 10} m`;
  if (km < 10) return `${km.toFixed(1).replace(".", ",")} km`;
  return `${Math.round(km)} km`;
}

/** Minuti a piedi a 5 km/h, minimo 1. */
export function walkingMinutes(km: number): number {
  return Math.max(1, Math.round((km / 5) * 60));
}

export function directionsUrl(p: LatLng, ios: boolean): string {
  return ios
    ? `https://maps.apple.com/?daddr=${p.lat},${p.lng}`
    : `https://maps.google.com/?q=${p.lat},${p.lng}`;
}

/** Sottoinsieme dell'oggetto `address` di Nominatim. */
export interface NominatimAddress {
  suburb?: string;
  quarter?: string;
  neighbourhood?: string;
  city?: string;
  town?: string;
  village?: string;
  municipality?: string;
}

/** "Quartiere, Città" / "Città" / null se non c'è nulla di utile. */
export function labelFromAddress(a: NominatimAddress): string | null {
  const area = a.suburb ?? a.quarter ?? a.neighbourhood ?? null;
  const city = a.city ?? a.town ?? a.village ?? a.municipality ?? null;
  if (area && city) return `${area}, ${city}`;
  return city ?? area;
}
```

- [ ] **Step 5: Esegui i test di geo: devono passare**

Run: `pnpm test`
Expected: PASS (geo).

- [ ] **Step 6: Scrivi i test di `dates.ts`**

`src/lib/cinema/dates.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  formatCountdown,
  formatShowingDate,
  formatTime,
  minutesUntil,
  nextDays,
  romeDateString,
  romeIso,
} from "./dates";

describe("dates (Europe/Rome)", () => {
  it("ricava la data locale di Roma", () => {
    // 23:30 UTC del 4 settembre = 01:30 del 5 a Roma (CEST)
    expect(romeDateString(new Date("2026-09-04T23:30:00Z"))).toBe("2026-09-05");
  });

  it("costruisce l'ISO con l'offset giusto (estate/inverno)", () => {
    expect(romeIso("2026-09-04", "21:00")).toBe("2026-09-04T21:00:00+02:00");
    expect(romeIso("2026-01-10", "21:00")).toBe("2026-01-10T21:00:00+01:00");
  });

  it("elenca i prossimi giorni con etichette italiane", () => {
    const days = nextDays(3, new Date("2026-09-04T10:00:00Z"));
    expect(days.map((d) => d.date)).toEqual(["2026-09-04", "2026-09-05", "2026-09-06"]);
    expect(days.map((d) => d.label)).toEqual(["Oggi", "Domani", "Dom 6"]);
  });

  it("formatta data e ora dello spettacolo", () => {
    expect(formatShowingDate("2026-09-10T21:00:00+02:00")).toBe("Gio 10 set · 21:00");
    expect(formatTime("2026-09-10T21:05:00+02:00")).toBe("21:05");
  });

  it("calcola minuti e countdown", () => {
    const now = new Date("2026-09-04T18:00:00+02:00").getTime();
    expect(minutesUntil("2026-09-04T20:10:00+02:00", now)).toBe(130);
    expect(formatCountdown(130)).toBe("tra 2 h 10");
    expect(formatCountdown(120)).toBe("tra 2 h");
    expect(formatCountdown(35)).toBe("tra 35 min");
    expect(formatCountdown(0)).toBe("adesso");
    expect(formatCountdown(-20)).toBe("iniziato");
  });
});
```

- [ ] **Step 7: Esegui: deve fallire**

Run: `pnpm test`
Expected: FAIL — `Cannot find module './dates'`.

- [ ] **Step 8: Implementa `dates.ts`**

```ts
// Date e orari degli spettacoli, sempre nel fuso dei cinema italiani.
// Nessuna dipendenza: usa solo Intl (Node 20+ supporta `longOffset`).

const TZ = "Europe/Rome";

export interface DayOption {
  /** YYYY-MM-DD */
  date: string;
  /** "Oggi", "Domani", "Gio 7" */
  label: string;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Data locale di Roma in formato YYYY-MM-DD. */
export function romeDateString(d: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

/** Offset di Roma ("+02:00" / "+01:00") nel giorno indicato. */
function romeOffset(date: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    timeZoneName: "longOffset",
  }).formatToParts(new Date(`${date}T12:00:00Z`));
  const name = parts.find((p) => p.type === "timeZoneName")?.value ?? "GMT";
  const offset = name.replace("GMT", "");
  return offset === "" ? "+00:00" : offset;
}

/** `date` + `hh:mm` locali di Roma → ISO 8601 con offset. */
export function romeIso(date: string, hhmm: string): string {
  return `${date}T${hhmm}:00${romeOffset(date)}`;
}

/** I prossimi `n` giorni a partire da `from` (oggi a Roma). */
export function nextDays(n = 7, from: Date = new Date()): DayOption[] {
  const fmt = new Intl.DateTimeFormat("it-IT", {
    timeZone: TZ,
    weekday: "short",
    day: "numeric",
  });
  const out: DayOption[] = [];
  for (let i = 0; i < n; i++) {
    const d = new Date(from.getTime() + i * 86_400_000);
    const label = i === 0 ? "Oggi" : i === 1 ? "Domani" : capitalize(fmt.format(d));
    out.push({ date: romeDateString(d), label });
  }
  return out;
}

/** "Gio 10 set · 21:00" */
export function formatShowingDate(iso: string): string {
  const d = new Date(iso);
  const day = new Intl.DateTimeFormat("it-IT", {
    timeZone: TZ,
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(d);
  return `${capitalize(day)} · ${formatTime(iso)}`;
}

/** "21:05" */
export function formatTime(iso: string): string {
  return new Intl.DateTimeFormat("it-IT", {
    timeZone: TZ,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));
}

export function minutesUntil(iso: string, now: number = Date.now()): number {
  return Math.round((new Date(iso).getTime() - now) / 60_000);
}

/** "tra 2 h 10" / "tra 35 min" / "adesso" / "iniziato" */
export function formatCountdown(minutes: number): string {
  if (minutes < 0) return "iniziato";
  if (minutes === 0) return "adesso";
  if (minutes < 60) return `tra ${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `tra ${h} h` : `tra ${h} h ${m}`;
}
```

- [ ] **Step 9: Esegui tutti i test: devono passare**

Run: `pnpm test && pnpm typecheck && pnpm lint`
Expected: PASS, nessun errore.

- [ ] **Step 10: Commit**

```bash
git add package.json pnpm-lock.yaml vitest.config.ts src/lib/cinema/geo.ts src/lib/cinema/geo.test.ts src/lib/cinema/dates.ts src/lib/cinema/dates.test.ts
git commit -m "feat(cinema): helper geo e date con vitest"
```

---

### Task 2: Formati sala, catene, match IMDb (puri)

**Files:**
- Create: `src/lib/cinema/formats.ts` (+ test), `src/lib/cinema/chains.ts` (+ test), `src/lib/cinema/films.ts` (+ test), `src/lib/cinema/types.ts`

**Interfaces:**
- Produces: `normalizeFormat(key): string`, `formatLabel(format): string | null`; `Chain`, `CINEMA_CHAINS`, `chainFor(name)`, `googleTicketsUrl(cinema, film)`; `matchFilmByImdb(films, imdbId)`; tipi `MgFilm`, `MgCinema`, `MgTime`, `MgShowings`, `MgFilmsNowShowing`, `MgCinemasNearby`, `MgFilmShowTimes`, `MgCinemaShowTimes`, `MgCinemaDetails`, `Cinema`, `Showing`, `FilmSummary`, `CinemaShowtimes`, `ProgrammeFilm`.

- [ ] **Step 1: Tipi in `types.ts`**

```ts
// Tipi raw MovieGlu v2 (solo i campi usati) e tipi pubblici dell'adapter cinema.

export interface MgFilm {
  film_id: number;
  film_name: string;
  imdb_id?: number | string | null;
  /** "tt1234567" */
  imdb_title_id?: string | null;
  release_dates?: { release_date: string; notes?: string }[];
}

export interface MgCinema {
  cinema_id: number;
  cinema_name: string;
  address?: string;
  address2?: string;
  city?: string;
  postcode?: string;
  lat?: number;
  lng?: number;
  /** Miglia dalla geolocation passata. */
  distance?: number;
  logo_url?: string | null;
}

export interface MgTime {
  /** "HH:MM" */
  start_time: string;
  end_time?: string;
}

/** Chiave = formato ("Standard", "3D", "IMAX", "IMAX 3D", …). */
export type MgShowings = Record<string, { film_id?: number; times: MgTime[] }>;

export interface MgFilmsNowShowing {
  films: MgFilm[];
}
export interface MgCinemasNearby {
  cinemas: MgCinema[];
}
export interface MgFilmShowTimes {
  film: MgFilm;
  cinemas: (MgCinema & { showings: MgShowings })[];
}
export interface MgCinemaShowTimes {
  cinema: MgCinema;
  films: (MgFilm & { showings: MgShowings })[];
}
export interface MgCinemaDetails extends MgCinema {
  website?: string | null;
}

// ---- tipi pubblici (serializzabili: passano ai client component) ----

export interface Cinema {
  id: number;
  name: string;
  address: string;
  city: string;
  lat: number;
  lng: number;
  distanceKm: number;
  logoUrl: string | null;
}

export interface Showing {
  /** ISO 8601 con offset di Roma. */
  start: string;
  end: string | null;
  /** "standard" | "3d" | "imax" | "imax3d" | altro normalizzato. */
  format: string;
  bookingUrl: string;
}

export interface FilmSummary {
  tmdbId: number | null;
  movieGluFilmId: number;
  title: string;
  posterPath: string | null;
  backdropPath: string | null;
}

export interface CinemaShowtimes {
  cinema: Cinema;
  showings: Showing[];
}

export interface ProgrammeFilm {
  film: FilmSummary;
  showings: Showing[];
}
```

- [ ] **Step 2: Test `formats.test.ts`**

```ts
import { describe, expect, it } from "vitest";
import { formatLabel, normalizeFormat } from "./formats";

describe("formats", () => {
  it("normalizza le chiavi MovieGlu", () => {
    expect(normalizeFormat("Standard")).toBe("standard");
    expect(normalizeFormat("3D")).toBe("3d");
    expect(normalizeFormat("IMAX")).toBe("imax");
    expect(normalizeFormat("IMAX 3D")).toBe("imax3d");
    expect(normalizeFormat("4DX")).toBe("4dx");
  });

  it("etichetta solo i formati speciali", () => {
    expect(formatLabel("standard")).toBeNull();
    expect(formatLabel("3d")).toBe("3D");
    expect(formatLabel("imax")).toBe("IMAX");
    expect(formatLabel("imax3d")).toBe("IMAX 3D");
    expect(formatLabel("4dx")).toBe("4DX");
  });
});
```

- [ ] **Step 3: Implementa `formats.ts`**

```ts
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
```

- [ ] **Step 4: Test `chains.test.ts`**

```ts
import { describe, expect, it } from "vitest";
import { chainFor, googleTicketsUrl } from "./chains";

describe("chains", () => {
  it("riconosce le catene dal nome del cinema", () => {
    expect(chainFor("UCI Cinemas Bicocca")?.name).toBe("UCI Cinemas");
    expect(chainFor("The Space Cinema Odeon")?.name).toBe("The Space Cinema");
    expect(chainFor("Notorious Cinemas Sesto")?.name).toBe("Notorious Cinemas");
    expect(chainFor("Cinelandia Arosio")?.name).toBe("Cinelandia");
    expect(chainFor("Anteo Palazzo del Cinema")).toBeNull();
  });

  it("costruisce la ricerca Google dei biglietti", () => {
    expect(googleTicketsUrl("Anteo Palazzo del Cinema", "Dune: Parte Due")).toBe(
      "https://www.google.com/search?q=Anteo%20Palazzo%20del%20Cinema%20Dune%3A%20Parte%20Due%20biglietti",
    );
  });
});
```

- [ ] **Step 5: Implementa `chains.ts`**

```ts
// Catene cinematografiche italiane: riconosciute dal nome, usate per il link
// biglietteria quando MovieGlu non fornisce il sito del singolo cinema.

export interface Chain {
  name: string;
  homeUrl: string;
  pattern: RegExp;
}

export const CINEMA_CHAINS: Chain[] = [
  { name: "UCI Cinemas", homeUrl: "https://ucicinemas.it/", pattern: /\buci\b/i },
  {
    name: "The Space Cinema",
    homeUrl: "https://www.thespacecinema.it/",
    pattern: /the\s*space/i,
  },
  {
    name: "Notorious Cinemas",
    homeUrl: "https://www.notoriouscinemas.it/",
    pattern: /notorious/i,
  },
  { name: "Cinelandia", homeUrl: "https://www.cinelandia.it/", pattern: /cinelandia/i },
];

export function chainFor(cinemaName: string): Chain | null {
  return CINEMA_CHAINS.find((c) => c.pattern.test(cinemaName)) ?? null;
}

export function googleTicketsUrl(cinemaName: string, filmName: string): string {
  const q = encodeURIComponent(`${cinemaName} ${filmName} biglietti`);
  return `https://www.google.com/search?q=${q}`;
}
```

- [ ] **Step 6: Test `films.test.ts`**

```ts
import { describe, expect, it } from "vitest";
import { matchFilmByImdb } from "./films";
import type { MgFilm } from "./types";

const films: MgFilm[] = [
  { film_id: 1, film_name: "A", imdb_title_id: "tt0000001" },
  { film_id: 2, film_name: "B", imdb_title_id: "tt0000002", imdb_id: 2 },
  { film_id: 3, film_name: "C", imdb_id: 3 },
];

describe("matchFilmByImdb", () => {
  it("trova per imdb_title_id", () => {
    expect(matchFilmByImdb(films, "tt0000002")?.film_id).toBe(2);
  });
  it("ripiega sull'imdb_id numerico (campo deprecato)", () => {
    expect(matchFilmByImdb(films, "tt0000003")?.film_id).toBe(3);
  });
  it("null senza match o senza id", () => {
    expect(matchFilmByImdb(films, "tt9999999")).toBeNull();
    expect(matchFilmByImdb(films, null)).toBeNull();
  });
});
```

- [ ] **Step 7: Implementa `films.ts`**

```ts
import type { MgFilm } from "./types";

/** Cerca il film MovieGlu con lo stesso IMDb id ("tt1234567") di TMDB. */
export function matchFilmByImdb(films: MgFilm[], imdbId: string | null): MgFilm | null {
  if (!imdbId) return null;
  const numeric = Number(imdbId.replace(/^tt/, ""));
  return (
    films.find(
      (f) =>
        f.imdb_title_id === imdbId ||
        (f.imdb_id != null && Number(f.imdb_id) === numeric),
    ) ?? null
  );
}
```

- [ ] **Step 8: Test, typecheck, lint, commit**

Run: `pnpm test && pnpm typecheck && pnpm lint`
Expected: PASS.

```bash
git add src/lib/cinema/types.ts src/lib/cinema/formats.ts src/lib/cinema/formats.test.ts src/lib/cinema/chains.ts src/lib/cinema/chains.test.ts src/lib/cinema/films.ts src/lib/cinema/films.test.ts
git commit -m "feat(cinema): tipi MovieGlu, formati, catene, match IMDb"
```

---

### Task 3: Migrazione `0006_cinema.sql`, tipi DB, config, env, Permissions-Policy

**Files:**
- Create: `supabase/migrations/0006_cinema.sql`
- Modify: `src/types/database.ts`, `src/lib/config.ts`, `.env.example`, `next.config.ts:44`

**Interfaces:**
- Produces: tabelle `cinema_films`, `cinema_links`, `cinema_plans`; colonne `profiles.location_*`; `SHOWTIME_CACHE_TTL_MS`, `CINEMA_FILM_MATCH_TTL_MS`, `CINEMA_LINK_TTL_MS`, `NOMINATIM_BASE`, `NOMINATIM_USER_AGENT`.

- [ ] **Step 1: Scrivi la migrazione**

`supabase/migrations/0006_cinema.sql`:

```sql
-- Zapp — migration 0006: cinema vicino a te (posizione, match MovieGlu, link, piani)

-- posizione dell'utente (GPS o città scelta): usata per cinema e orari
alter table public.profiles
  add column location_lat double precision,
  add column location_lng double precision,
  add column location_label text,
  add column location_updated_at timestamptz;

-- match TMDB → MovieGlu (dati di sistema, scritti solo dal service role)
create table public.cinema_films (
  tmdb_id bigint primary key,
  -- null = film non in programmazione al momento del match
  movieglu_film_id integer,
  imdb_id text,
  title text,
  poster_path text,
  backdrop_path text,
  fetched_at timestamptz not null default now()
);
create index cinema_films_movieglu_idx on public.cinema_films (movieglu_film_id);

-- link biglietteria per cinema (manual mai sovrascritto; movieglu = sito del cinema)
create table public.cinema_links (
  cinema_id integer primary key,
  -- null con source 'movieglu' = MovieGlu non conosce il sito; si ritenta dopo il TTL
  url text,
  source text not null check (source in ('manual', 'movieglu')),
  fetched_at timestamptz not null default now()
);

-- "Ci vado": serata al cinema pianificata dall'utente
create table public.cinema_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  tmdb_id bigint not null,
  film_title text not null,
  poster_path text,
  backdrop_path text,
  cinema_id integer not null,
  cinema_name text not null,
  cinema_address text not null,
  cinema_lat double precision,
  cinema_lng double precision,
  starts_at timestamptz not null,
  format text,
  booking_url text not null,
  created_at timestamptz not null default now(),
  unique (user_id, tmdb_id, starts_at)
);
create index cinema_plans_user_starts_idx on public.cinema_plans (user_id, starts_at);

-- RLS: le tabelle di sistema restano senza policy (solo service role);
-- i piani sono visibili e modificabili solo dal proprietario.
alter table public.cinema_films enable row level security;
alter table public.cinema_links enable row level security;
alter table public.cinema_plans enable row level security;

create policy "cinema_plans_select_own" on public.cinema_plans
  for select using (auth.uid() = user_id);
create policy "cinema_plans_insert_own" on public.cinema_plans
  for insert with check (auth.uid() = user_id);
create policy "cinema_plans_delete_own" on public.cinema_plans
  for delete using (auth.uid() = user_id);
```

- [ ] **Step 2: Applica e rigenera i tipi**

```bash
supabase db push
supabase gen types typescript --project-id bbuhwzdbzxgydewmcdwd > src/types/database.ts
pnpm prettier --write src/types/database.ts
```

Se la CLI non è loggata (`supabase login` è interattivo: chiedere all'utente di eseguirlo con `! supabase login`), applica la migrazione con il tool MCP Supabase `apply_migration` (project `bbuhwzdbzxgydewmcdwd`, name `0006_cinema`) e rigenera con `generate_typescript_types`, salvando l'output in `src/types/database.ts`.

Verifica che in `database.ts` esistano `cinema_films`, `cinema_links`, `cinema_plans` (con `Relationships: []` per le prime due e la FK su `profiles` per `cinema_plans`) e che `profiles.Row` contenga `location_lat: number | null`, `location_lng: number | null`, `location_label: string | null`, `location_updated_at: string | null`.

- [ ] **Step 3: Costanti in `src/lib/config.ts`** (in coda al file)

```ts
/** Orari cinema (MovieGlu): cache per cella geografica di ~110 m. */
export const SHOWTIME_CACHE_TTL_MS = 15 * 60 * 1000;
/** Match TMDB ↔ MovieGlu in `cinema_films`: rifatto una volta al giorno. */
export const CINEMA_FILM_MATCH_TTL_MS = 24 * 60 * 60 * 1000;
/** Sito del cinema da MovieGlu in `cinema_links`: 30 giorni. */
export const CINEMA_LINK_TTL_MS = 30 * 24 * 60 * 60 * 1000;
/** Geocoding (solo server): Nominatim richiede uno User-Agent identificabile. */
export const NOMINATIM_BASE = "https://nominatim.openstreetmap.org";
export const NOMINATIM_USER_AGENT = "Zapp/1.0 (michelimanuel03.mm@gmail.com)";
```

- [ ] **Step 4: `.env.example`** (in coda)

```
# opzionali: cinema vicini e orari (MovieGlu, https://developer.movieglu.com)
# senza queste tre variabili la sezione cinema non compare
MOVIEGLU_CLIENT=
MOVIEGLU_API_KEY=
MOVIEGLU_AUTHORIZATION=
# sviluppo senza chiave: 1 = dati finti (3 cinema a Milano)
MOVIEGLU_MOCK=
```

- [ ] **Step 5: Permissions-Policy in `next.config.ts:44`**

Sostituisci `geolocation=()` con `geolocation=(self)`:

```ts
        { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(self)" },
```

- [ ] **Step 6: Verifica e commit**

Run: `pnpm typecheck && pnpm lint`
Expected: PASS.

```bash
git add supabase/migrations/0006_cinema.sql src/types/database.ts src/lib/config.ts .env.example next.config.ts
git commit -m "feat(cinema): migrazione 0006, tipi, config, geolocation consentita"
```

---

### Task 4: Client MovieGlu + mock

**Files:**
- Create: `src/lib/cinema/movieglu.ts`, `src/lib/cinema/mock.ts`

**Interfaces:**
- Consumes: `LatLng`, `roundToCell`, `cellKey`, `distanceKm` (Task 1); tipi `Mg*` (Task 2); `getMovieList` da `@/lib/tmdb/client`.
- Produces: `isCinemaEnabled(): boolean`, `isMock(): boolean`, `movieglu.filmsNowShowing()`, `movieglu.cinemasNearby(geo, n)`, `movieglu.filmShowTimes(geo, filmId, date, n)`, `movieglu.cinemaShowTimes(geo, cinemaId, date)`, `movieglu.cinemaDetails(cinemaId)` — tutte `Promise<T | null>` (`null` = 204 / errore).

- [ ] **Step 1: Implementa `mock.ts`**

```ts
import "server-only";

import { getMovieList } from "@/lib/tmdb/client";
import { distanceKm, type LatLng } from "./geo";
import type {
  MgCinema,
  MgCinemaDetails,
  MgCinemaShowTimes,
  MgCinemasNearby,
  MgFilm,
  MgFilmShowTimes,
  MgFilmsNowShowing,
  MgShowings,
} from "./types";

/**
 * Dati finti per sviluppare senza chiave MovieGlu (`MOVIEGLU_MOCK=1`).
 * Tre cinema reali di Milano; i film sono i "now playing" TMDB con
 * `film_id` = id TMDB, così il match è diretto (vedi `match.ts`).
 */
const CINEMAS: MgCinema[] = [
  {
    cinema_id: 9001,
    cinema_name: "UCI Cinemas Bicocca",
    address: "Viale Sarca 336",
    city: "Milano",
    lat: 45.5228,
    lng: 9.2131,
    logo_url: null,
  },
  {
    cinema_id: 9002,
    cinema_name: "Anteo Palazzo del Cinema",
    address: "Piazza XXV Aprile 8",
    city: "Milano",
    lat: 45.4791,
    lng: 9.1884,
    logo_url: null,
  },
  {
    cinema_id: 9003,
    cinema_name: "The Space Cinema Odeon",
    address: "Via Santa Radegonda 8",
    city: "Milano",
    lat: 45.4656,
    lng: 9.1917,
    logo_url: null,
  },
];

const BASE_TIMES = ["15:30", "18:00", "20:45", "22:30"];

export interface MockFilm extends MgFilm {
  poster_path: string | null;
  backdrop_path: string | null;
}

async function films(): Promise<MockFilm[]> {
  const list = await getMovieList("now_playing").catch(() => null);
  return (list?.results ?? [])
    .filter((r) => r.media_type === "movie" || r.media_type === undefined)
    .slice(0, 6)
    .map((r) => ({
      film_id: r.id,
      film_name: r.title ?? r.name ?? "Film",
      imdb_title_id: null,
      poster_path: r.poster_path ?? null,
      backdrop_path: r.backdrop_path ?? null,
    }));
}

function withDistance(geo: LatLng): MgCinema[] {
  return CINEMAS.map((c) => ({
    ...c,
    distance: distanceKm(geo, { lat: c.lat!, lng: c.lng! }) / 1.609344,
  })).sort((a, b) => a.distance! - b.distance!);
}

/** Orari deterministici: sfasati di 15' per (film, cinema); IMAX solo alla Bicocca. */
function showingsFor(filmIndex: number, cinemaIndex: number): MgShowings {
  const shift = ((filmIndex + cinemaIndex) % 3) * 15;
  const times = BASE_TIMES.map((t) => {
    const [h, m] = t.split(":").map(Number);
    const total = h * 60 + m + shift;
    const hh = String(Math.floor(total / 60)).padStart(2, "0");
    const mm = String(total % 60).padStart(2, "0");
    const endTotal = total + 125;
    const eh = String(Math.floor(endTotal / 60) % 24).padStart(2, "0");
    const em = String(endTotal % 60).padStart(2, "0");
    return { start_time: `${hh}:${mm}`, end_time: `${eh}:${em}` };
  });
  const out: MgShowings = { Standard: { times } };
  if (cinemaIndex === 0 && filmIndex % 2 === 0) {
    out.IMAX = { times: [{ start_time: "21:15", end_time: "23:20" }] };
  }
  return out;
}

export const mock = {
  async filmsNowShowing(): Promise<MgFilmsNowShowing> {
    return { films: await films() };
  },
  async cinemasNearby(geo: LatLng, n: number): Promise<MgCinemasNearby> {
    return { cinemas: withDistance(geo).slice(0, n) };
  },
  async filmShowTimes(geo: LatLng, filmId: number): Promise<MgFilmShowTimes | null> {
    const all = await films();
    const index = all.findIndex((f) => f.film_id === filmId);
    if (index < 0) return null;
    return {
      film: all[index],
      cinemas: withDistance(geo).map((c, i) => ({ ...c, showings: showingsFor(index, i) })),
    };
  },
  async cinemaShowTimes(geo: LatLng, cinemaId: number): Promise<MgCinemaShowTimes | null> {
    const cinemas = withDistance(geo);
    const cinemaIndex = cinemas.findIndex((c) => c.cinema_id === cinemaId);
    if (cinemaIndex < 0) return null;
    const all = await films();
    return {
      cinema: cinemas[cinemaIndex],
      films: all.map((f, i) => ({ ...f, showings: showingsFor(i, cinemaIndex) })),
    };
  },
  async cinemaDetails(cinemaId: number): Promise<MgCinemaDetails | null> {
    const c = CINEMAS.find((x) => x.cinema_id === cinemaId);
    return c ? { ...c, website: null } : null;
  },
};
```

Nota: `TmdbMultiResult` ha `title`/`name`/`backdrop_path` opzionali; se `backdrop_path` non esiste nel tipo, aggiungilo a `TmdbMultiResult` in `src/lib/tmdb/types.ts` come `backdrop_path?: string | null;`.

- [ ] **Step 2: Implementa `movieglu.ts`**

```ts
import "server-only";

import { unstable_cache } from "next/cache";
import { SHOWTIME_CACHE_TTL_MS } from "@/lib/config";
import { cellKey, roundToCell, type LatLng } from "./geo";
import { mock } from "./mock";
import type {
  MgCinemaDetails,
  MgCinemaShowTimes,
  MgCinemasNearby,
  MgFilmShowTimes,
  MgFilmsNowShowing,
} from "./types";

const BASE = "https://api-gate2.movieglu.com";
const REVALIDATE_S = SHOWTIME_CACHE_TTL_MS / 1000;

export function isMock(): boolean {
  return process.env.MOVIEGLU_MOCK === "1";
}

function credentials(): { client: string; key: string; auth: string } | null {
  const client = process.env.MOVIEGLU_CLIENT;
  const key = process.env.MOVIEGLU_API_KEY;
  const auth = process.env.MOVIEGLU_AUTHORIZATION;
  if (!client || !key || !auth) return null;
  if ([client, key, auth].some((v) => v.startsWith("INSERISCI"))) return null;
  return { client, key, auth };
}

/** Senza chiave (e senza mock) la UI cinema non viene renderizzata. */
export function isCinemaEnabled(): boolean {
  return isMock() || credentials() !== null;
}

// Throttle in memoria: 2 richieste al secondo (quota MovieGlu a consumo).
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

/** GET su MovieGlu. `null` su 204 (nessun dato) o errore: chi chiama degrada. */
async function mgFetch<T>(
  path: string,
  params: Record<string, string>,
  geo: LatLng | null,
): Promise<T | null> {
  const creds = credentials();
  if (!creds) throw new Error("Credenziali MovieGlu mancanti in .env.local");

  const url = new URL(`${BASE}/${path}/`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

  const headers: Record<string, string> = {
    client: creds.client,
    "x-api-key": creds.key,
    authorization: creds.auth,
    territory: "IT",
    "api-version": "v201",
    "device-datetime": new Date().toISOString(),
  };
  if (geo) headers.geolocation = `${geo.lat};${geo.lng}`;

  await throttle();
  console.log(`[movieglu] fetch ${url.pathname}${url.search}`);
  try {
    const res = await fetch(url, { headers, cache: "no-store" });
    if (res.status === 204) return null;
    if (!res.ok) {
      console.error(`[movieglu] ${res.status} su ${url.pathname}`);
      return null;
    }
    return (await res.json()) as T;
  } catch (e) {
    console.error("[movieglu] errore di rete:", e);
    return null;
  }
}

/**
 * Le funzioni sono avvolte in `unstable_cache` con chiave esplicita
 * (cella ~110 m + argomenti): la geolocation nell'header cambierebbe la chiave
 * del `fetch` cache a ogni metro.
 */
export const movieglu = {
  filmsNowShowing: unstable_cache(
    async (): Promise<MgFilmsNowShowing | null> => {
      if (isMock()) return mock.filmsNowShowing();
      return mgFetch<MgFilmsNowShowing>("filmsNowShowing", { n: "50" }, null);
    },
    ["movieglu-films-now-showing"],
    { revalidate: 3600 },
  ),

  async cinemasNearby(geo: LatLng, n = 10): Promise<MgCinemasNearby | null> {
    const cell = roundToCell(geo);
    const fn = unstable_cache(
      async () => {
        if (isMock()) return mock.cinemasNearby(cell, n);
        return mgFetch<MgCinemasNearby>("cinemasNearby", { n: String(n) }, cell);
      },
      ["movieglu-cinemas-nearby", cellKey(geo), String(n)],
      { revalidate: REVALIDATE_S },
    );
    return fn();
  },

  async filmShowTimes(
    geo: LatLng,
    filmId: number,
    date: string,
    n = 10,
  ): Promise<MgFilmShowTimes | null> {
    const cell = roundToCell(geo);
    const fn = unstable_cache(
      async () => {
        if (isMock()) return mock.filmShowTimes(cell, filmId);
        return mgFetch<MgFilmShowTimes>(
          "filmShowTimes",
          { film_id: String(filmId), date, n: String(n) },
          cell,
        );
      },
      ["movieglu-film-showtimes", cellKey(geo), String(filmId), date, String(n)],
      { revalidate: REVALIDATE_S },
    );
    return fn();
  },

  async cinemaShowTimes(
    geo: LatLng,
    cinemaId: number,
    date: string,
  ): Promise<MgCinemaShowTimes | null> {
    const cell = roundToCell(geo);
    const fn = unstable_cache(
      async () => {
        if (isMock()) return mock.cinemaShowTimes(cell, cinemaId);
        return mgFetch<MgCinemaShowTimes>(
          "cinemaShowTimes",
          { cinema_id: String(cinemaId), date },
          cell,
        );
      },
      ["movieglu-cinema-showtimes", String(cinemaId), date],
      { revalidate: REVALIDATE_S },
    );
    return fn();
  },

  async cinemaDetails(cinemaId: number): Promise<MgCinemaDetails | null> {
    const fn = unstable_cache(
      async () => {
        if (isMock()) return mock.cinemaDetails(cinemaId);
        return mgFetch<MgCinemaDetails>("cinemaDetails", { cinema_id: String(cinemaId) }, null);
      },
      ["movieglu-cinema-details", String(cinemaId)],
      { revalidate: 30 * 24 * 3600 },
    );
    return fn();
  },
};
```

- [ ] **Step 3: Verifica e commit**

Run: `pnpm typecheck && pnpm lint`
Expected: PASS.

```bash
git add src/lib/cinema/movieglu.ts src/lib/cinema/mock.ts src/lib/tmdb/types.ts
git commit -m "feat(cinema): client MovieGlu con cache per cella e mock"
```

---

### Task 5: Match TMDB ↔ MovieGlu (`match.ts`) + `findByImdb`

**Files:**
- Create: `src/lib/cinema/match.ts`
- Modify: `src/lib/tmdb/client.ts` (aggiungi `findByImdb`)

**Interfaces:**
- Consumes: `movieglu.filmsNowShowing`, `isMock` (Task 4); `matchFilmByImdb` (Task 2); `createServiceClient`; `TitleRow` da `@/lib/tmdb/mappers`; `CINEMA_FILM_MATCH_TTL_MS`.
- Produces: `getMovieGluFilmId(title: TitleRow): Promise<number | null>`, `filmSummaryFor(film: MgFilm): Promise<FilmSummary>`.

- [ ] **Step 1: `findByImdb` in `src/lib/tmdb/client.ts`** (dopo `getExternalIds`)

```ts
export interface TmdbFindResult {
  movie_results: {
    id: number;
    title: string;
    poster_path: string | null;
    backdrop_path: string | null;
    release_date?: string;
  }[];
}

/** IMDb id ("tt1234567") → film TMDB (cache 24 h). */
export async function findByImdb(imdbId: string): Promise<TmdbFindResult> {
  return tmdbFetch<TmdbFindResult>(`find/${imdbId}`, {
    params: { external_source: "imdb_id" },
    revalidate: 86400,
  });
}
```

- [ ] **Step 2: Implementa `match.ts`**

```ts
import "server-only";

import { CINEMA_FILM_MATCH_TTL_MS } from "@/lib/config";
import { createServiceClient } from "@/lib/supabase/server";
import { findByImdb } from "@/lib/tmdb/client";
import type { TitleRow } from "@/lib/tmdb/mappers";
import type { Tables } from "@/types/database";
import { matchFilmByImdb } from "./films";
import type { MockFilm } from "./mock";
import { isMock, movieglu } from "./movieglu";
import type { FilmSummary, MgFilm } from "./types";

type FilmRow = Tables<"cinema_films">;

function isFresh(row: FilmRow): boolean {
  return Date.now() - new Date(row.fetched_at).getTime() < CINEMA_FILM_MATCH_TTL_MS;
}

function imdbOf(title: TitleRow): string | null {
  const ids = title.external_ids as { imdb_id?: string | null } | null;
  return ids?.imdb_id ?? null;
}

/** Uscito negli ultimi 120 giorni: nel mock è "al cinema". */
function recentlyReleased(title: TitleRow): boolean {
  if (!title.release_date) return false;
  const age = Date.now() - new Date(title.release_date).getTime();
  return age >= 0 && age < 120 * 24 * 3600 * 1000;
}

/**
 * ID MovieGlu del film TMDB, via IMDb id. Persistito in `cinema_films` per un
 * giorno (anche il "non trovato", come `movieglu_film_id = null`).
 */
export async function getMovieGluFilmId(title: TitleRow): Promise<number | null> {
  if (title.media_type !== "movie") return null;
  if (isMock()) return recentlyReleased(title) ? title.id : null;

  const db = createServiceClient();
  const { data: row } = await db
    .from("cinema_films")
    .select("*")
    .eq("tmdb_id", title.id)
    .maybeSingle();
  if (row && isFresh(row)) return row.movieglu_film_id;

  const imdb = imdbOf(title);
  const list = imdb ? await movieglu.filmsNowShowing() : null;
  const film = list ? matchFilmByImdb(list.films, imdb) : null;

  const { error } = await db.from("cinema_films").upsert({
    tmdb_id: title.id,
    movieglu_film_id: film?.film_id ?? null,
    imdb_id: imdb,
    title: title.title,
    poster_path: title.poster_path,
    backdrop_path: title.backdrop_path,
    fetched_at: new Date().toISOString(),
  });
  if (error) console.error("[cinema] errore upsert cinema_films:", error);
  return film?.film_id ?? null;
}

/**
 * Film MovieGlu → riassunto con id/poster TMDB (per la pagina /cinema).
 * Ordine: mock → `cinema_films` per movieglu_film_id → TMDB find per IMDb → solo nome.
 */
export async function filmSummaryFor(film: MgFilm): Promise<FilmSummary> {
  if (isMock()) {
    const m = film as MockFilm;
    return {
      tmdbId: film.film_id,
      movieGluFilmId: film.film_id,
      title: film.film_name,
      posterPath: m.poster_path ?? null,
      backdropPath: m.backdrop_path ?? null,
    };
  }

  const db = createServiceClient();
  const { data: row } = await db
    .from("cinema_films")
    .select("*")
    .eq("movieglu_film_id", film.film_id)
    .maybeSingle();
  if (row) {
    return {
      tmdbId: row.tmdb_id,
      movieGluFilmId: film.film_id,
      title: row.title ?? film.film_name,
      posterPath: row.poster_path,
      backdropPath: row.backdrop_path,
    };
  }

  const imdb = film.imdb_title_id ?? null;
  const found = imdb ? await findByImdb(imdb).catch(() => null) : null;
  const hit = found?.movie_results[0];
  if (hit) {
    await db.from("cinema_films").upsert({
      tmdb_id: hit.id,
      movieglu_film_id: film.film_id,
      imdb_id: imdb,
      title: hit.title,
      poster_path: hit.poster_path,
      backdrop_path: hit.backdrop_path,
      fetched_at: new Date().toISOString(),
    });
    return {
      tmdbId: hit.id,
      movieGluFilmId: film.film_id,
      title: hit.title,
      posterPath: hit.poster_path,
      backdropPath: hit.backdrop_path,
    };
  }

  return {
    tmdbId: null,
    movieGluFilmId: film.film_id,
    title: film.film_name,
    posterPath: null,
    backdropPath: null,
  };
}
```

- [ ] **Step 3: Verifica e commit**

Run: `pnpm typecheck && pnpm lint`
Expected: PASS.

```bash
git add src/lib/cinema/match.ts src/lib/tmdb/client.ts
git commit -m "feat(cinema): match TMDB-MovieGlu via IMDb in cinema_films"
```

---

### Task 6: Resolver link biglietteria + script manuale

**Files:**
- Create: `src/lib/cinema/links.ts`, `scripts/set-cinema-link.ts`

**Interfaces:**
- Consumes: `movieglu.cinemaDetails` (Task 4); `chainFor`, `googleTicketsUrl` (Task 2); `CINEMA_LINK_TTL_MS`.
- Produces: `resolveBookingLinks(cinemas: {id, name}[], filmName: string): Promise<Map<number, string>>`.

- [ ] **Step 1: Implementa `links.ts`**

```ts
import "server-only";

import { CINEMA_LINK_TTL_MS } from "@/lib/config";
import { createServiceClient } from "@/lib/supabase/server";
import type { Tables } from "@/types/database";
import { chainFor, googleTicketsUrl } from "./chains";
import { movieglu } from "./movieglu";

type LinkRow = Tables<"cinema_links">;

function isFresh(row: LinkRow): boolean {
  if (row.source === "manual") return true;
  return Date.now() - new Date(row.fetched_at).getTime() < CINEMA_LINK_TTL_MS;
}

/** Ultimo gradino: catena conosciuta o ricerca Google "cinema film biglietti". */
function fallback(cinemaName: string, filmName: string): string {
  return chainFor(cinemaName)?.homeUrl ?? googleTicketsUrl(cinemaName, filmName);
}

/**
 * Link biglietteria per ogni cinema. Cascata: `cinema_links` manual →
 * sito del cinema da MovieGlu (30 gg, anche il "nessun sito") → catena → Google.
 * Non è mai vuoto: la CTA "Compra i biglietti" è sempre attiva.
 */
export async function resolveBookingLinks(
  cinemas: { id: number; name: string }[],
  filmName: string,
): Promise<Map<number, string>> {
  const result = new Map<number, string>();
  if (cinemas.length === 0) return result;

  const db = createServiceClient();
  const { data: rows } = await db
    .from("cinema_links")
    .select("*")
    .in(
      "cinema_id",
      cinemas.map((c) => c.id),
    );

  const pending: { id: number; name: string }[] = [];
  for (const c of cinemas) {
    const row = rows?.find((r) => r.cinema_id === c.id);
    if (row && isFresh(row)) {
      result.set(c.id, row.url ?? fallback(c.name, filmName));
    } else {
      pending.push(c);
    }
  }
  if (pending.length === 0) return result;

  const now = new Date().toISOString();
  const upserts: LinkRow[] = [];
  await Promise.all(
    pending.map(async (c) => {
      const details = await movieglu.cinemaDetails(c.id);
      const website = details?.website?.startsWith("http") ? details.website : null;
      result.set(c.id, website ?? fallback(c.name, filmName));
      upserts.push({ cinema_id: c.id, url: website, source: "movieglu", fetched_at: now });
    }),
  );

  const { error } = await db
    .from("cinema_links")
    .upsert(upserts, { onConflict: "cinema_id" });
  if (error) console.error("[cinema] errore upsert cinema_links:", error);
  return result;
}
```

- [ ] **Step 2: Script `scripts/set-cinema-link.ts`**

```ts
/**
 * Override manuale del link biglietteria di un cinema (mai sovrascritto).
 * Uso: pnpm tsx scripts/set-cinema-link.ts <cinema_id> <https url>
 */
import { createClient } from "@supabase/supabase-js";
import { loadEnvFile } from "node:process";

loadEnvFile(new URL("../.env.local", import.meta.url).pathname.replace(/^\//, ""));

const [cinemaId, url] = process.argv.slice(2);

if (!/^\d+$/.test(cinemaId ?? "") || !url?.startsWith("https://")) {
  console.error("Uso: pnpm tsx scripts/set-cinema-link.ts <cinema_id> <https url>");
  process.exit(1);
}

async function main() {
  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
  const { error } = await db.from("cinema_links").upsert(
    { cinema_id: Number(cinemaId), url, source: "manual", fetched_at: new Date().toISOString() },
    { onConflict: "cinema_id" },
  );
  if (error) {
    console.error("Errore:", error.message);
    process.exit(1);
  }
  console.log(`OK: cinema ${cinemaId} → ${url} (manual)`);
}

void main();
```

- [ ] **Step 3: Verifica e commit**

Run: `pnpm typecheck && pnpm lint`
Expected: PASS.

```bash
git add src/lib/cinema/links.ts scripts/set-cinema-link.ts
git commit -m "feat(cinema): resolver link biglietteria e override manuale"
```

---

### Task 7: `showtimes.ts` — cinema vicini, orari film, programmazione cinema

**Files:**
- Create: `src/lib/cinema/showtimes.ts`

**Interfaces:**
- Consumes: `movieglu` (Task 4), `filmSummaryFor` (Task 5), `resolveBookingLinks` (Task 6), `romeIso` (Task 1), `normalizeFormat` (Task 2), `milesToKm`.
- Produces: `getNearbyCinemas(geo, n?): Promise<Cinema[]>`, `getFilmShowtimes(geo, filmId, filmName, date): Promise<CinemaShowtimes[]>`, `getCinemaProgramme(geo, cinema, date): Promise<ProgrammeFilm[]>`.

- [ ] **Step 1: Implementa**

```ts
import "server-only";

import { romeIso } from "./dates";
import { normalizeFormat } from "./formats";
import { milesToKm, type LatLng } from "./geo";
import { resolveBookingLinks } from "./links";
import { filmSummaryFor } from "./match";
import { movieglu } from "./movieglu";
import type {
  Cinema,
  CinemaShowtimes,
  MgCinema,
  MgShowings,
  ProgrammeFilm,
  Showing,
} from "./types";

function toCinema(mg: MgCinema): Cinema | null {
  if (mg.lat == null || mg.lng == null) return null;
  return {
    id: mg.cinema_id,
    name: mg.cinema_name,
    address: [mg.address, mg.address2].filter(Boolean).join(", "),
    city: mg.city ?? "",
    lat: mg.lat,
    lng: mg.lng,
    distanceKm: milesToKm(mg.distance ?? 0),
    logoUrl: mg.logo_url ?? null,
  };
}

/** Appiattisce `{Standard: {times}, IMAX: {times}}` in spettacoli ordinati. */
function toShowings(showings: MgShowings, date: string, bookingUrl: string): Showing[] {
  const out: Showing[] = [];
  for (const [key, block] of Object.entries(showings)) {
    const format = normalizeFormat(key);
    for (const t of block.times ?? []) {
      out.push({
        start: romeIso(date, t.start_time),
        end: t.end_time ? romeIso(date, t.end_time) : null,
        format,
        bookingUrl,
      });
    }
  }
  return out.sort((a, b) => a.start.localeCompare(b.start));
}

export async function getNearbyCinemas(geo: LatLng, n = 10): Promise<Cinema[]> {
  const res = await movieglu.cinemasNearby(geo, n);
  return (res?.cinemas ?? []).map(toCinema).filter((c): c is Cinema => c !== null);
}

/**
 * Cinema vicini che danno il film nel giorno indicato, con orari e link.
 * `filmShowTimes` non porta indirizzo/coordinate: si arricchisce dalla lista
 * `cinemasNearby` (stessa cache) e, per i mancanti, da `cinemaDetails`.
 */
export async function getFilmShowtimes(
  geo: LatLng,
  filmId: number,
  filmName: string,
  date: string,
): Promise<CinemaShowtimes[]> {
  const [res, nearby] = await Promise.all([
    movieglu.filmShowTimes(geo, filmId, date, 10),
    getNearbyCinemas(geo, 25),
  ]);
  if (!res) return [];

  const cinemas = await Promise.all(
    res.cinemas.map(async (mg) => {
      const known = nearby.find((c) => c.id === mg.cinema_id);
      if (known) return { cinema: { ...known, distanceKm: milesToKm(mg.distance ?? 0) }, mg };
      const details = await movieglu.cinemaDetails(mg.cinema_id);
      const cinema = details ? toCinema({ ...details, distance: mg.distance }) : null;
      return { cinema, mg };
    }),
  );
  const valid = cinemas.filter((x): x is { cinema: Cinema; mg: (typeof res.cinemas)[number] } =>
    x.cinema !== null,
  );

  const links = await resolveBookingLinks(
    valid.map((x) => ({ id: x.cinema.id, name: x.cinema.name })),
    filmName,
  );

  return valid
    .map(({ cinema, mg }) => ({
      cinema,
      showings: toShowings(mg.showings, date, links.get(cinema.id) ?? ""),
    }))
    .filter((x) => x.showings.length > 0)
    .sort((a, b) => a.cinema.distanceKm - b.cinema.distanceKm);
}

/** Tutti i film in programmazione in un cinema nel giorno indicato. */
export async function getCinemaProgramme(
  geo: LatLng,
  cinema: Cinema,
  date: string,
): Promise<ProgrammeFilm[]> {
  const res = await movieglu.cinemaShowTimes(geo, cinema.id, date);
  if (!res) return [];

  const films = await Promise.all(
    res.films.map(async (f) => {
      const [film, links] = await Promise.all([
        filmSummaryFor(f),
        resolveBookingLinks([{ id: cinema.id, name: cinema.name }], f.film_name),
      ]);
      return { film, showings: toShowings(f.showings, date, links.get(cinema.id) ?? "") };
    }),
  );
  return films.filter((f) => f.showings.length > 0);
}
```

- [ ] **Step 2: Verifica e commit**

Run: `pnpm typecheck && pnpm lint`
Expected: PASS.

```bash
git add src/lib/cinema/showtimes.ts
git commit -m "feat(cinema): orari per film e programmazione per cinema"
```

---

### Task 8: Posizione — geocoding, actions, query, `LocationPrompt`, `LocationChip`

**Files:**
- Create: `src/lib/cinema/geocode.ts`, `src/lib/cinema/location.ts`, `src/lib/cinema/queries.ts`, `src/components/cinema/LocationPrompt.tsx`, `src/components/cinema/LocationChip.tsx`, `src/components/cinema/icons.tsx`

**Interfaces:**
- Consumes: `isValidLatLng`, `labelFromAddress`, `NominatimAddress` (Task 1); `NOMINATIM_BASE`, `NOMINATIM_USER_AGENT`; `AUTH_FIELD_CLASS` da `@/components/auth/field`; `Sheet`, `Button`, `useToast`.
- Produces: `reverseGeocode(lat, lng): Promise<string | null>`, `geocodeQuery(q): Promise<{lat, lng, label} | null>`; actions `setLocation({lat, lng, label?}): Promise<LocationResult>`, `setLocationByQuery(q): Promise<LocationResult>`; `ViewerLocation`, `getViewerLocation(): Promise<ViewerLocation | null>`; componenti `LocationPrompt({ compact?, onDone? })`, `LocationChip({ label })`; `Icon({ name, size? })` con nomi `pin`, `nav`, `ticket`, `calendar`, `users`, `clock`, `chevron`.

- [ ] **Step 1: `geocode.ts`**

```ts
import "server-only";

import { NOMINATIM_BASE, NOMINATIM_USER_AGENT } from "@/lib/config";
import { labelFromAddress, type NominatimAddress } from "./geo";

const TIMEOUT_MS = 3000;

async function nominatim<T>(path: string, params: Record<string, string>): Promise<T | null> {
  const url = new URL(`${NOMINATIM_BASE}/${path}`);
  url.searchParams.set("format", "jsonv2");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": NOMINATIM_USER_AGENT, "Accept-Language": "it" },
      signal: controller.signal,
      next: { revalidate: 86400 },
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Coordinate → "Quartiere, Città" (null se Nominatim non risponde). */
export async function reverseGeocode(lat: number, lng: number): Promise<string | null> {
  const data = await nominatim<{ address?: NominatimAddress }>("reverse", {
    lat: lat.toFixed(4),
    lon: lng.toFixed(4),
    zoom: "14",
  });
  return data?.address ? labelFromAddress(data.address) : null;
}

/** Testo libero ("Monza", "Milano Isola") → prima corrispondenza in Italia. */
export async function geocodeQuery(
  q: string,
): Promise<{ lat: number; lng: number; label: string } | null> {
  const data = await nominatim<
    { lat: string; lon: string; address?: NominatimAddress; display_name?: string }[]
  >("search", { q, countrycodes: "it", limit: "1", addressdetails: "1" });
  const hit = data?.[0];
  if (!hit) return null;
  const label =
    (hit.address && labelFromAddress(hit.address)) ??
    hit.display_name?.split(",")[0] ??
    q;
  return { lat: Number(hit.lat), lng: Number(hit.lon), label };
}
```

- [ ] **Step 2: `location.ts` (Server Actions)**

```ts
"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { isValidLatLng } from "./geo";
import { geocodeQuery, reverseGeocode } from "./geocode";

export interface LocationResult {
  ok: boolean;
  error?: string;
  label?: string;
}

async function save(lat: number, lng: number, label: string): Promise<LocationResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Non autenticato" };

  const { error } = await supabase
    .from("profiles")
    .update({
      location_lat: lat,
      location_lng: lng,
      location_label: label,
      location_updated_at: new Date().toISOString(),
    })
    .eq("id", user.id);
  if (error) return { ok: false, error: "Impossibile salvare la posizione" };

  revalidatePath("/");
  revalidatePath("/cinema");
  revalidatePath("/title/movie/[id]", "page");
  return { ok: true, label };
}

/** Da GPS: coordinate del browser, etichetta via reverse geocoding. */
export async function setLocation(input: {
  lat: number;
  lng: number;
  label?: string;
}): Promise<LocationResult> {
  if (!isValidLatLng(input.lat, input.lng)) {
    return { ok: false, error: "Coordinate non valide" };
  }
  const label =
    input.label?.trim() ||
    (await reverseGeocode(input.lat, input.lng)) ||
    "Posizione attuale";
  return save(input.lat, input.lng, label);
}

/** Da testo: "Monza", "Milano Isola"… */
export async function setLocationByQuery(query: string): Promise<LocationResult> {
  const q = query.trim().slice(0, 80);
  if (q.length < 2) return { ok: false, error: "Scrivi una città" };
  const hit = await geocodeQuery(q);
  if (!hit) return { ok: false, error: "Città non trovata" };
  return save(hit.lat, hit.lng, hit.label);
}
```

- [ ] **Step 3: `queries.ts`**

```ts
import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/types/database";

export interface ViewerLocation {
  lat: number;
  lng: number;
  label: string;
}

/** Posizione salvata nel profilo, null se l'utente non l'ha ancora data. */
export async function getViewerLocation(): Promise<ViewerLocation | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("profiles")
    .select("location_lat, location_lng, location_label")
    .eq("id", user.id)
    .maybeSingle();
  if (data?.location_lat == null || data.location_lng == null) return null;
  return {
    lat: data.location_lat,
    lng: data.location_lng,
    label: data.location_label ?? "Posizione attuale",
  };
}

export type PlanRow = Tables<"cinema_plans">;

/** Il prossimo piano "Ci vado": da 3 h prima a 48 h dopo adesso. */
export async function getUpcomingPlan(): Promise<PlanRow | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const now = Date.now();
  const { data } = await supabase
    .from("cinema_plans")
    .select("*")
    .eq("user_id", user.id)
    .gte("starts_at", new Date(now - 3 * 3600_000).toISOString())
    .lte("starts_at", new Date(now + 48 * 3600_000).toISOString())
    .order("starts_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  return data ?? null;
}
```

- [ ] **Step 4: `icons.tsx`**

```tsx
import type { ReactNode } from "react";

const PATHS = {
  pin: (
    <>
      <path d="M12 21s-6-5.3-6-10a6 6 0 1 1 12 0c0 4.7-6 10-6 10z" />
      <circle cx="12" cy="11" r="2.2" />
    </>
  ),
  nav: <path d="M3 11l18-8-8 18-2-8-8-2z" />,
  ticket: (
    <path d="M3 9a2 2 0 0 0 2-2V6a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v1a2 2 0 0 0 2 2v6a2 2 0 0 0-2 2v1a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-1a2 2 0 0 0-2-2V9zM10 5v14" />
  ),
  calendar: (
    <>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 10h18M8 3v4M16 3v4" />
    </>
  ),
  users: (
    <>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 7M21.5 20a6.5 6.5 0 0 0-4.5-6.2" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  chevron: <path d="M9 6l6 6-6 6" />,
} satisfies Record<string, ReactNode>;

export type CinemaIconName = keyof typeof PATHS;

/** Icone inline della sezione cinema: stroke 1.8, currentColor. */
export function Icon({ name, size = 16 }: { name: CinemaIconName; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {PATHS[name]}
    </svg>
  );
}
```

- [ ] **Step 5: `LocationPrompt.tsx`**

```tsx
"use client";

import { useState, useTransition } from "react";
import { AUTH_FIELD_CLASS } from "@/components/auth/field";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toaster";
import { setLocation, setLocationByQuery } from "@/lib/cinema/location";
import { Icon } from "./icons";

/**
 * Chiede la posizione: GPS del browser (con spiegazione) o città scritta a mano.
 * `compact` = dentro uno sheet (niente card/titolo). `onDone` chiude lo sheet.
 */
export function LocationPrompt({
  compact = false,
  onDone,
}: {
  compact?: boolean;
  onDone?: () => void;
}) {
  const { show } = useToast();
  const [pending, startTransition] = useTransition();
  const [locating, setLocating] = useState(false);
  const [manual, setManual] = useState(compact);
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);

  function useGps() {
    if (!("geolocation" in navigator)) {
      setManual(true);
      setError("Il browser non supporta la posizione: scrivi la città.");
      return;
    }
    setLocating(true);
    setError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        startTransition(async () => {
          const r = await setLocation({
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
          });
          if (r.ok) {
            show(`Posizione: ${r.label}`);
            onDone?.();
          } else {
            setError(r.error ?? "Errore");
          }
        });
      },
      () => {
        setLocating(false);
        setManual(true);
        setError("Posizione non disponibile: scrivi la città.");
      },
      { maximumAge: 600_000, timeout: 8_000 },
    );
  }

  function submitQuery() {
    startTransition(async () => {
      const r = await setLocationByQuery(query);
      if (r.ok) {
        show(`Posizione: ${r.label}`);
        onDone?.();
      } else {
        setError(r.error ?? "Errore");
      }
    });
  }

  const body = (
    <div className="flex flex-col gap-3">
      <Button
        type="button"
        onClick={useGps}
        disabled={locating || pending}
        className="w-full"
      >
        <Icon name="pin" size={18} />
        {locating ? "Cerco la posizione…" : "Usa la mia posizione"}
      </Button>

      {manual ? (
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            submitQuery();
          }}
        >
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Città o quartiere"
            autoFocus
            className={`${AUTH_FIELD_CLASS} flex-1`}
          />
          <Button type="submit" variant="secondary" disabled={pending || query.length < 2}>
            Vai
          </Button>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setManual(true)}
          className="text-sm font-medium text-accent-soft"
        >
          Oppure scrivi la città
        </button>
      )}

      {error && <p className="text-sm text-danger">{error}</p>}
    </div>
  );

  if (compact) return body;

  return (
    <div className="glass rounded-[20px] p-5">
      <p className="text-lg font-bold tracking-[-0.02em]">Cinema vicino a te</p>
      <p className="mb-4 mt-1 text-sm text-muted">
        Dimmi dove sei e ti mostro sale, orari e biglietti. La posizione resta nel tuo
        profilo e puoi cambiarla quando vuoi.
      </p>
      {body}
    </div>
  );
}
```

Verifica che `AUTH_FIELD_CLASS` esista in `src/components/auth/field.ts` (CLAUDE.md lo cita); se il nome esportato è diverso, usa quello.

- [ ] **Step 6: `LocationChip.tsx`**

```tsx
"use client";

import { useState } from "react";
import { Sheet } from "@/components/ui/Sheet";
import { Icon } from "./icons";
import { LocationPrompt } from "./LocationPrompt";

/** "📍 Milano · Cambia": apre lo sheet per aggiornare la posizione. */
export function LocationChip({ label }: { label: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="glass inline-flex h-9 max-w-full items-center gap-1.5 rounded-full px-3 text-[13px] font-medium"
      >
        <Icon name="pin" size={14} />
        <span className="truncate">{label}</span>
        <span className="text-muted">· Cambia</span>
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title="Dove sei?">
        <LocationPrompt compact onDone={() => setOpen(false)} />
      </Sheet>
    </>
  );
}
```

- [ ] **Step 7: Verifica e commit**

Run: `pnpm typecheck && pnpm lint`
Expected: PASS.

```bash
git add src/lib/cinema/geocode.ts src/lib/cinema/location.ts src/lib/cinema/queries.ts src/components/cinema/icons.tsx src/components/cinema/LocationPrompt.tsx src/components/cinema/LocationChip.tsx
git commit -m "feat(cinema): posizione utente (GPS o città) salvata nel profilo"
```

---

### Task 9: Piani "Ci vado" (`plans.ts`) + `RecommendSheet.initialMessage`

**Files:**
- Create: `src/lib/cinema/plans.ts`
- Modify: `src/components/title/RecommendSheet.tsx`

**Interfaces:**
- Consumes: `addWant`, `restoreEntry`, `EntrySnapshot` da `@/lib/watch/actions`.
- Produces: `PlanInput`, `PlanResult`, `planShowing(input): Promise<PlanResult>`, `cancelPlan(planId, undo?): Promise<{ok: boolean}>`; `RecommendSheet` accetta `initialMessage?: string`.

- [ ] **Step 1: `plans.ts`**

```ts
"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { addWant, restoreEntry, type EntrySnapshot } from "@/lib/watch/actions";

export interface PlanInput {
  tmdbId: number;
  filmTitle: string;
  posterPath: string | null;
  backdropPath: string | null;
  cinemaId: number;
  cinemaName: string;
  cinemaAddress: string;
  cinemaLat: number | null;
  cinemaLng: number | null;
  /** ISO con offset */
  startsAt: string;
  format: string;
  bookingUrl: string;
}

export interface PlanUndo {
  tmdbId: number;
  /** Entry precedente in `watch_entries` (null = non esisteva). */
  prevEntry: EntrySnapshot | null;
  /** True se l'entry esisteva già: l'undo non la tocca. */
  hadEntry: boolean;
}

export interface PlanResult {
  ok: boolean;
  error?: string;
  planId: string | null;
  undo: PlanUndo | null;
}

/**
 * "Ci vado": salva la serata e mette il film in "Vuoi vederlo" se non è già
 * in libreria. Ritorna ciò che serve per annullare dal toast.
 */
export async function planShowing(input: PlanInput): Promise<PlanResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Non autenticato", planId: null, undo: null };

  const { data: existing } = await supabase
    .from("watch_entries")
    .select("status")
    .eq("user_id", user.id)
    .eq("title_id", input.tmdbId)
    .eq("media_type", "movie")
    .maybeSingle();

  let prevEntry: EntrySnapshot | null = null;
  const hadEntry = existing !== null;
  if (!hadEntry) {
    const r = await addWant(input.tmdbId, "movie");
    if (!r.ok) return { ok: false, error: r.error, planId: null, undo: null };
    prevEntry = r.prev;
  }

  const { data, error } = await supabase
    .from("cinema_plans")
    .upsert(
      {
        user_id: user.id,
        tmdb_id: input.tmdbId,
        film_title: input.filmTitle,
        poster_path: input.posterPath,
        backdrop_path: input.backdropPath,
        cinema_id: input.cinemaId,
        cinema_name: input.cinemaName,
        cinema_address: input.cinemaAddress,
        cinema_lat: input.cinemaLat,
        cinema_lng: input.cinemaLng,
        starts_at: input.startsAt,
        format: input.format,
        booking_url: input.bookingUrl,
      },
      { onConflict: "user_id,tmdb_id,starts_at" },
    )
    .select("id")
    .single();
  if (error || !data) {
    return { ok: false, error: "Impossibile salvare la serata", planId: null, undo: null };
  }

  revalidatePath("/");
  return { ok: true, planId: data.id, undo: { tmdbId: input.tmdbId, prevEntry, hadEntry } };
}

/** Elimina il piano; con `undo` ripristina anche l'entry creata da `planShowing`. */
export async function cancelPlan(planId: string, undo?: PlanUndo): Promise<{ ok: boolean }> {
  const supabase = await createClient();
  const { error } = await supabase.from("cinema_plans").delete().eq("id", planId);
  if (error) return { ok: false };
  if (undo && !undo.hadEntry) {
    await restoreEntry(undo.tmdbId, "movie", undo.prevEntry);
  }
  revalidatePath("/");
  return { ok: true };
}
```

- [ ] **Step 2: `RecommendSheet` — messaggio precompilato**

In `src/components/title/RecommendSheet.tsx`:
- aggiungi `initialMessage?: string` alle props;
- `import { useEffect, useState, useTransition } from "react";`
- dopo `const [message, setMessage] = useState("");` aggiungi:

```tsx
  // messaggio proposto dal chiamante (es. invito al cinema): ricaricato a ogni apertura
  useEffect(() => {
    if (open) setMessage((initialMessage ?? "").slice(0, 280));
  }, [open, initialMessage]);
```

- [ ] **Step 3: Verifica e commit**

Run: `pnpm typecheck && pnpm lint`
Expected: PASS.

```bash
git add src/lib/cinema/plans.ts src/components/title/RecommendSheet.tsx
git commit -m "feat(cinema): piani 'Ci vado' e messaggio precompilato nei consigli"
```

---

### Task 10: Componenti client — `DayBar`, `ShowtimeChip`, `CinemaCard`, `TicketSheet`, `ShowtimesClient`

**Files:**
- Create: `src/components/cinema/DayBar.tsx`, `ShowtimeChip.tsx`, `CinemaCard.tsx`, `TicketSheet.tsx`, `ShowtimesClient.tsx`

**Interfaces:**
- Consumes: `DayOption`, `formatTime`, `formatShowingDate`, `minutesUntil`, `formatCountdown`, `formatDistance`, `walkingMinutes`, `directionsUrl` (Task 1); `formatLabel` (Task 2); tipi `Cinema`, `Showing`, `FilmSummary`, `CinemaShowtimes` (Task 2); `planShowing`, `cancelPlan` (Task 9); `RecommendSheet`, `MiniProfile`, `Sheet`, `Button`, `useToast`, `Icon`.
- Produces: `DayBar({ days, selected })`, `ShowtimeChip({ showing, state, onClick })`, `CinemaCard({ cinema, showings, nearest, nowMs, onPick })`, `TicketSheet({ open, onClose, film, cinema, showing, friends, onInvite })`, `ShowtimesClient({ film, items, friends, nowMs })`.

- [ ] **Step 1: `DayBar.tsx`**

```tsx
"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import type { DayOption } from "@/lib/cinema/dates";

/** Pillola dei 7 giorni: cambia `?day=` mantenendo gli altri parametri. */
export function DayBar({ days, selected }: { days: DayOption[]; selected: string }) {
  const pathname = usePathname();
  const params = useSearchParams();

  function hrefFor(date: string): string {
    const next = new URLSearchParams(params.toString());
    next.set("day", date);
    return `${pathname}?${next.toString()}`;
  }

  return (
    <div className="scrollbar-none -mx-5 flex gap-1 overflow-x-auto px-5 md:mx-0 md:px-0">
      <div className="glass flex shrink-0 rounded-full p-1">
        {days.map((d) => {
          const active = d.date === selected;
          return (
            <Link
              key={d.date}
              href={hrefFor(d.date)}
              scroll={false}
              className={`relative rounded-full px-3.5 py-1.5 text-[13px] font-semibold whitespace-nowrap ${
                active ? "text-white" : "text-muted"
              }`}
            >
              {active && (
                <motion.span
                  layoutId="daybar-indicator"
                  className="absolute inset-0 rounded-full bg-accent"
                  transition={{ type: "spring", stiffness: 500, damping: 40 }}
                />
              )}
              <span className="relative">{d.label}</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: `ShowtimeChip.tsx`**

```tsx
"use client";

import { formatTime } from "@/lib/cinema/dates";
import { formatLabel } from "@/lib/cinema/formats";
import type { Showing } from "@/lib/cinema/types";

export type ChipState = "past" | "next" | "future";

/** Orario tappabile: passato (barrato), prossimo (accent) o futuro (vetro). */
export function ShowtimeChip({
  showing,
  state,
  countdown,
  onClick,
}: {
  showing: Showing;
  state: ChipState;
  /** "tra 2 h 10", solo per `next` */
  countdown?: string;
  onClick: () => void;
}) {
  const label = formatLabel(showing.format);
  const base =
    "flex shrink-0 flex-col items-center rounded-full px-4 py-2 text-[15px] font-semibold";
  const cls =
    state === "past"
      ? `${base} bg-surface-2 text-muted-2 line-through`
      : state === "next"
        ? `${base} bg-accent text-white shadow-[var(--shadow-accent)]`
        : `${base} glass text-text`;

  return (
    <button type="button" onClick={onClick} disabled={state === "past"} className={cls}>
      <span className="flex items-center gap-1.5">
        {formatTime(showing.start)}
        {label && (
          <span
            className={`rounded-md px-1.5 py-0.5 text-[10px] font-bold tracking-wide ${
              state === "next" ? "bg-white/20 text-white" : "bg-accent/20 text-accent-pale"
            }`}
          >
            {label}
          </span>
        )}
      </span>
      {state === "next" && countdown && (
        <span className="text-[11px] font-medium text-white/80">{countdown}</span>
      )}
    </button>
  );
}
```

- [ ] **Step 3: `CinemaCard.tsx`**

```tsx
"use client";

import { formatCountdown, minutesUntil } from "@/lib/cinema/dates";
import { formatDistance, walkingMinutes } from "@/lib/cinema/geo";
import type { Cinema, Showing } from "@/lib/cinema/types";
import { Icon } from "./icons";
import { ShowtimeChip, type ChipState } from "./ShowtimeChip";

/**
 * Card di un cinema con i suoi orari. Il primo spettacolo futuro è "next";
 * con ≤ 2 spettacoli futuri oggi compare "Ultimi spettacoli oggi".
 */
export function CinemaCard({
  cinema,
  showings,
  nearest = false,
  nowMs,
  onPick,
  children,
}: {
  cinema: Cinema;
  showings: Showing[];
  nearest?: boolean;
  /** Ora corrente in ms (dal server, per un primo render coerente). */
  nowMs: number;
  onPick: (showing: Showing) => void;
  /** Contenuto extra sotto gli orari (es. film, nella vista per cinema). */
  children?: React.ReactNode;
}) {
  const future = showings.filter((s) => minutesUntil(s.start, nowMs) >= 0);
  const nextStart = future[0]?.start ?? null;
  const isToday = future.length !== showings.length || future.length > 0;

  function stateOf(s: Showing): ChipState {
    if (minutesUntil(s.start, nowMs) < 0) return "past";
    return s.start === nextStart ? "next" : "future";
  }

  return (
    <article className="rounded-[20px] border border-border bg-surface p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate text-[17px] font-bold tracking-[-0.02em]">{cinema.name}</h3>
            {nearest && (
              <span className="rounded-full bg-accent/20 px-2 py-0.5 text-[11px] font-bold text-accent-pale">
                Il più vicino
              </span>
            )}
          </div>
          <p className="mt-0.5 truncate text-[13px] text-muted">
            {cinema.address}
            {cinema.city ? `, ${cinema.city}` : ""}
          </p>
        </div>
        <div className="shrink-0 text-right text-[13px] leading-tight">
          <p className="font-semibold">{formatDistance(cinema.distanceKm)}</p>
          <p className="text-muted">{walkingMinutes(cinema.distanceKm)} min a piedi</p>
        </div>
      </div>

      {isToday && future.length > 0 && future.length <= 2 && (
        <p className="mt-2 inline-flex items-center gap-1 text-[12px] font-semibold text-accent-pale">
          <Icon name="clock" size={13} /> Ultimi spettacoli oggi
        </p>
      )}

      <div className="scrollbar-none -mx-4 mt-3 flex gap-2 overflow-x-auto px-4">
        {showings.map((s) => {
          const state = stateOf(s);
          return (
            <ShowtimeChip
              key={`${s.start}-${s.format}`}
              showing={s}
              state={state}
              countdown={
                state === "next" ? formatCountdown(minutesUntil(s.start, nowMs)) : undefined
              }
              onClick={() => onPick(s)}
            />
          );
        })}
      </div>

      {children}
    </article>
  );
}
```

- [ ] **Step 4: `TicketSheet.tsx`**

```tsx
"use client";

import Image from "next/image";
import { useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { Sheet } from "@/components/ui/Sheet";
import { useToast } from "@/components/ui/Toaster";
import { posterUrl } from "@/lib/config";
import { formatShowingDate, formatTime } from "@/lib/cinema/dates";
import { formatLabel } from "@/lib/cinema/formats";
import { formatDistance } from "@/lib/cinema/geo";
import { cancelPlan, planShowing } from "@/lib/cinema/plans";
import type { Cinema, FilmSummary, Showing } from "@/lib/cinema/types";
import { Icon } from "./icons";

/**
 * Foglio "Biglietti": CTA verso la biglietteria del cinema, "Ci vado" (piano +
 * Vuoi vederlo, con undo dal toast) e "Invita amici" (delegato al genitore).
 */
export function TicketSheet({
  open,
  onClose,
  film,
  cinema,
  showing,
  onInvite,
}: {
  open: boolean;
  onClose: () => void;
  film: FilmSummary;
  cinema: Cinema | null;
  showing: Showing | null;
  onInvite: () => void;
}) {
  const { show } = useToast();
  const [pending, startTransition] = useTransition();
  const poster = posterUrl(film.posterPath, "w92");
  const label = showing ? formatLabel(showing.format) : null;

  function goThere() {
    if (!cinema || !showing || film.tmdbId == null) return;
    const tmdbId = film.tmdbId;
    startTransition(async () => {
      const r = await planShowing({
        tmdbId,
        filmTitle: film.title,
        posterPath: film.posterPath,
        backdropPath: film.backdropPath,
        cinemaId: cinema.id,
        cinemaName: cinema.name,
        cinemaAddress: cinema.address,
        cinemaLat: cinema.lat,
        cinemaLng: cinema.lng,
        startsAt: showing.start,
        format: showing.format,
        bookingUrl: showing.bookingUrl,
      });
      onClose();
      if (!r.ok || !r.planId) {
        show(r.error ?? "Errore");
        return;
      }
      const planId = r.planId;
      const undo = r.undo ?? undefined;
      show("Serata salvata: la trovi in home", {
        onUndo: () => {
          void cancelPlan(planId, undo);
        },
      });
    });
  }

  return (
    <Sheet open={open} onClose={onClose} title="Biglietti">
      {cinema && showing && (
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-3">
            {poster && (
              <Image
                src={poster}
                alt=""
                width={48}
                height={72}
                className="rounded-lg bg-surface-2"
              />
            )}
            <div className="min-w-0">
              <p className="truncate text-base font-bold tracking-[-0.02em]">{film.title}</p>
              <p className="text-[22px] font-bold tracking-[-0.03em]">
                {formatShowingDate(showing.start)}
                {label && (
                  <span className="ml-2 rounded-md bg-accent/20 px-1.5 py-0.5 align-middle text-[11px] font-bold text-accent-pale">
                    {label}
                  </span>
                )}
              </p>
              {showing.end && (
                <p className="text-[13px] text-muted">Finisce ~{formatTime(showing.end)}</p>
              )}
            </div>
          </div>

          <div className="rounded-[14px] bg-surface-2 px-4 py-3 text-sm">
            <p className="font-semibold">{cinema.name}</p>
            <p className="text-muted">
              {cinema.address}
              {cinema.city ? `, ${cinema.city}` : ""} · {formatDistance(cinema.distanceKm)}
            </p>
          </div>

          <a
            href={showing.bookingUrl}
            target="_blank"
            rel="noopener"
            className="inline-flex h-[54px] items-center justify-center gap-2 rounded-full bg-accent px-6 text-[17px] font-semibold text-white shadow-[var(--shadow-accent)] hover:bg-accent-strong"
          >
            <Icon name="ticket" size={18} />
            Compra i biglietti
          </a>

          <div className="grid grid-cols-2 gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={goThere}
              disabled={pending || film.tmdbId == null}
              className="h-12 px-4 text-[15px]"
            >
              <Icon name="calendar" size={16} />
              Ci vado
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={onInvite}
              disabled={film.tmdbId == null}
              className="h-12 px-4 text-[15px]"
            >
              <Icon name="users" size={16} />
              Invita amici
            </Button>
          </div>

          <p className="text-center text-[12px] text-muted-2">
            Posti e prezzi si scelgono sul sito del cinema.
          </p>
        </div>
      )}
    </Sheet>
  );
}
```

- [ ] **Step 5: `ShowtimesClient.tsx`** — lista card + un solo `TicketSheet` + `RecommendSheet`

```tsx
"use client";

import { useState } from "react";
import { RecommendSheet } from "@/components/title/RecommendSheet";
import { formatShowingDate } from "@/lib/cinema/dates";
import type { Cinema, CinemaShowtimes, FilmSummary, Showing } from "@/lib/cinema/types";
import type { MiniProfile } from "@/lib/social/queries";
import { CinemaCard } from "./CinemaCard";
import { TicketSheet } from "./TicketSheet";

interface Pick {
  cinema: Cinema;
  showing: Showing;
}

/** Card dei cinema per un film + foglio biglietti + invito agli amici. */
export function ShowtimesClient({
  film,
  items,
  friends,
  nowMs,
  limit,
}: {
  film: FilmSummary;
  items: CinemaShowtimes[];
  friends: MiniProfile[];
  nowMs: number;
  limit?: number;
}) {
  const [pick, setPick] = useState<Pick | null>(null);
  const [ticketOpen, setTicketOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);

  const shown = limit ? items.slice(0, limit) : items;
  const inviteMessage = pick
    ? `Vieni al ${pick.cinema.name} ${formatShowingDate(pick.showing.start).toLowerCase()}?`
    : "";

  return (
    <>
      <div className="flex flex-col gap-3">
        {shown.map((item, i) => (
          <CinemaCard
            key={item.cinema.id}
            cinema={item.cinema}
            showings={item.showings}
            nearest={i === 0}
            nowMs={nowMs}
            onPick={(showing) => {
              setPick({ cinema: item.cinema, showing });
              setTicketOpen(true);
            }}
          />
        ))}
      </div>

      <TicketSheet
        open={ticketOpen}
        onClose={() => setTicketOpen(false)}
        film={film}
        cinema={pick?.cinema ?? null}
        showing={pick?.showing ?? null}
        onInvite={() => {
          setTicketOpen(false);
          setInviteOpen(true);
        }}
      />

      {film.tmdbId != null && (
        <RecommendSheet
          open={inviteOpen}
          onClose={() => setInviteOpen(false)}
          titleId={film.tmdbId}
          mediaType="movie"
          friends={friends}
          initialMessage={inviteMessage}
        />
      )}
    </>
  );
}
```

- [ ] **Step 6: Verifica e commit**

Run: `pnpm typecheck && pnpm lint`
Expected: PASS.

```bash
git add src/components/cinema/DayBar.tsx src/components/cinema/ShowtimeChip.tsx src/components/cinema/CinemaCard.tsx src/components/cinema/TicketSheet.tsx src/components/cinema/ShowtimesClient.tsx
git commit -m "feat(cinema): giorni, chip orari, card cinema e foglio biglietti"
```

---

### Task 11: Sezione `NearbyShowtimes` nella scheda film

**Files:**
- Create: `src/components/cinema/NearbyShowtimes.tsx`
- Modify: `src/components/title/TitleBody.tsx`, `src/app/(app)/title/movie/[id]/page.tsx`

**Interfaces:**
- Consumes: `isCinemaEnabled` (Task 4), `getMovieGluFilmId` (Task 5), `getFilmShowtimes` (Task 7), `getViewerLocation` (Task 8), `nextDays`, `romeDateString` (Task 1), `getFriendsData` da `@/lib/social/queries`, `LocationPrompt`, `LocationChip`, `DayBar`, `ShowtimesClient`.
- Produces: `NearbyShowtimes({ title: TitleRow, day?: string })`; `TitleBody({ cached, day? })`.

- [ ] **Step 1: `NearbyShowtimes.tsx`** (server component)

```tsx
import Link from "next/link";
import { nextDays, romeDateString } from "@/lib/cinema/dates";
import { getMovieGluFilmId } from "@/lib/cinema/match";
import { isCinemaEnabled } from "@/lib/cinema/movieglu";
import { getViewerLocation } from "@/lib/cinema/queries";
import { getFilmShowtimes } from "@/lib/cinema/showtimes";
import type { FilmSummary } from "@/lib/cinema/types";
import { getFriendsData } from "@/lib/social/queries";
import type { TitleRow } from "@/lib/tmdb/mappers";
import { DayBar } from "./DayBar";
import { LocationChip } from "./LocationChip";
import { LocationPrompt } from "./LocationPrompt";
import { ShowtimesClient } from "./ShowtimesClient";

/**
 * "Al cinema vicino a te" nella scheda film. Assente se MovieGlu non è
 * configurato o il film non è in programmazione; senza posizione mostra il prompt.
 */
export async function NearbyShowtimes({ title, day }: { title: TitleRow; day?: string }) {
  if (!isCinemaEnabled()) return null;
  const filmId = await getMovieGluFilmId(title).catch(() => null);
  if (filmId == null) return null;

  const days = nextDays(7);
  const selected = days.some((d) => d.date === day) ? day! : days[0].date;
  const location = await getViewerLocation();

  return (
    <section className="px-5 md:px-0">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-xl font-bold tracking-[-0.03em]">Al cinema vicino a te</h2>
        {location && <LocationChip label={location.label} />}
      </div>

      {!location ? (
        <LocationPrompt />
      ) : (
        <NearbyList
          title={title}
          filmId={filmId}
          days={days}
          selected={selected}
          location={location}
        />
      )}
    </section>
  );
}

async function NearbyList({
  title,
  filmId,
  days,
  selected,
  location,
}: {
  title: TitleRow;
  filmId: number;
  days: ReturnType<typeof nextDays>;
  selected: string;
  location: { lat: number; lng: number };
}) {
  const [items, { friends }] = await Promise.all([
    getFilmShowtimes(location, filmId, title.title, selected).catch(() => []),
    getFriendsData(),
  ]);
  const film: FilmSummary = {
    tmdbId: title.id,
    movieGluFilmId: filmId,
    title: title.title,
    posterPath: title.poster_path,
    backdropPath: title.backdrop_path,
  };

  return (
    <div className="flex flex-col gap-3">
      <DayBar days={days} selected={selected} />
      {items.length === 0 ? (
        <p className="rounded-[20px] border border-border bg-surface p-4 text-sm text-muted">
          {selected === romeDateString()
            ? "Nessuno spettacolo vicino a te oggi. Prova un altro giorno."
            : "Nessuno spettacolo vicino a te in questo giorno."}
        </p>
      ) : (
        <ShowtimesClient
          film={film}
          items={items}
          friends={friends}
          nowMs={Date.now()}
          limit={5}
        />
      )}
      <Link
        href={`/cinema?film=${title.id}&day=${selected}`}
        className="self-start text-[13px] font-medium text-accent-soft"
      >
        Vedi tutti i cinema →
      </Link>
    </div>
  );
}
```

- [ ] **Step 2: `TitleBody` — accetta `day` e renderizza la sezione**

In `src/components/title/TitleBody.tsx`:
- `import { NearbyShowtimes } from "@/components/cinema/NearbyShowtimes";`
- firma: `export async function TitleBody({ cached, day }: { cached: CachedTitle; day?: string })`
- subito dopo il blocco `<Suspense fallback={<WhereToWatchSkeleton />}>…<WhereToWatch …/></Suspense>` aggiungi:

```tsx
            {title.media_type === "movie" && (
              <Suspense fallback={<WhereToWatchSkeleton />}>
                <NearbyShowtimes title={title} day={day} />
              </Suspense>
            )}
```

- [ ] **Step 3: Pagina film — legge `?day=`**

In `src/app/(app)/title/movie/[id]/page.tsx`: aggiungi `searchParams: Promise<{ day?: string }>` a `Props`, e nel componente pagina:

```tsx
export default async function MoviePage({ params, searchParams }: Props) {
  const { id } = await params;
  const { day } = await searchParams;
  // …resto invariato…
  return <TitleBody cached={cached} day={day} />;
}
```

(`generateMetadata` resta com'è: non usa `searchParams`.)

- [ ] **Step 4: Prova con il mock**

In `.env.local` imposta `MOVIEGLU_MOCK=1`, avvia `pnpm dev`, apri la scheda di un film uscito negli ultimi 120 giorni (dallo scaffale "Al cinema adesso"): compare il prompt posizione → "Scrivi la città" → "Milano" → tre cinema con orari, chip "next" in accent, tap → foglio biglietti; "Ci vado" mostra il toast con Annulla. Cambia giorno dalla pillola: l'URL prende `?day=`.

- [ ] **Step 5: Verifica e commit**

Run: `pnpm typecheck && pnpm lint`
Expected: PASS.

```bash
git add src/components/cinema/NearbyShowtimes.tsx src/components/title/TitleBody.tsx "src/app/(app)/title/movie/[id]/page.tsx"
git commit -m "feat(cinema): sezione 'Al cinema vicino a te' nella scheda film"
```

---

### Task 12: Pagina `/cinema` (Per film / Per cinema) + link da Scopri

**Files:**
- Create: `src/app/(app)/cinema/page.tsx`, `src/app/(app)/cinema/loading.tsx`, `src/components/cinema/FilmsView.tsx`, `src/components/cinema/VenuesView.tsx`
- Modify: `src/components/discover/DiscoverSections.tsx`

**Interfaces:**
- Consumes: `getNearbyCinemas`, `getCinemaProgramme`, `getFilmShowtimes` (Task 7), `getMovieGluFilmId` (Task 5), `getOrFetchTitle` da `@/lib/tmdb/cache`, `ShowtimesClient`, `CinemaCard`, `TicketSheet`, `DayBar`, `LocationChip`, `LocationPrompt`, `EmptyState`, `TopBar`, `GlassIconButton`, `directionsUrl`.
- Produces: route `/cinema?view=films|cinemas&day=YYYY-MM-DD&film=<tmdbId>`.

- [ ] **Step 1: `FilmsView.tsx`** (client: aggregato per film, poster + cinema più vicino + 3 orari)

```tsx
"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { RecommendSheet } from "@/components/title/RecommendSheet";
import { posterUrl } from "@/lib/config";
import { formatShowingDate, minutesUntil } from "@/lib/cinema/dates";
import { formatDistance } from "@/lib/cinema/geo";
import type { Cinema, FilmSummary, Showing } from "@/lib/cinema/types";
import type { MiniProfile } from "@/lib/social/queries";
import { ShowtimeChip } from "./ShowtimeChip";
import { TicketSheet } from "./TicketSheet";

export interface FilmEntry {
  film: FilmSummary;
  /** Cinema più vicino che lo dà, con i suoi orari. */
  cinema: Cinema;
  showings: Showing[];
  /** Quanti cinema vicini lo danno. */
  cinemaCount: number;
}

export function FilmsView({
  entries,
  friends,
  nowMs,
}: {
  entries: FilmEntry[];
  friends: MiniProfile[];
  nowMs: number;
}) {
  const [pick, setPick] = useState<{ entry: FilmEntry; showing: Showing } | null>(null);
  const [ticketOpen, setTicketOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);

  return (
    <>
      <div className="grid gap-3 lg:grid-cols-2">
        {entries.map((entry) => {
          const poster = posterUrl(entry.film.posterPath, "w185");
          const future = entry.showings.filter((s) => minutesUntil(s.start, nowMs) >= 0);
          const next = future.slice(0, 3);
          const href = entry.film.tmdbId != null ? `/title/movie/${entry.film.tmdbId}` : null;
          return (
            <article
              key={entry.film.movieGluFilmId}
              className="flex gap-3 rounded-[20px] border border-border bg-surface p-3"
            >
              {href ? (
                <Link href={href} className="shrink-0">
                  <Poster src={poster} alt={entry.film.title} />
                </Link>
              ) : (
                <Poster src={poster} alt={entry.film.title} />
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-[17px] font-bold tracking-[-0.02em]">
                  {href ? <Link href={href}>{entry.film.title}</Link> : entry.film.title}
                </p>
                <p className="mt-0.5 truncate text-[13px] text-muted">
                  {entry.cinema.name} · {formatDistance(entry.cinema.distanceKm)}
                  {entry.cinemaCount > 1 && ` · +${entry.cinemaCount - 1} cinema`}
                </p>
                <div className="scrollbar-none mt-2 flex gap-2 overflow-x-auto">
                  {next.length === 0 ? (
                    <span className="text-[13px] text-muted-2">Nessun altro spettacolo oggi</span>
                  ) : (
                    next.map((s, i) => (
                      <ShowtimeChip
                        key={`${s.start}-${s.format}`}
                        showing={s}
                        state={i === 0 ? "next" : "future"}
                        onClick={() => {
                          setPick({ entry, showing: s });
                          setTicketOpen(true);
                        }}
                      />
                    ))
                  )}
                </div>
              </div>
            </article>
          );
        })}
      </div>

      <TicketSheet
        open={ticketOpen}
        onClose={() => setTicketOpen(false)}
        film={pick?.entry.film ?? entries[0]?.film}
        cinema={pick?.entry.cinema ?? null}
        showing={pick?.showing ?? null}
        onInvite={() => {
          setTicketOpen(false);
          setInviteOpen(true);
        }}
      />

      {pick?.entry.film.tmdbId != null && (
        <RecommendSheet
          open={inviteOpen}
          onClose={() => setInviteOpen(false)}
          titleId={pick.entry.film.tmdbId}
          mediaType="movie"
          friends={friends}
          initialMessage={`Vieni al ${pick.entry.cinema.name} ${formatShowingDate(pick.showing.start).toLowerCase()}?`}
        />
      )}
    </>
  );
}

function Poster({ src, alt }: { src: string | null; alt: string }) {
  return (
    <div className="relative aspect-[2/3] w-[72px] overflow-hidden rounded-[10px] bg-surface-2">
      {src && <Image src={src} alt={alt} fill sizes="72px" className="object-cover" />}
    </div>
  );
}
```

Se `entries` è vuoto la pagina non monta `FilmsView` (vedi Step 3), quindi `entries[0]` è sempre definito quando il foglio è chiuso.

- [ ] **Step 2: `VenuesView.tsx`** (client: card cinema con film dentro + Indicazioni)

```tsx
"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { GlassIconButton } from "@/components/layout/GlassIconButton";
import { RecommendSheet } from "@/components/title/RecommendSheet";
import { posterUrl } from "@/lib/config";
import { formatShowingDate, minutesUntil } from "@/lib/cinema/dates";
import { directionsUrl, formatDistance, walkingMinutes } from "@/lib/cinema/geo";
import type { Cinema, ProgrammeFilm, Showing } from "@/lib/cinema/types";
import type { MiniProfile } from "@/lib/social/queries";
import { Icon } from "./icons";
import { ShowtimeChip } from "./ShowtimeChip";
import { TicketSheet } from "./TicketSheet";

export interface VenueEntry {
  cinema: Cinema;
  films: ProgrammeFilm[];
}

export function VenuesView({
  entries,
  friends,
  nowMs,
}: {
  entries: VenueEntry[];
  friends: MiniProfile[];
  nowMs: number;
}) {
  const [pick, setPick] = useState<{
    cinema: Cinema;
    film: ProgrammeFilm["film"];
    showing: Showing;
  } | null>(null);
  const [ticketOpen, setTicketOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [ios, setIos] = useState(false);
  useEffect(() => setIos(/iPhone|iPad|iPod/.test(navigator.userAgent)), []);

  return (
    <>
      <div className="grid gap-3 lg:grid-cols-2">
        {entries.map(({ cinema, films }, i) => (
          <article
            key={cinema.id}
            className="rounded-[20px] border border-border bg-surface p-4"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="truncate text-[17px] font-bold tracking-[-0.02em]">
                    {cinema.name}
                  </h3>
                  {i === 0 && (
                    <span className="rounded-full bg-accent/20 px-2 py-0.5 text-[11px] font-bold text-accent-pale">
                      Il più vicino
                    </span>
                  )}
                </div>
                <p className="mt-0.5 truncate text-[13px] text-muted">
                  {cinema.address}
                  {cinema.city ? `, ${cinema.city}` : ""} · {formatDistance(cinema.distanceKm)}{" "}
                  · {walkingMinutes(cinema.distanceKm)} min a piedi
                </p>
              </div>
              <a
                href={directionsUrl(cinema, ios)}
                target="_blank"
                rel="noopener"
                aria-label="Indicazioni"
                className="glass flex size-10 shrink-0 items-center justify-center rounded-full"
              >
                <Icon name="nav" size={18} />
              </a>
            </div>

            <div className="mt-3 flex flex-col gap-3">
              {films.map(({ film, showings }) => {
                const poster = posterUrl(film.posterPath, "w92");
                const href = film.tmdbId != null ? `/title/movie/${film.tmdbId}` : null;
                const future = showings.filter((s) => minutesUntil(s.start, nowMs) >= 0);
                const nextStart = future[0]?.start ?? null;
                return (
                  <div key={film.movieGluFilmId} className="flex gap-3">
                    <div className="relative aspect-[2/3] w-11 shrink-0 overflow-hidden rounded-md bg-surface-2">
                      {poster && (
                        <Image src={poster} alt="" fill sizes="44px" className="object-cover" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[15px] font-semibold">
                        {href ? <Link href={href}>{film.title}</Link> : film.title}
                      </p>
                      <div className="scrollbar-none mt-1.5 flex gap-2 overflow-x-auto">
                        {showings.map((s) => (
                          <ShowtimeChip
                            key={`${s.start}-${s.format}`}
                            showing={s}
                            state={
                              minutesUntil(s.start, nowMs) < 0
                                ? "past"
                                : s.start === nextStart
                                  ? "next"
                                  : "future"
                            }
                            onClick={() => {
                              setPick({ cinema, film, showing: s });
                              setTicketOpen(true);
                            }}
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </article>
        ))}
      </div>

      {pick && (
        <TicketSheet
          open={ticketOpen}
          onClose={() => setTicketOpen(false)}
          film={pick.film}
          cinema={pick.cinema}
          showing={pick.showing}
          onInvite={() => {
            setTicketOpen(false);
            setInviteOpen(true);
          }}
        />
      )}

      {pick?.film.tmdbId != null && (
        <RecommendSheet
          open={inviteOpen}
          onClose={() => setInviteOpen(false)}
          titleId={pick.film.tmdbId}
          mediaType="movie"
          friends={friends}
          initialMessage={`Vieni al ${pick.cinema.name} ${formatShowingDate(pick.showing.start).toLowerCase()}?`}
        />
      )}
    </>
  );
}
```

Nota `GlassIconButton` non accetta `target`: per questo il bottone Indicazioni è un `<a>` con le stesse classi. Rimuovi l'import di `GlassIconButton` se inutilizzato.

- [ ] **Step 3: `page.tsx`**

```tsx
import Link from "next/link";
import { TopBar } from "@/components/layout/TopBar";
import { DayBar } from "@/components/cinema/DayBar";
import { FilmsView, type FilmEntry } from "@/components/cinema/FilmsView";
import { LocationChip } from "@/components/cinema/LocationChip";
import { LocationPrompt } from "@/components/cinema/LocationPrompt";
import { ShowtimesClient } from "@/components/cinema/ShowtimesClient";
import { VenuesView, type VenueEntry } from "@/components/cinema/VenuesView";
import { EmptyState } from "@/components/ui/EmptyState";
import { nextDays } from "@/lib/cinema/dates";
import { getMovieGluFilmId } from "@/lib/cinema/match";
import { isCinemaEnabled } from "@/lib/cinema/movieglu";
import { getViewerLocation } from "@/lib/cinema/queries";
import {
  getCinemaProgramme,
  getFilmShowtimes,
  getNearbyCinemas,
} from "@/lib/cinema/showtimes";
import type { FilmSummary } from "@/lib/cinema/types";
import { getFriendsData } from "@/lib/social/queries";
import { getOrFetchTitle } from "@/lib/tmdb/cache";

export const metadata = { title: "Cinema" };

interface Props {
  searchParams: Promise<{ view?: string; day?: string; film?: string }>;
}

const PILL = "rounded-full px-4 py-1.5 text-xs font-semibold";

/** Aggrega la programmazione dei cinema per film (cinema più vicino in testa). */
function byFilm(venues: VenueEntry[]): FilmEntry[] {
  const map = new Map<number, FilmEntry>();
  for (const { cinema, films } of venues) {
    for (const { film, showings } of films) {
      const cur = map.get(film.movieGluFilmId);
      if (!cur) {
        map.set(film.movieGluFilmId, { film, cinema, showings, cinemaCount: 1 });
      } else {
        cur.cinemaCount += 1;
        if (cinema.distanceKm < cur.cinema.distanceKm) {
          cur.cinema = cinema;
          cur.showings = showings;
        }
      }
    }
  }
  return [...map.values()].sort((a, b) => b.cinemaCount - a.cinemaCount);
}

export default async function CinemaPage({ searchParams }: Props) {
  const { view, day, film } = await searchParams;
  const days = nextDays(7);
  const selected = days.some((d) => d.date === day) ? day! : days[0].date;
  const mode = view === "cinemas" ? "cinemas" : "films";
  const filmId = film && /^\d+$/.test(film) ? Number(film) : null;

  if (!isCinemaEnabled()) {
    return (
      <>
        <TopBar title="Cinema" />
        <main className="px-5 pb-16 lg:px-10">
          <EmptyState
            title="Orari non disponibili"
            description="La programmazione dei cinema non è ancora attiva."
          />
        </main>
      </>
    );
  }

  const location = await getViewerLocation();
  if (!location) {
    return (
      <>
        <TopBar title="Cinema" />
        <main className="px-5 pb-16 lg:px-10">
          <LocationPrompt />
        </main>
      </>
    );
  }

  const nowMs = Date.now();
  const query = (key: string, value: string) => {
    const p = new URLSearchParams({ day: selected });
    if (filmId) p.set("film", String(filmId));
    p.set(key, value);
    return `/cinema?${p.toString()}`;
  };

  // ?film=<tmdbId>: un solo film, stessa lista della scheda ma senza limite
  if (filmId) {
    const cached = await getOrFetchTitle(filmId, "movie");
    const mgId = cached ? await getMovieGluFilmId(cached.title).catch(() => null) : null;
    const [items, { friends }] = await Promise.all([
      mgId != null
        ? getFilmShowtimes(location, mgId, cached!.title.title, selected).catch(() => [])
        : Promise.resolve([]),
      getFriendsData(),
    ]);
    const summary: FilmSummary | null = cached
      ? {
          tmdbId: cached.title.id,
          movieGluFilmId: mgId ?? 0,
          title: cached.title.title,
          posterPath: cached.title.poster_path,
          backdropPath: cached.title.backdrop_path,
        }
      : null;

    return (
      <>
        <TopBar title={cached?.title.title ?? "Cinema"} action={<LocationChip label={location.label} />} />
        <main className="flex flex-col gap-4 px-5 pb-16 lg:px-10">
          <DayBar days={days} selected={selected} />
          <Link href={`/cinema?day=${selected}`} className="text-[13px] font-medium text-accent-soft">
            ← Tutti i cinema
          </Link>
          {summary && items.length > 0 ? (
            <ShowtimesClient film={summary} items={items} friends={friends} nowMs={nowMs} />
          ) : (
            <EmptyState
              title="Nessuno spettacolo vicino a te"
              description="Prova un altro giorno o cambia posizione."
            />
          )}
        </main>
      </>
    );
  }

  const cinemas = await getNearbyCinemas(location, 10).catch(() => []);
  const [programmes, { friends }] = await Promise.all([
    Promise.all(
      cinemas.slice(0, 5).map(async (cinema) => ({
        cinema,
        films: await getCinemaProgramme(location, cinema, selected).catch(() => []),
      })),
    ),
    getFriendsData(),
  ]);
  const venues: VenueEntry[] = programmes.filter((v) => v.films.length > 0);
  const films = byFilm(venues);

  return (
    <>
      <TopBar title="Cinema" action={<LocationChip label={location.label} />} />
      <main className="flex flex-col gap-4 px-5 pb-16 lg:px-10">
        <DayBar days={days} selected={selected} />
        <div className="flex gap-2">
          <Link
            href={query("view", "films")}
            className={`${PILL} ${mode === "films" ? "bg-accent text-white" : "border border-border bg-surface text-muted"}`}
          >
            Per film
          </Link>
          <Link
            href={query("view", "cinemas")}
            className={`${PILL} ${mode === "cinemas" ? "bg-accent text-white" : "border border-border bg-surface text-muted"}`}
          >
            Per cinema
          </Link>
        </div>

        {venues.length === 0 ? (
          <EmptyState
            title="Orari non disponibili ora"
            description="Nessuna programmazione trovata vicino a te. Riprova tra poco o cambia posizione."
          />
        ) : mode === "films" ? (
          <FilmsView entries={films} friends={friends} nowMs={nowMs} />
        ) : (
          <VenuesView entries={venues} friends={friends} nowMs={nowMs} />
        )}
      </main>
    </>
  );
}
```

- [ ] **Step 4: `loading.tsx`**

```tsx
import { TopBar } from "@/components/layout/TopBar";
import { Skeleton } from "@/components/ui/Skeleton";

export default function Loading() {
  return (
    <>
      <TopBar title="Cinema" />
      <main className="flex flex-col gap-3 px-5 pb-16 lg:px-10">
        <Skeleton className="h-10 w-72 rounded-full" />
        <Skeleton className="h-[120px] w-full rounded-[20px]" />
        <Skeleton className="h-[120px] w-full rounded-[20px]" />
        <Skeleton className="h-[120px] w-full rounded-[20px]" />
      </main>
    </>
  );
}
```

- [ ] **Step 5: Link da Scopri**

In `src/components/discover/DiscoverSections.tsx`: `Shelf` accetta `seeAllHref?: string` e lo passa a `HorizontalShelf`; la riga `Al cinema adesso` diventa:

```tsx
      <Shelf title="Al cinema adesso" items={nowPlaying?.results} seeAllHref="/cinema" />
```

```tsx
function Shelf({
  title,
  items,
  seeAllHref,
}: {
  title: string;
  items: TmdbMultiResult[] | undefined;
  seeAllHref?: string;
}) {
  if (!items || items.length === 0) return null;
  return (
    <HorizontalShelf title={title} seeAllHref={seeAllHref}>
      <ShelfItems items={items} />
    </HorizontalShelf>
  );
}
```

- [ ] **Step 6: Prova con il mock**

`/cinema` → vista Per film (6 film, poster, "UCI Cinemas Bicocca · 6,6 km · +2 cinema", 3 chip); Per cinema → 3 card con film e Indicazioni; `/cinema?film=<id>` → lista completa. Desktop `lg`: due colonne.

- [ ] **Step 7: Verifica e commit**

Run: `pnpm typecheck && pnpm lint`
Expected: PASS.

```bash
git add "src/app/(app)/cinema" src/components/cinema/FilmsView.tsx src/components/cinema/VenuesView.tsx src/components/discover/DiscoverSections.tsx
git commit -m "feat(cinema): pagina /cinema per film e per cinema, link da Scopri"
```

---

### Task 13: Home — card "Stasera al cinema"

**Files:**
- Create: `src/components/cinema/TonightAtCinema.tsx`, `src/components/cinema/PlanCard.tsx`
- Modify: `src/app/(app)/page.tsx`

**Interfaces:**
- Consumes: `getUpcomingPlan`, `PlanRow` (Task 8), `cancelPlan` (Task 9), `markWatched` da `@/lib/watch/actions`, `backdropUrl`, `formatShowingDate`, `minutesUntil`, `formatCountdown`, `directionsUrl`.
- Produces: `TonightAtCinema()` (server, null se nessun piano), `PlanCard({ plan })`.

- [ ] **Step 1: `PlanCard.tsx`**

```tsx
"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toaster";
import { backdropUrl } from "@/lib/config";
import { formatCountdown, formatShowingDate, minutesUntil } from "@/lib/cinema/dates";
import { directionsUrl } from "@/lib/cinema/geo";
import { cancelPlan } from "@/lib/cinema/plans";
import type { PlanRow } from "@/lib/cinema/queries";
import { markWatched } from "@/lib/watch/actions";
import { Icon } from "./icons";

/**
 * Serata pianificata: countdown live, Biglietti e Indicazioni. Se lo spettacolo
 * è iniziato da più di 3 h la card chiede "L'hai visto?".
 */
export function PlanCard({ plan }: { plan: PlanRow }) {
  const { show } = useToast();
  const [pending, startTransition] = useTransition();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);
  const [ios, setIos] = useState(false);
  useEffect(() => setIos(/iPhone|iPad|iPod/.test(navigator.userAgent)), []);

  const minutes = minutesUntil(plan.starts_at, now);
  const afterShow = minutes < -180;
  const bg = backdropUrl(plan.backdrop_path, "original");
  const coords =
    plan.cinema_lat != null && plan.cinema_lng != null
      ? { lat: plan.cinema_lat, lng: plan.cinema_lng }
      : null;

  function done(watched: boolean) {
    startTransition(async () => {
      if (watched) await markWatched(plan.tmdb_id, "movie");
      await cancelPlan(plan.id);
      show(watched ? "Segnato come visto" : "Serata rimossa");
    });
  }

  return (
    <section className="px-5 lg:px-10">
      <div className="relative overflow-hidden rounded-[20px] border border-border bg-surface">
        {bg && (
          <Image
            src={bg}
            alt=""
            fill
            sizes="100vw"
            quality={95}
            className="object-cover opacity-40"
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-r from-black/90 via-black/60 to-black/30" />
        <div className="relative flex flex-col gap-3 p-5">
          <p className="inline-flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-wide text-accent-pale">
            <Icon name="ticket" size={14} />
            {afterShow ? "Com'è andata?" : "Stasera al cinema"}
          </p>
          <div>
            <Link
              href={`/title/movie/${plan.tmdb_id}`}
              className="text-[22px] font-bold tracking-[-0.03em]"
            >
              {plan.film_title}
            </Link>
            <p className="text-sm text-muted">
              {formatShowingDate(plan.starts_at)} · {plan.cinema_name}
            </p>
            {!afterShow && (
              <p className="mt-1 text-[15px] font-semibold">{formatCountdown(minutes)}</p>
            )}
          </div>

          {afterShow ? (
            <div className="flex gap-2">
              <Button
                type="button"
                onClick={() => done(true)}
                disabled={pending}
                className="h-11 px-5 text-[15px]"
              >
                L&apos;ho visto
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => done(false)}
                disabled={pending}
                className="h-11 px-5 text-[15px]"
              >
                Non ci sono andato
              </Button>
            </div>
          ) : (
            <div className="flex gap-2">
              <a
                href={plan.booking_url}
                target="_blank"
                rel="noopener"
                className="inline-flex h-11 items-center gap-2 rounded-full bg-accent px-5 text-[15px] font-semibold text-white hover:bg-accent-strong"
              >
                <Icon name="ticket" size={16} /> Biglietti
              </a>
              {coords && (
                <a
                  href={directionsUrl(coords, ios)}
                  target="_blank"
                  rel="noopener"
                  className="glass inline-flex h-11 items-center gap-2 rounded-full px-5 text-[15px] font-semibold"
                >
                  <Icon name="nav" size={16} /> Indicazioni
                </a>
              )}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 2: `TonightAtCinema.tsx`** (server)

```tsx
import { getUpcomingPlan } from "@/lib/cinema/queries";
import { PlanCard } from "./PlanCard";

/** Prossima serata al cinema (da 3 h prima a 48 h dopo), se esiste. */
export async function TonightAtCinema() {
  const plan = await getUpcomingPlan();
  if (!plan) return null;
  return <PlanCard plan={plan} />;
}
```

- [ ] **Step 3: Home**

In `src/app/(app)/page.tsx`: `import { TonightAtCinema } from "@/components/cinema/TonightAtCinema";` e, come primo figlio del `<div className={`${empty ? "mt-2" : "mt-8"} space-y-8`}>`, prima del ternario `empty ? …`:

```tsx
        <Suspense fallback={null}>
          <TonightAtCinema />
        </Suspense>
```

- [ ] **Step 4: Prova con il mock**

Dalla scheda film → orario → "Ci vado": la home mostra la card con countdown, Biglietti e Indicazioni. Annulla dal toast la rimuove.

- [ ] **Step 5: Verifica e commit**

Run: `pnpm typecheck && pnpm lint`
Expected: PASS.

```bash
git add src/components/cinema/TonightAtCinema.tsx src/components/cinema/PlanCard.tsx "src/app/(app)/page.tsx"
git commit -m "feat(cinema): card 'Stasera al cinema' in home"
```

---

### Task 14: Documentazione, build, screenshot

**Files:**
- Modify: `README.md`, `CLAUDE.md`

- [ ] **Step 1: README** — nella sezione variabili d'ambiente aggiungi:

```
- **Cinema vicini e orari** (opzionale): `MOVIEGLU_CLIENT`, `MOVIEGLU_API_KEY`, `MOVIEGLU_AUTHORIZATION` da https://developer.movieglu.com (territory IT). Senza chiave la sezione non compare. `MOVIEGLU_MOCK=1` usa tre cinema finti di Milano per sviluppare. Geocoding via Nominatim (solo server, User-Agent in `src/lib/config.ts`). Override manuale del link biglietteria: `pnpm tsx scripts/set-cinema-link.ts <cinema_id> <https url>`.
```

- [ ] **Step 2: CLAUDE.md** — in "Commands" aggiungi `pnpm test # vitest, solo funzioni pure (src/**/*.test.ts)` e lo script `set-cinema-link.ts`; sostituisci "No test suite exists…" con "Vitest copre solo le funzioni pure di `src/lib/cinema/`; il resto si verifica con `pnpm typecheck && pnpm lint && pnpm build`". In "Architecture" aggiungi la sezione:

```
### Cinema (MovieGlu)

- `src/lib/cinema/`: `movieglu.ts` (client server-only, throttle 2 req/s, `unstable_cache` 15 min per cella di ~110 m, `MOVIEGLU_MOCK=1` → `mock.ts`), `match.ts` (TMDB ↔ MovieGlu via IMDb id in `cinema_films`, 24 h), `showtimes.ts` (`getFilmShowtimes`, `getCinemaProgramme`, `getNearbyCinemas`), `links.ts` (link biglietteria: `cinema_links` manual → sito cinema → catena `chains.ts` → Google), `location.ts` / `geocode.ts` (posizione in `profiles.location_*`, Nominatim), `plans.ts` (`cinema_plans`, "Ci vado" + `addWant`). Funzioni pure senza `server-only` (`geo.ts`, `dates.ts`, `formats.ts`, `chains.ts`, `films.ts`) hanno test Vitest.
- UI in `src/components/cinema/`: `NearbyShowtimes` (scheda film, `?day=`), pagina `/cinema` (`?view=films|cinemas&film=`), `TicketSheet` (Compra biglietti = deep link, mai iframe; Ci vado; Invita amici via `RecommendSheet.initialMessage`), `TonightAtCinema` in home. Posti in sala live: fuori scope (nessuna API in Italia).
- `Permissions-Policy` consente `geolocation=(self)`; CSP invariata (MovieGlu e Nominatim solo server).
```

- [ ] **Step 3: Build completa**

Run: `pnpm test && pnpm typecheck && pnpm lint && pnpm build`
Expected: tutto verde; nella build compare la route `/cinema`.

- [ ] **Step 4: Screenshot** (mock attivo, `pnpm dev`): scheda film mobile (390px) e desktop, `/cinema` Per film e Per cinema, `TicketSheet` aperto, card home. Salvali nello scratchpad e allegali nel messaggio finale.

- [ ] **Step 5: Commit**

```bash
git add README.md CLAUDE.md
git commit -m "docs: cinema vicino a te (MovieGlu, mock, test vitest)"
```

---

## Self-review

- **Spec coverage**: §1 dati/adapter → Task 2–7; migrazione → Task 3; §2 posizione → Task 8 (+ Permissions-Policy in Task 3); §3 scheda film → Task 11, `/cinema` → Task 12, `TicketSheet` → Task 10; §4 piani/amici/home → Task 9, 13; §5 errori (`isCinemaEnabled`, `.catch(() => [])`, `EmptyState`), config, env, README, verifica → Task 3, 14.
- **Scostamenti dalla spec, voluti**: cella cache 0,001° invece di 0,01° (distanze corrette); `cinema_links` senza source `search` (i fallback catena/Google si calcolano al volo, dipendono dal film); `cinema_films` e `cinema_plans` denormalizzano titolo/poster/backdrop per evitare join su `titles` con chiave composita.
- **Tipi**: `FilmSummary`, `Cinema`, `Showing`, `CinemaShowtimes`, `ProgrammeFilm` definiti in Task 2 e usati con gli stessi nomi in 7, 10–13; `PlanRow` da `queries.ts` (Task 8) usato in Task 13; `PlanUndo` (Task 9) usato in `TicketSheet` (Task 10) tramite `r.undo`.
