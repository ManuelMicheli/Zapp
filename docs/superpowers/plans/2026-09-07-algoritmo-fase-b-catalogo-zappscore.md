# Algoritmo Zapp — Fase B (catalogo, classifiche, ZappScore): piano di implementazione

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** sostituire il voto TMDB con uno ZappScore aggregato da 8 fonti e portare in app le classifiche settimanali di Netflix Italia e delle altre piattaforme, con badge e scaffali.

**Architecture:** due tabelle nuove (`title_ratings`, `title_charts`) scritte solo dal service client, mai colonne dentro `titles` (che viene riscritta dal cache TMDB). Tutta la matematica e tutto il parsing stanno in funzioni **pure** con test Vitest; i moduli che toccano la rete sono `server-only` e non fanno altro che chiamare quelle funzioni. Un motore periodico su `pg_cron` di Supabase chiama route `/api/jobs/*` protette da segreto.

**Tech Stack:** Next.js 15 App Router, TypeScript strict, Supabase Postgres + `pg_cron` + `pg_net` + Vault, Vitest, MDBList API, file TSV pubblico di Netflix Tudum, JustWatch GraphQL (client già in casa), TMDB.

**Spec:** `docs/superpowers/specs/2026-09-07-algoritmo-fase-b-catalogo-zappscore-design.md`

## Global Constraints

Valgono per ogni task, senza ripeterle.

- **Italiano.** UI in italiano, **commenti nel codice in italiano**. È la regola del progetto (CLAUDE.md).
- **Niente TMDB dal client.** Ogni chiamata esterna (MDBList, Netflix, JustWatch, TMDB) parte dal server. I moduli che le fanno cominciano con `import "server-only";`.
- **Service client solo per dati di sistema.** `createServiceClient()` da `@/lib/supabase/server` per scrivere `title_ratings`, `title_charts`, `job_runs`. Le letture usano `createClient()` (RLS attiva, policy di select `true`).
- **Token, non valori grezzi.** Colori solo dai token Tailwind (`text-muted`, `bg-surface`, `accent-soft`, `.glass`). Nessun hex nuovo.
- **Prettier**: virgolette doppie, virgole finali, `printWidth` 90. Alla fine di ogni task: `pnpm format`.
- **Vitest solo su funzioni pure**, file `*.test.ts` accanto al modulo. Il resto si verifica con `pnpm typecheck && pnpm lint`.
- **Mai due `next build` nella stessa `.next`.** Se serve una build di verifica, farla in un worktree separato (regola già in CLAUDE.md). `pnpm typecheck` e `pnpm lint` si possono lanciare sempre.
- **Dopo ogni migration**: rigenerare `src/types/database.ts` con
  `supabase gen types typescript --project-id bbuhwzdbzxgydewmcdwd > src/types/database.ts`.
- **Ogni commit** chiude con:
  ```
  Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01AufEa725mycVKi9kRM1NQV
  ```
- **Il branch di lavoro è quello corrente.** Nel tree ci sono modifiche di altre sessioni: `git add` solo i file elencati nel task, **mai `git add -A`, mai `git stash`**.

## Struttura dei file

| File | Responsabilità |
|---|---|
| `supabase/migrations/0020_ratings_charts.sql` | tabelle `title_ratings`, `title_charts`, `job_runs` + RLS |
| `supabase/migrations/0021_jobs_cron.sql` | estensioni e schedule `pg_cron` |
| `src/lib/ratings/types.ts` | tipi condivisi: `RatingSource`, `SourceValues`, `ZappScore` |
| `src/lib/ratings/parse.ts` (+ `.test.ts`) | **puro**: risposta MDBList → `SourceValues` |
| `src/lib/ratings/score.ts` (+ `.test.ts`) | **puro**: `SourceValues` → `ZappScore` |
| `src/lib/ratings/mdblist.ts` | `server-only`: HTTP, throttle, lotti, quota |
| `src/lib/ratings/store.ts` | `server-only`: scrittura in `title_ratings`, riempimento pigro |
| `src/lib/ratings/queries.ts` | `server-only`: letture in lotto per liste e scheda |
| `src/lib/charts/netflix-parse.ts` (+ `.test.ts`) | **puro**: righe TSV Tudum |
| `src/lib/charts/netflix.ts` | `server-only`: scarica il TSV a flusso |
| `src/lib/charts/clean.ts` (+ `.test.ts`) | **puro**: titolo di classifica → titolo cercabile |
| `src/lib/charts/momentum.ts` (+ `.test.ts`) | **puro**: posizioni guadagnate |
| `src/lib/charts/resolve.ts` | `server-only`: titolo → id TMDB |
| `src/lib/charts/justwatch.ts` | `server-only`: classifiche per provider |
| `src/lib/charts/store.ts` | `server-only`: scrittura `title_charts` |
| `src/lib/charts/queries.ts` | `server-only`: scaffali e badge |
| `src/lib/jobs/auth.ts` (+ `.test.ts`) | **puro**: confronto del segreto in tempo costante |
| `src/lib/jobs/runs.ts` | `server-only`: righe di `job_runs`, lucchetto |
| `src/app/api/jobs/[job]/route.ts` | le quattro route dei job |
| `src/components/title/RatingsPanel.tsx` | il pannello dei voti nella scheda |
| `src/components/ui/PosterCard.tsx` | prop `affinity` e `chartBadge` |
| `src/components/discover/DiscoverSections.tsx` | scaffali di classifica |

---

### Task 1: Migration delle tabelle e tipi

**Files:**
- Create: `supabase/migrations/0020_ratings_charts.sql`
- Modify: `src/types/database.ts` (rigenerato)

**Interfaces:**
- Consuma: niente.
- Produce: tabelle `public.title_ratings`, `public.title_charts`, `public.job_runs`; i tipi `Tables<"title_ratings">`, `Tables<"title_charts">`, `Tables<"job_runs">` in `src/types/database.ts`.

- [ ] **Step 1: Scrivere la migration**

Create `supabase/migrations/0020_ratings_charts.sql`:

```sql
-- Fase B dell'algoritmo: voti aggregati multi-fonte e classifiche settimanali.
-- Tabelle a parte, MAI colonne dentro `titles`: quella riga viene riscritta per intero
-- da `upsertTitle` a ogni rinfresco del cache TMDB e i voti sparirebbero.

create table public.title_ratings (
  title_id      bigint not null,
  media_type    public.media_type not null,
  -- {"imdb":{"value":8.5,"votes":1200000}, "tomatoes":{"value":92,"votes":410}, ...}
  sources       jsonb not null default '{}'::jsonb,
  zapp_score    numeric(3,1),
  zapp_votes    bigint not null default 0,
  zapp_critics  integer not null default 0,
  confidence    text not null default 'low',
  -- MDBList non conosce il titolo: non riprovarlo a ogni giro
  mdblist_miss  boolean not null default false,
  fetched_at    timestamptz not null default now(),
  primary key (title_id, media_type),
  constraint title_ratings_confidence_check
    check (confidence in ('low', 'medium', 'high')),
  constraint title_ratings_title_fkey
    foreign key (title_id, media_type) references public.titles (id, media_type)
    on delete cascade
);

create index title_ratings_score_idx on public.title_ratings (zapp_score desc nulls last)
  where confidence = 'high';
create index title_ratings_fetched_idx on public.title_ratings (fetched_at);

create table public.title_charts (
  id             bigserial primary key,
  source         text not null,
  provider_id    integer not null,
  country        text not null default 'IT',
  media_type     public.media_type not null,
  period         date not null,
  rank           integer not null,
  title_id       bigint,
  raw_title      text not null,
  raw_season     text,
  weeks_in_chart integer,
  momentum       integer,
  resolve_tries  smallint not null default 0,
  resolved_at    timestamptz,
  created_at     timestamptz not null default now(),
  constraint title_charts_source_check
    check (source in ('netflix_tudum', 'justwatch', 'tmdb')),
  constraint title_charts_unique
    unique (source, provider_id, country, media_type, period, rank),
  constraint title_charts_title_fkey
    foreign key (title_id, media_type) references public.titles (id, media_type)
    on delete set null
);

create index title_charts_latest_idx
  on public.title_charts (source, provider_id, media_type, period desc, rank);
create index title_charts_title_idx on public.title_charts (title_id, media_type)
  where title_id is not null;
create index title_charts_unresolved_idx on public.title_charts (period desc)
  where title_id is null and resolve_tries < 5;

-- Registro delle esecuzioni: senza, un job che smette di girare non se ne accorge nessuno.
create table public.job_runs (
  id         bigserial primary key,
  job        text not null,
  started_at timestamptz not null default now(),
  ended_at   timestamptz,
  ok         boolean,
  detail     jsonb
);
create index job_runs_job_idx on public.job_runs (job, started_at desc);

alter table public.title_ratings enable row level security;
alter table public.title_charts  enable row level security;
alter table public.job_runs      enable row level security;

-- Stessa regola di `titles`: lettura per tutti, scrittura solo col service client.
create policy "title_ratings_select_all" on public.title_ratings for select using (true);
create policy "title_charts_select_all"  on public.title_charts  for select using (true);
-- `job_runs` resta senza policy di select: è roba di servizio.
```

- [ ] **Step 2: Applicare la migration**

Applicarla al progetto Supabase `bbuhwzdbzxgydewmcdwd` con lo strumento MCP
`mcp__claude_ai_Supabase__apply_migration` (name `0020_ratings_charts`), **non** con
`supabase db push`: il progetto ha già migration applicate a mano e un push le rilancerebbe.

- [ ] **Step 3: Verificare che le tabelle esistano**

Con `mcp__claude_ai_Supabase__execute_sql`:

```sql
select table_name from information_schema.tables
where table_schema = 'public'
  and table_name in ('title_ratings', 'title_charts', 'job_runs')
order by table_name;
```

Atteso: tre righe — `job_runs`, `title_charts`, `title_ratings`.

- [ ] **Step 4: Rigenerare i tipi**

Con `mcp__claude_ai_Supabase__generate_typescript_types`, scrivendo il risultato in
`src/types/database.ts`. Poi:

Run: `pnpm typecheck`
Atteso: nessun errore (le tabelle nuove non sono ancora usate da nessuno).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0020_ratings_charts.sql src/types/database.ts
git commit -m "feat(ratings): tabelle title_ratings, title_charts e job_runs"
```

---

### Task 2: Tipi e parser MDBList (puro)

**Files:**
- Create: `src/lib/ratings/types.ts`
- Create: `src/lib/ratings/parse.ts`
- Test: `src/lib/ratings/parse.test.ts`

**Interfaces:**
- Consuma: niente.
- Produce:
  - `type RatingSource = "imdb" | "tmdb" | "trakt" | "letterboxd" | "audience" | "tomatoes" | "metacritic" | "rogerebert"`
  - `interface SourceValue { value: number; votes: number }`
  - `type SourceValues = Partial<Record<RatingSource, SourceValue>>`
  - `type Confidence = "low" | "medium" | "high"`
  - `interface ScoreBreakdownRow { source: RatingSource; value: number; votes: number; scale: "10" | "100" | "5" | "4" }`
  - `interface ZappScore { score: number | null; votes: number; critics: number; confidence: Confidence; breakdown: ScoreBreakdownRow[] }`
  - `function parseMdblistRatings(raw: unknown): SourceValues`

- [ ] **Step 1: Scrivere i tipi**

Create `src/lib/ratings/types.ts`:

```ts
/** Le otto fonti che sappiamo leggere. Tutto il resto che arriva viene ignorato. */
export type RatingSource =
  | "imdb"
  | "tmdb"
  | "trakt"
  | "letterboxd"
  | "audience"
  | "tomatoes"
  | "metacritic"
  | "rogerebert";

export interface SourceValue {
  /** Valore nella scala nativa della fonte (IMDb 0-10, Rotten Tomatoes 0-100...). */
  value: number;
  /** Quante persone o critici l'hanno votato; 0 se la fonte non lo dice. */
  votes: number;
}

export type SourceValues = Partial<Record<RatingSource, SourceValue>>;

export type Confidence = "low" | "medium" | "high";

/** Come si legge il valore di una fonte, per mostrarlo nella sua scala vera. */
export type RatingScale = "10" | "100" | "5" | "4";

export interface ScoreBreakdownRow {
  source: RatingSource;
  value: number;
  votes: number;
  scale: RatingScale;
}

export interface ZappScore {
  /** 0-10 con un decimale; `null` quando nessuna fonte è utilizzabile. */
  score: number | null;
  /** Somma dei voti del pubblico: è il "(2,4M voti)" mostrato accanto al punteggio. */
  votes: number;
  /** Numero di critici sommati. */
  critics: number;
  confidence: Confidence;
  breakdown: ScoreBreakdownRow[];
}
```

- [ ] **Step 2: Scrivere il test che fallisce**

Create `src/lib/ratings/parse.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { parseMdblistRatings } from "./parse";

describe("parseMdblistRatings", () => {
  it("legge le fonti conosciute dalla risposta intera", () => {
    const raw = {
      id: 693134,
      title: "Dune: Part Two",
      ratings: [
        { source: "imdb", value: 8.5, score: 85, votes: 1200000 },
        { source: "metacritic", value: 79, score: 79, votes: 67 },
        { source: "letterboxd", value: 4.3, score: 86, votes: 890000 },
      ],
    };
    expect(parseMdblistRatings(raw)).toEqual({
      imdb: { value: 8.5, votes: 1200000 },
      metacritic: { value: 79, votes: 67 },
      letterboxd: { value: 4.3, votes: 890000 },
    });
  });

  it("accetta anche il solo array di ratings", () => {
    const raw = [{ source: "tmdb", value: 8.2, votes: 11000 }];
    expect(parseMdblistRatings(raw)).toEqual({ tmdb: { value: 8.2, votes: 11000 } });
  });

  it("traduce i nomi di Rotten Tomatoes nelle nostre due fonti", () => {
    const raw = {
      ratings: [
        { source: "tomatoes", value: 92, votes: 410 },
        { source: "tomatoesaudience", value: 95, votes: 250000 },
      ],
    };
    expect(parseMdblistRatings(raw)).toEqual({
      tomatoes: { value: 92, votes: 410 },
      audience: { value: 95, votes: 250000 },
    });
  });

  it("ignora le fonti che non conosciamo", () => {
    const raw = { ratings: [{ source: "myanimelist", value: 8.9, votes: 400000 }] };
    expect(parseMdblistRatings(raw)).toEqual({});
  });

  it("scarta i valori fuori dalla scala della fonte", () => {
    const raw = {
      ratings: [
        { source: "imdb", value: 42, votes: 100 },
        { source: "letterboxd", value: -1, votes: 100 },
      ],
    };
    expect(parseMdblistRatings(raw)).toEqual({});
  });

  it("mette 0 dove mancano i voti, senza perdere il valore", () => {
    const raw = { ratings: [{ source: "rogerebert", value: 4 }] };
    expect(parseMdblistRatings(raw)).toEqual({ rogerebert: { value: 4, votes: 0 } });
  });

  it("ricava il valore da `score` quando `value` è nullo", () => {
    // `score` di MDBList è normalizzato 0-100: su Letterboxd (0-5) 86 vale 4,3
    const raw = { ratings: [{ source: "letterboxd", value: null, score: 86, votes: 10 }] };
    expect(parseMdblistRatings(raw)).toEqual({ letterboxd: { value: 4.3, votes: 10 } });
  });

  it("a parità di fonte tiene quella con più voti", () => {
    const raw = {
      ratings: [
        { source: "imdb", value: 7, votes: 10 },
        { source: "imdb", value: 8.5, votes: 1200000 },
      ],
    };
    expect(parseMdblistRatings(raw)).toEqual({ imdb: { value: 8.5, votes: 1200000 } });
  });

  it("non esplode su forme inattese", () => {
    expect(parseMdblistRatings(null)).toEqual({});
    expect(parseMdblistRatings("boh")).toEqual({});
    expect(parseMdblistRatings({ ratings: "no" })).toEqual({});
    expect(parseMdblistRatings({ ratings: [null, 3, { source: 1 }] })).toEqual({});
  });
});
```

- [ ] **Step 3: Lanciare il test e vederlo fallire**

Run: `pnpm test src/lib/ratings/parse.test.ts`
Atteso: FAIL — `Failed to resolve import "./parse"`.

- [ ] **Step 4: Scrivere il parser**

Create `src/lib/ratings/parse.ts`:

```ts
import type { RatingSource, SourceValues } from "./types";

