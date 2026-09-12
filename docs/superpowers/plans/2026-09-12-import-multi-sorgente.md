# Import multi-sorgente — piano di implementazione

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** far importare Zapp anche da Letterboxd, TV Time e da un file JSON/CSV, riusando la pipeline di riconoscimento e scrittura già costruita per Netflix.

**Architecture:** un nucleo comune in `src/lib/import/` (candidato, matcher, archivio zip) e un parser per sorgente in `src/lib/import/sources/`, tutti con la stessa firma `parse(files) → ParsedSource`. Le tre Server Action diventano generiche e ricevono lo slug della sorgente; le pagine diventano una rotta `[source]` guidata da un registry. I candidati che portano già un `tmdbId` (TV Time, backup Zapp) saltano del tutto la fase di riconoscimento.

**Tech Stack:** Next.js 15 App Router, TypeScript strict, Supabase (RPC `import_watch_entries`), papaparse (già presente), fflate (nuova, solo server), Vitest.

**Spec:** `docs/superpowers/specs/2026-09-12-import-multi-sorgente-design.md`

## Global Constraints

- Commenti del codice **in italiano**, UI in italiano. Prettier: doppi apici, virgole finali, `printWidth` 90.
- Nessuna chiamata TMDB dal client: tutto passa da `src/lib/tmdb/client.ts` (`server-only`).
- I parser sono **funzioni pure senza `server-only`**: sono la parte coperta da Vitest (`src/**/*.test.ts`, ambiente node).
- `src/lib/import/netflix-title.ts` **non si tocca e non si rinomina**: lo importano `lib/charts/resolve.ts`, `lib/cinema/booking/match.ts`, `lib/cinema/booking/webtic.ts`, `lib/scrobble/match.ts`.
- Scala dei voti in Zapp: `smallint` 1-10 (`watch_entries.rating`). Letterboxd 0,5-5 stelle → `× 2`. TV Time 1-5 → `× 2`.
- Stati: `watch_status` enum `('want','watching','watched','dropped')`.
- Tetti: 5 MB per file caricato, 10 MB complessivi sullo zip decompresso.
- Slug delle sorgenti, identici in DB, rotte e registry: `netflix`, `letterboxd`, `tvtime`, `file`.
- Niente librerie UI esterne: le primitive sono in `src/components/ui/`.
- Build di verifica in cartella propria: `NEXT_DIST_DIR=.next-import pnpm build`.

---

## Struttura dei file

**Nucleo (`src/lib/import/`)**

| File | Responsabilità |
| --- | --- |
| `candidate.ts` | `ImportCandidate`, `ImportProposal`, `mergeProposals` (da `netflix-proposals.ts`) |
| `match.ts` | riconoscimento TMDB (da `netflix.ts`), salta i candidati con `tmdbId` |
| `archive.ts` | zip → `SourceFile[]`, con il tetto sul decompresso |
| `sources/registry.ts` | metadati delle quattro sorgenti (slug, marchio, istruzioni, estensioni) |
| `sources/netflix.ts` | parser Netflix (da `netflix-rows.ts`) |
| `sources/letterboxd.ts` | i quattro csv di Letterboxd uniti |
| `sources/tvtime.ts` | csv a colonne riconosciute per nome |
| `sources/generic.ts` | backup Zapp, elenco JSON, csv generico |
| `netflix-title.ts` | invariato |

**Rotte (`src/app/(app)/import/`)**

| File | Responsabilità |
| --- | --- |
| `actions.ts` | `parseImportFiles`, `matchImportCandidates`, `confirmImport` |
| `limits.ts`, `messages.ts` | come oggi, spostati di una cartella |
| `page.tsx` | hub con le quattro schede |
| `[source]/page.tsx` | pagina della sorgente, guidata dal registry |
| `[source]/ImportClient.tsx` | caricamento file (da `netflix/ImportClient.tsx`) |

La cartella `src/app/(app)/import/netflix/` sparisce: `/import/netflix` resta valido come slug della rotta `[source]`.

---

### Task 1: Nucleo riorganizzato, comportamento invariato

Spostamenti puri più tre campi opzionali sul candidato. I test esistenti di Netflix sono la prova che non è cambiato niente.

**Files:**
- Create: `src/lib/import/candidate.ts` (da `netflix-proposals.ts`)
- Create: `src/lib/import/match.ts` (da `netflix.ts`)
- Create: `src/lib/import/sources/netflix.ts` (da `netflix-rows.ts`)
- Delete: `src/lib/import/netflix-proposals.ts`, `netflix.ts`, `netflix-rows.ts`
- Move: `src/lib/import/netflix-rows.test.ts` → `src/lib/import/sources/netflix.test.ts`
- Move: `src/lib/import/netflix-proposals.test.ts` → `src/lib/import/candidate.test.ts`
- Modify: `src/app/(app)/import/netflix/actions.ts`, `src/components/import/ImportProvider.tsx` (soli percorsi di import)

**Interfaces:**
- Consumes: niente.
- Produces: `ImportCandidate` (con `tmdbId?`, `rating?`, `status?`, `year?`), `ImportProposal`, `mergeProposals(proposals)`, `parseNetflixCsvText(text)`, `groupRows(rows)`, `matchCandidates(candidates)`.

- [ ] **Step 1: Spostare i tre moduli con `git mv`, senza toccarne il contenuto**

```bash
cd /d/PROGETTI/Zapp
mkdir -p src/lib/import/sources
git mv src/lib/import/netflix-proposals.ts src/lib/import/candidate.ts
git mv src/lib/import/netflix-proposals.test.ts src/lib/import/candidate.test.ts
git mv src/lib/import/netflix-rows.ts src/lib/import/sources/netflix.ts
git mv src/lib/import/netflix-rows.test.ts src/lib/import/sources/netflix.test.ts
git mv src/lib/import/netflix.ts src/lib/import/match.ts
```

- [ ] **Step 2: Aggiustare i percorsi di import dentro i file spostati**

In `src/lib/import/sources/netflix.ts`: `from "./netflix-title"` → `from "../netflix-title"`.

In `src/lib/import/candidate.ts`: la riga `import type { ImportCandidate } from "./netflix-rows";` sparisce — il tipo si **definisce** qui (Step 3).

In `src/lib/import/match.ts`:

```ts
import {
  MATCH_THRESHOLD,
  pickBestMatch,
  queryVariants,
  resolveEpisodeNumber,
  type BestMatch,
} from "./netflix-title";
import type { ImportCandidate, ImportProposal } from "./candidate";
import { parseNetflixCsvText, groupRows, type NetflixRow } from "./sources/netflix";

export { groupRows, parseNetflixCsvText } from "./sources/netflix";
export type { ImportCandidate, ImportProposal, NetflixRow };
```

In `src/lib/import/sources/netflix.test.ts`: `from "./netflix-rows"` → `from "./netflix"`.
In `src/lib/import/candidate.test.ts`: `from "./netflix-proposals"` → `from "./candidate"`.

- [ ] **Step 3: Spostare `ImportCandidate` in `candidate.ts` e aggiungere i campi nuovi**

Taglia l'interfaccia `ImportCandidate` da `sources/netflix.ts` e incollala in `candidate.ts`, sopra `ImportProposal`, con i quattro campi opzionali:

```ts
export interface ImportCandidate {
  key: string;
  /** Titolo come lo scrive la sorgente (il nome del campo è storico: vale per tutte). */
  netflixTitle: string;
  kind: "movie" | "tv";
  season: number | null;
  episode: number | null;
  lastDate: string | null;
  rowCount: number;
  /** Serie con stagione dal nome proprio: da provare su TMDB prima di `netflixTitle`. */
  altTitle: string | null;
  /** Film "A: B": A, da provare come serie se B non è un film. */
  fallbackShow: string | null;
  /** Nomi degli episodi visti nella stagione più avanzata. Vuoto per i film. */
  episodeTitles: string[];
  /** Già noto (TV Time, backup Zapp): salta del tutto il riconoscimento TMDB. */
  tmdbId?: number | null;
  /** Voto già sulla scala di Zapp (1-10). Non sovrascrive mai quello dell'utente. */
  rating?: number | null;
  /** Default "watched". "want" = watchlist: non è mai stato visto. */
  status?: "watched" | "want";
  /** Anno di uscita dichiarato dalla sorgente: restringe la ricerca TMDB. */
  year?: string | null;
}
```

In `sources/netflix.ts` al suo posto: `import type { ImportCandidate } from "../candidate";` e `export type { ImportCandidate };` per non rompere chi la importa da lì.

- [ ] **Step 4: Aggiornare i due consumatori**

`src/app/(app)/import/netflix/actions.ts` riga 14: `from "@/lib/import/netflix"` → `from "@/lib/import/match"`.

`src/components/import/ImportProvider.tsx` righe 25-26:

```ts
import type { ImportCandidate } from "@/lib/import/candidate";
import { mergeProposals, type ImportProposal } from "@/lib/import/candidate";
```

- [ ] **Step 5: Verificare che niente sia cambiato**

Run: `pnpm exec vitest run src/lib/import && pnpm typecheck`
Expected: tutti i test di Netflix passano (sono gli stessi di prima), `tsc` senza errori.

Se `tsc` segnala altri file che importavano `netflix-rows`/`netflix-proposals`/`netflix`, correggi anche quelli: `grep -rn "netflix-rows\|netflix-proposals\|import/netflix\"" src`.

- [ ] **Step 6: Commit**

```bash
git add -A src/lib/import src/app "src/components/import"
git commit -m "refactor: nucleo import separato dalla sorgente Netflix"
```

---

### Task 2: Migrazione DB — sorgenti nuove e guardia sulla watchlist

**Files:**
- Create: `supabase/migrations/0043_import_sorgenti.sql`

**Interfaces:**
- Consumes: la RPC `public.import_watch_entries(entries jsonb)` come definita in `supabase/migrations/0018_import_progress.sql`.
- Produces: la stessa RPC, che accetta righe con `status = 'want'` senza degradare un titolo già visto; `imports.source` accetta i quattro slug.

