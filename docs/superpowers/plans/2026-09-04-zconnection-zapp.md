# ZConnection — lato Zapp (fase 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Zapp riceve gli eventi di visione da un dispositivo ZConnection abbinato con un codice, li trasforma in sessioni e progresso, e mostra in home la serie in corso con aggiornamento live.

**Architecture:** Un dispositivo si abbina con codice a 6 cifre e un token (di cui il server conserva solo l'hash). `POST /api/scrobble` valida il token, fa il matching TMDB in TypeScript (funzioni pure testate con vitest) e delega le scritture alla RPC SECURITY DEFINER `scrobble_apply`, che applica le regole di sessione/completamento e scrive `watch_sessions`, `watch_entries`, `episode_watches`, `pending_scrobbles`. La home legge l'ultima sessione viva e si aggiorna via Supabase Realtime.

**Tech Stack:** Next.js 15 App Router, TypeScript strict, Supabase (Postgres + RLS + Realtime), TMDB v3 via `src/lib/tmdb/client.ts`, vitest (nuovo, solo per `src/lib/scrobble`), pnpm.

**Spec:** `docs/superpowers/specs/2026-09-04-zconnection-design.md`

## Global Constraints

- Nessuna chiamata TMDB dal client; solo `src/lib/tmdb/client.ts` (`server-only`).
- Nessuna libreria UI esterna; nessuna libreria di icone (SVG inline, `strokeWidth={1.8}`).
- Service client (`createServiceClient`) mai per dati utente: le scritture per conto del dispositivo passano dalle RPC validate dal token (spec §6).
- Token dispositivo: solo `sha256` hex nel DB, mai il token in chiaro (spec §4, §11).
- Whitelist package: solo Netflix (8), Prime Video (119), Disney+ (337), NOW (39) (spec §9.3).
- Limiti ingest: 240 eventi/min per dispositivo, body ≤ 64 KB, ≤ 50 eventi per richiesta, stringhe ≤ 512 caratteri (spec §5).
- Completamento: `position ≥ 90% duration`, oppure chiusura sessione con ultima posizione ≥ 85%; durata sconosciuta → mai automatico (spec §7.5).
- `watch_entries` scritta solo a inizio e completamento, mai a ogni heartbeat (spec §7.5).
- Dopo ogni migrazione: `supabase gen types typescript --project-id bbuhwzdbzxgydewmcdwd > src/types/database.ts`.
- Prettier: doppi apici, virgole finali, printWidth 90. Commenti in italiano. UI in italiano.
- Verifica finale: `pnpm typecheck && pnpm lint && pnpm test && pnpm build`.
- I moduli puri di `src/lib/scrobble` (`platforms.ts`, `parse.ts`, `score.ts`, `rules.ts`) **non** importano `server-only` (devono girare in vitest); `match.ts` e la route sì.

---

## File map

| File | Responsabilità |
|---|---|
| `vitest.config.ts`, `package.json` | runner test con alias `@/` |
| `src/lib/scrobble/platforms.ts` | package Android → `provider_id` |
| `src/lib/scrobble/parse.ts` | metadati grezzi → `ParsedMedia` (titolo, S/E, key) |
| `src/lib/scrobble/score.ts` | punteggio candidati TMDB e decisione `auto/ambiguous/none` (puro) |
| `src/lib/scrobble/rules.ts` | regola di completamento (pura) |
| `src/lib/scrobble/match.ts` | `matchTitle`: cache `titles` + TMDB + episodio (server-only) |
| `src/lib/scrobble/types.ts` | tipi condivisi: `ScrobbleEvent`, `ParsedMedia`, `MatchResult`, `ApplyItem` |
| `src/lib/scrobble/token.ts` | `hashToken`, `generateCode` |
| `supabase/migrations/0006_zconnection.sql` | tabelle, RLS, realtime, RPC |
| `src/lib/supabase/server.ts` | `createAnonClient()` per route senza cookie |
| `src/lib/supabase/middleware.ts` | `/api/devices`, `/api/scrobble` pubblici (auth a token) |
| `src/app/api/devices/pair/route.ts` | `POST` crea codice |
| `src/app/api/devices/pair/[code]/route.ts` | `GET` polling della TV |
| `src/app/api/scrobble/route.ts` | ingest eventi |
| `src/lib/devices/actions.ts`, `queries.ts` | Server Actions e letture per `/devices` |
| `src/lib/watch/queries.ts` | `getNowPlaying()` |
| `src/components/home/HeroWatching.tsx`, `src/app/(app)/page.tsx` | hero live |
| `src/components/home/LiveRefresh.tsx` | Realtime → `router.refresh()` |
| `src/app/(app)/devices/page.tsx`, `DevicesClient.tsx`, `PairForm.tsx` | UI dispositivi |
| `src/app/(app)/profile/page.tsx` | link "Dispositivi collegati" |
| `scripts/fake-tv.ts` | finta TV: abbinamento + heartbeat da terminale |

---

### Task 1: vitest e mappa package → piattaforma

**Files:**
- Create: `vitest.config.ts`
- Modify: `package.json` (scripts + devDependencies)
- Create: `src/lib/scrobble/platforms.ts`
- Test: `src/lib/scrobble/__tests__/platforms.test.ts`

**Interfaces:**
- Produces: `providerForPackage(pkg: string): number | null`; `SUPPORTED_PROVIDERS: readonly number[]` = `[8, 119, 337, 39]`.

- [ ] **Step 1: Installa vitest e aggiungi lo script**

Run: `pnpm add -D vitest@^3`

Modifica `package.json`, blocco `scripts`:

```json
"test": "vitest run",
"test:watch": "vitest"
```

Crea `vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    include: ["src/lib/scrobble/**/*.test.ts"],
    environment: "node",
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
  },
});
```

- [ ] **Step 2: Scrivi il test che fallisce**

`src/lib/scrobble/__tests__/platforms.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { providerForPackage, SUPPORTED_PROVIDERS } from "@/lib/scrobble/platforms";

describe("providerForPackage", () => {
  it("mappa i package Netflix su 8", () => {
    expect(providerForPackage("com.netflix.ninja")).toBe(8);
    expect(providerForPackage("com.netflix.mediaclient")).toBe(8);
  });
  it("mappa Prime, Disney+ e NOW", () => {
    expect(providerForPackage("com.amazon.avod")).toBe(119);
    expect(providerForPackage("com.amazon.firebat")).toBe(119);
    expect(providerForPackage("com.disney.disneyplus")).toBe(337);
    expect(providerForPackage("com.nowtv.it")).toBe(39);
  });
  it("ignora package sconosciuti", () => {
    expect(providerForPackage("com.spotify.tv.android")).toBeNull();
    expect(providerForPackage("")).toBeNull();
  });
  it("espone i provider supportati", () => {
    expect([...SUPPORTED_PROVIDERS]).toEqual([8, 119, 337, 39]);
  });
});
```

- [ ] **Step 3: Esegui il test, deve fallire**

Run: `pnpm test`
Expected: FAIL, `Cannot find module '@/lib/scrobble/platforms'`.

- [ ] **Step 4: Implementa**

`src/lib/scrobble/platforms.ts`:

```ts
// Package Android delle app di streaming → id provider TMDB (watch/providers, regione IT).
// I package NOW sono provvisori: si confermano con lo spike sulla Fire TV (spec §14).

export const SUPPORTED_PROVIDERS = [8, 119, 337, 39] as const;

const PACKAGES: Record<string, number> = {
  "com.netflix.ninja": 8, // Netflix su Fire TV / Android TV
  "com.netflix.mediaclient": 8, // Netflix telefono/tablet
  "com.amazon.avod": 119, // Prime Video Fire TV
  "com.amazon.firebat": 119, // Prime Video Fire TV (nuovo client)
  "com.amazon.avod.thirdpartyclient": 119, // Prime Video Android
  "com.disney.disneyplus": 337,
  "com.nowtv.it": 39,
  "it.sky.nowtv": 39,
  "com.bskyb.nowtv.beta": 39,
};

export function providerForPackage(pkg: string): number | null {
  return PACKAGES[pkg] ?? null;
}
```

- [ ] **Step 5: Esegui il test, deve passare**

Run: `pnpm test`
Expected: PASS (4 test).

- [ ] **Step 6: Commit**

```bash
git add vitest.config.ts package.json pnpm-lock.yaml src/lib/scrobble/platforms.ts src/lib/scrobble/__tests__/platforms.test.ts
git commit -m "feat(scrobble): vitest e mappa package Android → provider TMDB"
```

---

### Task 2: parsing dei metadati (`parse.ts`)

**Files:**
- Create: `src/lib/scrobble/types.ts`
- Create: `src/lib/scrobble/parse.ts`
- Test: `src/lib/scrobble/__tests__/parse.test.ts`

**Interfaces:**
- Produces (in `types.ts`):

```ts
export type PlaybackState = "playing" | "paused" | "stopped" | "buffering";

export interface ScrobbleEvent {
  id: string;
  at: string; // ISO
  package: string;
  state: PlaybackState;
  position_ms: number;
  duration_ms: number | null;
  meta: Record<string, string | null | undefined>;
  extras?: Record<string, string>;
  notification?: { title?: string | null; text?: string | null };
}

export interface ParsedMedia {
  kind: "movie" | "tv" | "unknown";
  title: string;
  year: number | null;
  season: number | null;
  episode: number | null;
  episodeName: string | null;
  /** hash stabile di (provider, titolo, stagione, episodio): chiave delle pending */
  key: string;
}
```

- Produces: `parseEvent(event: ScrobbleEvent, providerId: number): ParsedMedia | null` (null se nessun titolo).

- [ ] **Step 1: Scrivi i test che falliscono**

`src/lib/scrobble/__tests__/parse.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { parseEvent } from "@/lib/scrobble/parse";
import type { ScrobbleEvent } from "@/lib/scrobble/types";

function ev(meta: ScrobbleEvent["meta"], extra: Partial<ScrobbleEvent> = {}): ScrobbleEvent {
  return {
    id: "e1",
    at: "2026-09-04T21:00:00Z",
    package: "com.netflix.ninja",
    state: "playing",
    position_ms: 1000,
    duration_ms: 3_000_000,
    meta,
    ...extra,
  };
}

describe("parseEvent", () => {
  it("serie con S/E nel sottotitolo (stile Netflix)", () => {
    const p = parseEvent(ev({ title: "Dark", subtitle: "S2:E4 Il viaggiatore" }), 8);
    expect(p).toMatchObject({ kind: "tv", title: "Dark", season: 2, episode: 4 });
    expect(p?.episodeName).toBe("Il viaggiatore");
  });

  it("serie con 'Stagione 2: Episodio 4' e '2x04'", () => {
    expect(
      parseEvent(ev({ title: "The Boys", subtitle: "Stagione 2: Episodio 4" }), 119),
    ).toMatchObject({ kind: "tv", season: 2, episode: 4 });
    expect(parseEvent(ev({ title: "The Boys – 2x04" }), 119)).toMatchObject({
      kind: "tv",
      title: "The Boys",
      season: 2,
      episode: 4,
    });
  });

  it("serie con solo il nome dell'episodio → episodeName, kind tv", () => {
    const p = parseEvent(ev({ title: "Il viaggiatore", album: "Dark", artist: null }), 8);
    expect(p).toMatchObject({ kind: "tv", title: "Dark", episodeName: "Il viaggiatore" });
    expect(p?.season).toBeNull();
  });

  it("film: solo titolo, anno tra parentesi", () => {
    const p = parseEvent(ev({ title: "Interstellar (2014)" }), 119);
    expect(p).toMatchObject({ kind: "unknown", title: "Interstellar", year: 2014 });
    expect(p?.season).toBeNull();
  });

  it("usa la notifica se i metadati sono vuoti", () => {
    const p = parseEvent(
      ev({ title: null }, { notification: { title: "Loki", text: "S1:E2 La variante" } }),
      337,
    );
    expect(p).toMatchObject({ kind: "tv", title: "Loki", season: 1, episode: 2 });
  });

  it("nessun titolo → null", () => {
    expect(parseEvent(ev({ title: "" }), 8)).toBeNull();
  });

  it("key è stabile e cambia con l'episodio", () => {
    const a = parseEvent(ev({ title: "Dark", subtitle: "S2:E4" }), 8)!;
    const b = parseEvent(ev({ title: "Dark", subtitle: "S2:E4" }), 8)!;
    const c = parseEvent(ev({ title: "Dark", subtitle: "S2:E5" }), 8)!;
    expect(a.key).toBe(b.key);
    expect(a.key).not.toBe(c.key);
  });
});
```

- [ ] **Step 2: Esegui, deve fallire**

Run: `pnpm test`
Expected: FAIL, modulo `parse` non trovato.

- [ ] **Step 3: Implementa**

`src/lib/scrobble/types.ts`: il blocco dell'interfaccia sopra, più:

```ts
export interface Candidate {
  title_id: number;
  media_type: "movie" | "tv";
  title: string;
  year: number | null;
  poster_path: string | null;
  score: number;
}

export type MatchResult =
  | { kind: "auto"; candidate: Candidate; season: number | null; episode: number | null }
  | { kind: "ambiguous"; candidates: Candidate[] }
  | { kind: "none" };

/** Elemento del batch passato alla RPC scrobble_apply (spec §6). */
export interface ApplyItem {
  at: string;
  provider_id: number;
  state: PlaybackState;
  position_ms: number;
  duration_ms: number | null;
  match: {
    title_id: number;
    media_type: "movie" | "tv";
    season: number | null;
    episode: number | null;
  } | null;
  pending: {
    reason: "ambiguous_title" | "unknown_title";
    raw: ParsedMedia & { provider_id: number };
    candidates: Candidate[];
  } | null;
}
```

`src/lib/scrobble/parse.ts`:

```ts
import { createHash } from "node:crypto";
import type { ParsedMedia, ScrobbleEvent } from "./types";

// Riconoscimento stagione/episodio nei metadati MediaSession.
// Le mappature per piattaforma si affinano con le fixture dello spike (spec §14).

const SE_PATTERNS: RegExp[] = [
  /\bS(\d{1,2})\s*[:.]?\s*E(\d{1,3})\b/i, // S2:E4, S2E4, S2 E4
  /\b(?:stagione|season|temporada|saison)\s*(\d{1,2})\s*[:,.\-–]?\s*(?:episodio|episode|ep\.?)\s*(\d{1,3})\b/i,
  /\bT(\d{1,2})\s*E(\d{1,3})\b/i, // T2 E4
  /\b(\d{1,2})x(\d{1,3})\b/i, // 2x04
];

const EPISODE_ONLY = /\b(?:episodio|episode|ep\.?)\s*(\d{1,3})\b/i;
const YEAR_SUFFIX = /\s*\((\d{4})\)\s*$/;
const SEPARATORS = /\s*[–—:|-]\s*$/;

function clean(s: string | null | undefined): string {
  return (s ?? "").replace(/\s+/g, " ").trim();
}

function findSeasonEpisode(text: string): { season: number; episode: number; rest: string } | null {
  for (const re of SE_PATTERNS) {
    const m = text.match(re);
    if (m) {
      const rest = clean(text.replace(re, " ")).replace(/^[\s:–—-]+|[\s:–—-]+$/g, "");
      return { season: Number(m[1]), episode: Number(m[2]), rest };
    }
  }
  return null;
}

export function parseEvent(event: ScrobbleEvent, providerId: number): ParsedMedia | null {
  const m = event.meta;
  const fields = [
    clean(m.title),
    clean(m.display_title),
    clean(m.subtitle),
    clean(m.display_subtitle),
    clean(m.description),
    clean(m.display_description),
    clean(m.album),
    clean(m.artist),
    clean(event.notification?.title),
    clean(event.notification?.text),
  ];
  const [title, displayTitle, subtitle, displaySubtitle, description, , album, , notifTitle, notifText] =
    fields;

  let main = title || displayTitle || notifTitle;
  if (!main) return null;

  let season: number | null = null;
  let episode: number | null = null;
  let episodeName: string | null = null;
  let kind: ParsedMedia["kind"] = "unknown";

  // 1) S/E nel titolo stesso ("The Boys – 2x04")
  const inTitle = findSeasonEpisode(main);
  if (inTitle) {
    main = inTitle.rest || main;
    season = inTitle.season;
    episode = inTitle.episode;
    kind = "tv";
  }

  // 2) S/E in sottotitolo/descrizione/notifica: il resto è il nome dell'episodio
  if (season == null) {
    for (const source of [subtitle, displaySubtitle, description, notifText]) {
      const found = findSeasonEpisode(source);
      if (found) {
        season = found.season;
        episode = found.episode;
        episodeName = found.rest || null;
        kind = "tv";
        break;
      }
    }
  }

  // 3) album valorizzato = nome serie, title = nome episodio (stile "artist/album")
  if (season == null && album && album !== main) {
    episodeName = main;
    main = album;
    kind = "tv";
  }

  // 4) solo "Episodio 4" senza stagione
  if (season == null && episode == null) {
    for (const source of [subtitle, description]) {
      const only = source.match(EPISODE_ONLY);
      if (only) {
        episode = Number(only[1]);
        kind = "tv";
        break;
      }
    }
  }

  let year: number | null = null;
  const y = main.match(YEAR_SUFFIX);
  if (y) {
    year = Number(y[1]);
    main = main.replace(YEAR_SUFFIX, "");
  }
  main = main.replace(SEPARATORS, "").trim();
  if (!main) return null;

  const key = createHash("sha1")
    .update([providerId, main.toLowerCase(), season ?? "", episode ?? ""].join("|"))
    .digest("hex")
    .slice(0, 16);

  return { kind, title: main, year, season, episode, episodeName, key };
}
```

- [ ] **Step 4: Esegui, deve passare**

Run: `pnpm test`
Expected: PASS. Se un caso di regex fallisce, correggi la regex, non il test.

- [ ] **Step 5: Commit**

```bash
git add src/lib/scrobble/types.ts src/lib/scrobble/parse.ts src/lib/scrobble/__tests__/parse.test.ts
git commit -m "feat(scrobble): parsing metadati MediaSession in titolo/stagione/episodio"
```

---

### Task 3: punteggio e decisione di matching (`score.ts`)

**Files:**
- Create: `src/lib/scrobble/score.ts`
- Test: `src/lib/scrobble/__tests__/score.test.ts`

**Interfaces:**
- Consumes: `ParsedMedia`, `Candidate`, `MatchResult` da `types.ts`.
- Produces:

```ts
export interface RawCandidate {
  title_id: number;
  media_type: "movie" | "tv";
  title: string;
  original_title: string | null;
  year: number | null;
  poster_path: string | null;
  popularity: number;
  /** provider flatrate IT già noti in cache (vuoto se sconosciuti) */
  provider_ids: number[];
}
export function normalizeTitle(s: string): string;
export function scoreCandidates(parsed: ParsedMedia, providerId: number, raw: RawCandidate[]): Candidate[]; // ordinati per score desc
export function decide(parsed: ParsedMedia, scored: Candidate[]): MatchResult;
```

- [ ] **Step 1: Test che fallisce**

`src/lib/scrobble/__tests__/score.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { decide, normalizeTitle, scoreCandidates, type RawCandidate } from "@/lib/scrobble/score";
import type { ParsedMedia } from "@/lib/scrobble/types";

const parsed: ParsedMedia = {
  kind: "tv",
  title: "Dark",
  year: null,
  season: 2,
  episode: 4,
  episodeName: null,
  key: "k",
};

function c(over: Partial<RawCandidate>): RawCandidate {
  return {
    title_id: 1,
    media_type: "tv",
    title: "Dark",
    original_title: "Dark",
    year: 2017,
    poster_path: null,
    popularity: 10,
    provider_ids: [],
    ...over,
  };
}

describe("normalizeTitle", () => {
  it("toglie accenti, punteggiatura e articoli iniziali", () => {
    expect(normalizeTitle("L'Attacco dei Giganti!")).toBe("attacco dei giganti");
    expect(normalizeTitle("The Boys")).toBe("boys");
    expect(normalizeTitle("Élite")).toBe("elite");
  });
});

describe("scoreCandidates + decide", () => {
  it("titolo esatto e provider giusto → auto", () => {
    const scored = scoreCandidates(parsed, 8, [
      c({ title_id: 70523, provider_ids: [8], popularity: 50 }),
      c({ title_id: 2, title: "Dark Matter", popularity: 80 }),
    ]);
    expect(scored[0].title_id).toBe(70523);
    const d = decide(parsed, scored);
    expect(d.kind).toBe("auto");
    if (d.kind === "auto") expect(d.season).toBe(2);
  });

  it("due titoli identici senza provider → ambiguous con entrambi", () => {
    const scored = scoreCandidates(parsed, 8, [
      c({ title_id: 1, year: 2017 }),
      c({ title_id: 2, year: 2020 }),
    ]);
    const d = decide(parsed, scored);
    expect(d.kind).toBe("ambiguous");
    if (d.kind === "ambiguous") expect(d.candidates).toHaveLength(2);
  });

  it("kind tv scarta i film a parità di titolo", () => {
    const scored = scoreCandidates(parsed, 8, [
      c({ title_id: 1, media_type: "movie", title: "Dark", year: 2017 }),
      c({ title_id: 2, media_type: "tv", title: "Dark", year: 2017 }),
    ]);
    expect(decide(parsed, scored)).toMatchObject({ kind: "auto", candidate: { title_id: 2 } });
  });

  it("anno combacia → auto anche senza provider", () => {
    const film: ParsedMedia = { ...parsed, kind: "unknown", title: "Interstellar", year: 2014, season: null, episode: null };
    const scored = scoreCandidates(film, 119, [
      c({ title_id: 1, media_type: "movie", title: "Interstellar", year: 2014 }),
      c({ title_id: 2, media_type: "movie", title: "Interstellar", year: 1997 }),
    ]);
    expect(decide(film, scored)).toMatchObject({ kind: "auto", candidate: { title_id: 1 } });
  });

  it("nessun candidato con titolo simile → none", () => {
    const scored = scoreCandidates(parsed, 8, [c({ title: "Breaking Bad" })]);
    expect(decide(parsed, scored).kind).toBe("none");
  });
});
```

- [ ] **Step 2: Esegui, deve fallire**

Run: `pnpm test`
Expected: FAIL, modulo `score` non trovato.

- [ ] **Step 3: Implementa**

`src/lib/scrobble/score.ts`:

```ts
import type { Candidate, MatchResult, ParsedMedia } from "./types";

export interface RawCandidate {
  title_id: number;
  media_type: "movie" | "tv";
  title: string;
  original_title: string | null;
  year: number | null;
  poster_path: string | null;
  popularity: number;
  provider_ids: number[];
}

const ARTICLES = /^(the|a|an|il|lo|la|i|gli|le|l|un|uno|una|el|los|las|le|les|der|die|das)\s+/;

export function normalizeTitle(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/['’]/g, " ")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(ARTICLES, "")
    .trim();
}

/** Somiglianza 0..1: 1 uguali, 0.8 uno contiene l'altro, altrimenti quota di parole in comune. */
function similarity(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.startsWith(b) || b.startsWith(a)) return 0.8;
  const wa = new Set(a.split(" "));
  const wb = new Set(b.split(" "));
  let common = 0;
  for (const w of wa) if (wb.has(w)) common++;
  return common / Math.max(wa.size, wb.size);
}

const AUTO_MIN = 0.9;
const AMBIGUOUS_GAP = 0.15;
const MAX_CANDIDATES = 3;

export function scoreCandidates(
  parsed: ParsedMedia,
  providerId: number,
  raw: RawCandidate[],
): Candidate[] {
  const wanted = normalizeTitle(parsed.title);
  const maxPop = Math.max(1, ...raw.map((r) => r.popularity));
  return raw
    .map((r) => {
      const sim = Math.max(
        similarity(wanted, normalizeTitle(r.title)),
        similarity(wanted, normalizeTitle(r.original_title ?? "")),
      );
      let score = sim;
      if (parsed.kind !== "unknown" && r.media_type !== parsed.kind) score -= 0.5;
      if (parsed.year != null && r.year != null) score += r.year === parsed.year ? 0.15 : -0.15;
      if (r.provider_ids.includes(providerId)) score += 0.15;
      score += 0.05 * (r.popularity / maxPop); // spareggio, mai decisivo da solo
      return {
        title_id: r.title_id,
        media_type: r.media_type,
        title: r.title,
        year: r.year,
        poster_path: r.poster_path,
        score: Math.round(score * 1000) / 1000,
      };
    })
    .filter((c) => c.score > 0.3)
    .sort((a, b) => b.score - a.score);
}

export function decide(parsed: ParsedMedia, scored: Candidate[]): MatchResult {
  const [best, second] = scored;
  if (!best) return { kind: "none" };
  const clearWinner = best.score >= AUTO_MIN && (!second || best.score - second.score >= AMBIGUOUS_GAP);
  if (clearWinner) {
    return { kind: "auto", candidate: best, season: parsed.season, episode: parsed.episode };
  }
  return { kind: "ambiguous", candidates: scored.slice(0, MAX_CANDIDATES) };
}
```

- [ ] **Step 4: Esegui, deve passare**

Run: `pnpm test`
Expected: PASS. Se "due titoli identici" risulta `auto`, verifica che il gap tra i due sia < 0.15 (stessa popolarità → stesso score).

- [ ] **Step 5: Commit**

```bash
git add src/lib/scrobble/score.ts src/lib/scrobble/__tests__/score.test.ts
git commit -m "feat(scrobble): punteggio candidati TMDB e decisione auto/ambiguous/none"
```

---

### Task 4: regola di completamento (`rules.ts`)

**Files:**
- Create: `src/lib/scrobble/rules.ts`
- Test: `src/lib/scrobble/__tests__/rules.test.ts`

**Interfaces:**
- Produces: `isCompleted(input: {position_ms: number; duration_ms: number | null; closing: boolean}): boolean`. La stessa regola vive anche in SQL (`scrobble_apply`, Task 6): il test TS è la specifica leggibile; i due devono restare allineati (commento incrociato).

- [ ] **Step 1: Test che fallisce**

`src/lib/scrobble/__tests__/rules.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { isCompleted } from "@/lib/scrobble/rules";

describe("isCompleted", () => {
  it("≥ 90% durante la riproduzione", () => {
    expect(isCompleted({ position_ms: 900, duration_ms: 1000, closing: false })).toBe(true);
    expect(isCompleted({ position_ms: 899, duration_ms: 1000, closing: false })).toBe(false);
  });
  it("≥ 85% se la sessione si chiude", () => {
    expect(isCompleted({ position_ms: 850, duration_ms: 1000, closing: true })).toBe(true);
    expect(isCompleted({ position_ms: 849, duration_ms: 1000, closing: true })).toBe(false);
  });
  it("durata sconosciuta o zero → mai", () => {
    expect(isCompleted({ position_ms: 5000, duration_ms: null, closing: true })).toBe(false);
    expect(isCompleted({ position_ms: 5000, duration_ms: 0, closing: false })).toBe(false);
  });
});
```

- [ ] **Step 2: Esegui, deve fallire**

Run: `pnpm test`
Expected: FAIL, modulo `rules` non trovato.

- [ ] **Step 3: Implementa**

`src/lib/scrobble/rules.ts`:

```ts
// Regola di completamento (spec §7.5). Replica esatta di `scrobble_is_completed`
// in supabase/migrations/0006_zconnection.sql: se cambi una, cambia l'altra.

export const COMPLETE_PLAYING = 0.9;
export const COMPLETE_CLOSING = 0.85;

export function isCompleted(input: {
  position_ms: number;
  duration_ms: number | null;
  closing: boolean;
}): boolean {
  const { position_ms, duration_ms, closing } = input;
  if (!duration_ms || duration_ms <= 0) return false;
  const ratio = position_ms / duration_ms;
  return ratio >= (closing ? COMPLETE_CLOSING : COMPLETE_PLAYING);
}
```

- [ ] **Step 4: Esegui, deve passare**

Run: `pnpm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/scrobble/rules.ts src/lib/scrobble/__tests__/rules.test.ts
git commit -m "feat(scrobble): regola di completamento 90%/85%"
```

---

### Task 5: migrazione 0006 — tabelle, RLS, Realtime

**Files:**
- Create: `supabase/migrations/0006_zconnection.sql` (prima parte; le RPC si aggiungono in Task 6 nello stesso file, prima del `db push`)

**Interfaces:**
- Produces: tabelle `devices`, `device_members`, `pairing_codes`, `watch_sessions`, `pending_scrobbles`; enum `device_platform`; `notifications.kind` accetta `scrobble_confirm`.

- [ ] **Step 1: Scrivi la migrazione (parte 1)**

```sql
-- Zapp — migration 0006: ZConnection (dispositivi, abbinamento, sessioni di visione)
-- Spec: docs/superpowers/specs/2026-09-04-zconnection-design.md §6

create type public.device_platform as enum ('fire_tv', 'android_tv', 'android');

-- ============ dispositivi ============
create table public.devices (
  id uuid primary key default gen_random_uuid(),
  install_id uuid not null unique,
  token_hash text not null unique,          -- sha256 hex del token; il token in chiaro non esiste lato server
  name text not null,
  platform public.device_platform not null,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz,
  revoked_at timestamptz
);

create table public.device_members (
  device_id uuid not null references public.devices (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  enabled_providers int[] not null default '{8,119,337,39}',
  paused_until timestamptz,
  created_at timestamptz not null default now(),
  primary key (device_id, user_id)
);
create index device_members_user_idx on public.device_members (user_id);

create table public.pairing_codes (
  code text primary key check (code ~ '^[0-9]{6}$'),
  install_id uuid not null,
  token_hash text not null,
  device_name text not null,
  platform public.device_platform not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  claimed_by uuid references public.profiles (id) on delete set null,
  claimed_at timestamptz
);

-- ============ sessioni di visione ============
create table public.watch_sessions (
  id uuid primary key default gen_random_uuid(),
  device_id uuid not null references public.devices (id) on delete cascade,
  user_id uuid references public.profiles (id) on delete cascade,
  provider_id int not null,
  title_id bigint not null,
  media_type public.media_type not null,
  season_number int,
  episode_number int,
  state text not null check (state in ('playing', 'paused', 'stopped')),
  position_ms bigint not null default 0,
  duration_ms bigint,
  completed boolean not null default false,
  started_at timestamptz not null default now(),
  last_heartbeat_at timestamptz not null default now(),
  ended_at timestamptz,
  foreign key (title_id, media_type) references public.titles (id, media_type)
);
create index watch_sessions_user_live_idx
  on public.watch_sessions (user_id, last_heartbeat_at desc) where ended_at is null;
create index watch_sessions_device_open_idx
  on public.watch_sessions (device_id) where ended_at is null;

create table public.pending_scrobbles (
  id uuid primary key default gen_random_uuid(),
  device_id uuid not null references public.devices (id) on delete cascade,
  user_id uuid references public.profiles (id) on delete cascade,
  reason text not null check (reason in ('ambiguous_title', 'unknown_title', 'ambiguous_user')),
  provider_id int not null,
  raw jsonb not null,
  candidates jsonb not null default '[]',
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);
create unique index pending_scrobbles_open_key_idx
  on public.pending_scrobbles (device_id, provider_id, (raw->>'key'))
  where resolved_at is null;
create index pending_scrobbles_user_idx on public.pending_scrobbles (user_id, created_at desc)
  where resolved_at is null;

-- notifica "sei tu che stai guardando?"
alter table public.notifications drop constraint notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check check (
  kind in ('friend_request', 'friend_accepted', 'recommendation', 'comment', 'scrobble_confirm')
);

-- ============ RLS ============
alter table public.devices enable row level security;
alter table public.device_members enable row level security;
alter table public.pairing_codes enable row level security;
alter table public.watch_sessions enable row level security;
alter table public.pending_scrobbles enable row level security;

create policy "devices_select_member" on public.devices
  for select using (
    exists (select 1 from public.device_members m where m.device_id = id and m.user_id = auth.uid())
  );

create policy "device_members_select_own" on public.device_members
  for select using (user_id = auth.uid());
create policy "device_members_update_own" on public.device_members
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "device_members_delete_own" on public.device_members
  for delete using (user_id = auth.uid());

-- pairing_codes: nessuna policy → solo RPC/route con service definer
-- (le route usano la RPC; il client non legge mai i codici)

create policy "watch_sessions_select_own" on public.watch_sessions
  for select using (
    user_id = auth.uid()
    or (user_id is null and exists (
      select 1 from public.device_members m where m.device_id = device_id and m.user_id = auth.uid()
    ))
  );
create policy "watch_sessions_delete_own" on public.watch_sessions
  for delete using (user_id = auth.uid());

create policy "pending_scrobbles_select" on public.pending_scrobbles
  for select using (
    user_id = auth.uid()
    or (user_id is null and exists (
      select 1 from public.device_members m where m.device_id = device_id and m.user_id = auth.uid()
    ))
  );

-- Realtime sulle sessioni (RLS applicata dal server realtime)
alter publication supabase_realtime add table public.watch_sessions;
```

- [ ] **Step 2: Controlla il nome del vincolo di `notifications.kind`**

Run (Supabase MCP `execute_sql` o psql):

```sql
select conname from pg_constraint where conrelid = 'public.notifications'::regclass and contype = 'c';
```

Expected: `notifications_kind_check`. Se il nome è diverso, usalo nel `drop constraint`.

- [ ] **Step 3: Non fare ancora `db push`** (le RPC del Task 6 vanno nello stesso file). Commit della parte 1:

```bash
git add supabase/migrations/0006_zconnection.sql
git commit -m "feat(db): tabelle ZConnection, RLS e realtime su watch_sessions"
```

---

### Task 6: migrazione 0006 — RPC (`claim_pairing_code`, `device_touch`, `scrobble_apply`, `resolve/dismiss`)

**Files:**
- Modify: `supabase/migrations/0006_zconnection.sql` (append)
- Modify: `src/types/database.ts` (rigenerato)

**Interfaces:**
- Produces (chiamate con `supabase.rpc(...)`):
  - `create_pairing_code(p_install_id uuid, p_token_hash text, p_name text, p_platform device_platform) returns jsonb` → `{code, expires_at}` — `anon`.
  - `pairing_status(p_code text) returns jsonb` → `{status:'pending'}` | `{status:'claimed', device_id, members:[{username, avatar_url}]}` | `{status:'expired'}` — `anon`.
  - `claim_pairing_code(p_code text, p_device_name text) returns jsonb` → `{device_id, name}` — `authenticated`.
  - `device_touch(p_token_hash text) returns jsonb` → `{device_id, active, providers:int[]}` o `{error:'unauthorized'}` — `anon`.
  - `scrobble_apply(p_token_hash text, p_batch jsonb) returns jsonb` → `{applied, ignored, entries_changed:[{title_id, media_type}]}` — `anon`.
  - `resolve_pending_scrobble(p_id uuid, p_title_id bigint, p_media_type media_type, p_season int, p_episode int) returns void`, `dismiss_pending_scrobble(p_id uuid) returns void` — `authenticated`.
  - `scrobble_is_completed(p_position bigint, p_duration bigint, p_closing boolean) returns boolean` — interna.

- [ ] **Step 1: Appendi le RPC alla migrazione**

```sql
-- ============ RPC abbinamento ============

create or replace function public.create_pairing_code(
  p_install_id uuid, p_token_hash text, p_name text, p_platform public.device_platform
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_code text;
  v_expires timestamptz := now() + interval '10 minutes';
begin
  if p_token_hash !~ '^[0-9a-f]{64}$' then raise exception 'token_hash non valido'; end if;
  delete from pairing_codes where expires_at < now() - interval '1 hour';
  loop
    v_code := lpad((floor(random() * 1000000))::int::text, 6, '0');
    exit when not exists (select 1 from pairing_codes where code = v_code);
  end loop;
  insert into pairing_codes (code, install_id, token_hash, device_name, platform, expires_at)
  values (v_code, p_install_id, p_token_hash, left(coalesce(nullif(trim(p_name), ''), 'TV'), 40), p_platform, v_expires);
  return jsonb_build_object('code', v_code, 'expires_at', v_expires);
end $$;

create or replace function public.pairing_status(p_code text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  r pairing_codes;
  v_device_id uuid;
  v_members jsonb;
begin
  select * into r from pairing_codes where code = p_code;
  if not found or r.expires_at < now() then return jsonb_build_object('status', 'expired'); end if;
  if r.claimed_at is null then return jsonb_build_object('status', 'pending'); end if;
  select d.id into v_device_id from devices d where d.install_id = r.install_id;
  select coalesce(jsonb_agg(jsonb_build_object('username', p.username, 'avatar_url', p.avatar_url)), '[]')
    into v_members
  from device_members m join profiles p on p.id = m.user_id
  where m.device_id = v_device_id;
  delete from pairing_codes where code = p_code;   -- consegnato una volta sola
  return jsonb_build_object('status', 'claimed', 'device_id', v_device_id, 'members', v_members);
end $$;

create or replace function public.claim_pairing_code(p_code text, p_device_name text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  r pairing_codes;
  v_device_id uuid;
  v_name text;
begin
  if auth.uid() is null then raise exception 'Non autenticato'; end if;
  select * into r from pairing_codes where code = p_code for update;
  if not found or r.expires_at < now() then raise exception 'Codice scaduto o inesistente'; end if;
  if r.claimed_at is not null then raise exception 'Codice già usato'; end if;
  v_name := left(coalesce(nullif(trim(p_device_name), ''), r.device_name), 40);

  insert into devices (install_id, token_hash, name, platform)
  values (r.install_id, r.token_hash, v_name, r.platform)
  on conflict (install_id) do update
    set token_hash = excluded.token_hash, name = excluded.name, revoked_at = null
  returning id into v_device_id;

  insert into device_members (device_id, user_id) values (v_device_id, auth.uid())
  on conflict (device_id, user_id) do nothing;

  update pairing_codes set claimed_by = auth.uid(), claimed_at = now() where code = p_code;
  return jsonb_build_object('device_id', v_device_id, 'name', v_name);
end $$;

-- ============ RPC ingest ============

create or replace function public.device_touch(p_token_hash text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_device devices;
  v_providers int[];
begin
  select * into v_device from devices where token_hash = p_token_hash and revoked_at is null;
  if not found then return jsonb_build_object('error', 'unauthorized'); end if;
  update devices set last_seen_at = now() where id = v_device.id;
  select coalesce(array_agg(distinct p), '{}') into v_providers
  from device_members m, unnest(m.enabled_providers) p
  where m.device_id = v_device.id and (m.paused_until is null or m.paused_until < now());
  return jsonb_build_object(
    'device_id', v_device.id,
    'active', cardinality(v_providers) > 0,
    'providers', to_jsonb(v_providers)
  );
end $$;

-- Replica esatta di src/lib/scrobble/rules.ts (isCompleted).
create or replace function public.scrobble_is_completed(p_position bigint, p_duration bigint, p_closing boolean)
returns boolean language sql immutable as $$
  select case
    when p_duration is null or p_duration <= 0 then false
    else (p_position::numeric / p_duration) >= (case when p_closing then 0.85 else 0.90 end)
  end
$$;

-- true se (season, episode) è l'ultimo episodio disponibile secondo titles.raw.seasons
-- (stessa logica di src/lib/watch/episodes.ts: stagione 0 esclusa, stagioni future escluse)
create or replace function public.title_is_last_episode(p_title_id bigint, p_season int, p_episode int)
returns boolean language plpgsql stable set search_path = public as $$
declare
  v_last record;
begin
  select (s->>'season_number')::int as season, (s->>'episode_count')::int as episodes into v_last
  from titles t, jsonb_array_elements(t.raw->'seasons') s
  where t.id = p_title_id and t.media_type = 'tv'
    and (s->>'season_number')::int > 0
    and coalesce((s->>'episode_count')::int, 0) > 0
    and (s->>'air_date') is not null
    and (s->>'air_date')::date <= current_date
  order by (s->>'season_number')::int desc
  limit 1;
  if not found then return false; end if;
  return p_season = v_last.season and p_episode >= v_last.episodes;
end $$;

-- Applica il completamento di una sessione a watch_entries / episode_watches.
create or replace function public.scrobble_complete(p_session public.watch_sessions)
returns void language plpgsql security definer set search_path = public as $$
declare
  e watch_entries;
  v_last boolean;
begin
  if p_session.user_id is null then return; end if;
  select * into e from watch_entries
  where user_id = p_session.user_id and title_id = p_session.title_id and media_type = p_session.media_type;

  if p_session.media_type = 'movie' then
    insert into watch_entries (user_id, title_id, media_type, status, started_at, finished_at)
    values (p_session.user_id, p_session.title_id, 'movie', 'watched', p_session.started_at, p_session.last_heartbeat_at)
    on conflict (user_id, title_id, media_type) do update
      set status = 'watched',
          started_at = coalesce(watch_entries.started_at, excluded.started_at),
          finished_at = coalesce(watch_entries.finished_at, excluded.finished_at)
      where watch_entries.status <> 'watched';
    return;
  end if;

  if p_session.season_number is null or p_session.episode_number is null then return; end if;

  insert into episode_watches (user_id, title_id, season_number, episode_number, watched_at)
  values (p_session.user_id, p_session.title_id, p_session.season_number, p_session.episode_number, p_session.last_heartbeat_at)
  on conflict (user_id, title_id, season_number, episode_number) do nothing;

  v_last := title_is_last_episode(p_session.title_id, p_session.season_number, p_session.episode_number);

  insert into watch_entries (user_id, title_id, media_type, status, season_number, episode_number, started_at, finished_at)
  values (p_session.user_id, p_session.title_id, 'tv',
          case when v_last then 'watched' else 'watching' end,
          p_session.season_number, p_session.episode_number,
          p_session.started_at, case when v_last then p_session.last_heartbeat_at else null end)
  on conflict (user_id, title_id, media_type) do update
    set season_number = excluded.season_number,
        episode_number = excluded.episode_number,
        status = case when v_last then 'watched' else
                   case when watch_entries.status = 'watched' then 'watched' else 'watching' end end,
        started_at = coalesce(watch_entries.started_at, excluded.started_at),
        finished_at = case when v_last then coalesce(watch_entries.finished_at, excluded.finished_at) else watch_entries.finished_at end
    -- mai indietro: aggiorna solo se (season, episode) è più avanti
    where (watch_entries.season_number is null
           or (excluded.season_number, excluded.episode_number) > (watch_entries.season_number, watch_entries.episode_number));
end $$;

-- Segna l'inizio della visione su watch_entries (solo stati want/dropped/assente).
create or replace function public.scrobble_start(p_user uuid, p_title_id bigint, p_media public.media_type, p_at timestamptz)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  insert into watch_entries (user_id, title_id, media_type, status, started_at)
  values (p_user, p_title_id, p_media, 'watching', p_at)
  on conflict (user_id, title_id, media_type) do update
    set status = 'watching', started_at = coalesce(watch_entries.started_at, excluded.started_at)
    where watch_entries.status in ('want', 'dropped');
  return found;
end $$;

-- Chiude una sessione applicando la regola di completamento "in chiusura".
create or replace function public.scrobble_close(p_session_id uuid, p_at timestamptz)
returns void language plpgsql security definer set search_path = public as $$
declare s watch_sessions;
begin
  select * into s from watch_sessions where id = p_session_id for update;
  if not found or s.ended_at is not null then return; end if;
  if not s.completed and scrobble_is_completed(s.position_ms, s.duration_ms, true) then
    update watch_sessions set completed = true where id = s.id;
    s.completed := true;
    perform scrobble_complete(s);
  end if;
  update watch_sessions set ended_at = p_at, state = 'stopped' where id = s.id;
end $$;

create or replace function public.scrobble_apply(p_token_hash text, p_batch jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_device devices;
  item jsonb;
  v_at timestamptz;
  v_provider int;
  v_state text;
  v_pos bigint;
  v_dur bigint;
  v_title bigint;
  v_media media_type;
  v_season int;
  v_episode int;
  v_user uuid;
  v_member_count int;
  v_session watch_sessions;
  v_applied int := 0;
  v_ignored int := 0;
  v_changed jsonb := '[]';
  v_is_new boolean;
  v_closing boolean;
  r record;
begin
  select * into v_device from devices where token_hash = p_token_hash and revoked_at is null;
  if not found then raise exception 'unauthorized' using errcode = '28000'; end if;

  -- sessioni orfane del dispositivo (> 4 h senza heartbeat)
  for r in select id from watch_sessions
           where device_id = v_device.id and ended_at is null and last_heartbeat_at < now() - interval '4 hours'
  loop
    perform scrobble_close(r.id, (select last_heartbeat_at from watch_sessions where id = r.id));
  end loop;

  for item in select * from jsonb_array_elements(p_batch) loop
    v_at := (item->>'at')::timestamptz;
    v_provider := (item->>'provider_id')::int;
    v_state := case when item->>'state' = 'buffering' then 'playing' else item->>'state' end;
    v_pos := coalesce((item->>'position_ms')::bigint, 0);
    v_dur := (item->>'duration_ms')::bigint;

    -- membri attivi per questa piattaforma
    select count(*) into v_member_count
    from device_members m
    where m.device_id = v_device.id and v_provider = any(m.enabled_providers)
      and (m.paused_until is null or m.paused_until < now());
    if v_member_count = 0 then v_ignored := v_ignored + 1; continue; end if;

    -- pending (titolo ambiguo/sconosciuto): registra e passa oltre
    if item->'match' is null or item->'match' = 'null'::jsonb then
      if item->'pending' is not null and item->'pending' <> 'null'::jsonb then
        select case when v_member_count = 1 then m.user_id else null end into v_user
        from device_members m
        where m.device_id = v_device.id and v_provider = any(m.enabled_providers)
          and (m.paused_until is null or m.paused_until < now())
        limit 1;
        insert into pending_scrobbles (device_id, user_id, reason, provider_id, raw, candidates)
        values (v_device.id, v_user, item->'pending'->>'reason', v_provider,
                item->'pending'->'raw', coalesce(item->'pending'->'candidates', '[]'))
        on conflict (device_id, provider_id, (raw->>'key')) where resolved_at is null do nothing;
        v_applied := v_applied + 1;
      else
        v_ignored := v_ignored + 1;
      end if;
      continue;
    end if;

    v_title := (item->'match'->>'title_id')::bigint;
    v_media := (item->'match'->>'media_type')::media_type;
    v_season := (item->'match'->>'season')::int;
    v_episode := (item->'match'->>'episode')::int;

    -- attribuzione (spec §7.4)
    if v_member_count = 1 then
      select m.user_id into v_user from device_members m
      where m.device_id = v_device.id and v_provider = any(m.enabled_providers)
        and (m.paused_until is null or m.paused_until < now());
    else
      select m.user_id into v_user
      from device_members m
      left join watch_entries w on w.user_id = m.user_id and w.title_id = v_title and w.media_type = v_media and w.status = 'watching'
      left join lateral (
        select max(last_heartbeat_at) as last_seen from watch_sessions s
        where s.user_id = m.user_id and s.title_id = v_title and s.media_type = v_media
          and s.last_heartbeat_at > now() - interval '30 days'
      ) ws on true
      where m.device_id = v_device.id and v_provider = any(m.enabled_providers)
        and (m.paused_until is null or m.paused_until < now())
        and (w.user_id is not null or ws.last_seen is not null)
      order by greatest(coalesce(w.updated_at, 'epoch'), coalesce(ws.last_seen, 'epoch')) desc
      limit 1;
      if v_user is null then
        insert into pending_scrobbles (device_id, user_id, reason, provider_id, raw, candidates)
        values (v_device.id, null, 'ambiguous_user', v_provider,
                jsonb_build_object('key', v_title || ':' || v_media || ':' || coalesce(v_season::text, '') || ':' || coalesce(v_episode::text, ''),
                                   'title_id', v_title, 'media_type', v_media, 'season', v_season, 'episode', v_episode),
                '[]')
        on conflict (device_id, provider_id, (raw->>'key')) where resolved_at is null do nothing;
        if found then
          insert into notifications (user_id, kind, payload)
          select m.user_id, 'scrobble_confirm', jsonb_build_object('title_id', v_title, 'media_type', v_media, 'season', v_season, 'episode', v_episode)
          from device_members m where m.device_id = v_device.id and v_provider = any(m.enabled_providers);
        end if;
      end if;
    end if;

    -- chiudi altre sessioni aperte del dispositivo (titolo/episodio diverso)
    for r in select id from watch_sessions
             where device_id = v_device.id and ended_at is null
               and ((title_id, media_type) is distinct from (v_title, v_media)
                    or (season_number, episode_number) is distinct from (v_season, v_episode))
    loop
      perform scrobble_close(r.id, v_at);
    end loop;

    -- sessione corrente
    select * into v_session from watch_sessions
    where device_id = v_device.id and ended_at is null and title_id = v_title and media_type = v_media
      and season_number is not distinct from v_season and episode_number is not distinct from v_episode
      and last_heartbeat_at > now() - interval '4 hours'
    for update;
    v_is_new := not found;

    if v_is_new then
      insert into watch_sessions (device_id, user_id, provider_id, title_id, media_type, season_number, episode_number,
                                  state, position_ms, duration_ms, started_at, last_heartbeat_at)
      values (v_device.id, v_user, v_provider, v_title, v_media, v_season, v_episode,
              case when v_state = 'stopped' then 'stopped' else v_state end, v_pos, v_dur, v_at, v_at)
      returning * into v_session;
      if v_user is not null and scrobble_start(v_user, v_title, v_media, v_at) then
        v_changed := v_changed || jsonb_build_object('title_id', v_title, 'media_type', v_media);
      end if;
    else
      if v_at < v_session.last_heartbeat_at then v_ignored := v_ignored + 1; continue; end if;
      update watch_sessions
        set state = v_state, position_ms = v_pos, duration_ms = coalesce(v_dur, duration_ms),
            last_heartbeat_at = v_at, user_id = coalesce(user_id, v_user)
        where id = v_session.id
        returning * into v_session;
    end if;

    -- completamento durante la riproduzione
    v_closing := v_state = 'stopped';
    if not v_session.completed and scrobble_is_completed(v_session.position_ms, v_session.duration_ms, v_closing) then
      update watch_sessions set completed = true where id = v_session.id returning * into v_session;
      perform scrobble_complete(v_session);
      v_changed := v_changed || jsonb_build_object('title_id', v_title, 'media_type', v_media);
    end if;
    if v_closing then
      update watch_sessions set ended_at = v_at where id = v_session.id;
    end if;
    v_applied := v_applied + 1;
  end loop;

  return jsonb_build_object('applied', v_applied, 'ignored', v_ignored, 'entries_changed', v_changed);
end $$;

-- ============ RPC "Da confermare" ============

create or replace function public.resolve_pending_scrobble(
  p_id uuid, p_title_id bigint, p_media_type public.media_type, p_season int, p_episode int
) returns void language plpgsql security definer set search_path = public as $$
declare
  p pending_scrobbles;
  s watch_sessions;
begin
  if auth.uid() is null then raise exception 'Non autenticato'; end if;
  select * into p from pending_scrobbles where id = p_id and resolved_at is null for update;
  if not found then raise exception 'Pending inesistente'; end if;
  if p.user_id is not null and p.user_id <> auth.uid() then raise exception 'Non tua'; end if;
  if p.user_id is null and not exists (
    select 1 from device_members m where m.device_id = p.device_id and m.user_id = auth.uid()
  ) then raise exception 'Non tua'; end if;

  if p.reason = 'ambiguous_user' then
    -- attribuisci la sessione registrata senza utente
    update watch_sessions set user_id = auth.uid()
    where device_id = p.device_id and user_id is null and title_id = p_title_id and media_type = p_media_type
    returning * into s;
    if s.id is not null then
      perform scrobble_start(auth.uid(), p_title_id, p_media_type, s.started_at);
      if s.completed then perform scrobble_complete(s); end if;
    end if;
  else
    insert into watch_sessions (device_id, user_id, provider_id, title_id, media_type, season_number, episode_number,
                                state, position_ms, started_at, last_heartbeat_at, ended_at)
    values (p.device_id, auth.uid(), p.provider_id, p_title_id, p_media_type, p_season, p_episode,
            'stopped', 0, p.created_at, p.created_at, p.created_at);
    perform scrobble_start(auth.uid(), p_title_id, p_media_type, p.created_at);
  end if;

  update pending_scrobbles set resolved_at = now(), user_id = coalesce(user_id, auth.uid()) where id = p_id;
end $$;

create or replace function public.dismiss_pending_scrobble(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Non autenticato'; end if;
  update pending_scrobbles set resolved_at = now()
  where id = p_id and resolved_at is null and (
    user_id = auth.uid()
    or (user_id is null and exists (select 1 from device_members m where m.device_id = device_id and m.user_id = auth.uid()))
  );
end $$;

-- ============ grant ============
revoke all on function public.create_pairing_code(uuid, text, text, public.device_platform) from public;
revoke all on function public.pairing_status(text) from public;
revoke all on function public.device_touch(text) from public;
revoke all on function public.scrobble_apply(text, jsonb) from public;
revoke all on function public.claim_pairing_code(text, text) from public;
revoke all on function public.resolve_pending_scrobble(uuid, bigint, public.media_type, int, int) from public;
revoke all on function public.dismiss_pending_scrobble(uuid) from public;
revoke all on function public.scrobble_complete(public.watch_sessions) from public, anon, authenticated;
revoke all on function public.scrobble_start(uuid, bigint, public.media_type, timestamptz) from public, anon, authenticated;
revoke all on function public.scrobble_close(uuid, timestamptz) from public, anon, authenticated;
revoke all on function public.title_is_last_episode(bigint, int, int) from public, anon, authenticated;

-- le uniche funzioni con grant ad anon: validate dall'hash del token o dal codice
grant execute on function public.create_pairing_code(uuid, text, text, public.device_platform) to anon, authenticated;
grant execute on function public.pairing_status(text) to anon, authenticated;
grant execute on function public.device_touch(text) to anon, authenticated;
grant execute on function public.scrobble_apply(text, jsonb) to anon, authenticated;
grant execute on function public.claim_pairing_code(text, text) to authenticated;
grant execute on function public.resolve_pending_scrobble(uuid, bigint, public.media_type, int, int) to authenticated;
grant execute on function public.dismiss_pending_scrobble(uuid) to authenticated;
```

- [ ] **Step 2: Applica e rigenera i tipi**

Run:

```bash
supabase db push
supabase gen types typescript --project-id bbuhwzdbzxgydewmcdwd > src/types/database.ts
pnpm typecheck
```

Expected: push senza errori; `database.ts` contiene `watch_sessions`, `devices`, `Functions.scrobble_apply`. Se `db push` segnala un errore di sintassi, correggi la migrazione **prima** che venga registrata (in caso sia già registrata a metà, usa `supabase migration repair`).

- [ ] **Step 3: Smoke test SQL (Supabase MCP `execute_sql` o psql)**

```sql
select public.scrobble_is_completed(900, 1000, false), public.scrobble_is_completed(850, 1000, true), public.scrobble_is_completed(100, null, true);
```

Expected: `true, true, false`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0006_zconnection.sql src/types/database.ts
git commit -m "feat(db): RPC abbinamento e scrobble_apply per ZConnection"
```

---

### Task 7: helper token/codice, client anon, middleware pubblico

**Files:**
- Create: `src/lib/scrobble/token.ts`
- Test: `src/lib/scrobble/__tests__/token.test.ts`
- Modify: `src/lib/supabase/server.ts` (aggiungi `createAnonClient`)
- Modify: `src/lib/supabase/middleware.ts:5` (`PUBLIC_PATHS`)

**Interfaces:**
- Produces: `hashToken(token: string): string` (sha256 hex); `isTokenShape(token: string): boolean` (`zc_` + 43 caratteri base64url); `createAnonClient()` in `server.ts` (supabase-js con anon key, senza cookie, `persistSession:false`).

- [ ] **Step 1: Test**

`src/lib/scrobble/__tests__/token.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { hashToken, isTokenShape } from "@/lib/scrobble/token";

describe("token", () => {
  it("sha256 hex stabile", () => {
    expect(hashToken("zc_abc")).toMatch(/^[0-9a-f]{64}$/);
    expect(hashToken("zc_abc")).toBe(hashToken("zc_abc"));
  });
  it("forma del token", () => {
    expect(isTokenShape("zc_" + "A".repeat(43))).toBe(true);
    expect(isTokenShape("zc_short")).toBe(false);
    expect(isTokenShape("xx_" + "A".repeat(43))).toBe(false);
  });
});
```

- [ ] **Step 2: Esegui, deve fallire**

Run: `pnpm test` → FAIL, modulo `token` non trovato.

- [ ] **Step 3: Implementa**

`src/lib/scrobble/token.ts`:

```ts
import { createHash } from "node:crypto";

/** Il server conserva solo questo hash; il token in chiaro vive sulla TV. */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** `zc_` + 32 byte in base64url (43 caratteri senza padding). */
export function isTokenShape(token: string): boolean {
  return /^zc_[A-Za-z0-9_-]{43}$/.test(token);
}
```

Aggiungi in `src/lib/supabase/server.ts`:

```ts
/**
 * Client anonimo senza cookie: per le route chiamate dai dispositivi ZConnection,
 * che si autenticano con il token (validato dalle RPC via hash), non con una sessione.
 */
export function createAnonClient() {
  return createSupabaseClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
```

In `src/lib/supabase/middleware.ts` cambia:

```ts
const PUBLIC_PATHS = ["/login", "/signup", "/auth", "/api/devices", "/api/scrobble"];
```

- [ ] **Step 4: Esegui test e typecheck**

Run: `pnpm test && pnpm typecheck` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/scrobble/token.ts src/lib/scrobble/__tests__/token.test.ts src/lib/supabase/server.ts src/lib/supabase/middleware.ts
git commit -m "feat(scrobble): hash token, client anon e route pubbliche per i dispositivi"
```

---

### Task 8: route di abbinamento

**Files:**
- Create: `src/app/api/devices/pair/route.ts`
- Create: `src/app/api/devices/pair/[code]/route.ts`

**Interfaces:**
- Consumes: RPC `create_pairing_code`, `pairing_status`; `createAnonClient`; `hashToken`; `rateLimit`.
- Produces: `POST /api/devices/pair` body `{install_id, token_hash, name, platform}` → `201 {code, expires_at}`; `GET /api/devices/pair/{code}` → `200 {status:'pending'|'claimed'|'expired', device_id?, members?}`.

- [ ] **Step 1: `POST /api/devices/pair`**

`src/app/api/devices/pair/route.ts`:

```ts
import { NextResponse, type NextRequest } from "next/server";
import { createAnonClient } from "@/lib/supabase/server";
import { rateLimit } from "@/lib/rate-limit";

const PLATFORMS = new Set(["fire_tv", "android_tv", "android"]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** La TV chiede un codice di abbinamento. Il token resta sulla TV: qui arriva solo l'hash. */
export async function POST(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  if (!(await rateLimit(`pair:${ip}`, 20, 60))) {
    return NextResponse.json({ error: "Troppe richieste" }, { status: 429 });
  }

  let body: { install_id?: string; token_hash?: string; name?: string; platform?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON non valido" }, { status: 400 });
  }
  const { install_id, token_hash, name, platform } = body;
  if (
    !install_id ||
    !UUID.test(install_id) ||
    !token_hash ||
    !/^[0-9a-f]{64}$/.test(token_hash) ||
    !platform ||
    !PLATFORMS.has(platform)
  ) {
    return NextResponse.json({ error: "Parametri mancanti" }, { status: 400 });
  }

  const supabase = createAnonClient();
  const { data, error } = await supabase.rpc("create_pairing_code", {
    p_install_id: install_id,
    p_token_hash: token_hash,
    p_name: (name ?? "").slice(0, 40),
    p_platform: platform as "fire_tv" | "android_tv" | "android",
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
```

- [ ] **Step 2: `GET /api/devices/pair/[code]`**

`src/app/api/devices/pair/[code]/route.ts`:

```ts
import { NextResponse } from "next/server";
import { createAnonClient } from "@/lib/supabase/server";
import { rateLimit } from "@/lib/rate-limit";

/** Polling della TV (ogni 3 s) finché l'utente non reclama il codice in Zapp. */
export async function GET(_: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  if (!/^\d{6}$/.test(code)) {
    return NextResponse.json({ error: "Codice non valido" }, { status: 400 });
  }
  if (!(await rateLimit(`pair-status:${code}`, 60, 60))) {
    return NextResponse.json({ error: "Troppe richieste" }, { status: 429 });
  }
  const supabase = createAnonClient();
  const { data, error } = await supabase.rpc("pairing_status", { p_code: code });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
}
```

- [ ] **Step 3: Prova a mano**

Run (dev server avviato con `pnpm dev`):

```bash
curl -s -X POST http://localhost:3000/api/devices/pair -H "content-type: application/json" \
  -d '{"install_id":"11111111-2222-4333-8444-555555555555","token_hash":"'$(printf 'zc_test' | sha256sum | cut -d" " -f1)'","name":"Fire TV test","platform":"fire_tv"}'
curl -s http://localhost:3000/api/devices/pair/000000
```

Expected: `201 {"code":"123456","expires_at":"…"}`; secondo → `{"status":"expired"}` (codice inesistente). Nessun redirect a `/login` (middleware).

- [ ] **Step 4: Commit**

```bash
git add src/app/api/devices
git commit -m "feat(api): route di abbinamento ZConnection (codice e polling)"
```

---

### Task 9: `matchTitle` (server-only) e pipeline in memoria

**Files:**
- Create: `src/lib/scrobble/match.ts`

**Interfaces:**
- Consumes: `searchMulti`, `getSeason` (`@/lib/tmdb/client`), `getOrFetchTitle` (`@/lib/tmdb/cache`), `createServiceClient` **solo per leggere la cache `titles`/`title_providers`** (dati di sistema, consentito), `scoreCandidates`/`decide`, `ParsedMedia`, `MatchResult`.
- Produces: `matchTitle(parsed: ParsedMedia, providerId: number): Promise<MatchResult>` con memo 10 min per `parsed.key`.

- [ ] **Step 1: Implementa**

`src/lib/scrobble/match.ts`:

```ts
import "server-only";

import { createServiceClient } from "@/lib/supabase/server";
import { getOrFetchTitle } from "@/lib/tmdb/cache";
import { getSeason, searchMulti } from "@/lib/tmdb/client";
import { decide, normalizeTitle, scoreCandidates, type RawCandidate } from "./score";
import type { MatchResult, ParsedMedia } from "./types";

const MEMO_TTL_MS = 10 * 60 * 1000;
const memo = new Map<string, { at: number; result: MatchResult }>();

function yearOf(date: string | null | undefined): number | null {
  return date ? Number(date.slice(0, 4)) || null : null;
}

/** Candidati dalla cache locale: titoli con lo stesso nome normalizzato (zero TMDB). */
async function cachedCandidates(parsed: ParsedMedia): Promise<RawCandidate[]> {
  const db = createServiceClient();
  const { data } = await db
    .from("titles")
    .select("id, media_type, title, original_title, release_date, poster_path, title_providers(provider_id, kind)")
    .or(`title.ilike.${parsed.title},original_title.ilike.${parsed.title}`)
    .limit(10);
  return (data ?? []).map((t) => ({
    title_id: t.id,
    media_type: t.media_type,
    title: t.title,
    original_title: t.original_title,
    year: yearOf(t.release_date),
    poster_path: t.poster_path,
    popularity: 1,
    provider_ids: (t.title_providers ?? [])
      .filter((p) => p.kind === "flatrate")
      .map((p) => p.provider_id),
  }));
}

async function tmdbCandidates(parsed: ParsedMedia): Promise<RawCandidate[]> {
  const search = await searchMulti(parsed.title);
  return search.results
    .filter((r) => r.media_type === "movie" || r.media_type === "tv")
    .slice(0, 8)
    .map((r) => ({
      title_id: r.id,
      media_type: r.media_type as "movie" | "tv",
      title: r.media_type === "movie" ? r.title : r.name,
      original_title: (r.media_type === "movie" ? r.original_title : r.original_name) ?? null,
      year: yearOf(r.media_type === "movie" ? r.release_date : r.first_air_date),
      poster_path: r.poster_path ?? null,
      popularity: r.popularity ?? 0,
      provider_ids: [],
    }));
}

/** Numero episodio dal nome, cercando nella stagione (o in tutte se sconosciuta). */
async function resolveEpisode(
  tvId: number,
  season: number | null,
  episodeName: string,
): Promise<{ season: number; episode: number } | null> {
  const wanted = normalizeTitle(episodeName);
  const cached = await getOrFetchTitle(tvId, "tv");
  const raw = cached?.title.raw as { seasons?: { season_number: number }[] } | null;
  const seasons = season != null ? [season] : (raw?.seasons ?? []).map((s) => s.season_number).filter((n) => n > 0);
  for (const n of seasons) {
    try {
      const data = await getSeason(tvId, n);
      const hit = data.episodes.find((e) => normalizeTitle(e.name) === wanted);
      if (hit) return { season: n, episode: hit.episode_number };
    } catch {
      // stagione mancante o TMDB giù: passa alla prossima
    }
  }
  return null;
}

export async function matchTitle(parsed: ParsedMedia, providerId: number): Promise<MatchResult> {
  const hit = memo.get(parsed.key);
  if (hit && Date.now() - hit.at < MEMO_TTL_MS) return hit.result;

  let candidates = scoreCandidates(parsed, providerId, await cachedCandidates(parsed));
  let result = decide(parsed, candidates);
  if (result.kind !== "auto") {
    try {
      const fromTmdb = await tmdbCandidates(parsed);
      const merged = new Map<string, RawCandidate>();
      for (const c of [...(await cachedCandidates(parsed)), ...fromTmdb]) {
        merged.set(`${c.media_type}:${c.title_id}`, { ...merged.get(`${c.media_type}:${c.title_id}`), ...c });
      }
      candidates = scoreCandidates(parsed, providerId, [...merged.values()]);
      result = decide(parsed, candidates);
    } catch {
      // TMDB giù: resta la decisione presa sulla cache (spec §12)
    }
  }

  if (result.kind === "auto") {
    // la FK di watch_sessions richiede il titolo in cache
    const cached = await getOrFetchTitle(result.candidate.title_id, result.candidate.media_type);
    if (!cached) result = { kind: "none" };
    else if (
      result.candidate.media_type === "tv" &&
      result.episode == null &&
      parsed.episodeName
    ) {
      const ep = await resolveEpisode(result.candidate.title_id, parsed.season, parsed.episodeName);
      if (ep) result = { ...result, season: ep.season, episode: ep.episode };
    }
  }

  memo.set(parsed.key, { at: Date.now(), result });
  return result;
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck` → PASS. Se `title_providers(provider_id, kind)` non è tipizzato, usa `select("*, title_providers(*)")`.

- [ ] **Step 3: Commit**

```bash
git add src/lib/scrobble/match.ts
git commit -m "feat(scrobble): matching titolo su cache titles e TMDB, episodio per nome"
```

---

### Task 10: `POST /api/scrobble`

**Files:**
- Create: `src/app/api/scrobble/route.ts`

**Interfaces:**
- Consumes: `hashToken`, `isTokenShape`, `rateLimit`, `createAnonClient`, RPC `device_touch` e `scrobble_apply`, `providerForPackage`, `parseEvent`, `matchTitle`, tipi `ScrobbleEvent`, `ApplyItem`.
- Produces: `POST /api/scrobble` → `200 {ok:true, applied, ignored}`; `401` token; `429` limite; `400` body.

- [ ] **Step 1: Implementa**

`src/app/api/scrobble/route.ts`:

```ts
import { revalidatePath } from "next/cache";
import { NextResponse, type NextRequest } from "next/server";
import { createAnonClient } from "@/lib/supabase/server";
import { rateLimit } from "@/lib/rate-limit";
import { hashToken, isTokenShape } from "@/lib/scrobble/token";
import { providerForPackage } from "@/lib/scrobble/platforms";
import { parseEvent } from "@/lib/scrobble/parse";
import { matchTitle } from "@/lib/scrobble/match";
import type { ApplyItem, ScrobbleEvent } from "@/lib/scrobble/types";

const MAX_BODY = 64 * 1024;
const MAX_EVENTS = 50;
const MAX_STR = 512;
const STATES = new Set(["playing", "paused", "stopped", "buffering"]);

function str(v: unknown): string | null {
  return typeof v === "string" ? v.slice(0, MAX_STR) : null;
}

/** Normalizza e valida un evento grezzo; null se inutilizzabile. */
function toEvent(raw: unknown): ScrobbleEvent | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Record<string, unknown>;
  const at = str(r.at);
  const pkg = str(r.package);
  const state = str(r.state);
  if (!at || Number.isNaN(Date.parse(at)) || !pkg || !state || !STATES.has(state)) return null;
  const meta: ScrobbleEvent["meta"] = {};
  if (typeof r.meta === "object" && r.meta !== null) {
    for (const [k, v] of Object.entries(r.meta as Record<string, unknown>)) meta[k] = str(v);
  }
  const notif = (typeof r.notification === "object" && r.notification) as Record<string, unknown> | false;
  return {
    id: str(r.id) ?? "",
    at,
    package: pkg,
    state: state as ScrobbleEvent["state"],
    position_ms: Math.max(0, Number(r.position_ms) || 0),
    duration_ms: Number(r.duration_ms) > 0 ? Number(r.duration_ms) : null,
    meta,
    notification: notif ? { title: str(notif.title), text: str(notif.text) } : undefined,
  };
}

export async function POST(request: NextRequest) {
  const auth = request.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!isTokenShape(token)) {
    return NextResponse.json({ error: "Token mancante" }, { status: 401 });
  }
  const tokenHash = hashToken(token);

  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > MAX_BODY) return NextResponse.json({ error: "Body troppo grande" }, { status: 413 });

  let body: { events?: unknown[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON non valido" }, { status: 400 });
  }
  const rawEvents = Array.isArray(body.events) ? body.events.slice(0, MAX_EVENTS) : [];
  if (!(await rateLimit(`scrobble:${tokenHash}`, 240, 60))) {
    return NextResponse.json({ error: "Troppi eventi" }, { status: 429 });
  }

  const supabase = createAnonClient();
  const { data: touch, error: touchError } = await supabase.rpc("device_touch", {
    p_token_hash: tokenHash,
  });
  const ctx = touch as { device_id?: string; active?: boolean; providers?: number[]; error?: string } | null;
  if (touchError || !ctx || ctx.error) {
    return NextResponse.json({ error: "Dispositivo sconosciuto o scollegato" }, { status: 401 });
  }
  if (!ctx.active) return NextResponse.json({ ok: true, applied: 0, ignored: rawEvents.length });

  const enabled = new Set(ctx.providers ?? []);
  const batch: ApplyItem[] = [];
  let ignored = 0;

  for (const raw of rawEvents) {
    const event = toEvent(raw);
    const providerId = event ? providerForPackage(event.package) : null;
    if (!event || providerId == null || !enabled.has(providerId)) {
      ignored++;
      continue;
    }
    const parsed = parseEvent(event, providerId);
    if (!parsed) {
      ignored++;
      continue;
    }
    const match = await matchTitle(parsed, providerId);
    const base = {
      at: event.at,
      provider_id: providerId,
      state: event.state,
      position_ms: event.position_ms,
      duration_ms: event.duration_ms,
    };
    if (match.kind === "auto") {
      batch.push({
        ...base,
        match: {
          title_id: match.candidate.title_id,
          media_type: match.candidate.media_type,
          season: match.season,
          episode: match.episode,
        },
        pending: null,
      });
    } else {
      batch.push({
        ...base,
        match: null,
        pending: {
          reason: match.kind === "ambiguous" ? "ambiguous_title" : "unknown_title",
          raw: { ...parsed, provider_id: providerId },
          candidates: match.kind === "ambiguous" ? match.candidates : [],
        },
      });
    }
  }

  if (batch.length === 0) return NextResponse.json({ ok: true, applied: 0, ignored });

  const { data, error } = await supabase.rpc("scrobble_apply", {
    p_token_hash: tokenHash,
    p_batch: batch as unknown as never,
  });
  if (error) {
    const status = error.code === "28000" ? 401 : 500;
    return NextResponse.json({ error: error.message }, { status });
  }
  const result = data as { applied: number; ignored: number; entries_changed: { title_id: number; media_type: string }[] };

  if (result.entries_changed.length > 0) {
    revalidatePath("/");
    revalidatePath("/library");
    revalidatePath("/profile");
    for (const c of result.entries_changed) revalidatePath(`/title/${c.media_type}/${c.title_id}`);
  }
  return NextResponse.json({ ok: true, applied: result.applied, ignored: ignored + result.ignored });
}
```

- [ ] **Step 2: Typecheck e lint**

Run: `pnpm typecheck && pnpm lint` → PASS. Se `p_batch` non accetta l'array, il tipo generato è `Json`: tieni il cast `as unknown as never` oppure `as unknown as Json` importando `Json` da `@/types/database`.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/scrobble/route.ts
git commit -m "feat(api): ingest eventi ZConnection con matching e scrobble_apply"
```

---

### Task 11: script "finta TV" per test end-to-end senza hardware

**Files:**
- Create: `scripts/fake-tv.ts`

**Interfaces:**
- Consumes: le route dei Task 8 e 10.
- Produces: comando `pnpm tsx scripts/fake-tv.ts pair` (stampa codice, attende il claim, salva token in `.fake-tv.json` gitignored) e `pnpm tsx scripts/fake-tv.ts play "Dark" "S2:E4 Il viaggiatore" 1500 3000` (heartbeat con posizione/durata in secondi), `… stop`.

- [ ] **Step 1: Scrivi lo script**

`scripts/fake-tv.ts`:

```ts
/* Finta Fire TV: abbina un dispositivo e manda eventi come farebbe ZConnection.
   Uso:
     pnpm tsx scripts/fake-tv.ts pair
     pnpm tsx scripts/fake-tv.ts play "Dark" "S2:E4 Il viaggiatore" 1500 3000
     pnpm tsx scripts/fake-tv.ts pause "Dark" "S2:E4 Il viaggiatore" 1500 3000
     pnpm tsx scripts/fake-tv.ts stop "Dark" "S2:E4 Il viaggiatore" 2900 3000
   Variabili: ZAPP_URL (default http://localhost:3000), FAKE_PACKAGE (default com.netflix.ninja) */
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const BASE = process.env.ZAPP_URL ?? "http://localhost:3000";
const STATE_FILE = ".fake-tv.json";
const PKG = process.env.FAKE_PACKAGE ?? "com.netflix.ninja";

interface State { install_id: string; token: string }

function load(): State | null {
  return existsSync(STATE_FILE) ? (JSON.parse(readFileSync(STATE_FILE, "utf8")) as State) : null;
}

async function pair() {
  const state: State = {
    install_id: randomUUID(),
    token: "zc_" + randomBytes(32).toString("base64url"),
  };
  const token_hash = createHash("sha256").update(state.token).digest("hex");
  const res = await fetch(`${BASE}/api/devices/pair`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ install_id: state.install_id, token_hash, name: "Finta TV", platform: "fire_tv" }),
  });
  const { code } = (await res.json()) as { code: string };
  console.log(`Codice: ${code}  → inseriscilo in Zapp (Profilo → Dispositivi)`);
  for (;;) {
    await new Promise((r) => setTimeout(r, 3000));
    const s = (await (await fetch(`${BASE}/api/devices/pair/${code}`)).json()) as { status: string; members?: unknown };
    if (s.status === "claimed") {
      writeFileSync(STATE_FILE, JSON.stringify(state));
      console.log("Abbinata:", JSON.stringify(s.members));
      return;
    }
    if (s.status === "expired") throw new Error("Codice scaduto");
    process.stdout.write(".");
  }
}