/**
 * Nomi con cui MDBList chiama le fonti, tradotti nei nostri. Quello che non è qui
 * viene ignorato di proposito: `metacriticuser` (0-10 del pubblico Metacritic) e
 * `myanimelist` non entrano nella fase B per non raddoppiare il bacino del pubblico.
 */
const ALIASES: Record<string, RatingSource> = {
  imdb: "imdb",
  tmdb: "tmdb",
  trakt: "trakt",
  letterboxd: "letterboxd",
  tomatoes: "tomatoes",
  tomatoesaudience: "audience",
  audience: "audience",
  metacritic: "metacritic",
  rogerebert: "rogerebert",
};

/** Valore massimo della scala nativa: serve a scartare i valori impossibili. */
const MAX_VALUE: Record<RatingSource, number> = {
  imdb: 10,
  tmdb: 10,
  trakt: 10,
  letterboxd: 5,
  audience: 100,
  tomatoes: 100,
  metacritic: 100,
  rogerebert: 4,
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/**
 * Risposta MDBList → i nostri voti. Difensivo per scelta: lo schema OpenAPI dichiara
 * gli elementi di `ratings` come oggetti senza proprietà, quindi qualunque campo può
 * mancare o cambiare forma. Una forma inattesa dà `{}`, mai un'eccezione: la riga
 * verrà semplicemente ricalcolata al giro dopo.
 */
export function parseMdblistRatings(raw: unknown): SourceValues {
  const list = Array.isArray(raw)
    ? raw
    : isRecord(raw) && Array.isArray(raw.ratings)
      ? raw.ratings
      : [];

  const out: SourceValues = {};
  for (const item of list) {
    if (!isRecord(item)) continue;
    const name = typeof item.source === "string" ? item.source.toLowerCase() : null;
    const source = name ? ALIASES[name] : undefined;
    if (!source) continue;

    const max = MAX_VALUE[source];
    // `score` di MDBList è normalizzato 0-100: se manca `value`, lo riportiamo in scala
    const direct = num(item.value);
    const fromScore = num(item.score);
    const value =
      direct ?? (fromScore === null ? null : Math.round((fromScore / 100) * max * 10) / 10);
    if (value === null || value < 0 || value > max) continue;

    const votes = Math.max(0, Math.trunc(num(item.votes) ?? 0));
    const seen = out[source];
    if (seen && seen.votes >= votes) continue;
    out[source] = { value, votes };
  }
  return out;
}
```

- [ ] **Step 5: Lanciare il test e vederlo passare**

Run: `pnpm test src/lib/ratings/parse.test.ts`
Atteso: PASS, 9 test.

- [ ] **Step 6: Commit**

```bash
pnpm format
git add src/lib/ratings/types.ts src/lib/ratings/parse.ts src/lib/ratings/parse.test.ts
git commit -m "feat(ratings): tipi e parser difensivo delle risposte MDBList"
```

---

### Task 3: Lo ZappScore (puro)

**Files:**
- Create: `src/lib/ratings/score.ts`
- Test: `src/lib/ratings/score.test.ts`

**Interfaces:**
- Consuma: `SourceValues`, `ZappScore`, `RatingSource`, `Confidence`, `ScoreBreakdownRow`, `RatingScale` da `./types`.
- Produce:
  - `const SOURCE_CALIBRATION: Record<RatingSource, Calibration>`
  - `function zappScore(values: SourceValues): ZappScore`

- [ ] **Step 1: Scrivere il test che fallisce**

Create `src/lib/ratings/score.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { zappScore } from "./score";

describe("zappScore", () => {
  it("tira verso la media un voto perfetto con tre voti", () => {
    // 10/10 con 3 voti su TMDB (soglia 500, media 6,6) non deve valere 10
    const r = zappScore({ tmdb: { value: 10, votes: 3 } });
    expect(r.score).toBe(6.6);
    expect(r.confidence).toBe("low");
    expect(r.votes).toBe(3);
  });

  it("lascia stare un voto alto con mezzo milione di voti", () => {
    const r = zappScore({ imdb: { value: 9.2, votes: 500000 } });
    expect(r.score).toBe(9.2);
    expect(r.votes).toBe(500000);
    // "high" vuole almeno due fonti del pubblico: con IMDb da sola resta "medium"
    expect(r.confidence).toBe("medium");
  });

  it("mette insieme pubblico e critica su un titolo completo", () => {
    const r = zappScore({
      imdb: { value: 8.5, votes: 1200000 },
      tmdb: { value: 8.2, votes: 11000 },
      letterboxd: { value: 4.3, votes: 890000 },
      audience: { value: 95, votes: 250000 },
      tomatoes: { value: 92, votes: 410 },
      metacritic: { value: 79, votes: 67 },
    });
    expect(r.score).toBe(8.6);
    expect(r.votes).toBe(2351000);
    expect(r.critics).toBe(477);
    expect(r.confidence).toBe("high");
    expect(r.breakdown).toHaveLength(6);
  });

  it("non lascia che un critico solo ribalti il voto del pubblico", () => {
    const r = zappScore({
      imdb: { value: 8.5, votes: 1200000 },
      rogerebert: { value: 1, votes: 1 },
    });
    // col peso pieno della critica (0,30) sarebbe 7,3: la massa critica lo riduce
    expect(r.score).toBe(8.4);
    expect(r.critics).toBe(1);
  });

  it("senza critica il pubblico prende tutto, senza distorsione", () => {
    const solo = zappScore({ imdb: { value: 8.5, votes: 1200000 } });
    expect(solo.score).toBe(8.5);
    expect(solo.critics).toBe(0);
  });

  it("con la sola critica dà un voto ma non si fida", () => {
    const r = zappScore({ rogerebert: { value: 4, votes: 1 } });
    expect(r.score).toBe(8.3);
    expect(r.confidence).toBe("low");
    expect(r.votes).toBe(0);
  });

  it("mostra le fonti senza voti ma non le fa pesare", () => {
    const r = zappScore({
      imdb: { value: 8.5, votes: 1200000 },
      rogerebert: { value: 1, votes: 0 },
    });
    expect(r.score).toBe(8.5);
    expect(r.critics).toBe(0);
    expect(r.breakdown).toHaveLength(2);
  });

  it("senza nessuna fonte non inventa un numero", () => {
    const r = zappScore({});
    expect(r.score).toBeNull();
    expect(r.confidence).toBe("low");
    expect(r.breakdown).toEqual([]);
  });

  it("passa a medium sopra i mille voti", () => {
    expect(zappScore({ tmdb: { value: 7, votes: 900 } }).confidence).toBe("low");
    expect(zappScore({ tmdb: { value: 7, votes: 1200 } }).confidence).toBe("medium");
  });

  it("porta nel breakdown la scala nativa di ogni fonte", () => {
    const r = zappScore({
      tomatoes: { value: 92, votes: 410 },
      letterboxd: { value: 4.3, votes: 100 },
    });
    expect(r.breakdown).toContainEqual({
      source: "tomatoes",
      value: 92,
      votes: 410,
      scale: "100",
    });
    expect(r.breakdown).toContainEqual({
      source: "letterboxd",
      value: 4.3,
      votes: 100,
      scale: "5",
    });
  });
});
```

- [ ] **Step 2: Lanciare il test e vederlo fallire**

Run: `pnpm test src/lib/ratings/score.test.ts`
Atteso: FAIL — `Failed to resolve import "./score"`.

- [ ] **Step 3: Scrivere la formula**

Create `src/lib/ratings/score.ts`:

```ts
import type {
  Confidence,
  RatingScale,
  RatingSource,
  ScoreBreakdownRow,
  SourceValues,
  ZappScore,
} from "./types";

interface Calibration {
  /** Porta il valore dalla scala nativa a 0-10. */
  toTen: (v: number) => number;
  /** Voti sotto i quali il voto viene tirato verso la media della fonte. */
  m: number;
  /** Media globale della fonte, già in scala 0-10. */
  c: number;
  pool: "public" | "critic";
  scale: RatingScale;
}

/**
 * Calibrazione delle fonti.
 *
 * I valori `c` sono STIME iniziali (2026-09-07), non misure: vanno ricalcolate con una
 * query su `title_ratings` appena la tabella supera le 5000 righe, e la data qui sopra
 * va aggiornata. Le soglie `m` dicono quanti voti servono perché una fonte "conti da
 * sola": più la fonte è piccola (i critici), più bassa è la soglia.
 */
export const SOURCE_CALIBRATION: Record<RatingSource, Calibration> = {
  imdb: { toTen: (v) => v, m: 2500, c: 6.7, pool: "public", scale: "10" },
  tmdb: { toTen: (v) => v, m: 500, c: 6.6, pool: "public", scale: "10" },
  trakt: { toTen: (v) => v, m: 500, c: 7.2, pool: "public", scale: "10" },
  letterboxd: { toTen: (v) => v * 2, m: 1000, c: 6.4, pool: "public", scale: "5" },
  audience: { toTen: (v) => v / 10, m: 1000, c: 6.6, pool: "public", scale: "100" },
  tomatoes: { toTen: (v) => v / 10, m: 20, c: 6.2, pool: "critic", scale: "100" },
  metacritic: { toTen: (v) => v / 10, m: 12, c: 6.1, pool: "critic", scale: "100" },
  rogerebert: { toTen: (v) => v * 2.5, m: 1, c: 6.5, pool: "critic", scale: "4" },
};

/** Quanto pesa la critica quando è ben rappresentata. */
const CRITIC_WEIGHT = 0.3;
/** Massa critica (somma dei pesi) oltre la quale la critica pesa per intero. */
const CRITIC_FULL_MASS = 2.5;
const HIGH_VOTES = 10_000;
const MEDIUM_VOTES = 1_000;

const SOURCES = Object.keys(SOURCE_CALIBRATION) as RatingSource[];

/**
 * Il voto aggregato di Zapp.
 *
 * Tre idee, in quest'ordine:
 * 1. ogni fonte viene tirata verso la propria media in proporzione a quanti voti ha
 *    (bayesiana), così un 10/10 con tre voti non vale niente;
 * 2. dentro ogni bacino le fonti pesano in **logaritmo** dei voti: pesare in modo
 *    lineare vorrebbe dire che esiste solo IMDb, pesare uguale vorrebbe dire che 67
 *    critici contano quanto un milione di persone;
 * 3. pubblico e critica sono due bacini distinti, mescolati 70/30 — ma il 30 della
 *    critica si riduce se i critici sono pochi, così un singolo recensore non muove
 *    il voto di un film.
 */
export function zappScore(values: SourceValues): ZappScore {
  const breakdown: ScoreBreakdownRow[] = [];
  let pubNum = 0;
  let pubDen = 0;
  let pubVotes = 0;
  let pubSources = 0;
  let criNum = 0;
  let criDen = 0;
  let criCount = 0;

  for (const source of SOURCES) {
    const raw = values[source];
    if (!raw) continue;
    const cal = SOURCE_CALIBRATION[source];
    breakdown.push({ source, value: raw.value, votes: raw.votes, scale: cal.scale });
    // Senza voti la fonte si mostra ma non pesa: non sappiamo quanto valga
    if (raw.votes <= 0) continue;

    const r = cal.toTen(raw.value);
    const adjusted = (raw.votes * r + cal.m * cal.c) / (raw.votes + cal.m);
    const weight = Math.log10(1 + raw.votes);

    if (cal.pool === "public") {
      pubNum += adjusted * weight;
      pubDen += weight;
      pubVotes += raw.votes;
      pubSources += 1;
    } else {
      criNum += adjusted * weight;
      criDen += weight;
      criCount += raw.votes;
    }
  }

  const hasPublic = pubDen > 0;
  const hasCritic = criDen > 0;
  if (!hasPublic && !hasCritic) {
    return { score: null, votes: 0, critics: 0, confidence: "low", breakdown };
  }

  const publicScore = hasPublic ? pubNum / pubDen : 0;
  const criticScore = hasCritic ? criNum / criDen : 0;
  // Senza pubblico la critica prende tutto; con poca critica il suo 30% si assottiglia
  const criticWeight = !hasPublic
    ? 1
    : CRITIC_WEIGHT * Math.min(1, criDen / CRITIC_FULL_MASS);
  const blended = hasCritic
    ? (1 - criticWeight) * publicScore + criticWeight * criticScore
    : publicScore;

  const confidence: Confidence = !hasPublic
    ? "low"
    : pubVotes >= HIGH_VOTES && pubSources >= 2
      ? "high"
      : pubVotes >= MEDIUM_VOTES
        ? "medium"
        : "low";

  return {
    score: Math.round(blended * 10) / 10,
    votes: pubVotes,
    critics: criCount,
    confidence,
    breakdown,
  };
}
```

- [ ] **Step 4: Lanciare il test e vederlo passare**

Run: `pnpm test src/lib/ratings/score.test.ts`
Atteso: PASS, 10 test.

- [ ] **Step 5: Lanciare tutta la suite**

Run: `pnpm test`
Atteso: PASS, nessuna regressione sugli altri file.

- [ ] **Step 6: Commit**

```bash
pnpm format
git add src/lib/ratings/score.ts src/lib/ratings/score.test.ts
git commit -m "feat(ratings): ZappScore bayesiano a due bacini, pubblico e critica"
```

---

### Task 4: Client MDBList, scrittura e riempimento pigro

**Files:**
- Create: `src/lib/ratings/mdblist.ts`
- Create: `src/lib/ratings/store.ts`
- Create: `src/lib/ratings/queries.ts`
- Modify: `.env.example`

**Interfaces:**
- Consuma: `parseMdblistRatings` (Task 2), `zappScore` (Task 3), `SourceValues`/`ZappScore` (Task 2), `Tables<"title_ratings">` (Task 1).
- Produce:
  - `mdblist.ts`: `class MdblistQuotaError extends Error { retryAfterS: number }`, `async function fetchRatingsBatch(ids: number[], mediaType: "movie" | "tv"): Promise<Map<number, SourceValues>>`
  - `store.ts`: `async function saveRatings(mediaType: "movie" | "tv", found: Map<number, SourceValues>, asked: number[]): Promise<number>`, `async function ensureRatings(titleId: number, mediaType: "movie" | "tv"): Promise<StoredRating | null>`
  - `queries.ts`: `interface StoredRating { score: number | null; votes: number; critics: number; confidence: Confidence; sources: SourceValues }`, `type RatingKey = string` con `ratingKey(id, mediaType)`, `async function getRatings(keys: Array<{ id: number; mediaType: "movie" | "tv" }>): Promise<Map<string, StoredRating>>`

- [ ] **Step 1: Aggiungere le variabili d'ambiente**

Modify `.env.example`, in fondo:

```
# voti aggregati (MDBList, piano Supporter 1 €/mese: 10.000 richieste/giorno, lotti da 100).
# Chiave da mdblist.com -> Preferences. Senza chiave lo ZappScore non si calcola e
# l'app ricade sul voto TMDB.
MDBLIST_API_KEY=
# segreto delle route /api/jobs/*: stringa casuale di almeno 32 byte, la stessa che
# sta in Supabase Vault come `zapp_jobs_secret`.
JOBS_SECRET=
```

- [ ] **Step 2: Scrivere il client MDBList**

Create `src/lib/ratings/mdblist.ts`:

```ts
import "server-only";

import { parseMdblistRatings } from "./parse";
import type { SourceValues } from "./types";

const BASE = "https://api.mdblist.com";
const TIMEOUT_MS = 8000;

// Massimo 4 richieste al secondo (stesso schema di tmdb/client.ts e mymovies/client.ts).
const WINDOW_MS = 1000;
const MAX_PER_WINDOW = 4;
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

/** Quota giornaliera finita: il job si ferma, non ritenta a raffica. */
export class MdblistQuotaError extends Error {
  constructor(readonly retryAfterS: number) {
    super(`MDBList: quota esaurita, riprovare fra ${retryAfterS} s`);
    this.name = "MdblistQuotaError";
  }
}

function apiKey(): string {
  const key = process.env.MDBLIST_API_KEY;
  if (!key || key.startsWith("INSERISCI")) {
    throw new Error("MDBLIST_API_KEY mancante in .env.local");
  }
  return key;
}

/**
 * Lotti: 100 sul piano Supporter. Il limite vero non è documentato in modo netto,
 * quindi se il server rifiuta la richiesta si scende di gradino e ci si resta.
 */
const SIZES = [100, 50, 10] as const;
let sizeIndex = 0;

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** La risposta può essere un array o incapsulata: proviamo le forme note. */
function itemsOf(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload;
  if (!isRecord(payload)) return [];
  for (const key of ["items", "results", "data", "media"]) {
    const v = payload[key];
    if (Array.isArray(v)) return v;
  }
  return [];
}

async function postBatch(
  ids: number[],
  path: string,
): Promise<{ ok: true; items: unknown[] } | { ok: false; tooBig: boolean }> {
  await throttle();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${BASE}${path}`, {
      method: "POST",
      headers: {
        "X-API-Key": apiKey(),
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ ids }),
      signal: controller.signal,
      cache: "no-store",
    });
    if (res.status === 429) {
      throw new MdblistQuotaError(Number(res.headers.get("Retry-After")) || 3600);
    }
    if (res.status === 400 || res.status === 413 || res.status === 422) {
      console.error(`[mdblist] lotto da ${ids.length} rifiutato (${res.status})`);
      return { ok: false, tooBig: true };
    }
    if (!res.ok) {
      console.error(`[mdblist] ${res.status} su ${path}`);
      return { ok: false, tooBig: false };
    }
    return { ok: true, items: itemsOf(await res.json()) };
  } catch (e) {
    if (e instanceof MdblistQuotaError) throw e;
    console.error(`[mdblist] errore su ${path}:`, e);
    return { ok: false, tooBig: false };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Voti di più titoli in una sola richiesta per lotto. Gli id sono id TMDB.
 * Un titolo che MDBList non conosce semplicemente non compare nella mappa:
 * chi chiama lo segna come `mdblist_miss` e non lo richiede per un mese.
 */
export async function fetchRatingsBatch(
  ids: number[],
  mediaType: "movie" | "tv",
): Promise<Map<number, SourceValues>> {
  const path = `/tmdb/${mediaType === "tv" ? "show" : "movie"}/`;
  const out = new Map<number, SourceValues>();
  if (ids.length === 0) return out;

  for (const group of chunk(ids, SIZES[sizeIndex])) {
    let res = await postBatch(group, path);
    if (!res.ok && res.tooBig && sizeIndex < SIZES.length - 1) {
      sizeIndex += 1;
      for (const smaller of chunk(group, SIZES[sizeIndex])) {
        const retry = await postBatch(smaller, path);
        if (retry.ok) collect(retry.items, out);
      }
      continue;
    }
    if (res.ok) collect(res.items, out);
  }
  return out;
}

function collect(items: unknown[], out: Map<number, SourceValues>): void {
  for (const item of items) {
    if (!isRecord(item)) continue;
    const id = typeof item.id === "number" ? item.id : null;
    if (id === null) continue;
    const values = parseMdblistRatings(item);
    if (Object.keys(values).length > 0) out.set(id, values);
  }
}
```

- [ ] **Step 3: Scrivere le letture**

Create `src/lib/ratings/queries.ts`:

```ts
import "server-only";

import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { Confidence, SourceValues } from "./types";

export interface StoredRating {
  score: number | null;
  votes: number;
  critics: number;
  confidence: Confidence;
  sources: SourceValues;
}

export interface TitleKey {
  id: number;
  mediaType: "movie" | "tv";
}

/** Chiave della mappa: i titoli hanno id uguali fra film e serie. */
export function ratingKey(id: number, mediaType: "movie" | "tv"): string {
  return `${mediaType}-${id}`;
}

/**
 * Voti di più titoli in una query sola: le liste non devono mai chiedere riga per
 * riga. Le righe pesano circa 200 byte, quindi si possono chiedere tutte insieme
 * senza avvicinarsi al problema di `titles.raw`.
 */
export const getRatings = cache(
  async (keys: TitleKey[]): Promise<Map<string, StoredRating>> => {
    const out = new Map<string, StoredRating>();
    if (keys.length === 0) return out;

    const supabase = await createClient();
    const ids = [...new Set(keys.map((k) => k.id))];
    const { data } = await supabase
      .from("title_ratings")
      .select("title_id, media_type, zapp_score, zapp_votes, zapp_critics, confidence, sources")
      .in("title_id", ids);

    for (const row of data ?? []) {
      out.set(ratingKey(row.title_id, row.media_type), {
        score: row.zapp_score === null ? null : Number(row.zapp_score),
        votes: Number(row.zapp_votes),
        critics: row.zapp_critics,
        confidence: row.confidence as Confidence,
        sources: (row.sources ?? {}) as SourceValues,
      });
    }
    return out;
  },
);
```

- [ ] **Step 4: Scrivere la scrittura e il riempimento pigro**

Create `src/lib/ratings/store.ts`:

```ts
import "server-only";

import { createServiceClient } from "@/lib/supabase/server";
import { fetchRatingsBatch, MdblistQuotaError } from "./mdblist";
import { zappScore } from "./score";
import { ratingKey, type StoredRating } from "./queries";
import type { SourceValues } from "./types";

/** Quanto vale una riga prima di richiederla: 7 giorni per i titoli che contano. */
export const RATINGS_TTL_MS = 7 * 24 * 60 * 60 * 1000;
/** Un titolo che MDBList non conosce si riprova dopo un mese, non a ogni giro. */
export const RATINGS_MISS_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Scrive i voti trovati e segna come `mdblist_miss` quelli chiesti e non tornati.
 * Ritorna quante righe sono state scritte.
 */
export async function saveRatings(
  mediaType: "movie" | "tv",
  found: Map<number, SourceValues>,
  asked: number[],
): Promise<number> {
  if (asked.length === 0) return 0;
  const supabase = createServiceClient();
  const now = new Date().toISOString();

  const rows = asked.map((id) => {
    const sources = found.get(id) ?? {};
    const score = zappScore(sources);
    return {
      title_id: id,
      media_type: mediaType,
      sources,
      zapp_score: score.score,
      zapp_votes: score.votes,
      zapp_critics: score.critics,
      confidence: score.confidence,
      mdblist_miss: !found.has(id),
      fetched_at: now,
    };
  });

  const { error } = await supabase
    .from("title_ratings")
    .upsert(rows, { onConflict: "title_id,media_type" });
  if (error) {
    console.error("[ratings] upsert fallito:", error.message);
    return 0;
  }
  return rows.length;
}

/**
 * Riempimento pigro della scheda titolo: se la riga manca o è scaduta la chiede al
 * volo (una richiesta sola). Sta dentro il `Suspense` della scheda, quindi non
 * rallenta il primo chunk. Qualunque errore torna la riga vecchia, o `null`.
 */
export async function ensureRatings(
  titleId: number,
  mediaType: "movie" | "tv",
): Promise<StoredRating | null> {
  const supabase = createServiceClient();
  const { data: row } = await supabase
    .from("title_ratings")
    .select("zapp_score, zapp_votes, zapp_critics, confidence, sources, mdblist_miss, fetched_at")
    .eq("title_id", titleId)
    .eq("media_type", mediaType)
    .maybeSingle();

  const age = row ? Date.now() - new Date(row.fetched_at).getTime() : Infinity;
  const ttl = row?.mdblist_miss ? RATINGS_MISS_TTL_MS : RATINGS_TTL_MS;
  const stored: StoredRating | null = row
    ? {
        score: row.zapp_score === null ? null : Number(row.zapp_score),
        votes: Number(row.zapp_votes),
        critics: row.zapp_critics,
        confidence: row.confidence as StoredRating["confidence"],
        sources: (row.sources ?? {}) as SourceValues,
      }
    : null;

  if (row && age < ttl) return stored;

  try {
    const found = await fetchRatingsBatch([titleId], mediaType);
    await saveRatings(mediaType, found, [titleId]);
    const sources = found.get(titleId) ?? {};
    const score = zappScore(sources);
    return {
      score: score.score,
      votes: score.votes,
      critics: score.critics,
      confidence: score.confidence,
      sources,
    };
  } catch (e) {
    if (!(e instanceof MdblistQuotaError)) console.error("[ratings] fetch fallito:", e);
    // Quota finita o rete giù: si tiene quello che c'è, la UI ricade su TMDB
    return stored;
  }
}

/** Riesporta la chiave della mappa per chi importa solo da `store`. */
export { ratingKey };
```

- [ ] **Step 5: Verificare tipi e lint**

Run: `pnpm typecheck && pnpm lint`
Atteso: nessun errore. Se `pnpm typecheck` si lamenta di `sources` come `Json`, il cast
`as SourceValues` è già in tutti e tre i punti: controllare di non averne saltato uno.

- [ ] **Step 6: Commit**

```bash
pnpm format
git add .env.example src/lib/ratings/mdblist.ts src/lib/ratings/store.ts src/lib/ratings/queries.ts
git commit -m "feat(ratings): client MDBList a lotti, scrittura e riempimento pigro"
```

---

### Task 5: Il pannello dei voti e lo ZappScore nelle card

**Files:**
- Create: `src/components/title/RatingsPanel.tsx`
- Modify: `src/components/title/TitleAbout.tsx` (blocco voto, righe 40-65)
- Modify: `src/components/title/TitleBody.tsx` (montare il pannello dentro un `Suspense`)
- Modify: `src/components/ui/PosterCard.tsx` (prop `affinity`)

**Interfaces:**
- Consuma: `ensureRatings` (Task 4), `SOURCE_CALIBRATION` (Task 3), `StoredRating` (Task 4).
- Produce:
  - `function RatingsPanel({ titleId, mediaType, tmdbVote, tmdbVotes }: { titleId: number; mediaType: "movie" | "tv"; tmdbVote: number | null; tmdbVotes: number | null }): Promise<JSX.Element | null>`
  - `PosterCard` accetta in più `affinity?: number | null`.

- [ ] **Step 1: Scrivere il pannello**

Create `src/components/title/RatingsPanel.tsx`:

```ts
import { ensureRatings } from "@/lib/ratings/store";
import { zappScore } from "@/lib/ratings/score";
import type { RatingScale, RatingSource } from "@/lib/ratings/types";

/** Come si chiama ogni fonte in pagina. */
const SOURCE_LABEL: Record<RatingSource, string> = {
  imdb: "IMDb",
  tmdb: "TMDB",
  trakt: "Trakt",
  letterboxd: "Letterboxd",
  audience: "Rotten Tomatoes, pubblico",
  tomatoes: "Rotten Tomatoes, critica",
  metacritic: "Metacritic",
  rogerebert: "RogerEbert",
};

/** Chi vota: le tre fonti della critica contano critici, le altre persone. */
const VOTER_LABEL: Record<RatingSource, string> = {
  imdb: "voti",
  tmdb: "voti",
  trakt: "voti",
  letterboxd: "voti",
  audience: "voti",
  tomatoes: "critici",
  metacritic: "critici",
  rogerebert: "critici",
};

function formatValue(value: number, scale: RatingScale): string {
  const n = value.toLocaleString("it-IT", { maximumFractionDigits: 1 });
  return scale === "100" ? `${n}%` : `${n}/${scale}`;
}

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toLocaleString("it-IT", { maximumFractionDigits: 1 })} M`;
  if (n >= 10_000) return `${Math.round(n / 1000).toLocaleString("it-IT")} mila`;
  return n.toLocaleString("it-IT");
}

/**
 * Il voto della scheda titolo: lo ZappScore grande, i voti totali, e al tocco l'elenco
 * per fonte nella scala vera di ciascuna. Dove lo ZappScore non c'è ancora (catalogo
 * che si sta riempiendo, MDBList giù) si ricade sul voto TMDB come prima: la scheda non
 * resta mai senza numero per colpa nostra.
 */
export async function RatingsPanel({
  titleId,
  mediaType,
  tmdbVote,
  tmdbVotes,
}: {
  titleId: number;
  mediaType: "movie" | "tv";
  tmdbVote: number | null;
  tmdbVotes: number | null;
}) {
  const stored = await ensureRatings(titleId, mediaType);
  const detail = stored ? zappScore(stored.sources) : null;
  const score = stored?.score ?? null;

  if (score === null) {
    if (tmdbVote === null || tmdbVote <= 0) return null;
    return (
      <div className="flex items-baseline gap-2">
        <Star />
        <b className="text-xl font-bold tracking-[-0.03em]">
          {tmdbVote.toLocaleString("it-IT", { maximumFractionDigits: 1 })}
        </b>
        <span className="text-xs text-muted">
          /10
          {tmdbVotes && tmdbVotes > 0
            ? ` · ${tmdbVotes.toLocaleString("it-IT")} voti TMDB`
            : " TMDB"}
        </span>
      </div>
    );
  }

  const rows = detail?.breakdown ?? [];

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-baseline gap-2">
        <Star />
        <b className="text-xl font-bold tracking-[-0.03em]">
          {score.toLocaleString("it-IT", { maximumFractionDigits: 1 })}
        </b>
        <span className="text-xs text-muted">
          /10 · ZappScore
          {stored && stored.votes > 0 ? ` · ${formatCount(stored.votes)} voti` : ""}
        </span>
      </div>

      {stored?.confidence === "low" && (
        <p className="text-xs text-muted-2">Poche valutazioni: il voto può cambiare.</p>
      )}

      {rows.length > 0 && (
        <details className="group">
          <summary className="cursor-pointer list-none text-xs font-semibold text-accent-soft">
            Da dove viene
          </summary>
          <dl className="mt-3 flex flex-col gap-2">
            {rows.map((r) => (
              <div key={r.source} className="flex items-baseline justify-between gap-3">
                <dt className="text-[13px] text-muted">{SOURCE_LABEL[r.source]}</dt>
                <dd className="text-[13px] font-medium">
                  {formatValue(r.value, r.scale)}
                  {r.votes > 0 && (
                    <span className="text-muted-2">
                      {" "}
                      · {formatCount(r.votes)} {VOTER_LABEL[r.source]}
                    </span>
                  )}
                </dd>
              </div>
            ))}
          </dl>
          <p className="mt-3 text-[11px] leading-[1.4] text-muted-2">
            Voti da {rows.map((r) => SOURCE_LABEL[r.source].split(",")[0]).join(", ")} via
            MDBList. Lo ZappScore pesa ogni fonte sui suoi voti e tiene pubblico e critica
            in due bacini distinti.
          </p>
        </details>
      )}
    </div>
  );
}