- [ ] **Step 1: Scrivere la migrazione**

```sql
-- Import multi-sorgente: Letterboxd, TV Time e file JSON/CSV.
--
-- Due cose. (1) Il registro degli import conosceva solo Netflix.
-- (2) La watchlist arriva come status 'want': la clausola `where` dell'upsert
-- aggiornava **sempre** un film (`media_type = 'movie'`), quindi una riga di
-- watchlist avrebbe riportato a "Da vedere" un film già visto. Il filtro fine
-- resta in `confirmImport` (ha già le righe esistenti in memoria); questa è la
-- rete di sicurezza lato DB.

alter table public.imports drop constraint if exists imports_source_check;
alter table public.imports add constraint imports_source_check
  check (source in ('netflix', 'letterboxd', 'tvtime', 'file'));

create or replace function public.import_watch_entries(entries jsonb)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  entry jsonb;
  written int := 0;
begin
  if auth.uid() is null then
    raise exception 'Non autenticato';
  end if;
  perform set_config('zapp.skip_activities', 'true', true); -- locale alla transazione

  for entry in select * from jsonb_array_elements(entries) loop
    insert into watch_entries (
      user_id, title_id, media_type, status, season_number, episode_number,
      started_at, finished_at, rating, last_watched_at
    ) values (
      auth.uid(),
      (entry ->> 'title_id')::bigint,
      (entry ->> 'media_type')::media_type,
      (entry ->> 'status')::watch_status,
      (entry ->> 'season_number')::int,
      (entry ->> 'episode_number')::int,
      (entry ->> 'started_at')::timestamptz,
      (entry ->> 'finished_at')::timestamptz,
      (entry ->> 'rating')::smallint,
      coalesce((entry ->> 'last_watched_at')::timestamptz, now())
    )
    on conflict (user_id, title_id, media_type) do update set
      status = excluded.status,
      season_number = excluded.season_number,
      episode_number = excluded.episode_number,
      started_at = coalesce(watch_entries.started_at, excluded.started_at),
      finished_at = excluded.finished_at,
      rating = coalesce(watch_entries.rating, excluded.rating),
      last_watched_at = greatest(watch_entries.last_watched_at, excluded.last_watched_at)
    where (watch_entries.media_type = 'movie'
        or coalesce(excluded.season_number, 0) > coalesce(watch_entries.season_number, 0)
        or (coalesce(excluded.season_number, 0) = coalesce(watch_entries.season_number, 0)
            and coalesce(excluded.episode_number, 0) >= coalesce(watch_entries.episode_number, 0)))
      and not (excluded.status = 'want'
               and watch_entries.status in ('watching', 'watched', 'dropped'));
    if found then
      written := written + 1;
    end if;
  end loop;

  return written;
end;
$$;

revoke execute on function public.import_watch_entries(jsonb) from public, anon;
grant execute on function public.import_watch_entries(jsonb) to authenticated;
```

- [ ] **Step 2: Applicare la migrazione**

Run: `supabase db push` (oppure `apply_migration` via MCP Supabase sul progetto `bbuhwzdbzxgydewmcdwd`).
Expected: applicata senza errori.

- [ ] **Step 3: Chiamare davvero la funzione appena applicata**

Una migration applicata con successo non dimostra che la funzione giri: un errore dentro il corpo si vede solo alla chiamata. Con MCP `execute_sql`, o dal SQL editor:

```sql
select public.import_watch_entries('[]'::jsonb);
```

Expected: `0` (nessuna riga da scrivere), **non** un errore di sintassi o di tipo. Se risponde "Non autenticato" stai girando senza sessione: esegui invece `select pg_get_functiondef('public.import_watch_entries(jsonb)'::regprocedure);` e controlla che il corpo contenga la riga `and not (excluded.status = 'want'`.

- [ ] **Step 4: Controllare il vincolo**

```sql
insert into public.imports (user_id, source, rows, matched)
values ('00000000-0000-0000-0000-000000000000', 'letterboxd', 0, 0);
```

Expected: errore di **chiave esterna** su `user_id` (l'utente finto non esiste), non di `check`. Se l'errore nomina `imports_source_check`, il vincolo non è stato sostituito.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0043_import_sorgenti.sql
git commit -m "feat(db): sorgenti di import e guardia sulla watchlist"
```

---

### Task 3: Parser Letterboxd

**Files:**
- Create: `src/lib/import/sources/letterboxd.ts`
- Create: `src/lib/import/sources/letterboxd.test.ts`

**Interfaces:**
- Consumes: `ImportCandidate` da `../candidate`, `normalizeTitle` da `../netflix-title`.
- Produces: `parse(files: SourceFile[]): ParsedSource`, e i tipi condivisi `SourceFile` e `ParsedSource` (definiti qui la prima volta, in `src/lib/import/sources/types.ts`).

- [ ] **Step 1: Definire i tipi condivisi delle sorgenti**

Create `src/lib/import/sources/types.ts`:

```ts
/**
 * Contratto comune delle sorgenti di import: ogni parser riceve i file caricati
 * (già in testo) e restituisce candidati. Funzioni pure, coperte da Vitest.
 */
import type { ImportCandidate } from "../candidate";

export interface SourceFile {
  /** Nome originale: a Letterboxd serve per capire quale csv è. */
  name: string;
  text: string;
}

export interface ParsedSource {
  candidates: ImportCandidate[];
  /** Righe lette dai file, per il registro `imports.rows`. */
  rows: number;
  /** Messaggio pronto per l'utente quando non c'è niente da importare. */
  error?: string;
}
```

- [ ] **Step 2: Scrivere i test che falliscono**

Create `src/lib/import/sources/letterboxd.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { parse } from "./letterboxd";

const watched = `Date,Name,Year,Letterboxd URI
2024-01-02,Parasite,2019,https://boxd.it/a
2024-03-04,Inception,2010,https://boxd.it/b
`;

const ratings = `Date,Name,Year,Letterboxd URI,Rating
2024-01-02,Parasite,2019,https://boxd.it/a,5
2024-03-04,Inception,2010,https://boxd.it/b,3.5
`;

const diary = `Date,Name,Year,Letterboxd URI,Rating,Rewatch,Tags,Watched Date
2024-01-02,Parasite,2019,https://boxd.it/a,5,No,,2023-12-30
`;

const watchlist = `Date,Name,Year,Letterboxd URI
2024-05-06,Dune,2021,https://boxd.it/c
2024-05-06,Parasite,2019,https://boxd.it/a
`;

describe("parse (Letterboxd)", () => {
  it("unisce visti e voti, convertendo le stelle sulla scala 1-10", () => {
    const out = parse([
      { name: "watched.csv", text: watched },
      { name: "ratings.csv", text: ratings },
    ]);
    expect(out.rows).toBe(4);
    const byTitle = new Map(out.candidates.map((c) => [c.netflixTitle, c]));
    expect(byTitle.get("Parasite")).toMatchObject({
      kind: "movie",
      year: "2019",
      rating: 10,
      status: "watched",
      lastDate: "2024-01-02",
    });
    expect(byTitle.get("Inception")?.rating).toBe(7);
  });

  it("la data del diario vince su quella di watched.csv", () => {
    const out = parse([
      { name: "watched.csv", text: watched },
      { name: "diary.csv", text: diary },
    ]);
    const parasite = out.candidates.find((c) => c.netflixTitle === "Parasite");
    expect(parasite?.lastDate).toBe("2023-12-30");
  });

  it("la watchlist entra come 'want', ma non tocca un film già visto", () => {
    const out = parse([
      { name: "watched.csv", text: watched },
      { name: "watchlist.csv", text: watchlist },
    ]);
    const dune = out.candidates.find((c) => c.netflixTitle === "Dune");
    const parasite = out.candidates.find((c) => c.netflixTitle === "Parasite");
    expect(dune).toMatchObject({ status: "want", lastDate: null, kind: "movie" });
    expect(parasite?.status).toBe("watched");
    expect(out.candidates).toHaveLength(3);
  });

  it("dice cosa manca quando nello zip non c'è nessun csv utile", () => {
    const out = parse([{ name: "comments.csv", text: "a,b\n1,2\n" }]);
    expect(out.candidates).toHaveLength(0);
    expect(out.error).toContain("watched.csv");
  });
});
```

- [ ] **Step 3: Eseguire i test e vederli fallire**

Run: `pnpm exec vitest run src/lib/import/sources/letterboxd.test.ts`
Expected: FAIL — "Failed to resolve import ./letterboxd".

- [ ] **Step 4: Scrivere il parser**

Create `src/lib/import/sources/letterboxd.ts`:

```ts
/**
 * Export Letterboxd: quattro csv indipendenti che parlano degli stessi film.
 * `watched` dice cosa, `ratings` con che voto, `diary` quando davvero (la data di
 * `watched` è quella in cui il film è stato segnato, non vista), `watchlist` cosa
 * si vuole vedere. Solo film: Letterboxd non ha serie.
 */

import Papa from "papaparse";
import type { ImportCandidate } from "../candidate";
import { normalizeTitle } from "../netflix-title";
import type { ParsedSource, SourceFile } from "./types";

const MANCANO_I_FILE =
  "Non trovo i file di Letterboxd (watched.csv, ratings.csv, diary.csv, watchlist.csv).";

interface Film {
  name: string;
  year: string | null;
  rating: number | null;
  date: string | null;
  /** Data presa dal diario: non deve essere sovrascritta da `watched.csv`. */
  dateFromDiary: boolean;
  seen: boolean;
}

/** "2024-03-04" o "2024-03-04 12:00" → "2024-03-04"; null se non è una data ISO. */
function isoDate(value: string | undefined): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec((value ?? "").trim());
  return match ? match[0] : null;
}

/** "3.5" → 7; fuori scala o non numerico → null. */
function stars(value: string | undefined): number | null {
  const n = Number.parseFloat((value ?? "").replace(",", "."));
  if (!Number.isFinite(n) || n <= 0 || n > 5) return null;
  return Math.max(1, Math.min(10, Math.round(n * 2)));
}