async function send(state: string, title: string, subtitle: string, posSec: number, durSec: number) {
  const st = load();
  if (!st) throw new Error("Prima: pair");
  const body = {
    install_id: st.install_id,
    sent_at: new Date().toISOString(),
    events: [
      {
        id: randomUUID(),
        at: new Date().toISOString(),
        package: PKG,
        state,
        position_ms: posSec * 1000,
        duration_ms: durSec * 1000,
        meta: { title, subtitle },
      },
    ],
  };
  const res = await fetch(`${BASE}/api/scrobble`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${st.token}` },
    body: JSON.stringify(body),
  });
  console.log(res.status, await res.text());
}

const [cmd, title = "", subtitle = "", pos = "0", dur = "0"] = process.argv.slice(2);
if (cmd === "pair") pair();
else if (cmd === "play" || cmd === "pause" || cmd === "stop") send(cmd === "play" ? "playing" : cmd === "pause" ? "paused" : "stopped", title, subtitle, Number(pos), Number(dur));
else console.log("Comandi: pair | play | pause | stop");
```

Aggiungi `.fake-tv.json` a `.gitignore`.

- [ ] **Step 2: Prova il ciclo (dopo Task 12, che aggiunge la UI per reclamare il codice; in attesa, reclama via SQL)**

Run: `pnpm tsx scripts/fake-tv.ts pair` → stampa il codice. Reclamalo con Supabase MCP `execute_sql` impersonando l'utente **oppure** aspetta il Task 12 e usa `/devices`. Poi:

```bash
pnpm tsx scripts/fake-tv.ts play "Dark" "S2:E4 Il viaggiatore" 100 3000
pnpm tsx scripts/fake-tv.ts play "Dark" "S2:E4 Il viaggiatore" 2800 3000
```

Expected: `200 {"ok":true,"applied":1,"ignored":0}` due volte; in DB una `watch_sessions` per Dark S2E4 con `completed=true` dopo il secondo, `watch_entries` di Dark `watching` con `season_number=2, episode_number=4`, una riga in `episode_watches`.

- [ ] **Step 3: Commit**

```bash
git add scripts/fake-tv.ts .gitignore
git commit -m "chore(scripts): finta TV per testare abbinamento e ingest"
```

---

### Task 12: Server Actions e pagina `/devices`

**Files:**
- Create: `src/lib/devices/queries.ts`
- Create: `src/lib/devices/actions.ts`
- Create: `src/app/(app)/devices/page.tsx`
- Create: `src/app/(app)/devices/DevicesClient.tsx`
- Create: `src/app/(app)/devices/PairForm.tsx`
- Modify: `src/app/(app)/profile/page.tsx:224` (link)

**Interfaces:**
- Produces (`queries.ts`): `getMyDevices(): Promise<DeviceView[]>` con

```ts
export interface DeviceView {
  id: string;
  name: string;
  platform: "fire_tv" | "android_tv" | "android";
  last_seen_at: string | null;
  enabled_providers: number[];
  paused_until: string | null;
  members: { username: string; avatar_url: string | null }[];
}
```

- Produces (`actions.ts`, `"use server"`): `claimPairingCode(code: string, name: string): Promise<DevicesResult>`, `setDeviceProviders(deviceId, providers: number[])`, `pauseDevice(deviceId, hours: 24 | 0)`, `clearDeviceHistory(deviceId)`, `unlinkDevice(deviceId)`; tutte ritornano `{ok: boolean; error?: string}` e `revalidatePath("/devices")` + `"/"`.

- [ ] **Step 1: Query**

`src/lib/devices/queries.ts`:

```ts
import "server-only";

import { createClient } from "@/lib/supabase/server";

export interface DeviceView {
  id: string;
  name: string;
  platform: "fire_tv" | "android_tv" | "android";
  last_seen_at: string | null;
  enabled_providers: number[];
  paused_until: string | null;
  members: { username: string; avatar_url: string | null }[];
}

/** Dispositivi di cui l'utente è membro, con le sue impostazioni e gli altri membri. */
export async function getMyDevices(): Promise<DeviceView[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data: mine } = await supabase
    .from("device_members")
    .select("device_id, enabled_providers, paused_until, device:devices(id, name, platform, last_seen_at, revoked_at)")
    .eq("user_id", user.id);
  if (!mine || mine.length === 0) return [];

  // Fase 1: RLS su device_members espone solo la propria riga, quindi la card mostra
  // solo l'utente corrente. Gli altri membri arrivano in fase 2 con una RPC dedicata.
  const { data: me } = await supabase
    .from("profiles")
    .select("username, avatar_url")
    .eq("id", user.id)
    .single();

  return mine
    .filter((m) => m.device && !m.device.revoked_at)
    .map((m) => ({
      id: m.device!.id,
      name: m.device!.name,
      platform: m.device!.platform,
      last_seen_at: m.device!.last_seen_at,
      enabled_providers: m.enabled_providers,
      paused_until: m.paused_until,
      members: me ? [{ username: me.username, avatar_url: me.avatar_url }] : [],
    }));
}
```

- [ ] **Step 2: Actions**

`src/lib/devices/actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { rateLimit } from "@/lib/rate-limit";
import { SUPPORTED_PROVIDERS } from "@/lib/scrobble/platforms";

export interface DevicesResult {
  ok: boolean;
  error?: string;
}

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Non autenticato");
  return { supabase, user };
}

function refresh() {
  revalidatePath("/devices");
  revalidatePath("/");
}

/** Reclama il codice mostrato dalla TV (rate limit 10/min: i codici sono 6 cifre). */
export async function claimPairingCode(code: string, name: string): Promise<DevicesResult> {
  try {
    const { supabase, user } = await requireUser();
    if (!(await rateLimit(`claim:${user.id}`, 10, 60))) {
      return { ok: false, error: "Troppi tentativi, riprova tra un minuto" };
    }
    const clean = code.replace(/\D/g, "");
    if (clean.length !== 6) return { ok: false, error: "Il codice ha 6 cifre" };
    const { error } = await supabase.rpc("claim_pairing_code", {
      p_code: clean,
      p_device_name: name.trim().slice(0, 40),
    });
    if (error) return { ok: false, error: error.message };
    refresh();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

export async function setDeviceProviders(
  deviceId: string,
  providers: number[],
): Promise<DevicesResult> {
  try {
    const { supabase, user } = await requireUser();
    const allowed = providers.filter((p) => (SUPPORTED_PROVIDERS as readonly number[]).includes(p));
    const { error } = await supabase
      .from("device_members")
      .update({ enabled_providers: allowed })
      .eq("device_id", deviceId)
      .eq("user_id", user.id);
    if (error) return { ok: false, error: error.message };
    refresh();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

/** hours = 24 mette in pausa, 0 riprende. */
export async function pauseDevice(deviceId: string, hours: 24 | 0): Promise<DevicesResult> {
  try {
    const { supabase, user } = await requireUser();
    const until = hours > 0 ? new Date(Date.now() + hours * 3600_000).toISOString() : null;
    const { error } = await supabase
      .from("device_members")
      .update({ paused_until: until })
      .eq("device_id", deviceId)
      .eq("user_id", user.id);
    if (error) return { ok: false, error: error.message };
    refresh();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

/** Elimina le proprie sessioni registrate da questo dispositivo (non le voci di libreria). */
export async function clearDeviceHistory(deviceId: string): Promise<DevicesResult> {
  try {
    const { supabase, user } = await requireUser();
    const { error } = await supabase
      .from("watch_sessions")
      .delete()
      .eq("device_id", deviceId)
      .eq("user_id", user.id);
    if (error) return { ok: false, error: error.message };
    refresh();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

/** Rimuove la propria membership. L'ultimo membro fa revocare il token (trigger in DB, Task 12 step 3). */
export async function unlinkDevice(deviceId: string): Promise<DevicesResult> {
  try {
    const { supabase, user } = await requireUser();
    const { error } = await supabase
      .from("device_members")
      .delete()
      .eq("device_id", deviceId)
      .eq("user_id", user.id);
    if (error) return { ok: false, error: error.message };
    refresh();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}
```

- [ ] **Step 3: Trigger di revoca (nuova migrazione `0007_device_revoke.sql`)**

```sql
-- Zapp — migration 0007: revoca il dispositivo quando esce l'ultimo membro
create or replace function public.revoke_device_when_empty() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from device_members where device_id = old.device_id) then
    update devices set revoked_at = now() where id = old.device_id;
  end if;
  return old;
end $$;

create trigger device_members_revoke_when_empty
  after delete on public.device_members
  for each row execute function public.revoke_device_when_empty();
```

Run: `supabase db push && supabase gen types typescript --project-id bbuhwzdbzxgydewmcdwd > src/types/database.ts`.

- [ ] **Step 4: Pagina e client**

`src/app/(app)/devices/page.tsx`:

```tsx
import { TopBar } from "@/components/layout/TopBar";
import { getMyDevices } from "@/lib/devices/queries";
import { DevicesClient } from "./DevicesClient";
import { PairForm } from "./PairForm";

export const metadata = { title: "Dispositivi" };

export default async function DevicesPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string }>;
}) {
  const [devices, params] = await Promise.all([getMyDevices(), searchParams]);
  return (
    <>
      <TopBar title="Dispositivi" back />
      <main className="px-5 pb-16 md:px-8 lg:px-10">
        <p className="mb-6 max-w-[560px] text-[15px] text-muted">
          Installa <strong className="text-text">ZConnection</strong> sulla tua Fire TV o Android TV,
          inserisci qui il codice che mostra e Zapp saprà da solo cosa stai guardando su Netflix,
          Prime Video, Disney+ e NOW. Nessuna password delle piattaforme: solo titolo ed episodio.
        </p>
        <PairForm initialCode={params.code ?? ""} />
        <DevicesClient devices={devices} />
      </main>
    </>
  );
}
```

Verifica la firma di `TopBar` (`src/components/layout/TopBar.tsx`): se non ha la prop `back`, usa la stessa combinazione della pagina `notifications`.

`src/app/(app)/devices/PairForm.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import { claimPairingCode } from "@/lib/devices/actions";
import { useToast } from "@/components/ui/Toaster";
import { AUTH_FIELD_CLASS } from "@/components/auth/field";

export function PairForm({ initialCode }: { initialCode: string }) {
  const [code, setCode] = useState(initialCode);
  const [name, setName] = useState("");
  const [pending, start] = useTransition();
  const toast = useToast();

  return (
    <form
      className="mb-8 flex max-w-[560px] flex-col gap-3 rounded-[20px] border border-border bg-surface p-4"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const res = await claimPairingCode(code, name);
          if (res.ok) {
            toast.show("TV collegata");
            setCode("");
            setName("");
          } else {
            toast.show(res.error ?? "Errore");
          }
        });
      }}
    >
      <label className="text-[13px] font-medium text-muted">Codice sulla TV</label>
      <input
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9 ]*"
        maxLength={7}
        placeholder="000 000"
        value={code}
        onChange={(e) => setCode(e.target.value)}
        className={`${AUTH_FIELD_CLASS} text-center text-[28px] font-bold tracking-[0.3em]`}
        required
      />
      <input
        placeholder="Nome (es. TV salotto)"
        value={name}
        onChange={(e) => setName(e.target.value)}
        className={AUTH_FIELD_CLASS}
        maxLength={40}
      />
      <button
        type="submit"
        disabled={pending || code.replace(/\D/g, "").length !== 6}
        className="flex h-[54px] items-center justify-center rounded-full bg-accent text-base font-semibold text-white disabled:opacity-50"
      >
        {pending ? "Collego…" : "Collega"}
      </button>
    </form>
  );
}
```

Controlla in `src/components/ui/Toaster.tsx` il nome esatto del metodo del contesto (`show`, `toast`, …) e usa quello.

`src/app/(app)/devices/DevicesClient.tsx`:

```tsx
"use client";

import Image from "next/image";
import { useTransition } from "react";
import { PROVIDERS } from "@/lib/config";
import { SUPPORTED_PROVIDERS } from "@/lib/scrobble/platforms";
import {
  clearDeviceHistory,
  pauseDevice,
  setDeviceProviders,
  unlinkDevice,
} from "@/lib/devices/actions";
import type { DeviceView } from "@/lib/devices/queries";
import { useToast } from "@/components/ui/Toaster";

const PLATFORM_LABEL: Record<DeviceView["platform"], string> = {
  fire_tv: "Fire TV",
  android_tv: "Android TV",
  android: "Android",
};

function lastSeen(iso: string | null): string {
  if (!iso) return "mai attiva";
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (min < 2) return "attiva adesso";
  if (min < 60) return `attiva ${min} min fa`;
  const h = Math.round(min / 60);
  if (h < 48) return `attiva ${h} h fa`;
  return `attiva ${Math.round(h / 24)} giorni fa`;
}

export function DevicesClient({ devices }: { devices: DeviceView[] }) {
  const [pending, start] = useTransition();
  const toast = useToast();

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, okText: string) =>
    start(async () => {
      const res = await fn();
      toast.show(res.ok ? okText : (res.error ?? "Errore"));
    });

  if (devices.length === 0) {
    return <p className="text-[15px] text-muted-2">Nessun dispositivo collegato.</p>;
  }

  return (
    <ul className="flex max-w-[560px] flex-col gap-3">
      {devices.map((d) => {
        const paused = d.paused_until != null && new Date(d.paused_until) > new Date();
        return (
          <li key={d.id} className="rounded-[20px] border border-border bg-surface p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-[17px] font-semibold">{d.name}</h2>
                <p className="text-[13px] text-muted">
                  {PLATFORM_LABEL[d.platform]} · {paused ? "in pausa" : lastSeen(d.last_seen_at)}
                </p>
              </div>
              <div className="flex -space-x-2">
                {d.members.map((m) =>
                  m.avatar_url ? (
                    <Image
                      key={m.username}
                      src={m.avatar_url}
                      alt={m.username}
                      width={28}
                      height={28}
                      className="size-7 rounded-full border border-black"
                    />
                  ) : (
                    <span
                      key={m.username}
                      className="flex size-7 items-center justify-center rounded-full border border-black bg-surface-2 text-xs font-semibold"
                    >
                      {m.username.slice(0, 1).toUpperCase()}
                    </span>
                  ),
                )}
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              {SUPPORTED_PROVIDERS.map((id) => {
                const on = d.enabled_providers.includes(id);
                return (
                  <button
                    key={id}
                    type="button"
                    disabled={pending}
                    aria-pressed={on}
                    onClick={() =>
                      run(
                        () =>
                          setDeviceProviders(
                            d.id,
                            on
                              ? d.enabled_providers.filter((p) => p !== id)
                              : [...d.enabled_providers, id],
                          ),
                        on ? `${PROVIDERS[id].name} disattivata` : `${PROVIDERS[id].name} attivata`,
                      )
                    }
                    className={`h-9 rounded-full px-3.5 text-[13px] font-medium ${
                      on ? "bg-accent text-white" : "bg-surface-2 text-muted"
                    }`}
                  >
                    {PROVIDERS[id].name}
                  </button>
                );
              })}
            </div>

            <div className="mt-4 flex flex-wrap gap-2 text-[13px] font-medium">
              <button
                type="button"
                disabled={pending}
                onClick={() =>
                  run(() => pauseDevice(d.id, paused ? 0 : 24), paused ? "Ripresa" : "In pausa per 24 ore")
                }
                className="h-9 rounded-full bg-surface-2 px-3.5"
              >
                {paused ? "Riprendi" : "Pausa 24 h"}
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() => run(() => clearDeviceHistory(d.id), "Cronologia cancellata")}
                className="h-9 rounded-full bg-surface-2 px-3.5"
              >
                Cancella cronologia
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() => run(() => unlinkDevice(d.id), "Dispositivo scollegato")}
                className="h-9 rounded-full bg-surface-2 px-3.5 text-danger"
              >
                Scollega
              </button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
```

`next.config.ts`: se gli avatar sono su Supabase Storage, il dominio è già consentito per la pagina profilo; altrimenti usa `<img>` con `eslint-disable-next-line @next/next/no-img-element`.

- [ ] **Step 5: Link dal profilo**

In `src/app/(app)/profile/page.tsx`, subito dopo il `<Link href="/import/netflix">…</Link>` (riga ~224-240), aggiungi un separatore e la riga:

```tsx
<div aria-hidden="true" className="h-px bg-border" />
<Link href="/devices" className="flex h-14 items-center justify-between gap-3">
  <span className="flex items-center gap-3">
    <span
      aria-hidden="true"
      className="flex size-[30px] items-center justify-center rounded-lg bg-accent text-white"
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="4" width="20" height="13" rx="2" />
        <path d="M8 21h8M12 17v4" />
      </svg>
    </span>
    <span className="text-[15px] font-medium">Dispositivi collegati</span>
  </span>
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="text-muted-2"><path d="m9 6 6 6-6 6" /></svg>
</Link>
```

(Copia la chevron già usata nella riga "Importa da Netflix" se esiste, per coerenza.)

- [ ] **Step 6: Prova**

Run: `pnpm typecheck && pnpm lint`, poi con `pnpm dev`: Profilo → Dispositivi → `pnpm tsx scripts/fake-tv.ts pair` → inserisci il codice → la card appare; toggle Netflix off → `play` di un titolo Netflix → risposta `applied:0, ignored:1`; toggle on → `applied:1`; Scollega → il successivo `play` risponde `401`.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/0007_device_revoke.sql src/types/database.ts src/lib/devices "src/app/(app)/devices" "src/app/(app)/profile/page.tsx"
git commit -m "feat(devices): pagina Dispositivi, abbinamento e impostazioni per membro"
```

---

### Task 13: hero live in home e Realtime

**Files:**
- Modify: `src/lib/watch/queries.ts` (aggiungi `getNowPlaying`)
- Modify: `src/components/home/HeroWatching.tsx:40-60` (prop `eyebrow`)
- Modify: `src/app/(app)/page.tsx:152-175`
- Create: `src/components/home/LiveRefresh.tsx`

**Interfaces:**
- Produces: `getNowPlaying(): Promise<NowPlaying | null>` con

```ts
export interface NowPlaying {
  session: Tables<"watch_sessions">;
  entry: EntryWithTitle; // costruita dalla sessione: title embed + campi entry se esiste
  providerName: string | null;
  providerLogo: string | null;
  pct: number | null;
}
```

- `HeroWatching` accetta `eyebrow?: string` (default `"Continua a guardare"`).
- `LiveRefresh({ userId }: { userId: string })` client component.

- [ ] **Step 1: `getNowPlaying`**

Aggiungi in `src/lib/watch/queries.ts`:

```ts
import { PROVIDERS, providerLogoUrl } from "@/lib/config";

export interface NowPlaying {
  session: Tables<"watch_sessions">;
  entry: EntryWithTitle;
  providerName: string | null;
  providerLogo: string | null;
  pct: number | null;
}

const LIVE_WINDOW_MS = 6 * 60 * 60 * 1000;

/** Ultima sessione viva del dispositivo (spec §8): hero "Adesso su Netflix". */
export async function getNowPlaying(): Promise<NowPlaying | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const since = new Date(Date.now() - LIVE_WINDOW_MS).toISOString();
  const { data: session } = await supabase
    .from("watch_sessions")
    .select(
      "*, title:titles!watch_sessions_title_id_media_type_fkey(*, title_providers(*), title_provider_links(*))",
    )
    .eq("user_id", user.id)
    .is("ended_at", null)
    .gte("last_heartbeat_at", since)
    .order("last_heartbeat_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!session || !session.title) return null;

  const { data: existing } = await supabase
    .from("watch_entries")
    .select("*")
    .eq("user_id", user.id)
    .eq("title_id", session.title_id)
    .eq("media_type", session.media_type)
    .maybeSingle();

  const { title, ...rest } = session;
  const entry: EntryWithTitle = {
    ...(existing ?? {
      id: session.id,
      user_id: user.id,
      title_id: session.title_id,
      media_type: session.media_type,
      status: "watching",
      rating: null,
      season_number: session.season_number,
      episode_number: session.episode_number,
      is_private: false,
      started_at: session.started_at,
      finished_at: null,
      created_at: session.started_at,
      updated_at: session.last_heartbeat_at,
    }),
    title,
  };
  const logo = title.title_providers.find((p) => p.provider_id === session.provider_id);
  return {
    session: rest,
    entry,
    providerName: PROVIDERS[session.provider_id]?.name ?? logo?.provider_name ?? null,
    providerLogo: providerLogoUrl(logo?.logo_path ?? null),
    pct:
      session.duration_ms && session.duration_ms > 0
        ? Math.min(1, Number(session.position_ms) / Number(session.duration_ms))
        : null,
  };
}
```

- [ ] **Step 2: `eyebrow` nell'hero**

In `HeroWatching.tsx` aggiungi la prop `eyebrow?: string` alla firma e sostituisci il paragrafo fisso:

```tsx
<p className="text-[13px] font-medium text-accent-soft">{eyebrow ?? "Continua a guardare"}</p>
```

- [ ] **Step 3: `LiveRefresh`**

`src/components/home/LiveRefresh.tsx`:

```tsx
"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const THROTTLE_MS = 15_000;

/** Ricarica i Server Components della home quando cambia una sessione di visione (spec §8). */
export function LiveRefresh({ userId }: { userId: string }) {
  const router = useRouter();
  const last = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const supabase = createClient();
    const refresh = () => {
      if (document.visibilityState !== "visible") return;
      const wait = Math.max(0, THROTTLE_MS - (Date.now() - last.current));
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        last.current = Date.now();
        router.refresh();
      }, wait);
    };
    const channel = supabase
      .channel(`watch_sessions:${userId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "watch_sessions", filter: `user_id=eq.${userId}` },
        refresh,
      )
      .subscribe();
    document.addEventListener("visibilitychange", refresh);
    return () => {
      document.removeEventListener("visibilitychange", refresh);
      if (timer.current) clearTimeout(timer.current);
      supabase.removeChannel(channel);
    };
  }, [router, userId]);

  return null;
}
```

- [ ] **Step 4: Home**

In `src/app/(app)/page.tsx`, dentro `HomePage`:

```tsx
const [{ watching, want, watched }, recommendations, nowPlaying, devices] = await Promise.all([
  getHomeData(),
  getHomeRecommendations(),
  getNowPlaying(),
  getMyDevices(),
]);
const empty = watching.length === 0 && want.length === 0 && watched.length === 0 && !nowPlaying;
const hero = nowPlaying?.entry ?? watching[0];
const rest = watching.filter((e) => e.id !== hero?.id);
const wallPosters = hero ? [] : await getWallPosters();
const heroProgress = hero ? progressOf(hero) : null;
const liveLabel =
  nowPlaying &&
  [
    nowPlaying.session.season_number != null && nowPlaying.session.episode_number != null
      ? `S${nowPlaying.session.season_number} E${nowPlaying.session.episode_number}`
      : null,
    nowPlaying.pct != null ? `${Math.round(nowPlaying.pct * 100)}%` : null,
    nowPlaying.session.state === "paused" ? "in pausa" : null,
  ]
    .filter(Boolean)
    .join(" · ");
```

e nel JSX:

```tsx
{hero && (heroProgress || nowPlaying) ? (
  <HeroWatching
    entry={hero}
    info={
      nowPlaying
        ? { ...continueInfo(hero), name: nowPlaying.providerName, logo: nowPlaying.providerLogo }
        : continueInfo(hero)
    }
    eyebrow={nowPlaying ? `Adesso su ${nowPlaying.providerName ?? "TV"}` : undefined}
    progressLabel={nowPlaying ? liveLabel || null : heroProgress!.long}
    progressPct={nowPlaying ? nowPlaying.pct : heroProgress!.pct}
    isSeries={hero.media_type === "tv"}
  />
) : (
  <EmptyHero posters={wallPosters} />
)}
{devices.length > 0 && (
  <Suspense fallback={null}>
    <LiveRefreshForUser />
  </Suspense>
)}
```

dove `LiveRefreshForUser` è un piccolo Server Component in fondo a `page.tsx` che legge l'utente e rende `<LiveRefresh userId={user.id} />`:

```tsx
async function LiveRefreshForUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user ? <LiveRefresh userId={user.id} /> : null;
}
```

Import necessari: `getNowPlaying` da `@/lib/watch/queries`, `getMyDevices` da `@/lib/devices/queries`, `LiveRefresh` da `@/components/home/LiveRefresh`, `createClient` da `@/lib/supabase/server`. Attenzione: `heroProgress` può essere `{short:null,long:null,pct:null}` per i film; il ramo attuale usa `hero && heroProgress` (oggetto sempre truthy), quindi il comportamento per i film resta invariato.

- [ ] **Step 5: Prova end-to-end**

Run: `pnpm dev`; home aperta nel browser; in un altro terminale:

```bash
pnpm tsx scripts/fake-tv.ts play "Dark" "S2:E4 Il viaggiatore" 600 3000
```

Expected: entro ~15 s la home mostra l'hero "Adesso su Netflix", "S2 E4 · 20%", barra al 20%, senza ricaricare. `pause …` → "in pausa". `stop … 2900 3000` → l'hero torna a "Continua a guardare" con `S2 E4` come ultimo episodio visto (dopo il refresh) e `episode_watches` ha la riga.

- [ ] **Step 6: Verifica completa e commit**

Run: `pnpm typecheck && pnpm lint && pnpm test && pnpm build` → tutto verde.

```bash
git add src/lib/watch/queries.ts src/components/home/HeroWatching.tsx src/components/home/LiveRefresh.tsx "src/app/(app)/page.tsx"
git commit -m "feat(home): hero 'Adesso su' dalla sessione live e refresh via Realtime"
```

---

### Task 14: documentazione

**Files:**
- Modify: `CLAUDE.md` (sezione Architecture: nuovo paragrafo "ZConnection / scrobble")
- Modify: `.env.example` (nessuna variabile nuova: annota che l'ingest è same-origin)

- [ ] **Step 1: Paragrafo in CLAUDE.md** (dopo "### Social (phase 4)")

```markdown
### ZConnection (connessione automatica alle piattaforme)

- App Android/Fire TV separata (`D:\PROGETTI\ZConnection`) che legge le MediaSession e manda eventi a `POST /api/scrobble` con `Authorization: Bearer zc_…`. Il DB conserva solo `sha256` del token (`devices.token_hash`). Spec: `docs/superpowers/specs/2026-09-04-zconnection-design.md`.
- Abbinamento: `POST /api/devices/pair` (codice 6 cifre, 10 min) → l'utente lo reclama in `/devices` (`claimPairingCode` → RPC `claim_pairing_code`) → la TV lo scopre con `GET /api/devices/pair/{code}`. Route pubbliche nel middleware, autenticate dal token/codice.
- Pipeline `src/lib/scrobble/`: `platforms.ts` (package → provider), `parse.ts` (metadati → titolo/S/E), `score.ts` + `match.ts` (cache `titles` poi TMDB), `rules.ts` (completamento 90%/85%, replicato in SQL `scrobble_is_completed`). Scritture solo via RPC SECURITY DEFINER `scrobble_apply` (mai service client per dati utente): `watch_sessions` a ogni heartbeat, `watch_entries`/`episode_watches` solo a inizio e completamento, `pending_scrobbles` per titoli ambigui.
- Home: `getNowPlaying()` (sessione viva < 6 h) alimenta l'hero "Adesso su …"; `LiveRefresh` ascolta Realtime su `watch_sessions` e fa `router.refresh()`.
- Test: `pnpm test` (vitest) solo per i moduli puri di `src/lib/scrobble` (che non importano `server-only`). Finta TV: `pnpm tsx scripts/fake-tv.ts pair|play|pause|stop`.
```

- [ ] **Step 2: Aggiorna la riga "No test suite exists"** in CLAUDE.md → "Test unitari solo per `src/lib/scrobble` (`pnpm test`); verifica completa `pnpm typecheck && pnpm lint && pnpm test && pnpm build`."

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md .env.example
git commit -m "docs: ZConnection in CLAUDE.md"
```

---

## Self-review

**Copertura spec:** §4 abbinamento → T6, T8, T12. §5 protocollo → T10 (limiti, 401/429, idempotenza). §6 modello dati e RPC → T5, T6, T12 (trigger revoca). §7.1-7.3 → T1-T3, T9. §7.4 attribuzione → T6 (`scrobble_apply`). §7.5 regole → T4, T6. §8 hero live + Realtime → T13. §9.1 `/devices` → T12. §9.2 "Da confermare" UI → **fase 2, non in questo piano** (le RPC `resolve/dismiss` sono già in T6). §10 app → piano separato dopo lo spike. §11 privacy → T5 RLS, T7 hash, T10 limiti, T12 cancella/scollega. §12 errori → T9 (TMDB giù), T6 (heartbeat fuori ordine), T10 (body). §16 verifica → T1 vitest, T11 finta TV, T13 step 5.

**Semplificazione dichiarata (T12):** i membri mostrati nella card sono solo l'utente corrente: RLS su `device_members` espone solo la propria riga. In fase 2 si aggiunge una RPC `device_members_public(device_id)` per gli altri avatar.

**Coerenza tipi:** `ApplyItem.pending.raw` = `ParsedMedia & {provider_id}` (T2/T10) e `pending_scrobbles.raw->>'key'` (T5/T6) usano `key` di `parseEvent`. `device_touch` restituisce `providers` come array JSON (T6) letto come `number[]` (T10). `scrobble_apply` restituisce `entries_changed` (T6) usato in T10. `HeroWatching.eyebrow` (T13) opzionale.