function Star() {
  return (
    <svg
      width="17"
      height="17"
      viewBox="0 0 24 24"
      fill="#facc15"
      aria-hidden="true"
      className="self-center"
    >
      <path d="M12 2l2.94 6.26 6.87.86-5.06 4.73 1.3 6.79L12 17.27l-6.05 3.37 1.3-6.79L2.19 9.12l6.87-.86L12 2z" />
    </svg>
  );
}

/** Riesportata per l'eventuale uso da altre sezioni. */
export { SOURCE_LABEL };
```

- [ ] **Step 2: Sostituire il blocco voto nella trama**

Modify `src/components/title/TitleAbout.tsx`. Sostituire l'intero blocco
`{voto != null && voto > 0 && ( ... )}` (righe 40-65) con lo slot passato dall'alto, e
togliere le due variabili `voto`/`voti` diventate inutili:

```tsx
      {ratings && (
        <>
          <div className="h-px bg-border" />
          {ratings}
        </>
      )}
```

La firma diventa:

```tsx
export function TitleAbout({
  title,
  ratings,
}: {
  title: Tables<"titles">;
  /** Il pannello dei voti, montato dal chiamante dentro il suo Suspense. */
  ratings?: React.ReactNode;
}) {
```

Togliere `const voto = title.vote_average;` e `const voti = title.vote_count;`.

- [ ] **Step 3: Montare il pannello nella scheda**

Modify `src/components/title/TitleBody.tsx`: aggiungere l'import

```tsx
import { RatingsPanel } from "./RatingsPanel";
```

e, dove oggi c'è `<TitleAbout title={title} />`, passargli lo slot dentro un `Suspense`
(il pannello fa una chiamata di rete al primo giro e non deve trattenere la trama):

```tsx
<TitleAbout
  title={title}
  ratings={
    <Suspense fallback={null}>
      <RatingsPanel
        titleId={title.id}
        mediaType={title.media_type}
        tmdbVote={title.vote_average}
        tmdbVotes={title.vote_count}
      />
    </Suspense>
  }
/>
```

- [ ] **Step 4: Aprire il posto per l'affinità nelle card**

Modify `src/components/ui/PosterCard.tsx`. Aggiungere la prop nella firma:

```tsx
  /**
   * Affinità personale 0-100 ("per te 92%"): la accende la fase C dell'algoritmo.
   * Finché è `null` non si vede niente, così i componenti non andranno più toccati.
   */
  affinity?: number | null;
```

e, nel blocco che rende il voto, affiancarla:

```tsx
      {rating != null ? (
        <span className="text-[11px] font-semibold text-accent-soft">
          ★ {rating.toLocaleString("it-IT", { maximumFractionDigits: 1 })}
          {affinity != null && (
            <span className="text-muted"> · per te {Math.round(affinity)}%</span>
          )}
        </span>
      ) : rating === null && showNoRating ? (
        <span className="text-[11px] font-semibold text-muted">Senza voto</span>
      ) : null}
```

Ricordarsi di aggiungere `affinity = null,` fra i parametri destrutturati.

- [ ] **Step 5: ZappScore nel carosello della home**

Modify `src/lib/home/hero.ts`. Il carosello mostra `item.voteAverage`
(`HeroCarousel.tsx:202`): va sovrascritto con lo ZappScore dove c'è, in **una** query
per l'intera home. In fondo a `getHomeHero`, prima del `return`:

```ts
import { getRatings, ratingKey } from "@/lib/ratings/queries";

/** Sostituisce il voto TMDB con lo ZappScore dove il catalogo ce l'ha già. */
async function withZappScore(lists: HeroItem[][]): Promise<void> {
  const all = lists.flat();
  const ratings = await getRatings(
    all.map((i) => ({ id: i.id, mediaType: i.mediaType })),
  ).catch(() => new Map());
  for (const item of all) {
    const score = ratings.get(ratingKey(item.id, item.mediaType))?.score;
    if (score != null) item.voteAverage = score;
  }
}
```

e dentro `getHomeHero`, fra il `Promise.all` e il `return`:

```ts
    await withZappScore([movie, tv]);
    return { movie, tv, all: mixHero(movie, tv) };
```

`mixHero` lavora sugli stessi oggetti, quindi anche la lista "Tutto" eredita i voti
aggiornati senza una seconda passata.

- [ ] **Step 6: ZappScore nei risultati di ricerca**

Modify `src/app/api/search/route.ts`. Dopo la costruzione di `items` e prima del
`NextResponse.json`, una sola query in più:

```ts
    const ratings = await getRatings(
      items.map((i) => ({ id: i.id, mediaType: i.mediaType })),
    ).catch(() => new Map());
    for (const item of items) {
      const score = ratings.get(ratingKey(item.id, item.mediaType))?.score;
      if (score != null) item.voteAverage = score;
    }
```

con l'import `import { getRatings, ratingKey } from "@/lib/ratings/queries";`.
Il `.catch` c'è perché la ricerca deve rispondere anche se la tabella dei voti non
risponde: si torna al voto TMDB, come oggi.

- [ ] **Step 7: Verificare tipi e lint**

Run: `pnpm typecheck && pnpm lint`
Atteso: nessun errore. Se `TitleAbout` viene reso da altri punti oltre `TitleBody`,
il typecheck lo dice: `ratings` è opzionale, quindi quei punti restano validi e
mostrano semplicemente la trama senza voto. Se `HeroItem` risulta `readonly`,
costruire una nuova lista invece di mutare gli oggetti.

- [ ] **Step 8: Commit**

```bash
pnpm format
git add src/components/title/RatingsPanel.tsx src/components/title/TitleAbout.tsx src/components/title/TitleBody.tsx src/components/ui/PosterCard.tsx src/lib/home/hero.ts src/app/api/search/route.ts
git commit -m "feat(ratings): ZappScore nella scheda, nel carosello e nella ricerca"
```

---

### Task 6: Il TSV di Netflix (parser puro + scarico a flusso)

**Files:**
- Create: `src/lib/charts/netflix-parse.ts`
- Create: `src/lib/charts/__fixtures__/tudum-countries.tsv`
- Create: `src/lib/charts/netflix.ts`
- Test: `src/lib/charts/netflix-parse.test.ts`

**Interfaces:**
- Consuma: niente.
- Produce:
  - `interface TudumRow { countryIso2: string; week: string; category: "Films" | "TV"; rank: number; showTitle: string; seasonTitle: string | null; weeksInTop10: number | null }`
  - `function parseTudumRow(line: string): TudumRow | null`
  - `function latestWeek(rows: TudumRow[]): string | null`
  - `netflix.ts`: `async function fetchNetflixItaly(): Promise<TudumRow[]>` (le sole righe IT dell'ultima settimana)

- [ ] **Step 1: Creare la fixture**

Create `src/lib/charts/__fixtures__/tudum-countries.tsv` (colonne separate da TAB
veri, non spazi):

```
country_name	country_iso2	week	category	weekly_rank	show_title	season_title	cumulative_weeks_in_top_10
Argentina	AR	2026-08-23	Films	1	Facing El Chapo	N/A	1
Italy	IT	2026-08-16	Films	1	Vecchia settimana	N/A	4
Italy	IT	2026-08-23	Films	1	The Beekeeper	N/A	2
Italy	IT	2026-08-23	Films	2	Facing El Chapo	N/A	1
Italy	IT	2026-08-23	TV	1	Outer Banks	Outer Banks: Season 5	1
Italy	IT	2026-08-23	TV	2	I Will Find You	I Will Find You: Limited Series	10
Italy	IT	2026-08-23	TV	3	Senza settimane		
```

- [ ] **Step 2: Scrivere il test che fallisce**

Create `src/lib/charts/netflix-parse.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { latestWeek, parseTudumRow, type TudumRow } from "./netflix-parse";

const fixture = readFileSync(
  fileURLToPath(new URL("./__fixtures__/tudum-countries.tsv", import.meta.url)),
  "utf8",
);

function rowsOf(text: string): TudumRow[] {
  return text
    .split("\n")
    .map((l) => parseTudumRow(l))
    .filter((r): r is TudumRow => r !== null);
}

describe("parseTudumRow", () => {
  it("legge una riga film", () => {
    const rows = rowsOf(fixture);
    expect(rows).toContainEqual({
      countryIso2: "IT",
      week: "2026-08-23",
      category: "Films",
      rank: 1,
      showTitle: "The Beekeeper",
      seasonTitle: null,
      weeksInTop10: 2,
    });
  });

  it("tiene il titolo di stagione quando c'è", () => {
    const rows = rowsOf(fixture);
    const outerBanks = rows.find((r) => r.showTitle === "Outer Banks");
    expect(outerBanks?.seasonTitle).toBe("Outer Banks: Season 5");
    expect(outerBanks?.category).toBe("TV");
  });

  it("tratta N/A come assenza di stagione", () => {
    const rows = rowsOf(fixture);
    expect(rows.find((r) => r.showTitle === "Facing El Chapo")?.seasonTitle).toBeNull();
  });

  it("salta l'intestazione e le righe rotte", () => {
    expect(parseTudumRow("country_name\tcountry_iso2\tweek")).toBeNull();
    expect(parseTudumRow("")).toBeNull();
    expect(parseTudumRow("Italy\tIT\t2026-08-23\tFilms")).toBeNull();
    expect(
      parseTudumRow("Italy\tIT\t2026-08-23\tPodcast\t1\tX\tN/A\t1"),
    ).toBeNull();
    expect(parseTudumRow("Italy\tIT\t2026-08-23\tFilms\tuno\tX\tN/A\t1")).toBeNull();
  });

  it("accetta le settimane cumulative mancanti", () => {
    const rows = rowsOf(fixture);
    expect(rows.find((r) => r.showTitle === "Senza settimane")?.weeksInTop10).toBeNull();
  });
});

describe("latestWeek", () => {
  it("prende la settimana più recente", () => {
    expect(latestWeek(rowsOf(fixture))).toBe("2026-08-23");
  });

  it("senza righe non inventa una data", () => {
    expect(latestWeek([])).toBeNull();
  });
});
```

- [ ] **Step 3: Lanciare il test e vederlo fallire**

Run: `pnpm test src/lib/charts/netflix-parse.test.ts`
Atteso: FAIL — `Failed to resolve import "./netflix-parse"`.

- [ ] **Step 4: Scrivere il parser**

Create `src/lib/charts/netflix-parse.ts`:

```ts
/**
 * Il Top 10 ufficiale di Netflix, paese per paese.
 * Colonne del file `all-weeks-countries.tsv`:
 * country_name, country_iso2, week, category, weekly_rank, show_title, season_title,
 * cumulative_weeks_in_top_10.
 */
export interface TudumRow {
  countryIso2: string;
  /** Domenica della settimana, `YYYY-MM-DD`. */
  week: string;
  category: "Films" | "TV";
  rank: number;
  showTitle: string;
  /** `null` dove il file scrive `N/A` o lascia vuoto. */
  seasonTitle: string | null;
  weeksInTop10: number | null;
}

const WEEK_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Una riga del TSV, o `null` se è l'intestazione o è rotta. */
export function parseTudumRow(line: string): TudumRow | null {
  if (!line) return null;
  const cells = line.replace(/\r$/, "").split("\t");
  if (cells.length < 7) return null;

  const [, countryIso2, week, category, rankText, showTitle, seasonTitle, weeksText] =
    cells;

  if (!WEEK_RE.test(week)) return null; // intestazione compresa
  if (category !== "Films" && category !== "TV") return null;
  const rank = Number(rankText);
  if (!Number.isInteger(rank) || rank < 1) return null;
  if (!showTitle) return null;

  const weeks = Number(weeksText);
  return {
    countryIso2,
    week,
    category,
    rank,
    showTitle,
    seasonTitle: seasonTitle && seasonTitle !== "N/A" ? seasonTitle : null,
    weeksInTop10: Number.isInteger(weeks) && weeks > 0 ? weeks : null,
  };
}

/** La settimana più recente fra quelle passate. */
export function latestWeek(rows: TudumRow[]): string | null {
  let best: string | null = null;
  for (const r of rows) if (best === null || r.week > best) best = r.week;
  return best;
}
```

- [ ] **Step 5: Lanciare il test e vederlo passare**

Run: `pnpm test src/lib/charts/netflix-parse.test.ts`
Atteso: PASS, 7 test.

- [ ] **Step 6: Scrivere lo scarico a flusso**

Create `src/lib/charts/netflix.ts`:

```ts
import "server-only";

import { latestWeek, parseTudumRow, type TudumRow } from "./netflix-parse";

const URL_TUDUM = "https://www.netflix.com/tudum/top10/data/all-weeks-countries.tsv";
// Senza uno User-Agent da browser Netflix risponde 403 (verificato 2026-09-07).
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36";
const TIMEOUT_MS = 45_000;

/**
 * Le sole righe italiane dell'ultima settimana pubblicata.
 *
 * Il file pesa 31 MB (circa 5 con gzip) e va letto **a flusso**: un `res.text()`
 * porterebbe tutto in memoria dentro una funzione che ne ha poca. Si tiene solo ciò
 * che serve — le righe che cominciano per `Italy\tIT\t` — e alla fine si filtra la
 * settimana più recente.
 */
export async function fetchNetflixItaly(): Promise<TudumRow[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const started = Date.now();
  try {
    const res = await fetch(URL_TUDUM, {
      headers: { "User-Agent": USER_AGENT, "Accept-Encoding": "gzip" },
      signal: controller.signal,
      cache: "no-store",
    });
    if (!res.ok || !res.body) {
      console.error(`[netflix] ${res.status} sul TSV di Tudum`);
      return [];
    }

    const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
    const italian: TudumRow[] = [];
    let carry = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      carry += value;
      let cut = carry.indexOf("\n");
      while (cut !== -1) {
        const line = carry.slice(0, cut);
        carry = carry.slice(cut + 1);
        if (line.startsWith("Italy\t")) {
          const row = parseTudumRow(line);
          if (row && row.countryIso2 === "IT") italian.push(row);
        }
        cut = carry.indexOf("\n");
      }
    }
    if (carry.startsWith("Italy\t")) {
      const row = parseTudumRow(carry);
      if (row && row.countryIso2 === "IT") italian.push(row);
    }

    const week = latestWeek(italian);
    const rows = week ? italian.filter((r) => r.week === week) : [];
    console.log(
      `[netflix] settimana ${week ?? "?"}: ${rows.length} righe IT in ${Date.now() - started} ms`,
    );
    return rows;
  } catch (e) {
    console.error(`[netflix] errore dopo ${Date.now() - started} ms:`, e);
    return [];
  } finally {
    clearTimeout(timer);
  }
}
```

- [ ] **Step 7: Verificare tipi e lint**

Run: `pnpm typecheck && pnpm lint`
Atteso: nessun errore.

- [ ] **Step 8: Commit**

```bash
pnpm format
git add src/lib/charts/netflix-parse.ts src/lib/charts/netflix-parse.test.ts src/lib/charts/__fixtures__/tudum-countries.tsv src/lib/charts/netflix.ts
git commit -m "feat(charts): Top 10 ufficiale di Netflix Italia, letto a flusso"
```

---

### Task 7: Titolo pulito, momentum e risoluzione su TMDB

**Files:**
- Create: `src/lib/charts/clean.ts`
- Create: `src/lib/charts/momentum.ts`
- Create: `src/lib/charts/resolve.ts`
- Create: `src/lib/charts/store.ts`
- Test: `src/lib/charts/clean.test.ts`
- Test: `src/lib/charts/momentum.test.ts`

**Interfaces:**
- Consuma: `TudumRow` (Task 6); `normalizeTitle`, `titleSimilarity`, `MATCH_THRESHOLD` da `@/lib/import/netflix-title`; `searchMovies`, `searchTv` da `@/lib/tmdb/client`.
- Produce:
  - `clean.ts`: `function cleanChartTitle(showTitle: string, seasonTitle: string | null): string`, `function chartSeasonNumber(seasonTitle: string | null): number | null`
  - `momentum.ts`: `function computeMomentum(previousRank: number | null, rank: number): number`
  - `resolve.ts`: `async function resolveChartTitle(rawTitle: string, mediaType: "movie" | "tv"): Promise<number | null>`
  - `store.ts`: `interface ChartInput { source: "netflix_tudum" | "justwatch" | "tmdb"; providerId: number; mediaType: "movie" | "tv"; period: string; rank: number; rawTitle: string; rawSeason: string | null; weeksInChart: number | null }`, `async function saveChart(rows: ChartInput[]): Promise<number>`, `async function resolvePending(limit: number): Promise<number>`

- [ ] **Step 1: Scrivere i test che falliscono**

Create `src/lib/charts/clean.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { chartSeasonNumber, cleanChartTitle } from "./clean";