function rowsOf(text: string): Record<string, string>[] {
  return Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: true,
  }).data;
}

/** Un film vale per titolo + anno: due "Dune" di anni diversi sono due film. */
function keyOf(name: string, year: string | null): string {
  return `${normalizeTitle(name)}|${year ?? ""}`;
}

function fileKind(name: string): "watched" | "ratings" | "diary" | "watchlist" | null {
  const n = name.toLowerCase();
  if (n.includes("watchlist")) return "watchlist";
  if (n.includes("diary")) return "diary";
  if (n.includes("ratings")) return "ratings";
  if (n.includes("watched")) return "watched";
  return null;
}

export function parse(files: SourceFile[]): ParsedSource {
  const films = new Map<string, Film>();
  let rows = 0;
  let letti = 0;

  function upsert(name: string, year: string | null): Film {
    const key = keyOf(name, year);
    let film = films.get(key);
    if (!film) {
      film = { name, year, rating: null, date: null, dateFromDiary: false, seen: false };
      films.set(key, film);
    }
    return film;
  }

  // ordine fisso: il diario arriva per ultimo e ha l'ultima parola sulla data
  const ordine = ["watchlist", "watched", "ratings", "diary"] as const;
  for (const kind of ordine) {
    for (const file of files) {
      if (fileKind(file.name) !== kind) continue;
      letti++;
      for (const row of rowsOf(file.text)) {
        const name = (row.Name ?? row.name ?? "").trim();
        if (!name) continue;
        rows++;
        const year = (row.Year ?? row.year ?? "").trim() || null;
        const film = upsert(name, year);
        if (kind === "watchlist") continue; // solo presenza: resta `seen: false`
        film.seen = true;
        const rating = stars(row.Rating ?? row.rating);
        if (rating != null) film.rating = rating;
        if (kind === "diary") {
          const watched = isoDate(row["Watched Date"] ?? row.Date);
          if (watched) {
            film.date = watched;
            film.dateFromDiary = true;
          }
        } else if (!film.dateFromDiary) {
          film.date = isoDate(row.Date ?? row.date) ?? film.date;
        }
      }
    }
  }

  if (letti === 0) return { candidates: [], rows: 0, error: MANCANO_I_FILE };

  const candidates: ImportCandidate[] = [];
  for (const [key, film] of films) {
    candidates.push({
      key: `movie:${key}`,
      netflixTitle: film.name,
      kind: "movie",
      season: null,
      episode: null,
      lastDate: film.seen ? film.date : null,
      rowCount: 1,
      altTitle: null,
      fallbackShow: null,
      episodeTitles: [],
      year: film.year,
      rating: film.seen ? film.rating : null,
      status: film.seen ? "watched" : "want",
    });
  }
  // più recenti prima, come fa il parser Netflix; la watchlist (senza data) in fondo
  candidates.sort((a, b) => (b.lastDate ?? "").localeCompare(a.lastDate ?? ""));
  return { candidates, rows };
}
```

- [ ] **Step 5: Eseguire i test e vederli passare**

Run: `pnpm exec vitest run src/lib/import/sources/letterboxd.test.ts`
Expected: 4 test PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/import/sources/letterboxd.ts src/lib/import/sources/letterboxd.test.ts src/lib/import/sources/types.ts
git commit -m "feat(import): parser Letterboxd con voti, diario e watchlist"
```

---

### Task 4: Parser TV Time (csv a colonne riconosciute)

Lo stesso parser regge gli export di Trakt e Simkl: le colonne si leggono per nome normalizzato, non per posizione.