describe("cleanChartTitle", () => {
  it("tiene il nome della serie, non quello della stagione", () => {
    expect(cleanChartTitle("Outer Banks", "Outer Banks: Season 5")).toBe("Outer Banks");
  });

  it("toglie la coda di stagione finita nel titolo dello show", () => {
    expect(cleanChartTitle("Outer Banks: Season 5", "Outer Banks: Season 5")).toBe(
      "Outer Banks",
    );
    expect(cleanChartTitle("Squid Game: Part 2", "Squid Game: Part 2")).toBe("Squid Game");
    expect(cleanChartTitle("Kaos: Volume 2", "Kaos: Volume 2")).toBe("Kaos");
    expect(cleanChartTitle("Mare Fuori: Stagione 4", "Mare Fuori: Stagione 4")).toBe(
      "Mare Fuori",
    );
    expect(
      cleanChartTitle("Bridgerton: Limited Series", "Bridgerton: Limited Series"),
    ).toBe("Bridgerton");
  });

  it("su una riga film non tocca mai i due punti: sono parte del nome", () => {
    // `season_title` nullo = riga Films: "Kill Bill: Volume 1" è il titolo, non una parte
    expect(cleanChartTitle("Kill Bill: Volume 1", null)).toBe("Kill Bill: Volume 1");
    expect(cleanChartTitle("Blade Runner: 2049", null)).toBe("Blade Runner: 2049");
    expect(cleanChartTitle("Mission: Impossible", null)).toBe("Mission: Impossible");
  });

  it("non svuota mai il titolo", () => {
    expect(cleanChartTitle("Season 2", "Season 2")).toBe("Season 2");
  });

  it("toglie gli spazi di troppo", () => {
    expect(cleanChartTitle("  The Beekeeper  ", null)).toBe("The Beekeeper");
  });
});