**Files:**
- Create: `src/lib/import/sources/tvtime.ts`
- Create: `src/lib/import/sources/tvtime.test.ts`
- Read-only: `public/info/tvtime_export_example.csv` (campione fornito dall'utente, usato come fixture)

**Interfaces:**
- Consumes: `SourceFile`, `ParsedSource` da `./types`; `ImportCandidate` da `../candidate`; `normalizeTitle` da `../netflix-title`.
- Produces: `parse(files: SourceFile[]): ParsedSource` e `parseColumnCsv(text: string): ParsedSource` (riusata da `generic.ts` per il csv generico).

- [ ] **Step 1: Scrivere i test che falliscono**

Create `src/lib/import/sources/tvtime.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parse } from "./tvtime";

const campione = readFileSync("public/info/tvtime_export_example.csv", "utf8");

describe("parse (TV Time)", () => {
  it("legge il campione vero: 6 film, 5 serie, id TMDB riportato", () => {
    const out = parse([{ name: "tvtime.csv", text: campione }]);
    expect(out.rows).toBe(20);
    const movies = out.candidates.filter((c) => c.kind === "movie");
    const shows = out.candidates.filter((c) => c.kind === "tv");
    // 6 film su una riga ciascuno + 5 serie su 14 righe = le 20 righe del campione
    expect(movies).toHaveLength(6);
    expect(shows).toHaveLength(5);
    expect(movies.find((c) => c.netflixTitle === "Parasite")).toMatchObject({
      tmdbId: 496243,
      rating: 10,
      lastDate: "2024-09-01",
      status: "watched",
    });
  });

  it("di una serie tiene l'episodio più avanzato e il voto più alto", () => {
    const out = parse([{ name: "tvtime.csv", text: campione }]);
    const bb = out.candidates.find((c) => c.netflixTitle === "Breaking Bad");
    expect(bb).toMatchObject({
      kind: "tv",
      tmdbId: 1396,
      season: 1,
      episode: 3,
      rating: 10,
      rowCount: 3,
      lastDate: "2024-01-17",
    });
  });

  it("riconosce le colonne anche con nomi e ordine diversi", () => {
    const out = parse([
      {
        name: "trakt.csv",
        text: 'Type,Title,Watched Date,Season,Episode\nepisode,"Dark",2023-05-01,2,4\n',
      },
    ]);
    expect(out.candidates[0]).toMatchObject({
      kind: "tv",
      netflixTitle: "Dark",
      season: 2,
      episode: 4,
      lastDate: "2023-05-01",
      tmdbId: null,
    });
  });

  it("rifiuta un csv senza colonna titolo dicendo cosa serve", () => {
    const out = parse([{ name: "x.csv", text: "a,b\n1,2\n" }]);
    expect(out.candidates).toHaveLength(0);
    expect(out.error).toContain("title");
  });
});
```

- [ ] **Step 2: Eseguire i test e vederli fallire**

Run: `pnpm exec vitest run src/lib/import/sources/tvtime.test.ts`
Expected: FAIL — "Failed to resolve import ./tvtime".

- [ ] **Step 3: Scrivere il parser**

Create `src/lib/import/sources/tvtime.ts`:

```ts
/**
 * CSV a colonne riconosciute per nome: il tracciato dell'export TV Time
 * (`public/info/tvtime_export_example.csv`) e, senza codice in più, quelli di
 * Trakt e Simkl, che cambiano i nomi ma non le informazioni.
 *
 * Le righe con `tmdb_id` saltano del tutto il riconoscimento su TMDB: un export
 * da migliaia di righe diventa istantaneo nella prima fase.
 */

import Papa from "papaparse";
import type { ImportCandidate } from "../candidate";
import { normalizeTitle } from "../netflix-title";
import type { ParsedSource, SourceFile } from "./types";

const COLONNE_ATTESE =
  "Colonne attese: type, title, year, season, episode, watched_date, rating, tmdb_id.";

/** "Watched Date" → "watcheddate": nomi confrontabili fra export diversi. */
function normKey(key: string): string {
  return key.toLowerCase().replace(/[\s_-]+/g, "");
}

/** Primo valore presente fra gli alias, già ripulito. */
function pick(row: Record<string, string>, alias: string[]): string {
  for (const a of alias) {
    const v = row[a];
    if (v != null && String(v).trim() !== "") return String(v).trim();
  }
  return "";
}

const ALIAS = {
  type: ["type", "mediatype", "entitytype", "kind"],
  title: ["title", "showname", "show", "name", "seriestitle", "movietitle"],
  year: ["year", "releaseyear", "firstaired"],
  season: ["season", "seasonnumber", "seasonnum"],
  episode: ["episode", "episodenumber", "episodenum"],
  date: ["watcheddate", "date", "watchedat", "lastwatched", "seendate"],
  rating: ["rating", "score", "vote", "userrating"],
  tmdb: ["tmdbid", "tmdb", "themoviedbid"],
} as const;

function isoDate(value: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  return match ? match[0] : null;
}

/** 1-5 → 2-10; un export già su 10 resta su 10. */
function toRating(value: string): number | null {
  const n = Number.parseFloat(value.replace(",", "."));
  if (!Number.isFinite(n) || n <= 0) return null;
  const scaled = n <= 5 ? n * 2 : n;
  return Math.max(1, Math.min(10, Math.round(scaled)));
}

function isShow(type: string, season: string, episode: string): boolean {
  const t = type.toLowerCase();
  if (t) return /show|serie|tv|episode/.test(t);
  // senza colonna `type`: una riga con stagione o episodio è una serie
  return season !== "" || episode !== "";
}

interface Group {
  title: string;
  kind: "movie" | "tv";
  tmdbId: number | null;
  year: string | null;
  season: number | null;
  episode: number | null;
  rating: number | null;
  lastDate: string | null;
  rowCount: number;
}

export function parseColumnCsv(text: string): ParsedSource {
  const parsed = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: true,
    transformHeader: normKey,
  });
  const groups = new Map<string, Group>();
  let rows = 0;

  for (const row of parsed.data) {
    const title = pick(row, [...ALIAS.title]);
    const tmdbRaw = pick(row, [...ALIAS.tmdb]);
    const tmdbId = /^\d+$/.test(tmdbRaw) ? Number.parseInt(tmdbRaw, 10) : null;
    if (!title && tmdbId == null) continue;
    rows++;

    const seasonRaw = pick(row, [...ALIAS.season]);
    const episodeRaw = pick(row, [...ALIAS.episode]);
    const kind = isShow(pick(row, [...ALIAS.type]), seasonRaw, episodeRaw)
      ? "tv"
      : "movie";
    const year = pick(row, [...ALIAS.year]) || null;
    const season = /^\d+$/.test(seasonRaw) ? Number.parseInt(seasonRaw, 10) : null;
    const episode = /^\d+$/.test(episodeRaw) ? Number.parseInt(episodeRaw, 10) : null;
    const date = isoDate(pick(row, [...ALIAS.date]));
    const rating = toRating(pick(row, [...ALIAS.rating]));

    const key =
      tmdbId != null
        ? `${kind}:${tmdbId}`
        : `${kind}:${normalizeTitle(title)}|${year ?? ""}`;
    const group = groups.get(key);
    if (!group) {
      groups.set(key, {
        title,
        kind,
        tmdbId,
        year,
        season: kind === "tv" ? (season ?? 1) : null,
        episode: kind === "tv" ? (episode ?? 1) : null,
        rating,
        lastDate: date,
        rowCount: 1,
      });
      continue;
    }
    group.rowCount++;
    if (date && (!group.lastDate || date > group.lastDate)) group.lastDate = date;
    if (rating != null) group.rating = Math.max(group.rating ?? 0, rating);
    if (group.kind === "tv") {
      const s = season ?? 1;
      const e = episode ?? 1;
      const avanti =
        s > (group.season ?? 0) || (s === (group.season ?? 0) && e > (group.episode ?? 0));
      if (avanti) {
        group.season = s;
        group.episode = e;
      }
    }
    if (group.tmdbId == null && tmdbId != null) group.tmdbId = tmdbId;
  }

  if (groups.size === 0) {
    return { candidates: [], rows: 0, error: `Nessuna riga leggibile. ${COLONNE_ATTESE}` };
  }

  const candidates: ImportCandidate[] = [];
  for (const [key, g] of groups) {
    candidates.push({
      key,
      netflixTitle: g.title,
      kind: g.kind,
      season: g.season,
      episode: g.episode,
      lastDate: g.lastDate,
      rowCount: g.rowCount,
      altTitle: null,
      fallbackShow: null,
      episodeTitles: [],
      tmdbId: g.tmdbId,
      rating: g.rating,
      status: "watched",
      year: g.year,
    });
  }
  candidates.sort((a, b) => (b.lastDate ?? "").localeCompare(a.lastDate ?? ""));
  return { candidates, rows };
}

export function parse(files: SourceFile[]): ParsedSource {
  const csv = files.filter((f) => !f.name.toLowerCase().endsWith(".json"));
  if (csv.length === 0) {
    return { candidates: [], rows: 0, error: `Nessun csv da leggere. ${COLONNE_ATTESE}` };
  }
  // più file (uno zip): si concatenano i candidati, la fusione la fa `mergeProposals`
  const candidates: ImportCandidate[] = [];
  let rows = 0;
  let error: string | undefined;
  for (const file of csv) {
    const out = parseColumnCsv(file.text);
    candidates.push(...out.candidates);
    rows += out.rows;
    error ??= out.error;
  }
  return candidates.length > 0 ? { candidates, rows } : { candidates: [], rows, error };
}
```

- [ ] **Step 4: Eseguire i test e vederli passare**

Run: `pnpm exec vitest run src/lib/import/sources/tvtime.test.ts`
Expected: 4 test PASS. Se il terzo fallisce sul tipo `episode` con `Type=episode`, controlla che `isShow` guardi la parola `episode`: è il valore che usa Trakt.

- [ ] **Step 5: Commit**

```bash
git add src/lib/import/sources/tvtime.ts src/lib/import/sources/tvtime.test.ts
git commit -m "feat(import): parser TV Time a colonne riconosciute"
```

---

### Task 5: Parser file (backup Zapp, elenco JSON, csv generico)

**Files:**
- Create: `src/lib/import/sources/generic.ts`
- Create: `src/lib/import/sources/generic.test.ts`

**Interfaces:**
- Consumes: `parseColumnCsv` da `./tvtime`, `SourceFile`/`ParsedSource` da `./types`, `normalizeTitle` da `../netflix-title`.
- Produces: `parse(files: SourceFile[]): ParsedSource`.

**Contratto del backup Zapp** (da rispettare quando si costruirà `GET /api/account/export`, spec conformità legale § 5): oggetto JSON con un array `watch_entries`, righe con almeno `title_id`, `media_type`, `status`, `rating`, `season_number`, `episode_number`, `last_watched_at`.

- [ ] **Step 1: Scrivere i test che falliscono**

Create `src/lib/import/sources/generic.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { parse } from "./generic";

const backup = JSON.stringify({
  profilo: { username: "manu" },
  watch_entries: [
    {
      title_id: 1396,
      media_type: "tv",
      status: "watching",
      rating: 9,
      season_number: 4,
      episode_number: 2,
      last_watched_at: "2025-02-03T21:00:00Z",
    },
    {
      title_id: 278,
      media_type: "movie",
      status: "want",
      rating: null,
      season_number: null,
      episode_number: null,
      last_watched_at: null,
    },
  ],
});

describe("parse (file)", () => {
  it("rilegge un backup Zapp senza passare da TMDB", () => {
    const out = parse([{ name: "zapp.json", text: backup }]);
    expect(out.rows).toBe(2);
    expect(out.candidates[0]).toMatchObject({
      tmdbId: 1396,
      kind: "tv",
      season: 4,
      episode: 2,
      rating: 9,
      status: "watched",
      lastDate: "2025-02-03",
    });
    expect(out.candidates[1]).toMatchObject({ tmdbId: 278, status: "want" });
  });

  it("legge un elenco JSON generico di titoli", () => {
    const out = parse([
      {
        name: "miei-film.json",
        text: JSON.stringify([
          { title: "Dune", year: 2021, type: "movie", rating: 4, date: "2024-01-01" },
          { title: "Dark", type: "tv", season: 2, episode: 8 },
        ]),
      },
    ]);
    expect(out.candidates).toHaveLength(2);
    expect(out.candidates.find((c) => c.netflixTitle === "Dune")).toMatchObject({
      kind: "movie",
      year: "2021",
      rating: 8,
      lastDate: "2024-01-01",
    });
    expect(out.candidates.find((c) => c.netflixTitle === "Dark")).toMatchObject({
      kind: "tv",
      season: 2,
      episode: 8,
    });
  });

  it("legge un csv generico con le colonne riconosciute", () => {
    const out = parse([
      { name: "roba.csv", text: "title,type,watched_date\nParasite,movie,2024-09-01\n" },
    ]);
    expect(out.candidates[0]).toMatchObject({
      netflixTitle: "Parasite",
      kind: "movie",
      lastDate: "2024-09-01",
    });
  });

  it("spiega cosa non ha capito quando il JSON non è né un backup né un elenco", () => {
    const out = parse([{ name: "x.json", text: '{"foo":1}' }]);
    expect(out.candidates).toHaveLength(0);
    expect(out.error).toContain("backup Zapp");
  });
});
```

- [ ] **Step 2: Eseguire i test e vederli fallire**

Run: `pnpm exec vitest run src/lib/import/sources/generic.test.ts`
Expected: FAIL — "Failed to resolve import ./generic".

- [ ] **Step 3: Scrivere il parser**

Create `src/lib/import/sources/generic.ts`:

```ts
/**
 * Un file qualunque, riconosciuto dal contenuto e non dall'estensione:
 * 1. backup Zapp (l'export dell'account) → si rilegge per `title_id`, zero TMDB
 * 2. elenco JSON di titoli → come il csv generico, ma in JSON
 * 3. csv a colonne riconosciute → lo stesso parser di TV Time
 * Quando non è nessuno dei tre, l'errore dice cosa cercavamo.
 */

import type { ImportCandidate } from "../candidate";
import { normalizeTitle } from "../netflix-title";
import { parseColumnCsv } from "./tvtime";
import type { ParsedSource, SourceFile } from "./types";

const NON_RICONOSCIUTO =
  "Il file non sembra un backup Zapp né un elenco di titoli. " +
  "Attesi un JSON con watch_entries, oppure voci con un campo title.";

function isoDate(value: unknown): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value ?? "").trim());
  return match ? match[0] : null;
}

function intOf(value: unknown): number | null {
  const n = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(n) ? n : null;
}

/** 1-5 → 2-10; già su 10 resta su 10. */
function ratingOf(value: unknown): number | null {
  const n = Number.parseFloat(String(value ?? "").replace(",", "."));
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.max(1, Math.min(10, Math.round(n <= 5 ? n * 2 : n)));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Backup Zapp: le righe hanno `title_id` e `media_type`. */
function fromBackup(entries: unknown[]): ImportCandidate[] {
  const candidates: ImportCandidate[] = [];
  for (const raw of entries) {
    if (!isRecord(raw)) continue;
    const tmdbId = intOf(raw.title_id);
    const kind = raw.media_type === "tv" ? "tv" : "movie";
    if (tmdbId == null) continue;
    candidates.push({
      key: `${kind}:${tmdbId}`,
      netflixTitle: String(raw.title ?? raw.name ?? `TMDB ${tmdbId}`),
      kind,
      season: kind === "tv" ? (intOf(raw.season_number) ?? 1) : null,
      episode: kind === "tv" ? (intOf(raw.episode_number) ?? 1) : null,
      lastDate: isoDate(raw.last_watched_at ?? raw.finished_at),
      rowCount: 1,
      altTitle: null,
      fallbackShow: null,
      episodeTitles: [],
      tmdbId,
      rating: intOf(raw.rating),
      // "watching"/"dropped" tornano dentro come visti: il progresso decide lo stato
      status: raw.status === "want" ? "want" : "watched",
      year: null,
    });
  }
  return candidates;
}

/** Elenco generico: oggetti con un campo titolo. */
function fromList(items: unknown[]): ImportCandidate[] {
  const candidates: ImportCandidate[] = [];
  for (const raw of items) {
    if (!isRecord(raw)) continue;
    const title = String(raw.title ?? raw.name ?? raw.titolo ?? "").trim();
    if (!title) continue;
    const season = intOf(raw.season ?? raw.season_number);
    const episode = intOf(raw.episode ?? raw.episode_number);
    const declared = String(raw.type ?? raw.media_type ?? raw.kind ?? "").toLowerCase();
    const kind =
      declared !== ""
        ? /show|serie|tv|episode/.test(declared)
          ? "tv"
          : "movie"
        : season != null || episode != null
          ? "tv"
          : "movie";
    const year = raw.year != null ? String(raw.year) : null;
    candidates.push({
      key: `${kind}:${normalizeTitle(title)}|${year ?? ""}`,
      netflixTitle: title,
      kind,
      season: kind === "tv" ? (season ?? 1) : null,
      episode: kind === "tv" ? (episode ?? 1) : null,
      lastDate: isoDate(raw.date ?? raw.watched_date ?? raw.last_watched_at),
      rowCount: 1,
      altTitle: null,
      fallbackShow: null,
      episodeTitles: [],
      tmdbId: intOf(raw.tmdb_id ?? raw.tmdbId),
      rating: ratingOf(raw.rating),
      status: raw.status === "want" ? "want" : "watched",
      year,
    });
  }
  return candidates;
}

function parseOne(file: SourceFile): ParsedSource {
  const text = file.text.trim();
  if (text.startsWith("{") || text.startsWith("[")) {
    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch {
      return { candidates: [], rows: 0, error: "JSON non valido." };
    }
    if (isRecord(data) && Array.isArray(data.watch_entries)) {
      const candidates = fromBackup(data.watch_entries);
      return candidates.length > 0
        ? { candidates, rows: data.watch_entries.length }
        : { candidates: [], rows: 0, error: NON_RICONOSCIUTO };
    }
    const list = Array.isArray(data)
      ? data
      : isRecord(data)
        ? ((data.items ?? data.entries ?? data.titles ?? data.titoli) as unknown)
        : null;
    if (Array.isArray(list)) {
      const candidates = fromList(list);
      return candidates.length > 0
        ? { candidates, rows: list.length }
        : { candidates: [], rows: 0, error: NON_RICONOSCIUTO };
    }
    return { candidates: [], rows: 0, error: NON_RICONOSCIUTO };
  }
  return parseColumnCsv(text);
}

export function parse(files: SourceFile[]): ParsedSource {
  const candidates: ImportCandidate[] = [];
  let rows = 0;
  let error: string | undefined;
  for (const file of files) {
    const out = parseOne(file);
    candidates.push(...out.candidates);
    rows += out.rows;
    error ??= out.error;
  }
  if (candidates.length > 0) return { candidates, rows };
  return { candidates: [], rows, error: error ?? NON_RICONOSCIUTO };
}
```

- [ ] **Step 4: Eseguire i test e vederli passare**

Run: `pnpm exec vitest run src/lib/import/sources/generic.test.ts`
Expected: 4 test PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/import/sources/generic.ts src/lib/import/sources/generic.test.ts
git commit -m "feat(import): file JSON o CSV, backup Zapp compreso"
```

---

### Task 6: Archivio zip

**Files:**
- Create: `src/lib/import/archive.ts`
- Create: `src/lib/import/archive.test.ts`
- Modify: `package.json` (dipendenza `fflate`)

**Interfaces:**
- Consumes: `SourceFile` da `./sources/types`.
- Produces: `unzipSources(data: Uint8Array): SourceFile[]` — lancia `Error` con messaggio pronto per l'utente se il decompresso supera il tetto.

- [ ] **Step 1: Installare fflate**

Run: `pnpm add fflate`
Expected: `package.json` con `"fflate": "^0.8.x"` fra le `dependencies`.

- [ ] **Step 2: Scrivere il test che fallisce**

Create `src/lib/import/archive.test.ts`:

```ts
import { zipSync, strToU8 } from "fflate";
import { describe, expect, it } from "vitest";
import { unzipSources } from "./archive";

describe("unzipSources", () => {
  it("estrae solo csv e json, scartando il resto", () => {
    const zip = zipSync({
      "letterboxd/watched.csv": strToU8("Name,Year\nDune,2021\n"),
      "letterboxd/profile.jpg": strToU8("non un csv"),
      "letterboxd/ratings.csv": strToU8("Name,Rating\nDune,4\n"),
    });
    const files = unzipSources(zip);
    expect(files.map((f) => f.name).sort()).toEqual(["ratings.csv", "watched.csv"]);
    expect(files.find((f) => f.name === "watched.csv")?.text).toContain("Dune");
  });

  it("si ferma quando il decompresso supera il tetto", () => {
    const zip = zipSync({ "grande.csv": strToU8("x".repeat(11 * 1024 * 1024)) });
    expect(() => unzipSources(zip)).toThrow(/troppo grande/i);
  });
});
```

- [ ] **Step 3: Eseguire il test e vederlo fallire**

Run: `pnpm exec vitest run src/lib/import/archive.test.ts`
Expected: FAIL — "Failed to resolve import ./archive".

- [ ] **Step 4: Scrivere il modulo**

Create `src/lib/import/archive.ts`:

```ts
/**
 * Gli export di Letterboxd e TV Time si scaricano zippati. Aprirli qui evita
 * all'utente il passaggio in cui sbaglia file.
 *
 * Il tetto è sul **decompresso**, non sullo zip: uno zip da pochi kB può
 * espandersi in gigabyte, ed è l'unico modo per far male al server da questa
 * pagina. `unzipSync` decomprime tutto in memoria, quindi la somma si controlla
 * subito dopo, prima di decodificare il testo.
 */

import { strFromU8, unzipSync } from "fflate";
import type { SourceFile } from "./sources/types";

/** Somma massima dei file estratti da un archivio. */
export const MAX_UNZIPPED_BYTES = 10 * 1024 * 1024;

const UTILI = /\.(csv|json|txt)$/i;

export function unzipSources(data: Uint8Array): SourceFile[] {
  const entries = unzipSync(data, {
    filter: (file) => UTILI.test(file.name) && !file.name.startsWith("__MACOSX/"),
  });
  let total = 0;
  for (const content of Object.values(entries)) total += content.length;
  if (total > MAX_UNZIPPED_BYTES) {
    throw new Error("Archivio troppo grande una volta aperto (oltre 10MB).");
  }
  return Object.entries(entries).map(([name, content]) => ({
    // il nome dentro lo zip ha il percorso: alle sorgenti serve solo il file
    name: name.split("/").pop() ?? name,
    text: strFromU8(content),
  }));
}
```

- [ ] **Step 5: Eseguire i test e vederli passare**

Run: `pnpm exec vitest run src/lib/import/archive.test.ts`
Expected: 2 test PASS.

- [ ] **Step 6: Commit**

```bash
git add package.json pnpm-lock.yaml src/lib/import/archive.ts src/lib/import/archive.test.ts
git commit -m "feat(import): apertura degli zip di export"
```

---

### Task 7: Registry delle sorgenti

**Files:**
- Create: `src/lib/import/sources/registry.ts`
- Create: `src/lib/import/sources/registry.test.ts`

**Interfaces:**
- Consumes: i quattro moduli `./netflix`, `./letterboxd`, `./tvtime`, `./generic`; `ParsedSource`/`SourceFile` da `./types`.
- Produces: `SOURCE_SLUGS`, `type SourceSlug`, `SOURCES: Record<SourceSlug, SourceMeta>`, `SOURCE_LIST: SourceMeta[]`, `isSourceSlug(v: string): v is SourceSlug`, `parseSource(slug, files): ParsedSource`.

Netflix non espone `parse(files)` (ha `parseNetflixCsvText` + `groupRows`): l'adattatore sta nel registry, non nel parser.

- [ ] **Step 1: Scrivere il test che fallisce**

Create `src/lib/import/sources/registry.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { isSourceSlug, parseSource, SOURCE_LIST, SOURCES } from "./registry";

describe("registry", () => {
  it("elenca le quattro sorgenti con slug coerenti", () => {
    expect(SOURCE_LIST.map((s) => s.slug)).toEqual([
      "netflix",
      "letterboxd",
      "tvtime",
      "file",
    ]);
    for (const meta of SOURCE_LIST) expect(SOURCES[meta.slug]).toBe(meta);
    expect(isSourceSlug("netflix")).toBe(true);
    expect(isSourceSlug("trakt")).toBe(false);
  });

  it("smista al parser giusto: Netflix resta Netflix", () => {
    const out = parseSource("netflix", [
      {
        name: "NetflixViewingHistory.csv",
        text: 'Title,Date\n"Dark: Stagione 1: Segreti","05/12/2023"\n',
      },
    ]);
    expect(out.rows).toBe(1);
    expect(out.candidates[0]).toMatchObject({ kind: "tv", netflixTitle: "Dark" });
  });
});
```

- [ ] **Step 2: Eseguire il test e vederlo fallire**

Run: `pnpm exec vitest run src/lib/import/sources/registry.test.ts`
Expected: FAIL — "Failed to resolve import ./registry".

- [ ] **Step 3: Scrivere il registry**

Create `src/lib/import/sources/registry.ts`:

```ts
/**
 * Le sorgenti di import in un posto solo: slug (che è anche il valore in
 * `imports.source` e il segmento di rotta), marchio, istruzioni e parser.
 * Aggiungere una sorgente domani è una voce qui più un file accanto.
 */

import * as generic from "./generic";
import * as letterboxd from "./letterboxd";
import { groupRows, parseNetflixCsvText } from "./netflix";
import * as tvtime from "./tvtime";
import type { ParsedSource, SourceFile } from "./types";

export const SOURCE_SLUGS = ["netflix", "letterboxd", "tvtime", "file"] as const;
export type SourceSlug = (typeof SOURCE_SLUGS)[number];

export interface SourceMeta {
  slug: SourceSlug;
  /** Nome della piattaforma, per le schede dell'hub. */
  nome: string;
  /** Titolo della pagina e della scheda. */
  titolo: string;
  /** Una riga sotto il nome nell'hub. */
  descrizione: string;
  /** Iniziale o simbolo nel quadrato colorato. */
  sigla: string;
  /** Colore del quadrato (marchio della piattaforma). */
  colore: string;
  /** Estensioni accettate dall'input file. */
  accetta: string;
  /** Più file insieme (Letterboxd ne ha quattro). */
  multiplo: boolean;
  /** Passi numerati nel riquadro istruzioni. */
  istruzioni: string[];
  /** Testo del bottone. */
  bottone: string;
  /** File di esempio scaricabile, servito da `public/`. */
  esempio?: string;
}

const META: Record<SourceSlug, SourceMeta> = {
  netflix: {
    slug: "netflix",
    nome: "Netflix",
    titolo: "Importa da Netflix",
    descrizione: "La cronologia di visione.",
    sigla: "N",
    colore: "#E50914",
    accetta: ".csv,text/csv",
    multiplo: false,
    istruzioni: [
      "Netflix → Account → Profilo → Attività di visione",
      'In fondo, "Scarica tutto"',
      "Carica qui il file NetflixViewingHistory.csv",
    ],
    bottone: "Scegli il file CSV",
  },
  letterboxd: {
    slug: "letterboxd",
    nome: "Letterboxd",
    titolo: "Importa da Letterboxd",
    descrizione: "Film visti, voti e watchlist.",
    sigla: "L",
    colore: "#00E054",
    accetta: ".csv,.zip,text/csv,application/zip",
    multiplo: true,
    istruzioni: [
      "Letterboxd → Settings → Data → Export your data",
      "Arriva uno zip: caricalo così com'è",
      "Oppure apri lo zip e trascina qui watched.csv, ratings.csv, diary.csv, watchlist.csv",
    ],
    bottone: "Scegli lo zip o i CSV",
  },
  tvtime: {
    slug: "tvtime",
    nome: "TV Time",
    titolo: "Importa da TV Time",
    descrizione: "Serie e film visti, con i voti.",
    sigla: "T",
    colore: "#FBBC05",
    accetta: ".csv,.zip,text/csv,application/zip",
    multiplo: true,
    istruzioni: [
      "TV Time → Impostazioni → Privacy → Scarica i tuoi dati",
      "L'export arriva per email, di solito entro un giorno",
      "Carica qui lo zip o il csv che trovi dentro",
    ],
    bottone: "Scegli lo zip o il CSV",
  },
  file: {
    slug: "file",
    nome: "File",
    titolo: "Importa da un file",
    descrizione: "Backup di Zapp, JSON o CSV.",
    sigla: "{ }",
    colore: "#8B5CF6",
    accetta: ".json,.csv,.zip,application/json,text/csv,application/zip",
    multiplo: true,
    istruzioni: [
      "Il backup scaricato da Zapp (Profilo → Esporta i tuoi dati)",
      "Oppure un JSON con voci {title, year, type, season, episode, rating, date}",
      "Oppure un CSV con le colonne title, type, season, episode, watched_date, rating",
    ],
    bottone: "Scegli il file",
    esempio: "/info/tvtime_export_example.csv",
  },
};

export const SOURCES = META;
export const SOURCE_LIST: SourceMeta[] = SOURCE_SLUGS.map((slug) => META[slug]);

export function isSourceSlug(value: string): value is SourceSlug {
  return (SOURCE_SLUGS as readonly string[]).includes(value);
}

/** Netflix non ha una `parse(files)`: l'adattatore sta qui, non nel parser. */
function parseNetflix(files: SourceFile[]): ParsedSource {
  const rows = files.flatMap((file) => parseNetflixCsvText(file.text));
  if (rows.length === 0) return { candidates: [], rows: 0 };
  return { candidates: groupRows(rows), rows: rows.length };
}

export function parseSource(slug: SourceSlug, files: SourceFile[]): ParsedSource {
  switch (slug) {
    case "netflix":
      return parseNetflix(files);
    case "letterboxd":
      return letterboxd.parse(files);
    case "tvtime":
      return tvtime.parse(files);
    case "file":
      return generic.parse(files);
  }
}
```

- [ ] **Step 4: Eseguire il test e vederlo passare**

Run: `pnpm exec vitest run src/lib/import/sources/registry.test.ts`
Expected: 2 test PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/import/sources/registry.ts src/lib/import/sources/registry.test.ts
git commit -m "feat(import): registry delle sorgenti"
```

---

### Task 8: Server Action generiche

**Files:**
- Move: `src/app/(app)/import/netflix/actions.ts` → `src/app/(app)/import/actions.ts`
- Move: `src/app/(app)/import/netflix/limits.ts` → `src/app/(app)/import/limits.ts`
- Move: `src/app/(app)/import/netflix/messages.ts` → `src/app/(app)/import/messages.ts`
- Modify: `src/components/import/ImportProvider.tsx`
- Modify: `src/lib/import/match.ts`

**Interfaces:**
- Consumes: `parseSource`, `SOURCES`, `isSourceSlug`, `SourceSlug` dal registry; `unzipSources` da `@/lib/import/archive`; `matchCandidates` da `@/lib/import/match`.
- Produces:
  - `parseImportFiles(formData: FormData): Promise<ParseResult>` — `formData` con `source` (slug) e uno o più `file`.
  - `matchImportCandidates(candidates: ImportCandidate[]): Promise<MatchResult>`
  - `confirmImport(items: ConfirmItem[], final: ConfirmFinal | null): Promise<ConfirmResult>`
  - `interface ConfirmItem { tmdbId; kind; season; episode; lastDate; rating: number | null; status: "watched" | "want" }`
  - `interface ConfirmFinal { totalRows: number; writtenBefore: number; source: SourceSlug }`

- [ ] **Step 1: Spostare i tre file di una cartella**

```bash
cd /d/PROGETTI/Zapp
git mv "src/app/(app)/import/netflix/actions.ts" "src/app/(app)/import/actions.ts"
git mv "src/app/(app)/import/netflix/limits.ts" "src/app/(app)/import/limits.ts"
git mv "src/app/(app)/import/netflix/messages.ts" "src/app/(app)/import/messages.ts"
```

In `messages.ts`, il messaggio diventa generico:

```ts
export const CSV_INVALID_MESSAGE = "File vuoto o formato non riconosciuto.";
```

- [ ] **Step 2: `match.ts` salta i candidati che hanno già l'id TMDB**

In `src/lib/import/match.ts`, in cima a `matchOne`:

```ts
async function matchOne(candidate: ImportCandidate): Promise<ImportProposal> {
  // TV Time e backup Zapp portano l'id: niente da riconoscere, si scrive e basta
  if (candidate.tmdbId != null) {
    return {
      ...candidate,
      tmdbId: candidate.tmdbId,
      matchedTitle: candidate.netflixTitle,
      posterPath: null,
      year: candidate.year ?? null,
      exact: true,
      viaFallback: false,
    };
  }
  if (candidate.kind === "tv") {
```

Nota sui tipi: `ImportProposal.year` è `string | null` e `ImportCandidate.year` è `string | null | undefined`; `?? null` chiude il buco.

- [ ] **Step 3: L'anno dichiarato dalla sorgente restringe la ricerca TMDB**

Letterboxd dà l'anno di ogni film; Netflix no. Con l'anno, "Dune" del 2021 non finisce in quello del 1984. `findBest` prende un filtro opzionale che **preferisce** senza escludere: se nessun risultato dell'anno giusto supera la soglia, si ricade su tutti (l'anno di uscita TMDB può differire di uno da quello di Letterboxd, che usa quello di produzione).