describe("chartSeasonNumber", () => {
  it("legge il numero di stagione", () => {
    expect(chartSeasonNumber("Outer Banks: Season 5")).toBe(5);
    expect(chartSeasonNumber("Mare Fuori: Stagione 4")).toBe(4);
  });

  it("una miniserie non ha numero", () => {
    expect(chartSeasonNumber("I Will Find You: Limited Series")).toBeNull();
    expect(chartSeasonNumber(null)).toBeNull();
    expect(chartSeasonNumber("Outer Banks")).toBeNull();
  });
});
```

Create `src/lib/charts/momentum.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { computeMomentum } from "./momentum";

describe("computeMomentum", () => {
  it("conta le posizioni guadagnate", () => {
    expect(computeMomentum(3, 1)).toBe(2);
  });

  it("conta anche quelle perse", () => {
    expect(computeMomentum(1, 3)).toBe(-2);
  });

  it("un debutto al primo posto vale il massimo", () => {
    expect(computeMomentum(null, 1)).toBe(10);
  });

  it("un debutto non è mai una discesa", () => {
    expect(computeMomentum(null, 15)).toBe(0);
  });

  it("stessa posizione, nessun movimento", () => {
    expect(computeMomentum(5, 5)).toBe(0);
  });
});
```

- [ ] **Step 2: Lanciare i test e vederli fallire**

Run: `pnpm test src/lib/charts/clean.test.ts src/lib/charts/momentum.test.ts`
Atteso: FAIL — moduli `./clean` e `./momentum` non risolti.

- [ ] **Step 3: Scrivere le due funzioni pure**

Create `src/lib/charts/clean.ts`:

```ts
/**
 * Code che indicano una stagione, non un titolo. Nella classifica Netflix arrivano in
 * inglese, ma le raccogliamo anche in italiano perché JustWatch e TMDB le scrivono così.
 */
const SEASON_TAIL =
  /:\s*(?:season|stagione|part|parte|series|serie|volume|vol\.?)\s*(?:\d+|one|two|three|i{1,3}v?|uno|due|tre)\s*$/i;
const LIMITED_TAIL = /:\s*(?:limited series|miniseries|miniserie|serie limitata)\s*$/i;
const SEASON_NUMBER = /:\s*(?:season|stagione|part|parte|volume|vol\.?)\s*(\d+)\s*$/i;

/**
 * Il nome da cercare su TMDB. La classifica premia la serie, non la stagione.
 *
 * La coda si toglie **solo quando `seasonTitle` c'è**, cioè su una riga `TV`. È il
 * discrimine che tiene insieme i due casi che altrimenti si contraddicono: "Outer
 * Banks: Season 5" va tagliato, "Kill Bill: Volume 1" no — e l'unica differenza fra i
 * due è che il primo è una serie. Sulle righe `Films` il file Netflix lascia
 * `season_title` a `N/A`, che il parser ha già tradotto in `null`.
 */
export function cleanChartTitle(showTitle: string, seasonTitle: string | null): string {
  const base = showTitle.trim();
  if (!seasonTitle) return base;
  const cut = base.replace(LIMITED_TAIL, "").replace(SEASON_TAIL, "").trim();
  return cut || base;
}

/** Numero di stagione scritto nel titolo di stagione, se c'è. */
export function chartSeasonNumber(seasonTitle: string | null): number | null {
  if (!seasonTitle) return null;
  const m = SEASON_NUMBER.exec(seasonTitle);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isInteger(n) && n > 0 ? n : null;
}
```

Create `src/lib/charts/momentum.ts`:

```ts
/** Le posizioni di una Top 10: un debutto al primo posto vale +10. */
const CHART_SIZE = 10;

/**
 * Quante posizioni ha guadagnato un titolo rispetto al periodo precedente.
 * Un debutto vale come se venisse da fuori classifica, ma non conta mai come discesa:
 * entrare al quindicesimo posto di una classifica lunga è comunque una notizia neutra.
 */
export function computeMomentum(previousRank: number | null, rank: number): number {
  if (previousRank === null) return Math.max(0, CHART_SIZE + 1 - rank);
  return previousRank - rank;
}
```

- [ ] **Step 4: Lanciare i test e vederli passare**

Run: `pnpm test src/lib/charts/clean.test.ts src/lib/charts/momentum.test.ts`
Atteso: PASS, 11 test.

- [ ] **Step 5: Scrivere la risoluzione su TMDB**

Create `src/lib/charts/resolve.ts`:

```ts
import "server-only";

import { MATCH_THRESHOLD, titleSimilarity } from "@/lib/import/netflix-title";
import { getOrFetchTitle } from "@/lib/tmdb/cache";
import { searchMovies, searchTv } from "@/lib/tmdb/client";

/**
 * Dal titolo di una classifica all'id TMDB.
 *
 * Riusa il confronto già scritto e testato per l'import Netflix. Due differenze:
 * i titoli delle classifiche arrivano **in inglese** mentre TMDB ci risponde in
 * `it-IT`, quindi il confronto va fatto contro il nome italiano **e** l'originale;
 * e non c'è nessuna stagione da indovinare, perché la classifica premia la serie.
 *
 * Prima di restituire l'id, il titolo viene messo in cache con `getOrFetchTitle`:
 * `title_charts.title_id` ha una chiave esterna su `titles`, e scrivere l'id di un
 * titolo che non abbiamo mai scaricato farebbe fallire l'insert.
 */
export async function resolveChartTitle(
  rawTitle: string,
  mediaType: "movie" | "tv",
): Promise<number | null> {
  try {
    let bestId: number | null = null;
    let bestScore = 0;

    if (mediaType === "tv") {
      const res = await searchTv(rawTitle);
      for (const item of res.results) {
        for (const name of [item.name, item.original_name]) {
          if (!name) continue;
          const score = titleSimilarity(rawTitle, name);
          if (score > bestScore) {
            bestScore = score;
            bestId = item.id;
          }
        }
      }
    } else {
      const res = await searchMovies(rawTitle);
      for (const item of res.results) {
        for (const name of [item.title, item.original_title]) {
          if (!name) continue;
          const score = titleSimilarity(rawTitle, name);
          if (score > bestScore) {
            bestScore = score;
            bestId = item.id;
          }
        }
      }
    }

    if (bestId === null || bestScore < MATCH_THRESHOLD) return null;
    // Senza la riga in `titles` la chiave esterna di `title_charts` rifiuterebbe l'id
    const cached = await getOrFetchTitle(bestId, mediaType);
    return cached ? bestId : null;
  } catch (e) {
    console.error(`[charts] ricerca fallita per "${rawTitle}":`, e);
    return null;
  }
}
```

- [ ] **Step 6: Scrivere la scrittura delle classifiche**

Create `src/lib/charts/store.ts`:

```ts
import "server-only";

import { createServiceClient } from "@/lib/supabase/server";
import { computeMomentum } from "./momentum";
import { resolveChartTitle } from "./resolve";

export interface ChartInput {
  source: "netflix_tudum" | "justwatch" | "tmdb";
  providerId: number;
  mediaType: "movie" | "tv";
  /** `YYYY-MM-DD`. */
  period: string;
  rank: number;
  rawTitle: string;
  rawSeason: string | null;
  weeksInChart: number | null;
  /**
   * Id TMDB già noto: JustWatch lo restituisce insieme al titolo, quindi quelle righe
   * nascono risolte e saltano `resolvePending`. Netflix non lo dà: lì resta `null`.
   * Chi lo passa deve **prima** aver messo il titolo in cache con `getOrFetchTitle`,
   * altrimenti la chiave esterna lo rifiuta.
   */
  titleId?: number | null;
}

/**
 * Scrive un periodo di classifica calcolando il momentum sul periodo precedente
 * della stessa (fonte, provider, tipo). Le righe già presenti vengono aggiornate:
 * rilanciare il job due volte non crea doppioni (vincolo unico in migration 0020).
 */