In `src/lib/import/match.ts`:

```ts
async function findBest<T>(
  names: string[],
  search: (query: string) => Promise<{ results: T[] }>,
  namesOf: (r: T) => (string | null | undefined)[],
  threshold = MATCH_THRESHOLD,
  /** Risultati da provare per primi (stesso anno): non esclude gli altri. */
  prefer?: (result: T) => boolean,
): Promise<BestMatch<Scored<T>> | null> {
  const cache = new Map<string, T[]>();
  for (const name of names) {
    for (const query of queryVariants(name)) {
      let results = cache.get(query);
      if (!results) {
        results = (await search(query)).results;
        cache.set(query, results);
      }
      const scored = results.map((result) => ({ names: namesOf(result), result }));
      const preferiti = prefer ? scored.filter((s) => prefer(s.result)) : [];
      const best =
        (preferiti.length > 0 ? pickBestMatch(name, preferiti, threshold) : null) ??
        pickBestMatch(name, scored, threshold);
      if (best) return best;
    }
  }
  return null;
}
```

e nel ramo film di `matchOne`:

```ts
const anno = candidate.year;
const movie = await findBest(
  [candidate.netflixTitle],
  searchMovies,
  movieNames,
  MATCH_THRESHOLD,
  anno ? (m) => (m.release_date ?? "").startsWith(anno) : undefined,
);
```

- [ ] **Step 4: Riscrivere `parseImportFiles`**

In `src/app/(app)/import/actions.ts`, sostituisci `parseNetflixCsv` (resta tutto il resto del file: rate limit, `prendiPosto`, tetti):

```ts
import { unzipSources } from "@/lib/import/archive";
import {
  isSourceSlug,
  parseSource,
  type SourceSlug,
} from "@/lib/import/sources/registry";
import type { SourceFile } from "@/lib/import/sources/types";

export interface ParseResult {
  ok: boolean;
  error?: string;
  candidates: ImportCandidate[];
  totalRows: number;
}

/**
 * Parsing in memoria: nessun file viene salvato né loggato. Gli zip si aprono
 * qui (`unzipSources`), i csv/json si leggono come testo; poi tutto passa al
 * parser della sorgente.
 */
export async function parseImportFiles(formData: FormData): Promise<ParseResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Non autenticato", candidates: [], totalRows: 0 };

  const slugRaw = String(formData.get("source") ?? "");
  if (!isSourceSlug(slugRaw)) {
    return { ok: false, error: "Sorgente sconosciuta", candidates: [], totalRows: 0 };
  }
  const slug: SourceSlug = slugRaw;

  // Un import intero e' gia' centinaia di chiamate TMDB: senza tetto orario
  // bastava rilanciarlo in continuazione per bruciare la quota condivisa.
  if (!(await rateLimit(`import:parse:${user.id}`, 20, 3600, { condiviso: true }))) {
    return {
      ok: false,
      error: "Troppi import ravvicinati, riprova piu' tardi",
      candidates: [],
      totalRows: 0,
    };
  }
  if (!(await prendiPosto("import", user.id, POSTI_IMPORT, TTL_IMPORT_S))) {
    return {
      ok: false,
      error: "Ci sono gia' tre import in corso, riprova fra qualche minuto",
      candidates: [],
      totalRows: 0,
    };
  }

  const uploaded = formData.getAll("file").filter((f): f is File => f instanceof File);
  if (uploaded.length === 0) {
    return { ok: false, error: "Nessun file", candidates: [], totalRows: 0 };
  }
  if (uploaded.some((f) => f.size > MAX_FILE_BYTES)) {
    return { ok: false, error: "File oltre 5MB", candidates: [], totalRows: 0 };
  }

  const files: SourceFile[] = [];
  for (const file of uploaded) {
    if (file.name.toLowerCase().endsWith(".zip")) {
      try {
        files.push(...unzipSources(new Uint8Array(await file.arrayBuffer())));
      } catch (e) {
        const error = e instanceof Error ? e.message : "Archivio illeggibile.";
        return { ok: false, error, candidates: [], totalRows: 0 };
      }
    } else {
      files.push({ name: file.name, text: await file.text() });
    }
  }

  const parsed = parseSource(slug, files);
  if (parsed.candidates.length === 0) {
    return {
      ok: false,
      error: parsed.error ?? CSV_INVALID_MESSAGE,
      candidates: [],
      totalRows: 0,
    };
  }
  return { ok: true, candidates: parsed.candidates, totalRows: parsed.rows };
}
```