export async function saveChart(rows: ChartInput[]): Promise<number> {
  if (rows.length === 0) return 0;
  const supabase = createServiceClient();
  const { source, providerId, mediaType, period } = rows[0];

  // Posizioni del periodo precedente, per titolo grezzo
  const { data: previous } = await supabase
    .from("title_charts")
    .select("rank, raw_title, period")
    .eq("source", source)
    .eq("provider_id", providerId)
    .eq("media_type", mediaType)
    .lt("period", period)
    .order("period", { ascending: false })
    .limit(50);

  const lastPeriod = previous?.[0]?.period ?? null;
  const previousRank = new Map<string, number>();
  for (const p of previous ?? []) {
    if (p.period === lastPeriod) previousRank.set(p.raw_title, p.rank);
  }

  const payload = rows.map((r) => ({
    source: r.source,
    provider_id: r.providerId,
    country: "IT",
    media_type: r.mediaType,
    period: r.period,
    rank: r.rank,
    raw_title: r.rawTitle,
    raw_season: r.rawSeason,
    weeks_in_chart: r.weeksInChart,
    momentum: computeMomentum(previousRank.get(r.rawTitle) ?? null, r.rank),
    title_id: r.titleId ?? null,
    resolved_at: r.titleId ? new Date().toISOString() : null,
  }));

  const { error } = await supabase.from("title_charts").upsert(payload, {
    onConflict: "source,provider_id,country,media_type,period,rank",
  });
  if (error) {
    console.error("[charts] upsert fallito:", error.message);
    return 0;
  }
  return payload.length;
}

/**
 * Assegna un id TMDB alle righe che non ce l'hanno ancora. Cinque tentativi per riga,
 * poi si lascia stare: la riga resta in tabella col suo `raw_title`, così la classifica
 * si può ispezionare anche dove il match non c'è.
 */
export async function resolvePending(limit: number): Promise<number> {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from("title_charts")
    .select("id, media_type, raw_title, resolve_tries")
    .is("title_id", null)
    .lt("resolve_tries", 5)
    .order("period", { ascending: false })
    .limit(limit);

  let resolved = 0;
  for (const row of data ?? []) {
    const id = await resolveChartTitle(row.raw_title, row.media_type);
    if (id === null) {
      await supabase
        .from("title_charts")
        .update({ resolve_tries: row.resolve_tries + 1 })
        .eq("id", row.id);
      continue;
    }
    // Tutte le righe con lo stesso titolo grezzo puntano allo stesso titolo: una
    // update sola le sistema tutte, comprese le settimane precedenti
    await supabase
      .from("title_charts")
      .update({ title_id: id, resolved_at: new Date().toISOString() })
      .eq("raw_title", row.raw_title)
      .eq("media_type", row.media_type)
      .is("title_id", null);
    resolved += 1;
  }
  return resolved;
}
```

- [ ] **Step 7: Verificare tipi e lint**

Run: `pnpm typecheck && pnpm lint`
Atteso: nessun errore. Il typecheck fa emergere subito il `resolve_tries` mancante della
nota qui sopra: sistemarlo lì.

- [ ] **Step 8: Commit**

```bash
pnpm format
git add src/lib/charts/clean.ts src/lib/charts/clean.test.ts src/lib/charts/momentum.ts src/lib/charts/momentum.test.ts src/lib/charts/resolve.ts src/lib/charts/store.ts
git commit -m "feat(charts): titolo pulito, momentum e risoluzione su TMDB"
```

---

### Task 8: Le route dei job e il motore pg_cron

**Files:**
- Create: `src/lib/jobs/auth.ts`
- Create: `src/lib/jobs/runs.ts`
- Create: `src/app/api/jobs/[job]/route.ts`
- Create: `supabase/migrations/0021_jobs_cron.sql`
- Test: `src/lib/jobs/auth.test.ts`

**Interfaces:**
- Consuma: `fetchNetflixItaly` (Task 6), `saveChart`/`resolvePending` (Task 7), `cleanChartTitle`/`chartSeasonNumber` (Task 7), `fetchRatingsBatch` (Task 4), `saveRatings` (Task 4), `MdblistQuotaError` (Task 4).
- Produce:
  - `auth.ts`: `function secretMatches(given: string | null, expected: string | undefined): boolean`
  - `runs.ts`: `async function startRun(job: string): Promise<number | null>`, `async function endRun(id: number | null, ok: boolean, detail: Record<string, unknown>): Promise<void>`
  - route `GET|POST /api/jobs/charts-netflix|charts-resolve|ratings-refresh|charts-justwatch`

- [ ] **Step 1: Scrivere il test del segreto**

Create `src/lib/jobs/auth.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { secretMatches } from "./auth";

describe("secretMatches", () => {
  const expected = "a".repeat(32);

  it("accetta il segreto giusto", () => {
    expect(secretMatches(expected, expected)).toBe(true);
  });

  it("rifiuta un segreto sbagliato della stessa lunghezza", () => {
    expect(secretMatches("b".repeat(32), expected)).toBe(false);
  });

  it("rifiuta lunghezze diverse senza confrontare", () => {
    expect(secretMatches("a".repeat(31), expected)).toBe(false);
    expect(secretMatches("a".repeat(33), expected)).toBe(false);
  });

  it("rifiuta quando manca l'header", () => {
    expect(secretMatches(null, expected)).toBe(false);
  });

  it("rifiuta quando il segreto non è configurato", () => {
    expect(secretMatches(expected, undefined)).toBe(false);
    expect(secretMatches(expected, "")).toBe(false);
    expect(secretMatches("corto", "corto")).toBe(false);
  });
});
```

- [ ] **Step 2: Lanciare il test e vederlo fallire**

Run: `pnpm test src/lib/jobs/auth.test.ts`
Atteso: FAIL — `Failed to resolve import "./auth"`.

- [ ] **Step 3: Scrivere il confronto**

Create `src/lib/jobs/auth.ts`:

```ts
import { timingSafeEqual } from "node:crypto";

/** Sotto questa lunghezza il segreto non è un segreto: rifiutato a prescindere. */
const MIN_LENGTH = 32;

/**
 * Confronto in tempo costante fra il segreto dell'header e quello configurato.
 * Le lunghezze diverse escono subito — `timingSafeEqual` alza un'eccezione su buffer
 * di misura diversa, e la differenza di lunghezza non è comunque un'informazione utile
 * a chi attacca. Il segreto non passa mai dalla query string: finirebbe nei log.
 */