Il posto preso da `prendiPosto` va restituito anche quando il parsing fallisce: aggiungi `await lasciaPosto("import", user.id);` prima di ogni `return { ok: false, … }` **successivo** a `prendiPosto` (errore su file, zip, parsing). Senza, tre file sbagliati di fila bloccano l'import per mezz'ora.

- [ ] **Step 5: Rinominare le altre due azioni e passare voto e stato**

`matchNetflixCandidates` → `matchImportCandidates` (corpo invariato).

In `confirmNetflixImport` → `confirmImport`:

```ts
export interface ConfirmItem {
  tmdbId: number;
  kind: "movie" | "tv";
  season: number | null;
  episode: number | null;
  lastDate: string | null;
  /** Voto della sorgente sulla scala di Zapp (1-10), o null. */
  rating: number | null;
  /** "want" = watchlist: si scrive solo se il titolo non è già in libreria. */
  status: "watched" | "want";
}

export interface ConfirmFinal {
  totalRows: number;
  writtenBefore: number;
  source: SourceSlug;
}
```

Nel ciclo che riempie `toFetch`, la watchlist si ferma davanti a qualsiasi riga esistente:

```ts
for (const item of items) {
  const existing = existingMap.get(`${item.kind}:${item.tmdbId}`);
  // la watchlist non torna mai sopra a qualcosa che è già in libreria
  if (item.status === "want" && existing) {
    skipped++;
    continue;
  }
  if (item.status !== "want" && existing && !hasNewProgress(existing, item)) {
    skipped++;
    continue;
  }
  toFetch.push(item);
}
```

Nella costruzione delle righe RPC, il voto arriva dalla sorgente ma non scalza quello dell'utente (`coalesce` nella RPC) e la watchlist ha una riga tutta sua:

```ts
if (item.status === "want") {
  rpcEntries.push({
    title_id: item.tmdbId,
    media_type: item.kind,
    status: "want",
    season_number: null,
    episode_number: null,
    started_at: null,
    finished_at: null,
    rating: item.rating,
    last_watched_at: null,
  });
  return;
}
```

e nei due rami esistenti `rating: existing?.rating ?? item.rating`.

Il tipo `RpcEntry.status` diventa `"watched" | "watching" | "want"`.

Infine la riga di registro usa la sorgente vera:

```ts
await supabase.from("imports").insert({
  user_id: user.id,
  source: final.source,
  rows: final.totalRows,
  matched: final.writtenBefore + written,
});
```

- [ ] **Step 6: Aggiornare `ImportProvider`**

In `src/components/import/ImportProvider.tsx`:

```ts
import {
  confirmImport,
  matchImportCandidates,
  type ConfirmItem,
} from "@/app/(app)/import/actions";
import {
  CONFIRM_CHUNK_SIZE,
  MATCH_CHUNK_SIZE,
  MATCH_CONCURRENCY,
} from "@/app/(app)/import/limits";
import type { SourceSlug } from "@/lib/import/sources/registry";
```

`startImport` prende la sorgente e separa i candidati che non hanno bisogno di TMDB:

```ts
startImport: (
  candidates: ImportCandidate[],
  totalRows: number,
  source: SourceSlug,
) => void;
```

Dentro, prima della fase 1:

```ts
// chi porta già l'id TMDB salta il riconoscimento: nessuna chiamata, nessun
// giro di rete. Un export TV Time da migliaia di righe parte dalla scrittura.
const daRiconoscere = candidates.filter((c) => c.tmdbId == null);
const giaNoti: ImportProposal[] = candidates
  .filter((c) => c.tmdbId != null)
  .map((c) => ({
    ...c,
    tmdbId: c.tmdbId ?? null,
    matchedTitle: c.netflixTitle,
    posterPath: null,
    year: c.year ?? null,
    exact: true,
    viaFallback: false,
  }));
```

`const parts = chunk(daRiconoscere, MATCH_CHUNK_SIZE);`, il conteggio della fase parte da `giaNoti.length` (`setJob` iniziale con `done: giaNoti.length`, `total: candidates.length`), e la fusione diventa `mergeProposals([...giaNoti, ...byPart.flat()])`.

Gli `items` portano i due campi nuovi:

```ts
items.push({
  tmdbId: p.tmdbId,
  kind: p.kind,
  season: p.season,
  episode: p.episode,
  lastDate: p.lastDate,
  rating: p.rating ?? null,
  status: p.status ?? "watched",
});
```

e la chiamata finale `confirmImport(writeParts[i], isLast ? { totalRows, writtenBefore: written, source } : null)`.

- [ ] **Step 7: Verificare la compilazione**

Run: `pnpm typecheck`
Expected: errori **solo** in `src/app/(app)/import/netflix/{page,ImportClient}.tsx`, che il Task 9 sostituisce. Tutto il resto compila.

- [ ] **Step 8: Commit**

```bash
git add -A "src/app/(app)/import" src/components/import src/lib/import/match.ts
git commit -m "feat(import): azioni generiche con sorgente, voti e watchlist"
```

---

### Task 9: UI — hub, rotta per sorgente, profilo

**Files:**
- Create: `src/app/(app)/import/page.tsx`
- Create: `src/app/(app)/import/[source]/page.tsx`
- Create: `src/app/(app)/import/[source]/ImportClient.tsx`
- Delete: `src/app/(app)/import/netflix/page.tsx`, `src/app/(app)/import/netflix/ImportClient.tsx`
- Modify: `src/app/(app)/profile/page.tsx:106-139`
- Modify: `src/app/(app)/page.tsx:113`

**Interfaces:**
- Consumes: `SOURCE_LIST`, `SOURCES`, `isSourceSlug`, `SOURCE_SLUGS` dal registry; `parseImportFiles` dalle azioni; `useImport()`.
- Produces: rotte `/import` e `/import/<slug>`.

- [ ] **Step 1: Il client parametrico**

Create `src/app/(app)/import/[source]/ImportClient.tsx` partendo da `netflix/ImportClient.tsx` (`git show HEAD:"src/app/(app)/import/netflix/ImportClient.tsx"` se è già stato cancellato). Cambia solo quello che segue; impaginazione, classi e testo di coda restano identici.

```tsx
"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition, type ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import { useImport } from "@/components/import/ImportProvider";
import type { SourceMeta } from "@/lib/import/sources/registry";
import { parseImportFiles } from "../actions";

const NETWORK_ERROR = "Connessione interrotta. Controlla la rete e riprova.";

export function ImportClient({ source }: { source: SourceMeta }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const { startImport } = useImport();
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  /** Estensioni accettate da questa sorgente, per il controllo prima dell'invio. */
  const estensioni = source.accetta
    .split(",")
    .filter((a) => a.startsWith("."))
    .map((a) => a.toLowerCase());

  function handleFiles(files: File[]) {
    setError(null);
    const buoni = files.filter((f) =>
      estensioni.some((ext) => f.name.toLowerCase().endsWith(ext)),
    );
    if (buoni.length === 0) {
      setError(`Questa pagina accetta ${estensioni.join(" o ")}`);
      return;
    }
    const formData = new FormData();
    formData.set("source", source.slug);
    for (const file of buoni) formData.append("file", file);
    startTransition(async () => {
      try {
        const res = await parseImportFiles(formData);
        if (!res.ok) {
          setError(res.error ?? "Errore");
          return;
        }
        startImport(res.candidates, res.totalRows, source.slug);
        router.push("/");
      } catch {
        setError(NETWORK_ERROR);
      }
    });
  }
  // … resto del componente: il quadrato del marchio usa source.colore e
  //   source.sigla, le istruzioni sono source.istruzioni.map(...), l'input ha
  //   accept={source.accetta} e multiple={source.multiplo}, il bottone
  //   source.bottone. Drag&drop: handleFiles([...e.dataTransfer.files]).
}
```

Il riquadro istruzioni diventa:

```tsx
<div className="space-y-3.5 rounded-[20px] border border-border bg-surface p-[18px]">
  <p className="text-[15px] font-semibold">Come scaricare il tuo storico</p>
  {source.istruzioni.map((testo, i) => (
    <InstructionStep key={testo} n={i + 1}>
      {testo}
    </InstructionStep>
  ))}
  <p className="text-xs leading-relaxed text-muted">
    Il file viene elaborato in memoria e scartato: non salviamo né il file né
    l&apos;elenco dei titoli non importati.
  </p>
  {source.esempio && (
    <a
      href={source.esempio}
      download
      className="inline-block text-xs font-medium text-accent-pale underline underline-offset-2"
    >
      Scarica un file di esempio
    </a>
  )}
</div>
```