export function secretMatches(
  given: string | null,
  expected: string | undefined,
): boolean {
  if (!given || !expected) return false;
  if (expected.length < MIN_LENGTH) return false;
  const a = Buffer.from(given, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
```

- [ ] **Step 4: Lanciare il test e vederlo passare**

Run: `pnpm test src/lib/jobs/auth.test.ts`
Atteso: PASS, 5 test.

- [ ] **Step 5: Scrivere il registro delle esecuzioni**

Create `src/lib/jobs/runs.ts`:

```ts
import "server-only";

import { createServiceClient } from "@/lib/supabase/server";

/** Oltre questo tempo una riga aperta è considerata morta, non in corso. */
const STALE_MS = 15 * 60 * 1000;

/**
 * Apre una riga in `job_runs`. Torna `null` se lo stesso job è già in corso: due
 * `pg_cron` sovrapposti non devono scaricare due volte lo stesso file.
 */
export async function startRun(job: string): Promise<number | null> {
  const supabase = createServiceClient();
  const since = new Date(Date.now() - STALE_MS).toISOString();
  const { data: running } = await supabase
    .from("job_runs")
    .select("id")
    .eq("job", job)
    .is("ended_at", null)
    .gt("started_at", since)
    .limit(1);
  if (running && running.length > 0) return null;

  const { data } = await supabase
    .from("job_runs")
    .insert({ job })
    .select("id")
    .single();
  return data?.id ?? null;
}

/** Chiude la riga con l'esito e quello che è successo. */
export async function endRun(
  id: number | null,
  ok: boolean,
  detail: Record<string, unknown>,
): Promise<void> {
  if (id === null) return;
  const supabase = createServiceClient();
  await supabase
    .from("job_runs")
    .update({ ended_at: new Date().toISOString(), ok, detail })
    .eq("id", id);
}
```

- [ ] **Step 6: Scrivere la route**

Create `src/app/api/jobs/[job]/route.ts`:

```ts
import { NextResponse } from "next/server";
import { secretMatches } from "@/lib/jobs/auth";
import { endRun, startRun } from "@/lib/jobs/runs";
import { fetchNetflixItaly } from "@/lib/charts/netflix";
import { chartSeasonNumber, cleanChartTitle } from "@/lib/charts/clean";
import { resolvePending, saveChart, type ChartInput } from "@/lib/charts/store";
import { fetchRatingsBatch, MdblistQuotaError } from "@/lib/ratings/mdblist";
import { saveRatings, RATINGS_TTL_MS } from "@/lib/ratings/store";
import { createServiceClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Id TMDB di Netflix: le righe di Tudum sono tutte sue. */
const NETFLIX_PROVIDER_ID = 8;
/** Quanti titoli risolvere per giro. */
const RESOLVE_PER_RUN = 40;
/** Quanti titoli aggiornare per giro: 5 lotti da 100. */
const RATINGS_PER_RUN = 500;

type JobName = "charts-netflix" | "charts-resolve" | "ratings-refresh";

const JOBS: Record<JobName, () => Promise<Record<string, unknown>>> = {
  "charts-netflix": async () => {
    const rows = await fetchNetflixItaly();
    if (rows.length === 0) return { written: 0, note: "nessuna riga IT" };
    const period = rows[0].week;
    const input: ChartInput[] = rows.map((r) => ({
      source: "netflix_tudum",
      providerId: NETFLIX_PROVIDER_ID,
      mediaType: r.category === "TV" ? "tv" : "movie",
      period,
      rank: r.rank,
      rawTitle: cleanChartTitle(r.showTitle, r.seasonTitle),
      rawSeason: r.seasonTitle,
      weeksInChart: r.weeksInTop10,
    }));
    // I due tipi hanno momentum indipendenti: si scrivono separati
    const movies = input.filter((r) => r.mediaType === "movie");
    const tv = input.filter((r) => r.mediaType === "tv");
    const written = (await saveChart(movies)) + (await saveChart(tv));
    const seasons = rows.filter((r) => chartSeasonNumber(r.seasonTitle) !== null).length;
    return { period, written, seasons };
  },

  "charts-resolve": async () => ({ resolved: await resolvePending(RESOLVE_PER_RUN) }),

  "ratings-refresh": async () => {
    const supabase = createServiceClient();
    // La coda con le priorità sta in SQL (`ratings_refresh_queue`, migration 0021):
    // prima i titoli in classifica, poi quelli in libreria di qualcuno, poi il resto.
    const { data, error } = await supabase.rpc("ratings_refresh_queue", {
      want: RATINGS_PER_RUN,
    });
    if (error) throw new Error(`coda dei voti: ${error.message}`);

    const wanted = (data ?? []) as { id: number; media_type: "movie" | "tv" }[];
    let written = 0;
    for (const mediaType of ["movie", "tv"] as const) {
      const ids = wanted.filter((t) => t.media_type === mediaType).map((t) => t.id);
      if (ids.length === 0) continue;
      const found = await fetchRatingsBatch(ids, mediaType);
      written += await saveRatings(mediaType, found, ids);
    }
    return { asked: wanted.length, written };
  },
};

export async function POST(
  request: Request,
  { params }: { params: Promise<{ job: string }> },
) {
  const { job } = await params;
  if (!secretMatches(request.headers.get("x-jobs-secret"), process.env.JOBS_SECRET)) {
    return NextResponse.json({ error: "non autorizzato" }, { status: 401 });
  }
  const run = JOBS[job as JobName];
  if (!run) return NextResponse.json({ error: "job sconosciuto" }, { status: 404 });

  const id = await startRun(job);
  if (id === null) {
    return NextResponse.json({ error: "gia in corso" }, { status: 409 });
  }

  try {
    const detail = await run();
    await endRun(id, true, detail);
    return NextResponse.json({ ok: true, ...detail });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    const quota = e instanceof MdblistQuotaError;
    await endRun(id, false, { error: message, quota });
    console.error(`[jobs] ${job} fallito:`, e);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

/** Comodo per lanciare un job a mano dal browser durante il collaudo. */
export const GET = POST;
```

- [ ] **Step 7: Scrivere la migration del cron**

Create `supabase/migrations/0021_jobs_cron.sql`:

```sql
-- Motore periodico della fase B. Non usiamo Vercel Cron: sul piano Hobby dà al massimo
-- due job, una volta al giorno, a orario non garantito.
--
-- PRIMA di applicare questa migration, una volta sola, mettere il segreto nel Vault:
--   select vault.create_secret('<JOBS_SECRET>', 'zapp_jobs_secret',
--                              'segreto delle route /api/jobs/*');
-- e mettere lo stesso valore in JOBS_SECRET su Vercel (Production e Preview).

create extension if not exists pg_cron with schema cron;
create extension if not exists pg_net with schema extensions;

-- La coda dei voti, con le priorità della spec: prima i titoli che stanno in una
-- classifica corrente, poi quelli che qualcuno ha in libreria, poi tutti gli altri.
-- Dentro ogni fascia, il più vecchio per primo. I titoli che MDBList non conosce
-- (`mdblist_miss`) tornano in coda solo dopo 30 giorni.
create or replace function public.ratings_refresh_queue(want integer)
returns table (id bigint, media_type public.media_type)
language sql
stable
security definer
set search_path = public
as $$
  with in_charts as (
    select distinct c.title_id as id, c.media_type
    from public.title_charts c
    where c.title_id is not null
      and c.period > current_date - interval '21 days'
  ),
  in_library as (
    select distinct w.title_id as id, w.media_type
    from public.watch_entries w
  ),
  ranked as (
    select t.id,
           t.media_type,
           case
             when ic.id is not null then 0
             when il.id is not null then 1
             else 2
           end as priority,
           r.fetched_at,
           r.mdblist_miss
    from public.titles t
    left join in_charts  ic on ic.id = t.id and ic.media_type = t.media_type
    left join in_library il on il.id = t.id and il.media_type = t.media_type
    left join public.title_ratings r on r.title_id = t.id and r.media_type = t.media_type
  )
  select ranked.id, ranked.media_type
  from ranked
  where ranked.fetched_at is null
     or (ranked.mdblist_miss and ranked.fetched_at < now() - interval '30 days')
     or (not ranked.mdblist_miss
         and ranked.fetched_at < now() - (case when ranked.priority < 2
                                               then interval '7 days'
                                               else interval '30 days' end))
  order by ranked.priority, ranked.fetched_at nulls first
  limit greatest(1, want);
$$;

revoke all on function public.ratings_refresh_queue(integer) from public, anon, authenticated;

create or replace function public.call_zapp_job(job_name text)
returns bigint
language plpgsql
security definer
set search_path = public, extensions, vault
as $$
declare
  secret text;
begin
  select decrypted_secret into secret
  from vault.decrypted_secrets
  where name = 'zapp_jobs_secret';

  if secret is null then
    raise exception 'zapp_jobs_secret assente dal Vault';
  end if;

  return net.http_post(
    url := 'https://zapp-mu.vercel.app/api/jobs/' || job_name,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-jobs-secret', secret
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
end;
$$;

revoke all on function public.call_zapp_job(text) from public, anon, authenticated;

-- Netflix pubblica il martedì: due tentativi, il secondo fa da rete di sicurezza.
select cron.schedule('zapp-charts-netflix', '0 4 * * 2,3',
  $$select public.call_zapp_job('charts-netflix')$$);

-- Ogni giorno: risolve i titoli nuovi e ricalcola il momentum.
select cron.schedule('zapp-charts-resolve', '30 5 * * *',
  $$select public.call_zapp_job('charts-resolve')$$);

-- Ogni ora: 5 lotti da 100 = 500 titoli, cioè 120 richieste al giorno sulle 10.000
-- del piano Supporter.
select cron.schedule('zapp-ratings-refresh', '0 * * * *',
  $$select public.call_zapp_job('ratings-refresh')$$);
```

- [ ] **Step 8: Applicare e verificare**

Applicare con `mcp__claude_ai_Supabase__apply_migration` (name `0021_jobs_cron`) **dopo**
aver creato il segreto nel Vault e messo `JOBS_SECRET` su Vercel. Poi, con
`mcp__claude_ai_Supabase__execute_sql`:

```sql
select jobname, schedule, active from cron.job where jobname like 'zapp-%' order by jobname;
```

Atteso: tre righe attive — `zapp-charts-netflix`, `zapp-charts-resolve`,
`zapp-ratings-refresh`.

- [ ] **Step 9: Verificare tipi e lint**

Run: `pnpm typecheck && pnpm lint && pnpm test`
Atteso: tutto verde.

- [ ] **Step 10: Commit**

```bash
pnpm format
git add src/lib/jobs/auth.ts src/lib/jobs/auth.test.ts src/lib/jobs/runs.ts "src/app/api/jobs/[job]/route.ts" supabase/migrations/0021_jobs_cron.sql
git commit -m "feat(jobs): route protette e motore periodico su pg_cron"
```

---

### Task 9: Classifiche delle altre piattaforme

**Files:**
- Create: `src/lib/charts/justwatch.ts`
- Modify: `src/app/api/jobs/[job]/route.ts` (aggiungere il job `charts-justwatch`)

**Files (aggiuntivo):**
- Modify: `src/lib/links/justwatch.ts` (estrarre ed esportare il POST GraphQL)

**Interfaces:**
- Consuma: `ChartInput`/`saveChart` (Task 7), `getOrFetchTitle` da `@/lib/tmdb/cache`, `discoverNewOnStreaming` dal client TMDB.
- Produce:
  - `links/justwatch.ts`: `async function jwPost<T>(query: string, variables: Record<string, unknown>, revalidate: number): Promise<T | null>`, `const JW_QUERY_COUNTRY: string`, `const JW_QUERY_LANGUAGE: string`
  - `charts/justwatch.ts`: `async function fetchProviderChart(providerId: number, mediaType: "movie" | "tv"): Promise<ChartInput[]>`

- [ ] **Step 1: Esporre il POST GraphQL già esistente**

`src/lib/links/justwatch.ts` fa il `POST` dentro `searchJustWatch` (righe 118-152).
Non va scritto un secondo client HTTP: si estrae quel `fetch` in una funzione
esportata e `searchJustWatch` la usa.

Modify `src/lib/links/justwatch.ts`, subito prima di `searchJustWatch`:

```ts
/**
 * Un POST al GraphQL pubblico di JustWatch. Estratta da `searchJustWatch` perché la
 * usa anche `src/lib/charts/justwatch.ts` per le classifiche per piattaforma: un solo
 * endpoint, un solo timeout, un solo User-Agent.
 */
export async function jwPost<T>(
  query: string,
  variables: Record<string, unknown>,
  revalidate: number,
): Promise<T | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), JW_TIMEOUT_MS);
  try {
    const res = await fetch(JW_ENDPOINT, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json",
        "user-agent": JW_UA,
      },
      body: JSON.stringify({ query, variables }),
      signal: controller.signal,
      next: { revalidate },
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    // timeout o rete: chi chiama ha sempre un ripiego
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Costanti condivise con le classifiche. */
export const JW_QUERY_COUNTRY = JW_COUNTRY;
export const JW_QUERY_LANGUAGE = JW_LANGUAGE;
```

e riscrivere il corpo di `searchJustWatch` così:

```ts
async function searchJustWatch(
  query: string,
  objectType: "MOVIE" | "SHOW",
): Promise<JwNode[]> {
  const json = await jwPost<JwResponse>(
    QUERY,
    {
      country: JW_COUNTRY,
      language: JW_LANGUAGE,
      first: 10,
      filter: { searchQuery: query, objectTypes: [objectType] },
    },
    86400,
  );
  return (json?.data?.popularTitles?.edges ?? []).map((e) => e.node);
}
```

Run: `pnpm typecheck && pnpm lint`
Atteso: nessun errore — il comportamento di `getJustWatchOffers` non cambia.

- [ ] **Step 2: Scrivere il modulo**

Create `src/lib/charts/justwatch.ts`:

```ts
import "server-only";

import { PROVIDERS } from "@/lib/config";
import {
  JW_QUERY_COUNTRY,
  JW_QUERY_LANGUAGE,
  jwPost,
} from "@/lib/links/justwatch";
import { getOrFetchTitle } from "@/lib/tmdb/cache";
import { discoverNewOnStreaming } from "@/lib/tmdb/client";
import type { ChartInput } from "./store";

/** Codici pacchetto di JustWatch per i provider che ci interessano. */
const JW_PACKAGE: Record<number, string> = {
  8: "nfx", // Netflix
  119: "amp", // Prime Video
  337: "dnp", // Disney+
  350: "atp", // Apple TV+
};

const CHART_SIZE = 10;
/** La classifica cambia ogni giorno: cache Next di sei ore. */
const JW_REVALIDATE_S = 6 * 60 * 60;

const CHART_QUERY = `
query ZappProviderChart($country: Country!, $language: Language!, $first: Int!, $filter: TitleFilter) {
  popularTitles(country: $country, first: $first, filter: $filter) {
    edges {
      node {
        objectType
        content(country: $country, language: $language) {
          title
          externalIds { tmdbId }
        }
      }
    }
  }
}`;

interface ChartResponse {
  data?: {
    popularTitles?: {
      edges?: {
        node: {
          content: {
            title: string | null;
            externalIds: { tmdbId: string | number | null } | null;
          } | null;
        };
      }[];
    };
  };
}

/**
 * Classifiche per piattaforma.
 *
 * Prime Video, Disney+ e Apple TV+ **non pubblicano** una Top 10 come fa Netflix:
 * questa è una stima, e resta dichiarata come tale — la riga porta `source` diverso da
 * `netflix_tudum` e la UI dice "i più visti", non "classifica ufficiale".
 *
 * Prima si prova JustWatch, che ha una popolarità vera per provider in Italia **e
 * restituisce già il `tmdbId`**: quelle righe nascono risolte e saltano
 * `resolvePending`. Se JustWatch non risponde si ripiega su TMDB `discover` filtrato
 * per provider e la riga viene scritta con `source = 'tmdb'`, così l'origine del dato
 * resta sempre leggibile.
 */
export async function fetchProviderChart(
  providerId: number,
  mediaType: "movie" | "tv",
): Promise<ChartInput[]> {
  const period = new Date().toISOString().slice(0, 10);
  const name = PROVIDERS[providerId]?.name ?? String(providerId);

  const fromJustWatch = await popularOnJustWatch(providerId, mediaType);
  if (fromJustWatch.length > 0) {
    return fromJustWatch.map((item, i) => ({
      source: "justwatch" as const,
      providerId,
      mediaType,
      period,
      rank: i + 1,
      rawTitle: item.title,
      rawSeason: null,
      weeksInChart: null,
      titleId: item.tmdbId,
    }));
  }

  console.log(`[charts] JustWatch muto per ${name}: ripiego su TMDB discover`);
  const page = await discoverNewOnStreaming(mediaType, [providerId]).catch(() => null);
  const results = (page?.results ?? []).slice(0, CHART_SIZE);
  const out: ChartInput[] = [];
  for (const r of results) {
    if (r.media_type !== mediaType) continue;
    const title = r.media_type === "tv" ? r.name : r.title;
    if (!title) continue;
    // `title_id` esige la riga in `titles`: la scarichiamo prima di scriverla
    const cached = await getOrFetchTitle(r.id, mediaType);
    out.push({
      source: "tmdb",
      providerId,
      mediaType,
      period,
      rank: out.length + 1,
      rawTitle: title,
      rawSeason: null,
      weeksInChart: null,
      titleId: cached ? r.id : null,
    });
  }
  return out;
}

/**
 * I titoli più popolari su un provider in Italia. Ritorna solo quelli con un `tmdbId`
 * che siamo riusciti a mettere in cache: senza la riga in `titles` la chiave esterna
 * di `title_charts` rifiuterebbe l'id.
 */
async function popularOnJustWatch(
  providerId: number,
  mediaType: "movie" | "tv",
): Promise<{ title: string; tmdbId: number }[]> {
  const pkg = JW_PACKAGE[providerId];
  if (!pkg) return [];

  const json = await jwPost<ChartResponse>(
    CHART_QUERY,
    {
      country: JW_QUERY_COUNTRY,
      language: JW_QUERY_LANGUAGE,
      first: CHART_SIZE,
      filter: {
        packages: [pkg],
        objectTypes: [mediaType === "tv" ? "SHOW" : "MOVIE"],
      },
    },
    JW_REVALIDATE_S,
  );

  const out: { title: string; tmdbId: number }[] = [];
  for (const edge of json?.data?.popularTitles?.edges ?? []) {
    const content = edge.node.content;
    const tmdbId = Number(content?.externalIds?.tmdbId);
    if (!content?.title || !Number.isInteger(tmdbId) || tmdbId <= 0) continue;
    const cached = await getOrFetchTitle(tmdbId, mediaType);
    if (!cached) continue;
    out.push({ title: content.title, tmdbId });
  }
  return out;
}
```

- [ ] **Step 3: Provare la query dal vivo**

```bash
pnpm tsx -e "import('./src/lib/charts/justwatch').then(async (m) => console.log(await m.fetchProviderChart(119, 'movie')))"
```

Atteso: dieci righe con `source: "justwatch"` e un `titleId` valorizzato.
Se tornano con `source: "tmdb"`, JustWatch non ha risposto o ha cambiato lo schema del
filtro: annotarlo nel commit e proseguire — il ripiego funziona ed è previsto dal design,
ma va segnalato all'utente perché la classifica diventa "novità" invece che "più visti".

- [ ] **Step 4: Aggiungere il job**

Modify `src/app/api/jobs/[job]/route.ts`. Aggiungere l'import

```ts
import { fetchProviderChart } from "@/lib/charts/justwatch";
```

estendere `JobName` con `"charts-justwatch"` e aggiungere la voce a `JOBS`:

```ts
  "charts-justwatch": async () => {
    // Netflix escluso: per lui abbiamo il dato ufficiale di Tudum
    const providers = [119, 337, 350];
    let written = 0;
    for (const providerId of providers) {
      for (const mediaType of ["movie", "tv"] as const) {
        written += await saveChart(await fetchProviderChart(providerId, mediaType));
      }
    }
    return { providers: providers.length, written };
  },
```

- [ ] **Step 5: Aggiungere lo schedule**

Con `mcp__claude_ai_Supabase__execute_sql`:

```sql
select cron.schedule('zapp-charts-justwatch', '0 5 * * *',
  $$select public.call_zapp_job('charts-justwatch')$$);
```

Verificare con `select jobname from cron.job where jobname like 'zapp-%'`: quattro righe.

- [ ] **Step 6: Verificare tipi e lint**

Run: `pnpm typecheck && pnpm lint`
Atteso: nessun errore.

- [ ] **Step 7: Commit**

```bash
pnpm format
git add src/lib/charts/justwatch.ts src/lib/links/justwatch.ts "src/app/api/jobs/[job]/route.ts"
git commit -m "feat(charts): i piu visti su Prime, Disney+ e Apple TV+"
```

---

### Task 10: Scaffali di classifica e badge sulle locandine

**Files:**
- Create: `src/lib/charts/queries.ts`
- Modify: `src/components/ui/PosterCard.tsx` (prop `chartBadge`)
- Modify: `src/components/discover/DiscoverSections.tsx` (scaffali nuovi, sostituzione dei due "più amati")

**Interfaces:**
- Consuma: `Tables<"title_charts">` (Task 1), `TITLE_LIST_COLUMNS` da `@/lib/watch/queries`, `getRatings`/`ratingKey` (Task 4).
- Produce:
  - `interface ChartItem { id: number; mediaType: "movie" | "tv"; title: string; posterPath: string | null; year: string | null; rank: number; momentum: number | null; providerId: number; official: boolean; score: number | null }`
  - `async function getProviderChart(providerId: number): Promise<ChartItem[]>`
  - `async function getRisingChart(): Promise<ChartItem[]>`
  - `async function getTopRatedOnZapp(mediaType: "movie" | "tv"): Promise<ChartItem[]>`
  - `async function getChartBadges(keys: TitleKey[]): Promise<Map<string, { rank: number; providerName: string; rising: boolean }>>`

- [ ] **Step 1: Scrivere le letture**

Create `src/lib/charts/queries.ts`:

```ts
import "server-only";

import { cache } from "react";
import { PROVIDERS } from "@/lib/config";
import { createClient } from "@/lib/supabase/server";
import { ratingKey, type TitleKey } from "@/lib/ratings/queries";

export interface ChartItem {
  id: number;
  mediaType: "movie" | "tv";
  title: string;
  posterPath: string | null;
  year: string | null;
  rank: number;
  momentum: number | null;
  providerId: number;
  /** `true` solo per il Top 10 ufficiale di Netflix; il resto è una stima. */
  official: boolean;
  score: number | null;
}

/** Le colonne del titolo che servono a una locandina: mai `raw`. */
const TITLE_COLUMNS = "id, media_type, title, poster_path, release_date";

interface ChartRow {
  rank: number;
  momentum: number | null;
  source: string;
  provider_id: number;
  media_type: "movie" | "tv";
  titles: {
    id: number;
    media_type: "movie" | "tv";
    title: string;
    poster_path: string | null;
    release_date: string | null;
  } | null;
}

function toItems(rows: ChartRow[], scores: Map<string, number | null>): ChartItem[] {
  const seen = new Set<string>();
  const out: ChartItem[] = [];
  for (const row of rows) {
    const t = row.titles;
    if (!t || !t.poster_path) continue;
    const key = ratingKey(t.id, t.media_type);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      id: t.id,
      mediaType: t.media_type,
      title: t.title,
      posterPath: t.poster_path,
      year: t.release_date ? t.release_date.slice(0, 4) : null,
      rank: row.rank,
      momentum: row.momentum,
      providerId: row.provider_id,
      official: row.source === "netflix_tudum",
      score: scores.get(key) ?? null,
    });
  }
  return out;
}

async function withScores(rows: ChartRow[]): Promise<ChartItem[]> {
  const supabase = await createClient();
  const ids = rows.map((r) => r.titles?.id).filter((id): id is number => id != null);
  const scores = new Map<string, number | null>();
  if (ids.length > 0) {
    const { data } = await supabase
      .from("title_ratings")
      .select("title_id, media_type, zapp_score")
      .in("title_id", ids);
    for (const r of data ?? []) {
      scores.set(
        ratingKey(r.title_id, r.media_type),
        r.zapp_score === null ? null : Number(r.zapp_score),
      );
    }
  }
  return toItems(rows, scores);
}

/** L'ultima classifica disponibile di un provider, film e serie insieme. */
export const getProviderChart = cache(
  async (providerId: number): Promise<ChartItem[]> => {
    const supabase = await createClient();
    const { data } = await supabase
      .from("title_charts")
      .select(
        `rank, momentum, source, provider_id, media_type, titles!title_charts_title_fkey(${TITLE_COLUMNS})`,
      )
      .eq("provider_id", providerId)
      .eq("country", "IT")
      .not("title_id", "is", null)
      .order("period", { ascending: false })
      .order("rank", { ascending: true })
      .limit(40);
    return withScores((data ?? []) as unknown as ChartRow[]);
  },
);

/** Chi ha guadagnato almeno due posizioni, su qualunque fonte. */
export const getRisingChart = cache(async (): Promise<ChartItem[]> => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("title_charts")
    .select(
      `rank, momentum, source, provider_id, media_type, titles!title_charts_title_fkey(${TITLE_COLUMNS})`,
    )
    .eq("country", "IT")
    .gte("momentum", 2)
    .not("title_id", "is", null)
    .order("period", { ascending: false })
    .order("momentum", { ascending: false })
    .limit(40);
  return withScores((data ?? []) as unknown as ChartRow[]);
});

/** I meglio votati secondo lo ZappScore, solo dove il voto è solido. */
export const getTopRatedOnZapp = cache(
  async (mediaType: "movie" | "tv"): Promise<ChartItem[]> => {
    const supabase = await createClient();
    const { data } = await supabase
      .from("title_ratings")
      .select(`zapp_score, title_id, media_type, titles!inner(${TITLE_COLUMNS})`)
      .eq("media_type", mediaType)
      .eq("confidence", "high")
      .order("zapp_score", { ascending: false })
      .limit(20);

    const out: ChartItem[] = [];
    for (const row of data ?? []) {
      const t = row.titles as unknown as ChartRow["titles"];
      if (!t || !t.poster_path) continue;
      out.push({
        id: t.id,
        mediaType: t.media_type,
        title: t.title,
        posterPath: t.poster_path,
        year: t.release_date ? t.release_date.slice(0, 4) : null,
        rank: 0,
        momentum: null,
        providerId: 0,
        official: false,
        score: row.zapp_score === null ? null : Number(row.zapp_score),
      });
    }
    return out;
  },
);

/**
 * Il badge di una locandina: la posizione in classifica se c'è, altrimenti "in salita".
 * Una query sola per pagina, come per i voti.
 */
export const getChartBadges = cache(
  async (
    keys: TitleKey[],
  ): Promise<Map<string, { rank: number; providerName: string; rising: boolean }>> => {
    const out = new Map<string, { rank: number; providerName: string; rising: boolean }>();
    if (keys.length === 0) return out;
    const supabase = await createClient();
    const { data } = await supabase
      .from("title_charts")
      .select("title_id, media_type, rank, momentum, provider_id, period")
      .in(
        "title_id",
        keys.map((k) => k.id),
      )
      .eq("country", "IT")
      .order("period", { ascending: false })
      .order("rank", { ascending: true })
      .limit(200);

    for (const row of data ?? []) {
      if (row.title_id === null) continue;
      const key = ratingKey(row.title_id, row.media_type);
      if (out.has(key)) continue; // la prima riga è già la più recente e meglio piazzata
      out.set(key, {
        rank: row.rank,
        providerName: PROVIDERS[row.provider_id]?.name ?? "streaming",
        rising: (row.momentum ?? 0) >= 2,
      });
    }
    return out;
  },
);
```

- [ ] **Step 2: Aggiungere il badge alla locandina**

Modify `src/components/ui/PosterCard.tsx`. Nuova prop nella firma:

```tsx
  /**
   * Pillola in alto a sinistra: la posizione in classifica ("#3 su Netflix") oppure
   * "in salita". Una sola alla volta — la classifica ha la precedenza.
   */
  chartBadge?: { rank: number; providerName: string; rising: boolean } | null;
```

e, dentro il `div` con `className="relative aspect-[2/3] ..."`, subito dopo l'`Image`:

```tsx
        {chartBadge && (
          <span className="glass absolute left-1.5 top-1.5 rounded-full px-2 py-0.5 text-[10px] font-semibold">
            {chartBadge.rank <= 10
              ? `#${chartBadge.rank} su ${chartBadge.providerName}`
              : chartBadge.rising
                ? "↑ in salita"
                : null}
          </span>
        )}
```

Ricordarsi di aggiungere `chartBadge = null,` fra i parametri destrutturati.

- [ ] **Step 3: Aggiungere gli scaffali**

Modify `src/components/discover/DiscoverSections.tsx`.

Aggiungere gli import:

```tsx
import {
  getProviderChart,
  getRisingChart,
  getTopRatedOnZapp,
  type ChartItem,
} from "@/lib/charts/queries";
```

Aggiungere un componente scaffale che parla di `ChartItem` (gli altri parlano di
`TmdbMultiResult`, che ha una forma diversa: non vanno mescolati):

```tsx
function ChartShelf({
  title,
  items,
  byType,
  showRank,
}: {
  title: string;
  items: ChartItem[];
  byType: boolean;
  /** La pillola con la posizione: solo per gli scaffali che sono una classifica. */
  showRank: boolean;
}) {
  if (items.length === 0) return null;

  const one = (type?: HomeTab) => {
    const mine =
      type && type !== "all" ? items.filter((i) => i.mediaType === type) : items;
    if (mine.length === 0) return null;
    const shelf = (
      <HorizontalShelf title={title}>
        {mine.slice(0, SHELF_SIZE).map((i) => (
          <PosterCard
            key={`${i.mediaType}-${i.id}`}
            className="w-28 shrink-0 lg:w-[140px]"
            title={i.title}
            posterPath={i.posterPath}
            year={i.year}
            rating={i.score}
            href={`/title/${i.mediaType}/${i.id}`}
            preview={byType}
            chartBadge={
              showRank
                ? {
                    rank: i.rank,
                    providerName: PROVIDERS[i.providerId]?.name ?? "streaming",
                    rising: (i.momentum ?? 0) >= 2,
                  }
                : null
            }
          />
        ))}
      </HorizontalShelf>
    );
    return type ? <HomeTypeGate type={type}>{shelf}</HomeTypeGate> : shelf;
  };

  if (!byType) return one();
  return (
    <>
      {one("all")}
      {one("movie")}
      {one("tv")}
    </>
  );
}
```

Aggiungere `import { PROVIDERS } from "@/lib/config";` accanto a `MAIN_PROVIDER_IDS`.

Dentro `DiscoverSections`, aggiungere al `Promise.all` esistente:

```tsx
    getProviderChart(8).catch(() => []),
    getProviderChart(119).catch(() => []),
    getProviderChart(337).catch(() => []),
    getProviderChart(350).catch(() => []),
    getRisingChart().catch(() => []),
    getTopRatedOnZapp("movie").catch(() => []),
    getTopRatedOnZapp("tv").catch(() => []),
```

con i nomi corrispondenti nella destrutturazione: `netflixChart`, `primeChart`,
`disneyChart`, `appleChart`, `rising`, `topMovies`, `topTv`.

Nel JSX, **prima** di `<Shelf title="Di tendenza questa settimana" ...>`:

```tsx
      <ChartShelf
        title="Top 10 su Netflix in Italia"
        items={netflixChart}
        byType={byType}
        showRank
      />
      <ChartShelf
        title="I più visti su Prime Video"
        items={primeChart}
        byType={byType}
        showRank
      />
      <ChartShelf
        title="I più visti su Disney+"
        items={disneyChart}
        byType={byType}
        showRank
      />
      <ChartShelf
        title="I più visti su Apple TV+"
        items={appleChart}
        byType={byType}
        showRank
      />
      <ChartShelf
        title="In salita questa settimana"
        items={rising}
        byType={byType}
        showRank={false}
      />
```

E **sostituire** i due scaffali che oggi ordinano per `vote_average` di TMDB:

```tsx
      <Shelf title="Film più amati di sempre" items={movieTop?.results} byType={byType} />
      <Shelf title="Serie più amate di sempre" items={tvTop?.results} byType={byType} />
```

con:

```tsx
      <ChartShelf
        title="I film meglio votati su Zapp"
        items={topMovies}
        byType={byType}
        showRank={false}
      />
      <ChartShelf
        title="Le serie meglio votate su Zapp"
        items={topTv}
        byType={byType}
        showRank={false}
      />
```

Togliere allora `discoverTopRated` dal `Promise.all` e dall'import se non è più usato —
il typecheck e il lint lo dicono.

- [ ] **Step 4: Il badge anche sugli scaffali TMDB**

Un titolo in Top 10 deve portare la sua pillola **ovunque compaia**, non solo nello
scaffale della classifica: è il segnale "questo va adesso" mentre si scorre. Gli
scaffali TMDB (`Shelf`) parlano di `TmdbMultiResult`, quindi il badge arriva da una
mappa calcolata una volta sola per l'intera pagina.

Modify `src/components/discover/DiscoverSections.tsx`. Aggiungere l'import
`getChartBadges` a quelli di `@/lib/charts/queries`, e in fondo al `Promise.all`
**non** aggiungere niente: la mappa si calcola dopo, quando i risultati TMDB ci sono.

Subito prima del `return` di `DiscoverSections`:

```tsx
  // Una query sola per tutta la pagina: la posizione in classifica di ogni titolo
  // che compare negli scaffali TMDB.
  const shown = [
    trending?.results,
    nowPlaying?.results,
    newOnStreaming,
    tvPopular?.results,
    moviePopular?.results,
    comingSoon,
  ]
    .flatMap((list) => list ?? [])
    .filter((r) => r.media_type === "movie" || r.media_type === "tv")
    .map((r) => ({ id: r.id, mediaType: r.media_type as "movie" | "tv" }));
  const badges = await getChartBadges(shown).catch(() => new Map());
```

Poi far scendere `badges` fino alle locandine. In `ShelfItems`:

```tsx
function ShelfItems({
  items,
  preview,
  badges,
}: {
  items: TmdbMultiResult[];
  preview?: boolean;
  badges?: Map<string, { rank: number; providerName: string; rising: boolean }>;
}) {
  return (
    <>
      {items
        .filter((r) => r.media_type === "movie" || r.media_type === "tv")
        .filter((r) => r.poster_path)
        .slice(0, SHELF_SIZE)
        .map((item) => (
          <PosterCard
            key={`${item.media_type}-${item.id}`}
            className="w-28 shrink-0 lg:w-[140px]"
            title={searchResultTitle(item)}
            posterPath={item.poster_path ?? null}
            year={searchResultYear(item)}
            href={`/title/${item.media_type}/${item.id}`}
            preview={preview}
            chartBadge={badges?.get(`${item.media_type}-${item.id}`) ?? null}
          />
        ))}
    </>
  );
}
```

`ShelfProps`, `OneShelf` e `Shelf` prendono la stessa prop `badges` opzionale e la
passano oltre senza altra logica. Ogni `<Shelf ... />` nel JSX riceve `badges={badges}`.

La chiave della mappa è `` `${mediaType}-${id}` ``, la stessa che produce `ratingKey`:
se le due divergono i badge spariscono in silenzio, quindi vanno tenute insieme.

- [ ] **Step 5: Verificare tipi e lint**

Run: `pnpm typecheck && pnpm lint`
Atteso: nessun errore. Se `PosterCard` protesta su `rating={i.score}` (che è
`number | null`), va bene: la prop è già `number | null | undefined`.

- [ ] **Step 6: Lanciare tutta la suite**

Run: `pnpm test`
Atteso: PASS su tutti i file, compresi quelli preesistenti.

- [ ] **Step 7: Build di verifica in un worktree separato**

```bash
git worktree add ../Zapp-ratings HEAD
cd ../Zapp-ratings && pnpm install --frozen-lockfile && pnpm build
```

Atteso: build completata. **Mai** lanciarla nella `.next` del tree principale: le sessioni
parallele si rompono a vicenda (regola in CLAUDE.md).

- [ ] **Step 8: Commit**

```bash
git add src/lib/charts/queries.ts src/components/ui/PosterCard.tsx src/components/discover/DiscoverSections.tsx
git commit -m "feat(charts): scaffali di classifica, badge e meglio votati su Zapp"
```

---

## Collaudo finale (dopo il Task 10)

- [ ] Lanciare i job a mano, in quest'ordine, con il segreto giusto:
  `POST /api/jobs/charts-netflix`, poi `charts-resolve`, poi `ratings-refresh`,
  poi `charts-justwatch`.
- [ ] Controllare gli esiti:
  ```sql
  select job, started_at, ok, detail from public.job_runs order by started_at desc limit 10;
  ```
  Atteso: quattro righe `ok = true`, con `written > 0` per `charts-netflix`.
- [ ] Controllare quanti titoli di classifica non si sono risolti:
  ```sql
  select source, count(*) filter (where title_id is null) as non_risolti, count(*) as totale
  from public.title_charts group by source;
  ```
  Qualche titolo non risolto è normale (film Netflix originali senza corrispondenza
  italiana su TMDB); più della metà non lo è, e allora il problema sta in
  `resolveChartTitle`.
- [ ] Aprire la home: gli scaffali di classifica devono comparire sopra gli altri, con i
  badge sulle locandine.
- [ ] Aprire una scheda titolo: lo ZappScore col pannello "Da dove viene".
- [ ] Aggiornare `CLAUDE.md` con una sezione «Algoritmo: voti e classifiche» che riassuma
  tabelle, job e regola dei due bacini, e committarla.