e il quadrato del marchio:

```tsx
<div
  className="flex size-14 shrink-0 items-center justify-center rounded-2xl text-3xl font-extrabold text-white"
  style={{ background: source.colore }}
>
  {source.sigla}
</div>
```

- [ ] **Step 2: La pagina della sorgente**

Create `src/app/(app)/import/[source]/page.tsx`:

```tsx
import Link from "next/link";
import { notFound } from "next/navigation";
import { BackButton } from "@/components/layout/BackButton";
import { isSourceSlug, SOURCE_SLUGS, SOURCES } from "@/lib/import/sources/registry";
import { ImportClient } from "./ImportClient";

export function generateStaticParams() {
  return SOURCE_SLUGS.map((source) => ({ source }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ source: string }>;
}) {
  const { source } = await params;
  return { title: isSourceSlug(source) ? SOURCES[source].titolo : "Importa" };
}

export default async function ImportSourcePage({
  params,
}: {
  params: Promise<{ source: string }>;
}) {
  const { source } = await params;
  if (!isSourceSlug(source)) notFound();
  const meta = SOURCES[source];

  return (
    <main className="relative px-5 pb-[150px] lg:px-10 lg:pb-36">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -left-[140px] -top-[180px] h-[380px] w-[460px] rounded-full blur-[44px]"
        style={{
          background:
            "radial-gradient(circle, rgba(139,92,246,0.32) 0%, rgba(139,92,246,0.08) 45%, rgba(0,0,0,0) 70%)",
        }}
      />
      <header className="relative flex items-center gap-3.5 pt-[calc(env(safe-area-inset-top,0px)+var(--nav-top)+32px)]">
        <BackButton inline />
        <div className="flex min-w-0 flex-col gap-1">
          <Link
            data-crumb
            href="/import"
            className="text-[13px] font-medium text-accent-soft"
          >
            Importa
          </Link>
          <h1 className="text-[28px] font-bold leading-none tracking-[-0.045em]">
            {meta.titolo}
          </h1>
        </div>
      </header>
      <div className="relative mt-7 lg:max-w-[720px]">
        <ImportClient source={meta} />
      </div>
    </main>
  );
}
```

- [ ] **Step 3: L'hub**

Create `src/app/(app)/import/page.tsx`:

```tsx
import Link from "next/link";
import { BackButton } from "@/components/layout/BackButton";
import { SOURCE_LIST } from "@/lib/import/sources/registry";

export const metadata = { title: "Importa i tuoi dati" };

export default function ImportHubPage() {
  return (
    <main className="relative px-5 pb-[150px] lg:px-10 lg:pb-36">
      <header className="relative flex items-center gap-3.5 pt-[calc(env(safe-area-inset-top,0px)+var(--nav-top)+32px)]">
        <BackButton inline />
        <div className="flex min-w-0 flex-col gap-1">
          <Link
            data-crumb
            href="/profile"
            className="text-[13px] font-medium text-accent-soft"
          >
            Profilo
          </Link>
          <h1 className="text-[28px] font-bold leading-none tracking-[-0.045em]">
            Importa i tuoi dati
          </h1>
        </div>
      </header>
      <p className="mt-4 text-pretty text-[15px] leading-[1.45] text-white/80 lg:max-w-[720px]">
        Porta in Zapp quello che hai già visto altrove. Il file resta in memoria il
        tempo di leggerlo.
      </p>
      <div className="mt-6 grid grid-cols-1 gap-3 min-[380px]:grid-cols-2 lg:max-w-[720px]">
        {SOURCE_LIST.map((source) => (
          <Link
            key={source.slug}
            href={`/import/${source.slug}`}
            className="flex flex-col gap-3 rounded-[20px] border border-border bg-surface p-4 transition-opacity active:opacity-60"
          >
            <span
              aria-hidden="true"
              className="flex size-11 items-center justify-center rounded-[13px] text-lg font-extrabold leading-none text-white"
              style={{ background: source.colore }}
            >
              {source.sigla}
            </span>
            <span className="flex flex-col gap-0.5">
              <span className="text-[15px] font-semibold">{source.nome}</span>
              <span className="text-xs leading-relaxed text-muted">
                {source.descrizione}
              </span>
            </span>
          </Link>
        ))}
      </div>
    </main>
  );
}
```

- [ ] **Step 4: Cancellare la vecchia cartella**

```bash
git rm -r "src/app/(app)/import/netflix"
```

- [ ] **Step 5: Profilo e home**

In `src/app/(app)/profile/page.tsx`, il blocco `<Link href="/import/netflix">` (righe 106-139) diventa:

```tsx
<Link
  href="/import"
  className="flex items-center justify-between gap-4 py-4 transition-opacity active:opacity-60"
>
  <span className="flex items-center gap-3">
    <span
      aria-hidden="true"
      className="flex size-9 shrink-0 items-center justify-center rounded-[11px] bg-accent/[0.18] text-accent-pale"
    >
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M12 3v12" />
        <path d="m7 10 5 5 5-5" />
        <path d="M5 21h14" />
      </svg>
    </span>
    <span className="flex flex-col gap-0.5">
      <span className="text-[15px] font-semibold">Importa i tuoi dati</span>
      <span className="text-xs text-muted">
        Netflix, Letterboxd, TV Time o un file.
      </span>
    </span>
  </span>
  <svg
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.8}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    className="shrink-0 text-muted-2"
  >
    <path d="m9 6 6 6-6 6" />
  </svg>
</Link>
```

In `src/app/(app)/page.tsx:113`:

```tsx
<Link href="/import" className={`${PILL} glass hover:bg-white/[0.16]`}>
  Importa i tuoi dati
</Link>
```

- [ ] **Step 6: Verificare compilazione e lint**

Run: `pnpm typecheck && pnpm lint`
Expected: nessun errore. Se `lint` segnala `ImportCandidate` non usato in un file spostato, togli l'import morto.

- [ ] **Step 7: Commit**

```bash
git add -A "src/app/(app)/import" "src/app/(app)/profile/page.tsx" "src/app/(app)/page.tsx"
git commit -m "feat(import): hub delle sorgenti e pagina per sorgente"
```

---

### Task 10: Verifica di insieme

**Files:** nessuno nuovo; si correggono i difetti trovati.

- [ ] **Step 1: Tutta la batteria**

Run: `pnpm test && pnpm typecheck && pnpm lint && pnpm format`
Expected: test verdi (compresi i tre di Netflix, che non devono essere cambiati), niente errori, `format` che non riscrive nulla di inatteso.

- [ ] **Step 2: Build vera, in cartella propria**

Run: `NEXT_DIST_DIR=.next-import pnpm build`
Expected: build completata. `/import` e `/import/[source]` compaiono fra le rotte, con le quattro `generateStaticParams`.

- [ ] **Step 3: Prova a mano sull'istanza costruita**

Run: `NEXT_DIST_DIR=.next-import pnpm exec next start -p 3399`, poi da browser autenticato:

1. `/profile` → "Importa i tuoi dati" → `/import`: quattro schede.
2. Scheda **TV Time** → carica `public/info/tvtime_export_example.csv`. Atteso: si torna in home, il chip passa **subito** alla fase di scrittura (nessun riconoscimento da fare), 10 titoli importati.
3. Libreria: Breaking Bad a S1E3, Parasite con voto 10.
4. Ricarica lo stesso file. Atteso: "0 titoli importati, 10 già presenti".
5. Metti a mano 9 a un film che nell'export ha 5 stelle, reimporta: il voto resta 9.
6. Scheda **File** → carica un JSON `{"watch_entries":[{"title_id":278,"media_type":"movie","status":"want"}]}`. Atteso: il film compare in "Da vedere". Poi segnalo visto, ricarica lo stesso JSON: **resta visto**.
7. Scheda **Letterboxd** → carica uno zip di export vero, se disponibile: film e voti dentro, watchlist in "Da vedere".
8. `/import/netflix` → la pagina Netflix di sempre, con un CSV vero.

- [ ] **Step 4: Controllare il registro degli import**

```sql
select source, rows, matched, created_at from public.imports
order by created_at desc limit 5;
```

Expected: una riga per import, con la sorgente giusta (`tvtime`, `file`, `letterboxd`, `netflix`).

- [ ] **Step 5: Aggiornare la documentazione**

`docs/architecture/social.md` contiene la sezione sull'import Netflix: sostituiscila con la pipeline a quattro sorgenti (registry, parser, `tmdbId` che salta il riconoscimento, voti e watchlist). `CLAUDE.md` **non** si tocca: non cambia nessuna regola di progetto.

Nella spec `docs/superpowers/specs/2026-09-12-conformita-legale-design.md`, § 5, aggiungi una riga: l'export deve emettere `watch_entries` con `title_id`, `media_type`, `status`, `rating`, `season_number`, `episode_number`, `last_watched_at`, perché l'import sappia rileggerlo.

- [ ] **Step 6: Commit**

```bash
git add -A docs
git commit -m "docs: import multi-sorgente nella pagina social e vincolo sull'export"
```

---

## Note per chi esegue

- **Il posto dell'import** (`prendiPosto`/`lasciaPosto`, 3 in tutta l'app) va restituito su **ogni** uscita d'errore dopo averlo preso: è il difetto più facile da introdurre in questo giro, e si manifesta come "import bloccato per mezz'ora" senza nessun errore visibile.
- **I test di Netflix non si toccano.** Se un test di `sources/netflix.test.ts` diventa rosso durante il refactor, è il refactor a essere sbagliato, non il test.
- **Voti**: la RPC fa già `rating = coalesce(watch_entries.rating, excluded.rating)`. Non aggiungere logica di confronto lato TypeScript: quella riga è la regola.
- **Date**: `last_watched_at` ordina home e libreria. Una data letta male si vede subito in "Continua a guardare"; è il primo posto dove guardare se qualcosa sembra fuori posto.
