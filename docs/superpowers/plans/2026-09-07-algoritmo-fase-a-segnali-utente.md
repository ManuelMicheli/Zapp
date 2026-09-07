# Fase A dell'algoritmo — segnali utente: piano di implementazione

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** dare a Zapp un profilo di gusto per utente (`user_taste`), alimentato da onboarding (anno di nascita + 5 titoli seed) e da telemetria implicita (impression / aperture / skip), con un interruttore che spegne e cancella tutto.

**Architecture:** tre strati separati. (1) **Raccolta**: un solo `IntersectionObserver` in un provider client montato nel layout `(app)`, che legge gli attributi `data-signal` delle copertine e manda batch a `POST /api/events`; le azioni esplicite (aggiunta in libreria, voto) le scrive il server dentro le Server Action che già esistono. (2) **Aggregazione**: due funzioni SQL `security definer` riducono eventi e libreria a una riga per titolo. (3) **Calcolo**: `buildTasteProfile`, funzione **pura** con test Vitest, trasforma quelle righe in vettori normalizzati; la esegue un job `pg_cron` orario sulla rotta `/api/jobs/[job]` già esistente, più un ricalcolo immediato a fine onboarding.

**Tech Stack:** Next.js 15 App Router (Server Components), TypeScript strict, Supabase (Postgres + RLS + pg_cron + Vault), Vitest per le funzioni pure, Playwright per la verifica visiva, Tailwind 4 con i token del progetto.

**Spec:** `docs/superpowers/specs/2026-09-07-algoritmo-fase-a-segnali-utente-design.md`

## Global Constraints

- **Worktree**: `D:/PROGETTI/Zapp-algoritmo` (branch `feat/algoritmo-fase-b`, allineato a `origin/main`). Mai `git stash`/`reset` nel tree condiviso `D:/PROGETTI/Zapp`: ci lavorano altre sessioni.
- **Lingua**: UI e commenti in **italiano**. Nessuna stringa inglese visibile all'utente.
- **Niente `localStorage` né `sessionStorage` per dati dell'utente** (regola di progetto): il `sessionId` della telemetria vive in memoria e muore con la scheda.
- **Il service client (`createServiceClient`) non tocca mai dati utente su richiesta dell'utente**: la rotta `/api/events` scrive con il client a cookie (RLS attiva). Il service client compare solo dentro i job.
- **Nessuna chiamata TMDB dal client.**
- **Il voto TMDB non si tocca**: questa fase non cambia nulla di ciò che si vede sulle copertine. `PosterCard.affinity` resta `null` fino alla fase C.
- Prettier: doppi apici, virgole finali, `printWidth` 90. I file del worktree sono **CRLF**: gli script di modifica devono normalizzare `\r?\n`.
- Verifica minima prima di ogni commit che tocca `src/`: `pnpm typecheck && pnpm lint && pnpm test`.
- **Mai due `next build` nello stesso `.next`**: per costruire usare `NEXT_DIST_DIR=.next-check pnpm build`.
- Attribuzione dei commit:
  ```
  Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_014VjXxfzV52izLXiQDcbv32
  ```

**Due correzioni alla spec, decise leggendo lo schema reale** (da riportare nella spec al Task 12):

1. La tabella `titles` **non ha** la colonna `original_language`: la dimensione `lingua` si ricava da `titles.raw->original_language`, e quindi **solo per i 50 titoli di testa**, insieme a `persone`, che già leggono `raw`. Nessuna lettura di `raw` in più.
2. `src/lib/home/hero.ts` esporta già una funzione chiamata `getTaste`. La lettura del profilo si chiama **`getTasteProfile`**, per non creare due simboli omonimi in due moduli.

---

### Task 1: Migration 0024 — tabelle, RLS e funzioni SQL

**Files:**
- Create: `supabase/migrations/0024_segnali_utente.sql`
- Modify: `src/types/database.ts` (rigenerato, non a mano)

**Interfaces:**
- Consumes: niente (primo task).
- Produces: tabelle `user_preferences`, `user_events`, `user_seed_picks`, `user_taste`; enum `signal_kind`; funzioni `taste_input(uid uuid)` e `taste_refresh_queue(want integer)`. I tipi TypeScript corrispondenti arrivano in `src/types/database.ts` (`Tables<"user_events">`, `Enums<"signal_kind">`, `Database["public"]["Functions"]["taste_input"]`).

- [ ] **Step 1: Scrivere la migration**

Crea `supabase/migrations/0024_segnali_utente.sql`:

```sql
-- Fase A dell'algoritmo: segnali utente.
--
-- Tre principi, tutti già pagati altrove in questo progetto:
--  * i dati personali stanno in tabelle private, mai in `profiles` (che è leggibile
--    da chiunque via `user_search` e dai profili pubblici) — come `user_locations`;
--  * niente foreign key verso `titles` sugli eventi: una copertina di ricerca può
--    essere di un titolo non ancora in cache, e perdere quell'evento sarebbe un buco
--    silenzioso proprio sui titoli nuovi;
--  * il profilo calcolato lo scrive solo il service client, come `job_runs`.

create table public.user_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  -- solo l'anno, mai la data completa. Il limite è letterale: Postgres rifiuta le
  -- funzioni non immutabili (`extract(year from now())`) dentro un check.
  birth_year smallint check (birth_year between 1900 and 2100),
  personalization_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.user_preferences enable row level security;

create policy user_preferences_select_own on public.user_preferences
  for select using (auth.uid() = user_id);
create policy user_preferences_insert_own on public.user_preferences
  for insert with check (auth.uid() = user_id);
create policy user_preferences_update_own on public.user_preferences
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create type public.signal_kind as enum (
  'impression', 'open', 'provider_open', 'trailer_play', 'dismiss',
  'library_add', 'rate'
);

create table public.user_events (
  id bigserial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  kind public.signal_kind not null,
  title_id bigint,
  media_type public.media_type,
  surface text not null,
  position smallint,
  session_id uuid not null,
  created_at timestamptz not null default now()
);

alter table public.user_events enable row level security;

create policy user_events_select_own on public.user_events
  for select using (auth.uid() = user_id);
create policy user_events_insert_own on public.user_events
  for insert with check (auth.uid() = user_id);
create policy user_events_delete_own on public.user_events
  for delete using (auth.uid() = user_id);
-- nessuna policy di update: un evento è un fatto, non si corregge

create index user_events_utente_idx on public.user_events (user_id, created_at desc);
create index user_events_potatura_idx on public.user_events (created_at);

-- Il vero risparmio: una impression ripetuta nella stessa sessione costa un
-- `on conflict do nothing`, non una riga. Senza, una home scorsa avanti e indietro
-- scriverebbe centinaia di righe identiche.
create unique index user_events_impression_unica_idx
  on public.user_events (user_id, session_id, title_id, media_type, surface)
  where kind = 'impression';

create table public.user_seed_picks (
  user_id uuid not null references auth.users(id) on delete cascade,
  title_id bigint not null,
  media_type public.media_type not null,
  created_at timestamptz not null default now(),
  primary key (user_id, title_id, media_type)
);

alter table public.user_seed_picks enable row level security;

create policy user_seed_picks_select_own on public.user_seed_picks
  for select using (auth.uid() = user_id);
create policy user_seed_picks_insert_own on public.user_seed_picks
  for insert with check (auth.uid() = user_id);
create policy user_seed_picks_delete_own on public.user_seed_picks
  for delete using (auth.uid() = user_id);

create table public.user_taste (
  user_id uuid primary key references auth.users(id) on delete cascade,
  generi jsonb not null default '{}'::jsonb,
  decenni jsonb not null default '{}'::jsonb,
  provider jsonb not null default '{}'::jsonb,
  persone jsonb not null default '{}'::jsonb,
  tipo jsonb not null default '{}'::jsonb,
  runtime jsonb not null default '{}'::jsonb,
  lingua jsonb not null default '{}'::jsonb,
  novita real,
  massa real not null default 0,
  eventi_contati integer not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.user_taste enable row level security;

-- Sola lettura per il proprietario: la riga la scrive il job col service client.
create policy user_taste_select_own on public.user_taste
  for select using (auth.uid() = user_id);

-- Tutto ciò che serve al calcolo, già ridotto a una riga per titolo.
--
-- Lo `skip` non è un evento che manda il client: è `impression_sessioni > 0 and
-- aperture = 0`. Contiamo le **sessioni** distinte con impression, non le impression:
-- dieci scroll nella stessa sessione sono una noia sola, non dieci rifiuti.
create or replace function public.taste_input(uid uuid)
returns table (
  title_id bigint,
  media_type public.media_type,
  status public.watch_status,
  rating smallint,
  last_watched_at timestamptz,
  is_seed boolean,
  impression_sessioni integer,
  aperture integer,
  provider_aperture integer,
  trailer integer,
  dismissi integer,
  ultimo_evento timestamptz
)
language sql
stable
security definer
set search_path = public
as $fn$
  with eventi as (
    select e.title_id,
           e.media_type,
           count(distinct e.session_id) filter (where e.kind = 'impression')   as impression_sessioni,
           count(*) filter (where e.kind = 'open')                             as aperture,
           count(*) filter (where e.kind = 'provider_open')                    as provider_aperture,
           count(*) filter (where e.kind = 'trailer_play')                     as trailer,
           count(*) filter (where e.kind = 'dismiss')                          as dismissi,
           max(e.created_at)                                                   as ultimo_evento
    from public.user_events e
    where e.user_id = uid
      and e.title_id is not null
      and e.media_type is not null
      and e.created_at > now() - interval '90 days'
    group by e.title_id, e.media_type
  ),
  libreria as (
    select w.title_id, w.media_type, w.status, w.rating, w.last_watched_at
    from public.watch_entries w
    where w.user_id = uid
  ),
  seed as (
    select s.title_id, s.media_type
    from public.user_seed_picks s
    where s.user_id = uid
  ),
  chiavi as (
    select title_id, media_type from eventi
    union
    select title_id, media_type from libreria
    union
    select title_id, media_type from seed
  )
  select k.title_id,
         k.media_type,
         l.status,
         l.rating::smallint,
         l.last_watched_at,
         (s.title_id is not null)                as is_seed,
         coalesce(ev.impression_sessioni, 0)::int,
         coalesce(ev.aperture, 0)::int,
         coalesce(ev.provider_aperture, 0)::int,
         coalesce(ev.trailer, 0)::int,
         coalesce(ev.dismissi, 0)::int,
         ev.ultimo_evento
  from chiavi k
  left join eventi   ev on ev.title_id = k.title_id and ev.media_type = k.media_type
  left join libreria l  on l.title_id  = k.title_id and l.media_type  = k.media_type
  left join seed     s  on s.title_id  = k.title_id and s.media_type  = k.media_type
  order by greatest(
    coalesce(l.last_watched_at, 'epoch'::timestamptz),
    coalesce(ev.ultimo_evento, 'epoch'::timestamptz)
  ) desc
  limit 1000;
$fn$;

revoke all on function public.taste_input(uuid) from public, anon, authenticated;

-- Gli utenti con qualcosa di nuovo dall'ultimo ricalcolo, i più fermi per primi.
create or replace function public.taste_refresh_queue(want integer)
returns table (user_id uuid)
language sql
stable
security definer
set search_path = public
as $fn$
  with ultimo_segnale as (
    select p.user_id,
           greatest(
             coalesce((select max(e.created_at) from public.user_events e where e.user_id = p.user_id), 'epoch'::timestamptz),
             coalesce((select max(w.updated_at) from public.watch_entries w where w.user_id = p.user_id), 'epoch'::timestamptz),
             coalesce((select max(s.created_at) from public.user_seed_picks s where s.user_id = p.user_id), 'epoch'::timestamptz)
           ) as ultimo
    from public.profiles p
  )
  select u.user_id
  from ultimo_segnale u
  left join public.user_preferences pr on pr.user_id = u.user_id
  left join public.user_taste t on t.user_id = u.user_id
  where u.ultimo > 'epoch'::timestamptz
    and coalesce(pr.personalization_enabled, true)
    and (t.updated_at is null or u.ultimo > t.updated_at)
  order by coalesce(t.updated_at, 'epoch'::timestamptz)
  limit greatest(1, want);
$fn$;

revoke all on function public.taste_refresh_queue(integer) from public, anon, authenticated;
```

- [ ] **Step 2: Applicare la migration**

Applicare col tool MCP Supabase `apply_migration` (nome `0024_segnali_utente`, progetto `bbuhwzdbzxgydewmcdwd`). **Non** lanciare `supabase db push`: il progetto ha già migration applicate fuori dal CLI.

- [ ] **Step 3: Verificare che le tabelle esistano e che RLS sia attiva**

Con `execute_sql`:

```sql
select tablename, rowsecurity
from pg_tables
where schemaname = 'public'
  and tablename in ('user_preferences','user_events','user_seed_picks','user_taste');
```

Atteso: 4 righe, `rowsecurity = true` su tutte.

Poi provare la funzione a vuoto (deve rispondere senza errore, zero righe):

```sql
select count(*) from public.taste_input('00000000-0000-0000-0000-000000000000'::uuid);
select count(*) from public.taste_refresh_queue(10);
```

- [ ] **Step 4: Rigenerare i tipi**

Con il tool MCP `generate_typescript_types` e sovrascrivere `src/types/database.ts`. Verificare che `Enums<"signal_kind">` e `Tables<"user_taste">` esistano:

```bash
grep -n "signal_kind" src/types/database.ts | head -3
```

- [ ] **Step 5: Verificare che il progetto compili ancora**

Run: `pnpm typecheck`
Expected: nessun errore (i tipi nuovi non sono ancora usati da nessuno).

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/0024_segnali_utente.sql src/types/database.ts
git commit -m "feat(algoritmo): tabelle dei segnali utente e funzioni di aggregazione"
```

---

### Task 2: `surfaces.ts` — l'elenco chiuso delle superfici e l'attributo `data-signal`

**Files:**
- Create: `src/lib/taste/surfaces.ts`
- Test: `src/lib/taste/surfaces.test.ts`

**Interfaces:**
- Consumes: niente.
- Produces:
  - `SURFACES: readonly Surface[]`, `type Surface`
  - `isSurface(v: string): v is Surface`
  - `interface SignalTarget { mediaType: "movie" | "tv"; titleId: number; surface: Surface; position: number | null }`
  - `signalAttr(mediaType: "movie" | "tv", titleId: number, surface: Surface, position?: number | null): string`
  - `parseSignal(raw: string | null | undefined): SignalTarget | null`

- [ ] **Step 1: Scrivere i test che falliscono**

Crea `src/lib/taste/surfaces.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { isSurface, parseSignal, signalAttr } from "./surfaces";

describe("signalAttr / parseSignal", () => {
  it("fa il giro completo con la posizione", () => {
    const attr = signalAttr("movie", 603, "home-top10", 3);
    expect(attr).toBe("movie:603:home-top10:3");
    expect(parseSignal(attr)).toEqual({
      mediaType: "movie",
      titleId: 603,
      surface: "home-top10",
      position: 3,
    });
  });

  it("fa il giro completo senza posizione", () => {
    const attr = signalAttr("tv", 1396, "search");
    expect(attr).toBe("tv:1396:search:");
    expect(parseSignal(attr)).toEqual({
      mediaType: "tv",
      titleId: 1396,
      surface: "search",
      position: null,
    });
  });

  it("rifiuta una superficie che non è nell'elenco", () => {
    expect(parseSignal("movie:603:home-inventata:1")).toBeNull();
  });

  it("rifiuta un id che non è un numero", () => {
    expect(parseSignal("movie:abc:search:1")).toBeNull();
  });

  it("rifiuta un media_type diverso da movie|tv", () => {
    expect(parseSignal("persona:603:search:1")).toBeNull();
  });

  it("rifiuta stringhe vuote, nulle o con troppi pezzi", () => {
    expect(parseSignal(null)).toBeNull();
    expect(parseSignal(undefined)).toBeNull();
    expect(parseSignal("")).toBeNull();
    expect(parseSignal("movie:603:search:1:extra")).toBeNull();
  });

  it("isSurface riconosce solo i nomi dell'elenco", () => {
    expect(isSurface("home-continua")).toBe(true);
    expect(isSurface("home-continua-bis")).toBe(false);
  });
});
```

- [ ] **Step 2: Lanciare i test e vederli fallire**

Run: `pnpm test src/lib/taste/surfaces.test.ts`
Expected: FAIL, "Failed to resolve import ./surfaces".

- [ ] **Step 3: Scrivere l'implementazione minima**

Crea `src/lib/taste/surfaces.ts`:

```ts
/**
 * Le superfici da cui può arrivare un segnale. È un **elenco chiuso** apposta: il
 * motore di ranking (fase C) deve poter pesare "l'ha ignorato in home" diversamente
 * da "l'ha ignorato in ricerca", e con stringhe libere non saprebbe mai quali esistono.
 *
 * Aggiungere una superficie qui è gratis; scriverne una a mano in un componente no:
 * `parseSignal` la scarta e l'evento non arriva mai.
 */
export const SURFACES = [
  "home-hero",
  "home-continua",
  "home-top10",
  "home-provider",
  "home-salita",
  "home-consigli",
  "home-libreria",
  "discover",
  "search",
  "library",
  "title-simili",
  "profile",
  "friends",
] as const;

export type Surface = (typeof SURFACES)[number];

const SET = new Set<string>(SURFACES);

export function isSurface(value: string): value is Surface {
  return SET.has(value);
}

export interface SignalTarget {
  mediaType: "movie" | "tv";
  titleId: number;
  surface: Surface;
  /** Posizione nello scaffale, da 0. `null` dove non ha senso. */
  position: number | null;
}

/** L'attributo che una copertina espone: `movie:603:home-top10:3`. */
export function signalAttr(
  mediaType: "movie" | "tv",
  titleId: number,
  surface: Surface,
  position?: number | null,
): string {
  return `${mediaType}:${titleId}:${surface}:${position ?? ""}`;
}

/** Legge l'attributo. Qualunque cosa storta torna `null`: mai un evento inventato. */
export function parseSignal(raw: string | null | undefined): SignalTarget | null {
  if (!raw) return null;
  const parts = raw.split(":");
  if (parts.length !== 4) return null;
  const [mediaType, id, surface, position] = parts;
  if (mediaType !== "movie" && mediaType !== "tv") return null;
  if (!/^\d+$/.test(id)) return null;
  if (!isSurface(surface)) return null;
  if (position !== "" && !/^\d+$/.test(position)) return null;
  return {
    mediaType,
    titleId: Number(id),
    surface,
    position: position === "" ? null : Number(position),
  };
}
```

- [ ] **Step 4: Lanciare i test**

Run: `pnpm test src/lib/taste/surfaces.test.ts`
Expected: PASS, 7 test.

- [ ] **Step 5: Commit**

```bash
git add src/lib/taste/surfaces.ts src/lib/taste/surfaces.test.ts
git commit -m "feat(algoritmo): elenco chiuso delle superfici e attributo data-signal"
```

---

### Task 3: `weights.ts` — pesi dei segnali e decadimento

**Files:**
- Create: `src/lib/taste/weights.ts`
- Test: `src/lib/taste/weights.test.ts`

**Interfaces:**
- Consumes: niente (funzioni pure).
- Produces:
  - `interface TasteRow` — la riga che torna `taste_input`, in camelCase
  - `WEIGHTS` (oggetto dei pesi), `HALF_LIFE_DAYS = 180`
  - `decay(at: string | null, now: Date): number`
  - `signalAt(row: TasteRow): string | null`
  - `rawWeight(row: TasteRow): number`
  - `weightOf(row: TasteRow, now: Date): number`

- [ ] **Step 1: Scrivere i test che falliscono**

Crea `src/lib/taste/weights.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { decay, rawWeight, weightOf, type TasteRow } from "./weights";

const ORA = new Date("2026-09-07T12:00:00Z");

function riga(patch: Partial<TasteRow> = {}): TasteRow {
  return {
    titleId: 1,
    mediaType: "movie",
    status: null,
    rating: null,
    lastWatchedAt: null,
    isSeed: false,
    impressionSessions: 0,
    opens: 0,
    providerOpens: 0,
    trailers: 0,
    dismisses: 0,
    lastEventAt: null,
    ...patch,
  };
}

describe("decay", () => {
  it("vale 1 oggi", () => {
    expect(decay(ORA.toISOString(), ORA)).toBeCloseTo(1, 5);
  });

  it("dimezza a 180 giorni", () => {
    const sei_mesi_fa = new Date(ORA.getTime() - 180 * 86400_000).toISOString();
    expect(decay(sei_mesi_fa, ORA)).toBeCloseTo(0.5, 3);
  });

  it("vale un quarto a due anni (360 giorni = due emivite)", () => {
    const due_anni = new Date(ORA.getTime() - 360 * 86400_000).toISOString();
    expect(decay(due_anni, ORA)).toBeCloseTo(0.25, 3);
  });

  it("non supera mai 1, nemmeno con una data futura (orologi storti)", () => {
    const domani = new Date(ORA.getTime() + 86400_000).toISOString();
    expect(decay(domani, ORA)).toBe(1);
  });

  it("senza data vale 1: un segnale senza tempo non va punito", () => {
    expect(decay(null, ORA)).toBe(1);
  });
});

describe("rawWeight", () => {
  it("un voto alto pesa più di un finito senza voto", () => {
    expect(rawWeight(riga({ status: "watched", rating: 9 }))).toBeGreaterThan(
      rawWeight(riga({ status: "watched" })),
    );
  });

  it("un voto basso porta il peso sotto zero anche se il titolo è finito", () => {
    expect(rawWeight(riga({ status: "watched", rating: 3 }))).toBeLessThan(0);
  });

  it("un voto di mezzo non sposta nulla", () => {
    expect(rawWeight(riga({ status: "watched", rating: 6 }))).toBe(
      rawWeight(riga({ status: "watched" })),
    );
  });

  it("le impression senza aperture sono uno skip, e non oltre il tetto", () => {
    expect(rawWeight(riga({ impressionSessions: 1 }))).toBe(-0.5);
    expect(rawWeight(riga({ impressionSessions: 2 }))).toBe(-1);
    expect(rawWeight(riga({ impressionSessions: 40 }))).toBe(-2);
  });

  it("una sola apertura cancella lo skip", () => {
    expect(rawWeight(riga({ impressionSessions: 10, opens: 1 }))).toBe(1);
  });

  it("le aperture ripetute contano al massimo tre volte", () => {
    expect(rawWeight(riga({ opens: 3 }))).toBe(3);
    expect(rawWeight(riga({ opens: 50 }))).toBe(3);
  });

  it("il dismiss è il segnale negativo più forte", () => {
    expect(rawWeight(riga({ dismisses: 1 }))).toBe(-4);
  });

  it("il seed pick vale come un mezzo voto alto", () => {
    expect(rawWeight(riga({ isSeed: true }))).toBe(5);
  });

  it("abbandonato è negativo", () => {
    expect(rawWeight(riga({ status: "dropped" }))).toBe(-3);
  });
});

describe("weightOf", () => {
  it("applica il decadimento alla data più recente fra libreria ed eventi", () => {
    const vecchio = new Date(ORA.getTime() - 180 * 86400_000).toISOString();
    const row = riga({ status: "watched", lastWatchedAt: vecchio, lastEventAt: null });
    expect(weightOf(row, ORA)).toBeCloseTo(3, 2); // 6 × 0,5
  });

  it("un evento recente su un titolo vecchio lo tiene vivo", () => {
    const vecchio = new Date(ORA.getTime() - 720 * 86400_000).toISOString();
    const row = riga({
      status: "watched",
      lastWatchedAt: vecchio,
      lastEventAt: ORA.toISOString(),
      opens: 1,
    });
    expect(weightOf(row, ORA)).toBeCloseTo(7, 5); // (6 + 1) × 1
  });
});
```

- [ ] **Step 2: Lanciare i test e vederli fallire**

Run: `pnpm test src/lib/taste/weights.test.ts`
Expected: FAIL, "Failed to resolve import ./weights".

- [ ] **Step 3: Scrivere l'implementazione**

Crea `src/lib/taste/weights.ts`:

```ts
/**
 * Quanto vale ogni segnale, e quanto invecchia.
 *
 * Funzioni pure senza `server-only`: sono la parte del calcolo che si può provare
 * senza database, ed è dove stanno tutte le scelte discutibili — i numeri qui sotto
 * sono l'algoritmo, il resto è idraulica.
 */

/** Una riga di `taste_input`, in camelCase. */
export interface TasteRow {
  titleId: number;
  mediaType: "movie" | "tv";
  status: "want" | "watching" | "watched" | "dropped" | null;
  rating: number | null;
  lastWatchedAt: string | null;
  isSeed: boolean;
  /** Sessioni distinte in cui la copertina è stata vista. */
  impressionSessions: number;
  opens: number;
  providerOpens: number;
  trailers: number;
  dismisses: number;
  lastEventAt: string | null;
}

export const WEIGHTS = {
  ratingHigh: 10,
  watched: 6,
  seed: 5,
  watching: 3,
  providerOpen: 3,
  want: 2,
  trailer: 1.5,
  open: 1,
  /** Per sessione in cui è stato mostrato e ignorato. */
  skipPerSession: -0.5,
  /** Tetto dello skip: l'indifferenza non deve mai pesare come un rifiuto esplicito. */
  skipFloor: -2,
  ratingLow: -3,
  dropped: -3,
  dismiss: -4,
} as const;

/** Un gusto vecchio di sei mesi vale metà; di due anni, un quarto. Non sparisce mai. */
export const HALF_LIFE_DAYS = 180;

/** Oltre questo numero, riaprire la stessa scheda non aggiunge informazione. */
const MAX_OPENS = 3;

/** Voti da qui in su valgono `ratingHigh`; da `RATING_LOW` in giù, `ratingLow`. */
const RATING_HIGH = 8;
const RATING_LOW = 4;

export function decay(at: string | null, now: Date): number {
  if (!at) return 1;
  const t = Date.parse(at);
  if (Number.isNaN(t)) return 1;
  const giorni = (now.getTime() - t) / 86_400_000;
  // Date future (orologio del telefono avanti, fuso sbagliato) non devono premiare.
  if (giorni <= 0) return 1;
  return Math.pow(0.5, giorni / HALF_LIFE_DAYS);
}

/** La data più recente fra ultima visione ed ultimo evento. */
export function signalAt(row: TasteRow): string | null {
  if (!row.lastWatchedAt) return row.lastEventAt;
  if (!row.lastEventAt) return row.lastWatchedAt;
  return Date.parse(row.lastEventAt) > Date.parse(row.lastWatchedAt)
    ? row.lastEventAt
    : row.lastWatchedAt;
}

export function rawWeight(row: TasteRow): number {
  let w = 0;

  if (row.rating !== null) {
    if (row.rating >= RATING_HIGH) w += WEIGHTS.ratingHigh;
    else if (row.rating <= RATING_LOW) w += WEIGHTS.ratingLow;
  }

  if (row.status === "watched") w += WEIGHTS.watched;
  else if (row.status === "watching") w += WEIGHTS.watching;
  else if (row.status === "want") w += WEIGHTS.want;
  else if (row.status === "dropped") w += WEIGHTS.dropped;

  if (row.isSeed) w += WEIGHTS.seed;
  if (row.providerOpens > 0) w += WEIGHTS.providerOpen;
  if (row.trailers > 0) w += WEIGHTS.trailer;

  w += Math.min(row.opens, MAX_OPENS) * WEIGHTS.open;

  // Lo skip esiste solo se la copertina è stata vista e mai aperta.
  if (row.opens === 0 && row.impressionSessions > 0) {
    w += Math.max(WEIGHTS.skipFloor, row.impressionSessions * WEIGHTS.skipPerSession);
  }

  if (row.dismisses > 0) w += WEIGHTS.dismiss;

  return w;
}

export function weightOf(row: TasteRow, now: Date): number {
  return rawWeight(row) * decay(signalAt(row), now);
}
```

- [ ] **Step 4: Lanciare i test**

Run: `pnpm test src/lib/taste/weights.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/taste/weights.ts src/lib/taste/weights.test.ts
git commit -m "feat(algoritmo): pesi dei segnali e decadimento a 180 giorni"
```

---

### Task 4: `profile.ts` — `buildTasteProfile`

**Files:**
- Create: `src/lib/taste/profile.ts`
- Test: `src/lib/taste/profile.test.ts`

**Interfaces:**
- Consumes: `TasteRow`, `weightOf` da `./weights` (Task 3).
- Produces:
  - `interface TitleMeta { mediaType: "movie" | "tv"; genreIds: number[]; year: number | null; runtime: number | null; providerIds: number[]; people: string[]; originalLanguage: string | null }`
  - `interface TasteInput { birthYear: number | null; rows: TasteRow[]; meta: Map<string, TitleMeta>; now: Date }`
  - `interface TasteProfile { generi: Record<string, number>; decenni: Record<string, number>; provider: Record<string, number>; persone: Record<string, number>; tipo: Record<string, number>; runtime: Record<string, number>; lingua: Record<string, number>; novita: number; massa: number; eventiContati: number }`
  - `metaKey(mediaType: "movie" | "tv", titleId: number): string`
  - `runtimeBucket(minutes: number | null): string | null`
  - `decadeOf(year: number | null): string | null`
  - `buildTasteProfile(input: TasteInput): TasteProfile`

- [ ] **Step 1: Scrivere i test che falliscono**

Crea `src/lib/taste/profile.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  buildTasteProfile,
  decadeOf,
  metaKey,
  runtimeBucket,
  type TitleMeta,
  type TasteInput,
} from "./profile";
import type { TasteRow } from "./weights";

const ORA = new Date("2026-09-07T12:00:00Z");

function riga(patch: Partial<TasteRow> & { titleId: number }): TasteRow {
  return {
    mediaType: "movie",
    status: null,
    rating: null,
    lastWatchedAt: ORA.toISOString(),
    isSeed: false,
    impressionSessions: 0,
    opens: 0,
    providerOpens: 0,
    trailers: 0,
    dismisses: 0,
    lastEventAt: null,
    ...patch,
  };
}

function meta(patch: Partial<TitleMeta> = {}): TitleMeta {
  return {
    mediaType: "movie",
    genreIds: [28],
    year: 2020,
    runtime: 120,
    providerIds: [8],
    people: [],
    originalLanguage: "en",
    ...patch,
  };
}

function input(rows: TasteRow[], metas: [string, TitleMeta][]): TasteInput {
  return { birthYear: null, rows, meta: new Map(metas), now: ORA };
}

describe("runtimeBucket / decadeOf", () => {
  it("divide le durate in tre fasce", () => {
    expect(runtimeBucket(70)).toBe("corto");
    expect(runtimeBucket(110)).toBe("medio");
    expect(runtimeBucket(160)).toBe("lungo");
    expect(runtimeBucket(null)).toBeNull();
    expect(runtimeBucket(0)).toBeNull();
  });

  it("arrotonda l'anno al decennio", () => {
    expect(decadeOf(1997)).toBe("1990");
    expect(decadeOf(2026)).toBe("2020");
    expect(decadeOf(null)).toBeNull();
  });
});

describe("buildTasteProfile", () => {
  it("le quote positive di una dimensione sommano a 1", () => {
    const p = buildTasteProfile(
      input(
        [
          riga({ titleId: 1, status: "watched", rating: 9 }),
          riga({ titleId: 2, status: "watched" }),
        ],
        [
          [metaKey("movie", 1), meta({ genreIds: [28] })],
          [metaKey("movie", 2), meta({ genreIds: [35] })],
        ],
      ),
    );
    const somma = Object.values(p.generi).reduce((a, b) => a + b, 0);
    expect(somma).toBeCloseTo(1, 5);
    expect(p.generi["28"]).toBeGreaterThan(p.generi["35"]);
  });

  it("un titolo rifiutato lascia il suo genere in negativo", () => {
    const p = buildTasteProfile(
      input(
        [
          riga({ titleId: 1, status: "watched", rating: 9 }),
          riga({ titleId: 2, dismisses: 1 }),
        ],
        [
          [metaKey("movie", 1), meta({ genreIds: [28] })],
          [metaKey("movie", 2), meta({ genreIds: [27] })],
        ],
      ),
    );
    expect(p.generi["28"]).toBeCloseTo(1, 5);
    expect(p.generi["27"]).toBeLessThan(0);
  });

  it("la massa è la somma dei pesi positivi, non il numero di titoli", () => {
    const p = buildTasteProfile(
      input(
        [riga({ titleId: 1, status: "watched", rating: 9 })],
        [[metaKey("movie", 1), meta()]],
      ),
    );
    expect(p.massa).toBeCloseTo(16, 5); // 10 (voto alto) + 6 (finito)
  });

  it("un titolo senza metadati non entra nelle dimensioni ma conta nella massa", () => {
    const p = buildTasteProfile(input([riga({ titleId: 99, status: "watched" })], []));
    expect(p.massa).toBeCloseTo(6, 5);
    expect(p.generi).toEqual({});
  });

  it("novita è la quota di peso sui titoli usciti negli ultimi due anni", () => {
    const p = buildTasteProfile(
      input(
        [
          riga({ titleId: 1, status: "watched" }),
          riga({ titleId: 2, status: "watched" }),
        ],
        [
          [metaKey("movie", 1), meta({ year: 2026 })],
          [metaKey("movie", 2), meta({ year: 1999 })],
        ],
      ),
    );
    expect(p.novita).toBeCloseTo(0.5, 5);
  });

  it("l'anno di nascita inclina i decenni dell'adolescenza, senza ribaltarli", () => {
    const senza = buildTasteProfile(
      input(
        [riga({ titleId: 1, status: "watched", rating: 9 })],
        [[metaKey("movie", 1), meta({ year: 2020 })]],
      ),
    );
    const con = buildTasteProfile({
      ...input(
        [riga({ titleId: 1, status: "watched", rating: 9 })],
        [[metaKey("movie", 1), meta({ year: 2020 })]],
      ),
      birthYear: 1990,
    });
    // il decennio dei 12-25 anni di chi è nato nel 1990 è 2000/2010
    expect(con.decenni["2000"] ?? 0).toBeGreaterThan(senza.decenni["2000"] ?? 0);
    // ma il decennio davvero guardato resta il primo
    const massimo = Object.entries(con.decenni).sort((a, b) => b[1] - a[1])[0];
    expect(massimo[0]).toBe("2020");
  });

  it("conta gli eventi visti, non i titoli", () => {
    const p = buildTasteProfile(
      input(
        [riga({ titleId: 1, impressionSessions: 3, opens: 2, dismisses: 1 })],
        [[metaKey("movie", 1), meta()]],
      ),
    );
    expect(p.eventiContati).toBe(6);
  });

  it("un profilo vuoto è un profilo vuoto, non un errore", () => {
    const p = buildTasteProfile(input([], []));
    expect(p.massa).toBe(0);
    expect(p.novita).toBe(0);
    expect(p.generi).toEqual({});
  });
});
```

- [ ] **Step 2: Lanciare i test e vederli fallire**

Run: `pnpm test src/lib/taste/profile.test.ts`
Expected: FAIL, "Failed to resolve import ./profile".

- [ ] **Step 3: Scrivere l'implementazione**

Crea `src/lib/taste/profile.ts`:

```ts
import { weightOf, type TasteRow } from "./weights";

/**
 * Il profilo di gusto: `buildTasteProfile` prende i segnali già aggregati dal database
 * e i metadati dei titoli, e ne fa vettori normalizzati.
 *
 * Funzione **pura**: nessun accesso a rete o database, così l'unica parte che decide
 * "chi è questo utente" si può provare con dati finti e leggere in un test.
 */

export interface TitleMeta {
  mediaType: "movie" | "tv";
  genreIds: number[];
  year: number | null;
  runtime: number | null;
  providerIds: number[];
  /** Etichette già pronte, es. `Regia:Denis Villeneuve`. */
  people: string[];
  originalLanguage: string | null;
}

export interface TasteInput {
  birthYear: number | null;
  rows: TasteRow[];
  /** Chiave `metaKey(mediaType, titleId)`. I titoli senza metadati sono ammessi. */
  meta: Map<string, TitleMeta>;
  now: Date;
}

export interface TasteProfile {
  generi: Record<string, number>;
  decenni: Record<string, number>;
  provider: Record<string, number>;
  persone: Record<string, number>;
  tipo: Record<string, number>;
  runtime: Record<string, number>;
  lingua: Record<string, number>;
  /** Quota di peso su titoli usciti negli ultimi 24 mesi, 0-1. */
  novita: number;
  /** Somma dei pesi positivi: quanto ci si può fidare di questo profilo. */
  massa: number;
  eventiContati: number;
}

/** Quanti anni indietro conta come "novità". */
const NOVITA_ANNI = 2;
/** Quanto pesa il prior generazionale, in frazione della massa. */
const PRIOR_ETA = 0.03;

export function metaKey(mediaType: "movie" | "tv", titleId: number): string {
  return `${mediaType}-${titleId}`;
}

export function runtimeBucket(minutes: number | null): string | null {
  if (!minutes || minutes <= 0) return null;
  if (minutes < 95) return "corto";
  if (minutes <= 135) return "medio";
  return "lungo";
}

export function decadeOf(year: number | null): string | null {
  if (!year) return null;
  return String(Math.floor(year / 10) * 10);
}

/** Somma pesata su una dimensione. */
function add(map: Map<string, number>, key: string | null, weight: number) {
  if (key === null) return;
  map.set(key, (map.get(key) ?? 0) + weight);
}

/**
 * Normalizza dividendo per la **massa positiva**: le voci positive sommano a 1, quelle
 * negative restano negative e dicono "questo no". Normalizzare sul valore assoluto
 * avrebbe schiacciato i sì di un utente con molti rifiuti.
 */
function normalize(map: Map<string, number>, massa: number): Record<string, number> {
  if (massa <= 0) return {};
  const out: Record<string, number> = {};
  for (const [k, v] of map) {
    const q = v / massa;
    // sotto lo 0,5% è rumore: sporcherebbe la riga senza spostare nulla
    if (Math.abs(q) >= 0.005) out[k] = Number(q.toFixed(4));
  }
  return out;
}

export function buildTasteProfile(input: TasteInput): TasteProfile {
  const { rows, meta, now, birthYear } = input;

  const generi = new Map<string, number>();
  const decenni = new Map<string, number>();
  const provider = new Map<string, number>();
  const persone = new Map<string, number>();
  const tipo = new Map<string, number>();
  const runtime = new Map<string, number>();
  const lingua = new Map<string, number>();

  let massa = 0;
  let pesoNovita = 0;
  let eventiContati = 0;

  const annoCorrente = now.getUTCFullYear();

  for (const row of rows) {
    eventiContati +=
      row.impressionSessions +
      row.opens +
      row.providerOpens +
      row.trailers +
      row.dismisses;

    const w = weightOf(row, now);
    if (w === 0) continue;
    if (w > 0) massa += w;

    const m = meta.get(metaKey(row.mediaType, row.titleId));
    if (!m) continue;

    for (const g of m.genreIds) add(generi, String(g), w);
    add(decenni, decadeOf(m.year), w);
    for (const p of m.providerIds) add(provider, String(p), w);
    for (const p of m.people) add(persone, p, w);
    add(tipo, m.mediaType, w);
    add(runtime, runtimeBucket(m.runtime), w);
    add(lingua, m.originalLanguage, w);

    if (w > 0 && m.year !== null && annoCorrente - m.year <= NOVITA_ANNI) {
      pesoNovita += w;
    }
  }

  // Prior generazionale: i decenni fra i 12 e i 25 anni dell'utente prendono una
  // spinta pari al 3% della massa, divisa fra loro. Leggero apposta — la nostalgia
  // esiste, ma quello che uno guarda davvero deve poterla superare sempre.
  if (birthYear && massa > 0) {
    const chiavi = new Set<string>();
    for (let eta = 12; eta <= 25; eta++) {
      const d = decadeOf(birthYear + eta);
      if (d) chiavi.add(d);
    }
    const quota = (massa * PRIOR_ETA) / Math.max(1, chiavi.size);
    for (const d of chiavi) add(decenni, d, quota);
  }

  return {
    generi: normalize(generi, massa),
    decenni: normalize(decenni, massa),
    provider: normalize(provider, massa),
    persone: normalize(persone, massa),
    tipo: normalize(tipo, massa),
    runtime: normalize(runtime, massa),
    lingua: normalize(lingua, massa),
    novita: massa > 0 ? Number((pesoNovita / massa).toFixed(4)) : 0,
    massa: Number(massa.toFixed(3)),
    eventiContati,
  };
}
```

- [ ] **Step 4: Lanciare i test**

Run: `pnpm test src/lib/taste/profile.test.ts`
Expected: PASS. Se `massa` del test "titolo senza metadati" non torna, controllare che il `continue` sul metadato mancante sia **dopo** l'accumulo della massa.

- [ ] **Step 5: Lanciare tutta la suite e i controlli**

Run: `pnpm test && pnpm typecheck && pnpm lint`
Expected: tutto verde.

- [ ] **Step 6: Commit**

```bash
git add src/lib/taste/profile.ts src/lib/taste/profile.test.ts
git commit -m "feat(algoritmo): buildTasteProfile, il profilo di gusto in una funzione pura"
```

---

### Task 5: `events.ts` — validazione del corpo di `/api/events`

**Files:**
- Create: `src/lib/taste/events.ts`
- Test: `src/lib/taste/events.test.ts`

**Interfaces:**
- Consumes: `Surface`, `isSurface` da `./surfaces` (Task 2).
- Produces:
  - `CLIENT_KINDS: readonly ClientKind[]`, `type ClientKind = "impression" | "open" | "provider_open" | "trailer_play" | "dismiss"`
  - `MAX_EVENTS_PER_BATCH = 100`
  - `interface IncomingEvent { kind: ClientKind; titleId: number; mediaType: "movie" | "tv"; surface: Surface; position: number | null; at: string }`
  - `interface EventsBody { sessionId: string; events: IncomingEvent[] }`
  - `parseEventsBody(raw: unknown): EventsBody | null`

- [ ] **Step 1: Scrivere i test che falliscono**

Crea `src/lib/taste/events.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { parseEventsBody } from "./events";

const SESSIONE = "3f1a6b3e-2d0e-4a1b-9c5e-7c3a1b2d4e5f";

function corpo(events: unknown[], sessionId: string = SESSIONE) {
  return { sessionId, events };
}

const evento = {
  kind: "impression",
  titleId: 603,
  mediaType: "movie",
  surface: "home-top10",
  position: 3,
  at: "2026-09-07T12:00:00.000Z",
};

describe("parseEventsBody", () => {
  it("accetta un corpo valido", () => {
    const out = parseEventsBody(corpo([evento]));
    expect(out?.sessionId).toBe(SESSIONE);
    expect(out?.events).toHaveLength(1);
    expect(out?.events[0].titleId).toBe(603);
  });

  it("rifiuta un sessionId che non è un uuid", () => {
    expect(parseEventsBody(corpo([evento], "pippo"))).toBeNull();
  });

  it("rifiuta i tipi che scrive solo il server", () => {
    expect(parseEventsBody(corpo([{ ...evento, kind: "library_add" }]))).toBeNull();
    expect(parseEventsBody(corpo([{ ...evento, kind: "rate" }]))).toBeNull();
  });

  it("rifiuta una superficie inventata", () => {
    expect(parseEventsBody(corpo([{ ...evento, surface: "home-nuova" }]))).toBeNull();
  });

  it("rifiuta un lotto più lungo del massimo", () => {
    expect(parseEventsBody(corpo(Array(101).fill(evento)))).toBeNull();
  });

  it("rifiuta un corpo senza eventi", () => {
    expect(parseEventsBody(corpo([]))).toBeNull();
    expect(parseEventsBody({ sessionId: SESSIONE })).toBeNull();
    expect(parseEventsBody(null)).toBeNull();
    expect(parseEventsBody("stringa")).toBeNull();
  });

  it("accetta position nulla e la tiene nulla", () => {
    const out = parseEventsBody(corpo([{ ...evento, position: null }]));
    expect(out?.events[0].position).toBeNull();
  });

  it("rifiuta una data non valida", () => {
    expect(parseEventsBody(corpo([{ ...evento, at: "ieri" }]))).toBeNull();
  });
});
```

- [ ] **Step 2: Lanciare i test e vederli fallire**

Run: `pnpm test src/lib/taste/events.test.ts`
Expected: FAIL, "Failed to resolve import ./events".

- [ ] **Step 3: Scrivere l'implementazione**

Crea `src/lib/taste/events.ts`:

```ts
import { isSurface, type Surface } from "./surfaces";

/**
 * Il corpo che il browser manda a `/api/events`, validato prima di toccare il database.
 *
 * Sta qui, puro e testato, perché la rotta possa restare tre righe e perché la regola
 * più importante sia verificabile: **il client non può dichiarare `library_add` né
 * `rate`**. Quei due li scrive il server dentro le Server Action che aggiornano
 * davvero la libreria; accettarli da fuori vorrebbe dire lasciare che chiunque si
 * costruisca il proprio profilo di gusto con un `curl`.
 */

export const CLIENT_KINDS = [
  "impression",
  "open",
  "provider_open",
  "trailer_play",
  "dismiss",
] as const;

export type ClientKind = (typeof CLIENT_KINDS)[number];

/** Oltre questo, il lotto viene rifiutato: nessuna home ha 100 copertine nuove. */
export const MAX_EVENTS_PER_BATCH = 100;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface IncomingEvent {
  kind: ClientKind;
  titleId: number;
  mediaType: "movie" | "tv";
  surface: Surface;
  position: number | null;
  at: string;
}

export interface EventsBody {
  sessionId: string;
  events: IncomingEvent[];
}

function parseEvent(raw: unknown): IncomingEvent | null {
  if (!raw || typeof raw !== "object") return null;
  const e = raw as Record<string, unknown>;

  const kind = e.kind;
  if (typeof kind !== "string" || !CLIENT_KINDS.includes(kind as ClientKind)) return null;

  const titleId = e.titleId;
  if (typeof titleId !== "number" || !Number.isInteger(titleId) || titleId <= 0) {
    return null;
  }

  const mediaType = e.mediaType;
  if (mediaType !== "movie" && mediaType !== "tv") return null;

  const surface = e.surface;
  if (typeof surface !== "string" || !isSurface(surface)) return null;

  const position = e.position;
  if (position !== null && (typeof position !== "number" || !Number.isInteger(position))) {
    return null;
  }

  const at = e.at;
  if (typeof at !== "string" || Number.isNaN(Date.parse(at))) return null;

  return {
    kind: kind as ClientKind,
    titleId,
    mediaType,
    surface,
    position: position === null ? null : (position as number),
    at,
  };
}

export function parseEventsBody(raw: unknown): EventsBody | null {
  if (!raw || typeof raw !== "object") return null;
  const body = raw as Record<string, unknown>;

  const sessionId = body.sessionId;
  if (typeof sessionId !== "string" || !UUID_RE.test(sessionId)) return null;

  const events = body.events;
  if (!Array.isArray(events)) return null;
  if (events.length === 0 || events.length > MAX_EVENTS_PER_BATCH) return null;

  const out: IncomingEvent[] = [];
  for (const raw of events) {
    const parsed = parseEvent(raw);
    // Un evento storto invalida il lotto: se il client sbaglia forma, voglio
    // accorgermene in collaudo, non raccogliere metà dei segnali per sempre.
    if (!parsed) return null;
    out.push(parsed);
  }
  return { sessionId, events: out };
}
```

- [ ] **Step 4: Lanciare i test**

Run: `pnpm test src/lib/taste/events.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/taste/events.ts src/lib/taste/events.test.ts
git commit -m "feat(algoritmo): validazione dei lotti di eventi, il client non può fingere un voto"
```

---

### Task 6: `POST /api/events` e la lettura delle preferenze

**Files:**
- Create: `src/app/api/events/route.ts`
- Create: `src/lib/taste/queries.ts`
- Modify: `src/lib/supabase/middleware.ts` (verifica soltanto: `/api/events` **non** va in `PUBLIC_PATHS`)

**Interfaces:**
- Consumes: `parseEventsBody`, `MAX_EVENTS_PER_BATCH` da `@/lib/taste/events` (Task 5); `rateLimit` da `@/lib/rate-limit`; `createClient` da `@/lib/supabase/server`; `getViewer` da `@/lib/auth/viewer`.
- Produces:
  - `src/lib/taste/queries.ts`: `getPersonalizationEnabled(): Promise<boolean>` (React `cache()`), `getTasteProfile(userId: string): Promise<Tables<"user_taste"> | null>`

- [ ] **Step 1: Scrivere `queries.ts`**

Crea `src/lib/taste/queries.ts`:

```ts
import "server-only";

import { cache } from "react";
import { getViewer } from "@/lib/auth/viewer";
import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/types/database";

/**
 * Il flag della personalizzazione, letto una volta per richiesta e condiviso dal
 * layout con tutto il resto (React `cache()`, come `getViewer`).
 *
 * Riga assente = acceso: il default sta nella colonna, e chi si è iscritto prima di
 * questa fase non deve trovarsi la personalizzazione spenta senza averlo chiesto.
 */
export const getPersonalizationEnabled = cache(async (): Promise<boolean> => {
  const user = await getViewer();
  if (!user) return false;
  const supabase = await createClient();
  const { data } = await supabase
    .from("user_preferences")
    .select("personalization_enabled")
    .eq("user_id", user.id)
    .maybeSingle();
  return data?.personalization_enabled ?? true;
});

/** La riga del profilo di gusto. `null` finché il job non l'ha mai scritta. */
export async function getTasteProfile(
  userId: string,
): Promise<Tables<"user_taste"> | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("user_taste")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  return data ?? null;
}
```

- [ ] **Step 2: Scrivere la rotta**

Crea `src/app/api/events/route.ts`:

```ts
import { NextResponse } from "next/server";
import { parseEventsBody } from "@/lib/taste/events";
import { rateLimit } from "@/lib/rate-limit";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Lotti per utente in cinque minuti: 40 × 5 s coprono più di tre minuti pieni di scroll. */
const LIMITE = 40;
const FINESTRA_S = 300;

/**
 * La telemetria della fase A.
 *
 * È un route handler e non una Server Action di proposito: non deve rivalidare nessuna
 * pagina né rigirare i cookie di sessione a ogni lotto, e viene chiamata anche da
 * `navigator.sendBeacon`, che una Server Action non sa invocare.
 *
 * Risponde **sempre** 204, anche quando scarta: il client non deve mai avere un motivo
 * per riprovare, e la telemetria non deve mai poter disturbare l'app.
 */
export async function POST(request: Request): Promise<Response> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new NextResponse(null, { status: 204 });

  if (!(await rateLimit(`events:${user.id}`, LIMITE, FINESTRA_S))) {
    return new NextResponse(null, { status: 204 });
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return new NextResponse(null, { status: 204 });
  }

  const body = parseEventsBody(raw);
  if (!body) return new NextResponse(null, { status: 204 });

  // Spento = non si scrive niente. Il controllo sta anche qui, non solo nel client:
  // il client si può aggirare, la rotta no.
  const { data: pref } = await supabase
    .from("user_preferences")
    .select("personalization_enabled")
    .eq("user_id", user.id)
    .maybeSingle();
  if (pref && !pref.personalization_enabled) {
    return new NextResponse(null, { status: 204 });
  }

  const righe = body.events.map((e) => ({
    user_id: user.id,
    kind: e.kind,
    title_id: e.titleId,
    media_type: e.mediaType,
    surface: e.surface,
    position: e.position,
    session_id: body.sessionId,
    created_at: e.at,
  }));

  // `ignoreDuplicates` sull'indice unico parziale delle impression: una copertina
  // rivista nella stessa sessione non scrive una seconda riga.
  const { error } = await supabase
    .from("user_events")
    .upsert(righe, { ignoreDuplicates: true });
  if (error) console.error("[events] scrittura fallita:", error.message);

  return new NextResponse(null, { status: 204 });
}
```

- [ ] **Step 3: Verificare il middleware**

Run: `grep -n "PUBLIC_PATHS" -A 8 src/lib/supabase/middleware.ts`
Expected: l'elenco contiene `/login`, `/signup`, `/auth`, `/api/jobs` — e **non** `/api/events`. Se `/api/events` ci fosse, toglierlo: quella rotta deve avere la sessione a cookie per sapere chi è l'utente.

- [ ] **Step 4: Controlli**

Run: `pnpm typecheck && pnpm lint`
Expected: verde.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/events/route.ts src/lib/taste/queries.ts
git commit -m "feat(algoritmo): rotta /api/events e lettura del flag di personalizzazione"
```

---

### Task 7: `SignalsProvider` e le copertine che si dichiarano

**Files:**
- Create: `src/components/signals/SignalsProvider.tsx`
- Modify: `src/components/ui/PosterCard.tsx`
- Modify: `src/app/(app)/layout.tsx`

**Interfaces:**
- Consumes: `parseSignal`, `signalAttr`, `type Surface` da `@/lib/taste/surfaces` (Task 2); `MAX_EVENTS_PER_BATCH`, `type ClientKind` da `@/lib/taste/events` (Task 5); `getPersonalizationEnabled` da `@/lib/taste/queries` (Task 6).
- Produces:
  - `<SignalsProvider enabled={boolean}>{children}</SignalsProvider>`
  - `useSignals(): { record(kind: ClientKind, target: SignalTarget): void }` — usato dal Task 8
  - `PosterCard` accetta `signal?: { surface: Surface; position?: number | null }`

- [ ] **Step 1: Scrivere il provider**

Crea `src/components/signals/SignalsProvider.tsx`:

```tsx
"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
} from "react";
import { MAX_EVENTS_PER_BATCH, type ClientKind } from "@/lib/taste/events";
import { parseSignal, type SignalTarget } from "@/lib/taste/surfaces";

/** Ogni quanto si svuota la coda. */
const FLUSH_MS = 5_000;
/** Quanto una copertina deve restare visibile perché conti come vista. */
const DWELL_MS = 1_000;
/** Quanta parte della copertina deve essere sullo schermo. */
const RATIO = 0.5;
/** Tetto per sessione: nessuna sessione può diventare un fiume di richieste. */
const MAX_BATCHES = 20;

interface Coda {
  kind: ClientKind;
  titleId: number;
  mediaType: "movie" | "tv";
  surface: string;
  position: number | null;
  at: string;
}

interface Api {
  record: (kind: ClientKind, target: SignalTarget) => void;
}

const Ctx = createContext<Api>({ record: () => {} });

export function useSignals(): Api {
  return useContext(Ctx);
}

/**
 * La raccolta dei segnali impliciti.
 *
 * Un solo `IntersectionObserver` per tutta l'app, più un `MutationObserver` per gli
 * elementi che arrivano dopo (scaffali, "Carica altri"): le copertine si dichiarano
 * con `data-signal`, quindi **restano componenti server** — è lo stesso schema del
 * `PreviewLayer`, che ascolta un solo `pointerover` sul documento.
 *
 * `sessionId` sta in memoria e muore con la scheda: le regole del progetto vietano
 * `localStorage` e `sessionStorage` per i dati dell'utente.
 *
 * Da spento non aggancia niente: nessun observer, nessuna coda, nessuna richiesta.
 */
export function SignalsProvider({
  enabled,
  children,
}: {
  enabled: boolean;
  children: ReactNode;
}) {
  const coda = useRef<Coda[]>([]);
  const inviati = useRef(0);
  /** Impression già mandate in questa sessione: `titolo|superficie`. */
  const viste = useRef(new Set<string>());
  const sessionId = useRef<string>("");
  if (!sessionId.current && typeof crypto !== "undefined") {
    sessionId.current = crypto.randomUUID();
  }

  const flush = useCallback((beacon: boolean) => {
    if (coda.current.length === 0) return;
    if (inviati.current >= MAX_BATCHES) {
      coda.current = [];
      return;
    }
    const events = coda.current.splice(0, MAX_EVENTS_PER_BATCH);
    inviati.current += 1;
    const payload = JSON.stringify({ sessionId: sessionId.current, events });

    // Alla chiusura della scheda `fetch` viene interrotta: solo `sendBeacon` arriva.
    if (beacon && typeof navigator !== "undefined" && navigator.sendBeacon) {
      navigator.sendBeacon("/api/events", new Blob([payload], { type: "application/json" }));
      return;
    }
    void fetch("/api/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: payload,
      keepalive: true,
    }).catch(() => {
      // La telemetria non deve mai disturbare l'app: un lotto perso è perso.
    });
  }, []);

  const record = useCallback(
    (kind: ClientKind, target: SignalTarget) => {
      if (!enabled) return;
      if (kind === "impression") {
        const chiave = `${target.mediaType}-${target.titleId}|${target.surface}`;
        if (viste.current.has(chiave)) return;
        viste.current.add(chiave);
      }
      coda.current.push({
        kind,
        titleId: target.titleId,
        mediaType: target.mediaType,
        surface: target.surface,
        position: target.position,
        at: new Date().toISOString(),
      });
      if (coda.current.length >= MAX_EVENTS_PER_BATCH) flush(false);
    },
    [enabled, flush],
  );

  useEffect(() => {
    if (!enabled) return;

    const attesa = new Map<Element, ReturnType<typeof setTimeout>>();

    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const el = entry.target;
          if (entry.isIntersecting && entry.intersectionRatio >= RATIO) {
            if (attesa.has(el)) continue;
            attesa.set(
              el,
              setTimeout(() => {
                attesa.delete(el);
                const t = parseSignal(el.getAttribute("data-signal"));
                if (t) record("impression", t);
                io.unobserve(el);
              }, DWELL_MS),
            );
          } else {
            const timer = attesa.get(el);
            if (timer) {
              clearTimeout(timer);
              attesa.delete(el);
            }
          }
        }
      },
      { threshold: [RATIO] },
    );

    const osserva = (root: ParentNode) => {
      root.querySelectorAll?.("[data-signal]").forEach((el) => io.observe(el));
    };
    osserva(document);

    const mo = new MutationObserver((records) => {
      for (const r of records) {
        for (const n of r.addedNodes) {
          if (n.nodeType !== 1) continue;
          const el = n as Element;
          if (el.hasAttribute("data-signal")) io.observe(el);
          osserva(el);
        }
      }
    });
    mo.observe(document.body, { childList: true, subtree: true });

    // L'apertura: un solo ascoltatore sul documento, come il PreviewLayer.
    const onClick = (e: Event) => {
      const el = (e.target as Element | null)?.closest?.("[data-signal]");
      if (!el) return;
      const t = parseSignal(el.getAttribute("data-signal"));
      if (t) record("open", t);
    };
    document.addEventListener("pointerdown", onClick, { passive: true });

    const timer = setInterval(() => flush(false), FLUSH_MS);
    const onHide = () => {
      if (document.visibilityState === "hidden") flush(true);
    };
    document.addEventListener("visibilitychange", onHide);

    return () => {
      for (const t of attesa.values()) clearTimeout(t);
      io.disconnect();
      mo.disconnect();
      document.removeEventListener("pointerdown", onClick);
      document.removeEventListener("visibilitychange", onHide);
      clearInterval(timer);
      flush(true);
    };
  }, [enabled, record, flush]);

  const api = useMemo(() => ({ record }), [record]);
  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}
```

- [ ] **Step 2: Aggiungere la prop `signal` a `PosterCard`**

In `src/components/ui/PosterCard.tsx`, accanto alla prop `preview`:

1. importare in cima al file:

```ts
import { signalAttr, type Surface } from "@/lib/taste/surfaces";
```

2. aggiungere alla destrutturazione dei parametri (dopo `preview = false,`):

```ts
  signal = null,
```

3. aggiungere al tipo delle props (dopo `preview?: boolean;`):

```ts
  /**
   * Dichiara la copertina alla raccolta dei segnali (fase A): impression quando entra
   * nello schermo, apertura quando la si tocca. La card resta un componente server:
   * qui esce solo un attributo, come per `preview`.
   */
  signal?: { surface: Surface; position?: number | null } | null;
```

4. nel `div` che già porta `data-preview`, aggiungere:

```tsx
      data-signal={
        signal ? signalAttr(mediaType, id, signal.surface, signal.position) : undefined
      }
```

**Attenzione**: `PosterCard` deve avere `mediaType` e `id` fra le props per poterlo scrivere. Verificare con `grep -n "mediaType\|  id" src/components/ui/PosterCard.tsx`; se non ci sono, ricavarli dall'`href` (`/title/movie/603`) con una funzione locale `fromHref(href)` che torna `{mediaType, id} | null`, e non emettere l'attributo quando torna `null`.

- [ ] **Step 3: Montare il provider nel layout**

In `src/app/(app)/layout.tsx`:

```tsx
import { SignalsProvider } from "@/components/signals/SignalsProvider";
import { getPersonalizationEnabled } from "@/lib/taste/queries";
```

e nel corpo, dopo `const profile = await getViewerProfile();`:

```tsx
  const segnaliAttivi = await getPersonalizationEnabled();
```

poi avvolgere `ImportProvider` (o il suo contenuto) con `<SignalsProvider enabled={segnaliAttivi}>…</SignalsProvider>`.

**Nota di latenza**: `getPersonalizationEnabled` è una query in più nel layout. Metterla in `Promise.all` con `getViewerProfile()` **non** si può (la seconda dipende dalla prima solo per l'id, che arriva da `getViewer`, già in cache): lasciarla sequenziale è corretto e costa ~5 ms in `fra1`.

- [ ] **Step 4: Dichiarare le prime superfici**

Cercare i punti dove `PosterCard` viene usata negli scaffali della home e aggiungere `signal`:

```bash
grep -rn "<PosterCard" src/components src/app | head -30
```

Per ogni scaffale, passare la superficie giusta dell'elenco e l'indice della `map`:

```tsx
<PosterCard … signal={{ surface: "home-top10", position: i }} />
```

Coprire almeno: `ChartShelf` (`home-top10` / `home-provider` / `home-salita` a seconda della classifica), gli scaffali di `DiscoverSections` (`discover`), la griglia di ricerca (`search`), la griglia della libreria (`library`), i simili della scheda titolo (`title-simili`).

- [ ] **Step 5: Controlli**

Run: `pnpm typecheck && pnpm lint && pnpm test`
Expected: verde.

- [ ] **Step 6: Commit**

```bash
git add src/components/signals/SignalsProvider.tsx src/components/ui/PosterCard.tsx "src/app/(app)/layout.tsx" src/components src/app
git commit -m "feat(algoritmo): raccolta dei segnali impliciti con un solo IntersectionObserver"
```

---

### Task 8: i segnali espliciti — `logSignal` sul server, `provider_open` e `trailer_play` sul client

**Files:**
- Create: `src/lib/taste/log.ts`
- Modify: `src/lib/watch/actions.ts`
- Modify: `src/components/title/ProviderButton.tsx`
- Modify: `src/components/title/CinematicBackdrop.tsx`

**Interfaces:**
- Consumes: `useSignals` da `@/components/signals/SignalsProvider` (Task 7).
- Produces: `logSignal(userId: string, kind: "library_add" | "rate", titleId: number, mediaType: "movie" | "tv"): Promise<void>`

- [ ] **Step 1: Scrivere `log.ts`**

Crea `src/lib/taste/log.ts`:

```ts
import "server-only";

import { createClient } from "@/lib/supabase/server";

/**
 * I due segnali che il client non può dichiarare: aggiunta in libreria e voto.
 *
 * Li scrive il server, dentro le Server Action che stanno già aggiornando
 * `watch_entries`: lì il fatto è certo e la scrittura costa una riga in più su una
 * connessione già aperta. Accettarli da `/api/events` vorrebbe dire lasciare che
 * chiunque si costruisca il profilo di gusto con un `curl`.
 *
 * `session_id` è casuale: gli eventi del server non appartengono a nessuna sessione
 * del browser, e la colonna non ammette nulli.
 *
 * Non torna mai un errore: un segnale perso non deve far fallire un'azione dell'utente.
 */
export async function logSignal(
  userId: string,
  kind: "library_add" | "rate",
  titleId: number,
  mediaType: "movie" | "tv",
): Promise<void> {
  try {
    const supabase = await createClient();
    const { data: pref } = await supabase
      .from("user_preferences")
      .select("personalization_enabled")
      .eq("user_id", userId)
      .maybeSingle();
    if (pref && !pref.personalization_enabled) return;

    await supabase.from("user_events").insert({
      user_id: userId,
      kind,
      title_id: titleId,
      media_type: mediaType,
      surface: "library",
      session_id: crypto.randomUUID(),
    });
  } catch (e) {
    console.error("[taste] segnale non registrato:", e);
  }
}
```

- [ ] **Step 2: Agganciarlo alle action della libreria**

In `src/lib/watch/actions.ts`:

1. importare: `import { logSignal } from "@/lib/taste/log";`
2. in `addWant`, dopo aver ottenuto l'esito di `writeEntry`, registrare il segnale **senza aspettarlo** né farne dipendere il risultato:

```ts
export async function addWant(
  titleId: number,
  mediaType: MediaType,
): Promise<ActionResult> {
  const result = await writeEntry(titleId, mediaType, { status: "want" });
  if (result.ok) {
    const { user } = await getContext(titleId, mediaType);
    await logSignal(user.id, "library_add", titleId, mediaType);
  }
  return result;
}
```

3. lo stesso in `setRating`, con `kind` `"rate"` e solo quando `rating !== null`.

**Non** aggiungerlo alle altre action: `markWatched`, `startWatching` e compagnia sono già visibili al profilo attraverso `watch_entries`, che `taste_input` legge direttamente. Duplicarle in `user_events` le conterebbe due volte.

- [ ] **Step 3: `provider_open` dal bottone della piattaforma**

In `src/components/title/ProviderButton.tsx` (è già un componente client; se non lo fosse, **non** renderlo client: passare invece l'attributo `data-signal` sul link e lasciare che il `pointerdown` del provider registri un `open` — in quel caso saltare questo step e annotarlo nel commit).

Se è client:

```tsx
import { useSignals } from "@/components/signals/SignalsProvider";
…
const { record } = useSignals();
…
onClick={() => record("provider_open", { mediaType, titleId, surface: "library", position: null })}
```

`mediaType` e `titleId` devono già essere fra le props; se mancano, aggiungerli e passarli dal chiamante.

- [ ] **Step 4: `trailer_play` quando il trailer parte davvero**

In `src/components/title/CinematicBackdrop.tsx`, nel punto in cui si gestisce l'evento `playing` di YouTube (cercare `playing` nel file), aggiungere una sola chiamata, protetta da un ref perché parta una volta sola per montaggio:

```tsx
if (!segnalato.current) {
  segnalato.current = true;
  record("trailer_play", { mediaType, titleId, surface: "library", position: null });
}
```

Se il componente non riceve `mediaType`/`titleId`, passarli dai chiamanti (`TitleHeader` e la pagina stagione).

- [ ] **Step 5: Controlli**

Run: `pnpm typecheck && pnpm lint && pnpm test`
Expected: verde.

- [ ] **Step 6: Commit**

```bash
git add src/lib/taste/log.ts src/lib/watch/actions.ts src/components/title
git commit -m "feat(algoritmo): segnali espliciti: libreria e voto dal server, piattaforma e trailer dal client"
```

---

### Task 9: `refresh.ts` — leggere, calcolare, salvare

**Files:**
- Create: `src/lib/taste/refresh.ts`
- Modify: `src/app/api/jobs/[job]/route.ts`
- Create: `supabase/migrations/0025_cron_taste.sql`

**Interfaces:**
- Consumes: `taste_input`, `taste_refresh_queue` (Task 1); `buildTasteProfile`, `TitleMeta`, `metaKey` (Task 4); `TasteRow` (Task 3); `TITLE_LIST_COLUMNS` da `@/lib/watch/queries`.
- Produces:
  - `refreshTasteFor(userId: string): Promise<boolean>`
  - `refreshTasteBatch(limit: number): Promise<{ utenti: number; scritti: number }>`
  - `pruneEvents(): Promise<{ eliminati: number }>`

- [ ] **Step 1: Scrivere `refresh.ts`**

Crea `src/lib/taste/refresh.ts`:

```ts
import "server-only";

import { createServiceClient } from "@/lib/supabase/server";
import { buildTasteProfile, metaKey, type TitleMeta } from "./profile";
import type { TasteRow } from "./weights";
import type { Json } from "@/types/database";

/** Quanti titoli di testa meritano una lettura di `titles.raw` (registi, cast, lingua). */
const TITOLI_CON_CREDITI = 50;
/** Quanti nomi tenere per titolo: il regista e i primi interpreti. */
const PERSONE_PER_TITOLO = 4;

type Service = ReturnType<typeof createServiceClient>;

/** Da riga SQL a `TasteRow`. */
function toRow(r: {
  title_id: number;
  media_type: "movie" | "tv";
  status: TasteRow["status"];
  rating: number | null;
  last_watched_at: string | null;
  is_seed: boolean;
  impression_sessioni: number;
  aperture: number;
  provider_aperture: number;
  trailer: number;
  dismissi: number;
  ultimo_evento: string | null;
}): TasteRow {
  return {
    titleId: r.title_id,
    mediaType: r.media_type,
    status: r.status,
    rating: r.rating,
    lastWatchedAt: r.last_watched_at,
    isSeed: r.is_seed,
    impressionSessions: r.impression_sessioni,
    opens: r.aperture,
    providerOpens: r.provider_aperture,
    trailers: r.trailer,
    dismisses: r.dismissi,
    lastEventAt: r.ultimo_evento,
  };
}

/** Estrae generi, anno, durata dai titoli, e i provider dalle offerte. */
async function caricaMeta(
  supabase: Service,
  rows: TasteRow[],
): Promise<Map<string, TitleMeta>> {
  const meta = new Map<string, TitleMeta>();
  if (rows.length === 0) return meta;

  const movieIds = rows.filter((r) => r.mediaType === "movie").map((r) => r.titleId);
  const tvIds = rows.filter((r) => r.mediaType === "tv").map((r) => r.titleId);

  // Mai `raw` qui: sono ~27 KB per riga, e queste query ne toccano fino a mille.
  const colonne = "id, media_type, genres, release_date, runtime";
  const [film, serie, offerte] = await Promise.all([
    movieIds.length
      ? supabase.from("titles").select(colonne).eq("media_type", "movie").in("id", movieIds)
      : Promise.resolve({ data: [] as Record<string, unknown>[] }),
    tvIds.length
      ? supabase.from("titles").select(colonne).eq("media_type", "tv").in("id", tvIds)
      : Promise.resolve({ data: [] as Record<string, unknown>[] }),
    supabase
      .from("title_providers")
      .select("title_id, media_type, provider_id")
      .in("title_id", [...movieIds, ...tvIds]),
  ]);

  const provider = new Map<string, number[]>();
  for (const o of (offerte.data ?? []) as {
    title_id: number;
    media_type: "movie" | "tv";
    provider_id: number;
  }[]) {
    const k = metaKey(o.media_type, o.title_id);
    provider.set(k, [...(provider.get(k) ?? []), o.provider_id]);
  }

  for (const t of [...(film.data ?? []), ...(serie.data ?? [])] as {
    id: number;
    media_type: "movie" | "tv";
    genres: Json | null;
    release_date: string | null;
    runtime: number | null;
  }[]) {
    const k = metaKey(t.media_type, t.id);
    const genreIds = Array.isArray(t.genres)
      ? (t.genres as { id?: unknown }[])
          .map((g) => (g && typeof g === "object" ? g.id : null))
          .filter((id): id is number => typeof id === "number")
      : [];
    meta.set(k, {
      mediaType: t.media_type,
      genreIds,
      year: t.release_date ? Number(t.release_date.slice(0, 4)) || null : null,
      runtime: t.runtime,
      providerIds: provider.get(k) ?? [],
      people: [],
      originalLanguage: null,
    });
  }
  return meta;
}

/**
 * Registi, interpreti e lingua originale, **solo per i titoli di testa**.
 *
 * Stanno in `titles.raw` (~27 KB per riga): leggerlo per l'intera libreria ripeterebbe
 * l'errore che è costato 34 MB di serializzazione sul profilo, e per cui esiste
 * `TITLE_LIST_COLUMNS`. Cinquanta titoli sono un paio di megabyte dentro un job, e
 * bastano: le persone che contano stanno in cima, non in coda.
 */
async function arricchisciTeste(
  supabase: Service,
  meta: Map<string, TitleMeta>,
  teste: { titleId: number; mediaType: "movie" | "tv" }[],
): Promise<void> {
  if (teste.length === 0) return;
  const { data } = await supabase
    .from("titles")
    .select("id, media_type, raw")
    .in("id", teste.map((t) => t.titleId));

  for (const t of (data ?? []) as {
    id: number;
    media_type: "movie" | "tv";
    raw: Json | null;
  }[]) {
    const m = meta.get(metaKey(t.media_type, t.id));
    if (!m || !t.raw || typeof t.raw !== "object") continue;
    const raw = t.raw as Record<string, unknown>;

    const lingua = raw.original_language;
    if (typeof lingua === "string") m.originalLanguage = lingua;

    const credits = raw.credits as
      | { cast?: { name?: unknown }[]; crew?: { name?: unknown; job?: unknown }[] }
      | undefined;
    const nomi: string[] = [];
    for (const c of credits?.crew ?? []) {
      if (c.job === "Director" && typeof c.name === "string") nomi.push(`Regia:${c.name}`);
    }
    for (const c of (credits?.cast ?? []).slice(0, PERSONE_PER_TITOLO)) {
      if (typeof c.name === "string") nomi.push(`Cast:${c.name}`);
    }
    m.people = nomi;
  }
}

/** Ricalcola e salva il profilo di un utente. `false` se non c'era niente da salvare. */
export async function refreshTasteFor(userId: string): Promise<boolean> {
  const supabase = createServiceClient();

  const [{ data: input, error }, { data: pref }] = await Promise.all([
    supabase.rpc("taste_input", { uid: userId }),
    supabase
      .from("user_preferences")
      .select("birth_year, personalization_enabled")
      .eq("user_id", userId)
      .maybeSingle(),
  ]);
  if (error) throw new Error(`taste_input: ${error.message}`);
  if (pref && !pref.personalization_enabled) return false;

  const rows = ((input ?? []) as Parameters<typeof toRow>[0][]).map(toRow);
  if (rows.length === 0) return false;

  const meta = await caricaMeta(supabase, rows);

  // I titoli di testa per peso grezzo: gli unici per cui vale leggere `raw`.
  const teste = [...rows]
    .sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0))
    .slice(0, TITOLI_CON_CREDITI)
    .map((r) => ({ titleId: r.titleId, mediaType: r.mediaType }));
  await arricchisciTeste(supabase, meta, teste);

  const profilo = buildTasteProfile({
    birthYear: pref?.birth_year ?? null,
    rows,
    meta,
    now: new Date(),
  });

  const { error: erroreScrittura } = await supabase.from("user_taste").upsert(
    {
      user_id: userId,
      generi: profilo.generi as unknown as Json,
      decenni: profilo.decenni as unknown as Json,
      provider: profilo.provider as unknown as Json,
      persone: profilo.persone as unknown as Json,
      tipo: profilo.tipo as unknown as Json,
      runtime: profilo.runtime as unknown as Json,
      lingua: profilo.lingua as unknown as Json,
      novita: profilo.novita,
      massa: profilo.massa,
      eventi_contati: profilo.eventiContati,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );
  if (erroreScrittura) throw new Error(`user_taste: ${erroreScrittura.message}`);
  return true;
}

/** Il giro del job: gli utenti con qualcosa di nuovo. */
export async function refreshTasteBatch(
  limit: number,
): Promise<{ utenti: number; scritti: number }> {
  const supabase = createServiceClient();
  const { data, error } = await supabase.rpc("taste_refresh_queue", { want: limit });
  if (error) throw new Error(`coda dei profili: ${error.message}`);

  const utenti = (data ?? []) as { user_id: string }[];
  let scritti = 0;
  for (const u of utenti) {
    try {
      if (await refreshTasteFor(u.user_id)) scritti += 1;
    } catch (e) {
      // Un utente che fallisce non deve far cadere il giro degli altri.
      console.error(`[taste] profilo di ${u.user_id} non aggiornato:`, e);
    }
  }
  return { utenti: utenti.length, scritti };
}

/** Potatura: 90 giorni di storico, e niente per chi ha spento la personalizzazione. */
export async function pruneEvents(): Promise<{ eliminati: number }> {
  const supabase = createServiceClient();
  const soglia = new Date(Date.now() - 90 * 86_400_000).toISOString();
  const { count, error } = await supabase
    .from("user_events")
    .delete({ count: "exact" })
    .lt("created_at", soglia);
  if (error) throw new Error(`potatura: ${error.message}`);
  return { eliminati: count ?? 0 };
}
```

- [ ] **Step 2: Aggiungere i due job alla rotta**

In `src/app/api/jobs/[job]/route.ts`:

1. importare: `import { pruneEvents, refreshTasteBatch } from "@/lib/taste/refresh";`
2. allargare il tipo:

```ts
type JobName =
  | "charts-netflix"
  | "charts-justwatch"
  | "charts-resolve"
  | "ratings-refresh"
  | "taste-refresh"
  | "events-prune";
```

3. aggiungere le due voci alla mappa `JOBS`:

```ts
  /** Quanti utenti per giro: 200 × (1 RPC + 3 query) stanno larghi nei 60 s della funzione. */
  "taste-refresh": async () => await refreshTasteBatch(200),

  "events-prune": async () => await pruneEvents(),
```

- [ ] **Step 3: Scrivere la migration del cron**

Crea `supabase/migrations/0025_cron_taste.sql`:

```sql
-- I due job della fase A. `call_zapp_job` e il Vault esistono dalla 0021.

-- Ogni ora al minuto 20: `ratings-refresh` parte al minuto 0, e il lucchetto di
-- `job_runs` è per nome del job, non globale — ma sovrapporli sprecherebbe comunque
-- la stessa finestra di 60 secondi della funzione Vercel.
select cron.schedule('zapp-taste-refresh', '20 * * * *',
  $$select public.call_zapp_job('taste-refresh')$$);

-- Ogni notte: 90 giorni di storico e basta.
select cron.schedule('zapp-events-prune', '0 3 * * *',
  $$select public.call_zapp_job('events-prune')$$);
```

Applicarla col tool MCP `apply_migration` (nome `0025_cron_taste`).

- [ ] **Step 4: Verificare che i cron siano registrati**

Con `execute_sql`:

```sql
select jobname, schedule, active from cron.job order by jobname;
```

Atteso: fra le righe, `zapp-taste-refresh` (`20 * * * *`) e `zapp-events-prune` (`0 3 * * *`), entrambe `active = true`.

- [ ] **Step 5: Controlli**

Run: `pnpm typecheck && pnpm lint && pnpm test`
Expected: verde.

- [ ] **Step 6: Commit**

```bash
git add src/lib/taste/refresh.ts "src/app/api/jobs/[job]/route.ts" supabase/migrations/0025_cron_taste.sql
git commit -m "feat(algoritmo): job orario del profilo di gusto e potatura degli eventi"
```

---

### Task 10: la griglia dei titoli seed

**Files:**
- Create: `src/lib/taste/seed.ts`
- Test: `src/lib/taste/seed.test.ts`
- Create: `src/lib/taste/seed-source.ts`

**Interfaces:**
- Consumes: `createClient` da `@/lib/supabase/server`; `getTrending` da `@/lib/tmdb/client`; `posterUrl` da `@/lib/config`.
- Produces:
  - `interface SeedCandidate { id: number; mediaType: "movie" | "tv"; title: string; posterPath: string; genreIds: number[]; rank: number | null; score: number | null }`
  - `SEED_GRID_SIZE = 30`, `SEED_MIN_PICKS = 3`, `SEED_MAX_PICKS = 5`
  - `pickSeedGrid(candidates: SeedCandidate[], size?: number): SeedCandidate[]`
  - `getSeedCandidates(): Promise<SeedCandidate[]>` (server-only)

- [ ] **Step 1: Scrivere i test che falliscono**

Crea `src/lib/taste/seed.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { pickSeedGrid, type SeedCandidate } from "./seed";

function c(patch: Partial<SeedCandidate> & { id: number }): SeedCandidate {
  return {
    mediaType: "movie",
    title: `Titolo ${patch.id}`,
    posterPath: `/p${patch.id}.jpg`,
    genreIds: [28],
    rank: null,
    score: 70,
    ...patch,
  };
}

describe("pickSeedGrid", () => {
  it("non mette più di tre titoli dello stesso genere", () => {
    const griglia = pickSeedGrid(
      Array.from({ length: 10 }, (_, i) => c({ id: i + 1, genreIds: [28] })),
      10,
    );
    expect(griglia).toHaveLength(3);
  });

  it("mescola film e serie invece di mettere prima tutti i film", () => {
    const film = Array.from({ length: 6 }, (_, i) =>
      c({ id: i + 1, genreIds: [i], mediaType: "movie" }),
    );
    const serie = Array.from({ length: 6 }, (_, i) =>
      c({ id: 100 + i, genreIds: [i], mediaType: "tv" }),
    );
    const griglia = pickSeedGrid([...film, ...serie], 6);
    const tipi = new Set(griglia.map((g) => g.mediaType));
    expect(tipi.size).toBe(2);
    expect(griglia.filter((g) => g.mediaType === "tv").length).toBeGreaterThanOrEqual(2);
  });

  it("scarta i titoli senza locandina", () => {
    const griglia = pickSeedGrid([
      c({ id: 1, posterPath: "" }),
      c({ id: 2, genreIds: [35] }),
    ]);
    expect(griglia.map((g) => g.id)).toEqual([2]);
  });

  it("non ripete lo stesso titolo arrivato da due fonti", () => {
    const griglia = pickSeedGrid([
      c({ id: 5, rank: 1 }),
      c({ id: 5, rank: null }),
      c({ id: 6, genreIds: [35] }),
    ]);
    expect(griglia.filter((g) => g.id === 5)).toHaveLength(1);
  });

  it("mette prima chi è in classifica, poi chi ha lo ZappScore più alto", () => {
    const griglia = pickSeedGrid(
      [
        c({ id: 1, score: 95, rank: null, genreIds: [1] }),
        c({ id: 2, score: 60, rank: 2, genreIds: [2] }),
        c({ id: 3, score: 80, rank: null, genreIds: [3] }),
      ],
      3,
    );
    expect(griglia[0].id).toBe(2);
    expect(griglia[1].id).toBe(1);
  });

  it("taglia alla dimensione chiesta", () => {
    const molti = Array.from({ length: 100 }, (_, i) => c({ id: i + 1, genreIds: [i] }));
    expect(pickSeedGrid(molti)).toHaveLength(30);
  });

  it("con zero candidati torna una griglia vuota, non un errore", () => {
    expect(pickSeedGrid([])).toEqual([]);
  });
});
```

- [ ] **Step 2: Lanciare i test e vederli fallire**

Run: `pnpm test src/lib/taste/seed.test.ts`
Expected: FAIL, "Failed to resolve import ./seed".

- [ ] **Step 3: Scrivere `seed.ts`**

Crea `src/lib/taste/seed.ts`:

```ts
/**
 * La griglia del passo 2 dell'onboarding: "scegline almeno 3 che ti piacciono".
 *
 * Puro e testato: chi apre Zapp per la prima volta vede questa griglia e nient'altro,
 * quindi le regole (mai troppi titoli dello stesso genere, film e serie mescolati,
 * niente doppioni) devono essere verificabili senza database.
 */

export interface SeedCandidate {
  id: number;
  mediaType: "movie" | "tv";
  title: string;
  posterPath: string;
  genreIds: number[];
  /** Posizione in una classifica corrente; `null` se arriva dal trending. */
  rank: number | null;
  /** ZappScore 0-100, quando c'è. */
  score: number | null;
}

export const SEED_GRID_SIZE = 30;
export const SEED_MIN_PICKS = 3;
export const SEED_MAX_PICKS = 5;
/** Oltre tre titoli dello stesso genere la griglia smette di dire qualcosa di nuovo. */
export const SEED_MAX_PER_GENRE = 3;

export function pickSeedGrid(
  candidates: SeedCandidate[],
  size = SEED_GRID_SIZE,
): SeedCandidate[] {
  const ordinati = candidates
    .filter((c) => c.posterPath)
    .sort((a, b) => {
      // Prima chi è in una classifica (lo riconoscono tutti), poi il voto.
      const ra = a.rank ?? Number.POSITIVE_INFINITY;
      const rb = b.rank ?? Number.POSITIVE_INFINITY;
      if (ra !== rb) return ra - rb;
      return (b.score ?? 0) - (a.score ?? 0);
    });

  const perTipo = { movie: [] as SeedCandidate[], tv: [] as SeedCandidate[] };
  const visti = new Set<string>();
  const perGenere = new Map<number, number>();

  for (const c of ordinati) {
    const chiave = `${c.mediaType}-${c.id}`;
    if (visti.has(chiave)) continue;
    // il tetto vale sul primo genere, quello principale
    const genere = c.genreIds[0];
    if (genere !== undefined) {
      const n = perGenere.get(genere) ?? 0;
      if (n >= SEED_MAX_PER_GENRE) continue;
      perGenere.set(genere, n + 1);
    }
    visti.add(chiave);
    perTipo[c.mediaType].push(c);
  }

  // Alternati: una griglia di soli film direbbe a metà degli utenti che Zapp non fa
  // per loro prima ancora di aver cominciato.
  const out: SeedCandidate[] = [];
  const massimo = Math.max(perTipo.movie.length, perTipo.tv.length);
  for (let i = 0; i < massimo && out.length < size; i++) {
    if (perTipo.movie[i]) out.push(perTipo.movie[i]);
    if (out.length < size && perTipo.tv[i]) out.push(perTipo.tv[i]);
  }
  return out;
}
```

- [ ] **Step 4: Lanciare i test**

Run: `pnpm test src/lib/taste/seed.test.ts`
Expected: PASS.

- [ ] **Step 5: Scrivere `seed-source.ts`**

Crea `src/lib/taste/seed-source.ts`:

```ts
import "server-only";

import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { getTrending } from "@/lib/tmdb/client";
import { pickSeedGrid, type SeedCandidate } from "./seed";

/**
 * I candidati per la griglia dell'onboarding.
 *
 * Nessuna chiamata nuova a servizi esterni: le classifiche stanno già in `title_charts`
 * (fase B) e il trending è la stessa `fetch` che usa Scopri, quindi condivide la cache
 * Next da un'ora. Se entrambe le fonti mancassero, la griglia torna vuota e il passo 2
 * dell'onboarding non compare: meglio un passo in meno che una schermata rotta.
 */
export const getSeedCandidates = cache(async (): Promise<SeedCandidate[]> => {
  const supabase = await createClient();

  const [classifiche, trending] = await Promise.all([
    supabase
      .from("title_charts")
      .select(
        "rank, title_id, media_type, titles!title_charts_title_fkey(id, media_type, title, poster_path, genres), title_ratings!left(score)",
      )
      .eq("country", "IT")
      .not("title_id", "is", null)
      .order("period", { ascending: false })
      .limit(120),
    getTrending().catch(() => null),
  ]);

  const candidati: SeedCandidate[] = [];

  for (const r of (classifiche.data ?? []) as unknown as {
    rank: number;
    titles: {
      id: number;
      media_type: "movie" | "tv";
      title: string;
      poster_path: string | null;
      genres: unknown;
    } | null;
    title_ratings: { score: number | null }[] | null;
  }[]) {
    const t = r.titles;
    if (!t?.poster_path) continue;
    candidati.push({
      id: t.id,
      mediaType: t.media_type,
      title: t.title,
      posterPath: t.poster_path,
      genreIds: genreIdsOf(t.genres),
      rank: r.rank,
      score: r.title_ratings?.[0]?.score ?? null,
    });
  }

  for (const t of trending?.results ?? []) {
    const mediaType = t.media_type === "tv" ? "tv" : "movie";
    if (t.media_type !== "movie" && t.media_type !== "tv") continue;
    if (!t.poster_path) continue;
    candidati.push({
      id: t.id,
      mediaType,
      title: ("title" in t ? t.title : t.name) ?? "",
      posterPath: t.poster_path,
      genreIds: Array.isArray(t.genre_ids) ? t.genre_ids : [],
      rank: null,
      score: typeof t.vote_average === "number" ? t.vote_average * 10 : null,
    });
  }

  return pickSeedGrid(candidati);
});

function genreIdsOf(raw: unknown): number[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((g) => (g && typeof g === "object" ? (g as { id?: unknown }).id : null))
    .filter((id): id is number => typeof id === "number");
}
```

**Se il join `title_ratings!left(score)` desse 400**: la chiave di `title_ratings` è composita (`title_id, media_type`) e PostgREST non la deduce — è la stessa trappola già annotata per `getTopRatedOnZapp`. In quel caso togliere il join e leggere i punteggi con una seconda query su `title_ratings` filtrata per gli id trovati, indicizzandoli con `ratingKey` da `@/lib/ratings/queries`.

- [ ] **Step 6: Controlli**

Run: `pnpm typecheck && pnpm lint && pnpm test`
Expected: verde.

- [ ] **Step 7: Commit**

```bash
git add src/lib/taste/seed.ts src/lib/taste/seed.test.ts src/lib/taste/seed-source.ts
git commit -m "feat(algoritmo): griglia dei titoli seed per l'onboarding"
```

---

### Task 11: onboarding in due passi

**Files:**
- Create: `src/app/onboarding/SeedGrid.tsx`
- Modify: `src/app/onboarding/OnboardingForm.tsx`
- Modify: `src/app/onboarding/actions.ts`
- Modify: `src/app/onboarding/page.tsx`

**Interfaces:**
- Consumes: `getSeedCandidates` (Task 10), `SEED_MIN_PICKS`, `SEED_MAX_PICKS`, `type SeedCandidate` (Task 10); `refreshTasteFor` (Task 9).
- Produces: `completeOnboarding` accetta anche `birth_year` e `seed` (JSON `["movie-603", "tv-1396"]`) dalla `FormData`.

- [ ] **Step 1: Aggiornare la Server Action**

In `src/app/onboarding/actions.ts`, dentro `completeOnboarding`, **dopo** l'update di `profiles` andato a buon fine e **prima** della gestione del cookie `zapp_ref`:

```ts
  // Anno di nascita: solo l'anno, e in una tabella privata — `profiles` la legge
  // chiunque. Fuori intervallo o assente: non si scrive nulla, non è un errore.
  const anno = Number(String(formData.get("birth_year") ?? "").trim());
  const annoValido =
    Number.isInteger(anno) && anno >= 1900 && anno <= new Date().getFullYear();
  if (annoValido) {
    await supabase
      .from("user_preferences")
      .upsert(
        { user_id: user.id, birth_year: anno, updated_at: new Date().toISOString() },
        { onConflict: "user_id" },
      );
  }

  // Titoli seed: `["movie-603","tv-1396"]`, al massimo cinque.
  const seedRaw = String(formData.get("seed") ?? "");
  if (seedRaw) {
    try {
      const scelte = JSON.parse(seedRaw) as unknown;
      const righe = (Array.isArray(scelte) ? scelte : [])
        .filter((s): s is string => typeof s === "string")
        .slice(0, SEED_MAX_PICKS)
        .map((s) => {
          const [tipo, id] = s.split("-");
          if ((tipo !== "movie" && tipo !== "tv") || !/^\d+$/.test(id ?? "")) return null;
          return { user_id: user.id, title_id: Number(id), media_type: tipo };
        })
        .filter((r): r is NonNullable<typeof r> => r !== null);
      if (righe.length > 0) {
        await supabase.from("user_seed_picks").upsert(righe, { ignoreDuplicates: true });
      }
    } catch {
      // Un JSON storto non deve impedire a nessuno di entrare nell'app.
    }
  }

  // Il primo profilo, subito: senza, la prima home sarebbe cieca fino all'ora piena.
  await refreshTasteFor(user.id).catch((e) =>
    console.error("[onboarding] primo profilo non calcolato:", e),
  );
```

Import da aggiungere in cima:

```ts
import { SEED_MAX_PICKS } from "@/lib/taste/seed";
import { refreshTasteFor } from "@/lib/taste/refresh";
```

- [ ] **Step 2: Scrivere `SeedGrid.tsx`**

Crea `src/app/onboarding/SeedGrid.tsx`:

```tsx
"use client";

import Image from "next/image";
import { posterUrl } from "@/lib/config";
import { SEED_MAX_PICKS, SEED_MIN_PICKS, type SeedCandidate } from "@/lib/taste/seed";

/**
 * Il passo 2 dell'onboarding. Il valore selezionato lo tiene il form padre, così
 * l'invio resta una sola Server Action e non serve stato condiviso.
 */
export function SeedGrid({
  candidates,
  selected,
  onToggle,
}: {
  candidates: SeedCandidate[];
  selected: string[];
  onToggle: (key: string) => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-4 lg:grid-cols-5">
        {candidates.map((c) => {
          const key = `${c.mediaType}-${c.id}`;
          const scelto = selected.includes(key);
          const pieno = selected.length >= SEED_MAX_PICKS && !scelto;
          return (
            <button
              key={key}
              type="button"
              onClick={() => onToggle(key)}
              disabled={pieno}
              aria-pressed={scelto}
              aria-label={c.title}
              className={`relative aspect-[2/3] overflow-hidden rounded-[12px] bg-surface-2 transition ${
                scelto ? "ring-2 ring-accent" : "ring-0"
              } ${pieno ? "opacity-40" : ""}`}
            >
              <Image
                src={posterUrl(c.posterPath, "w342") ?? ""}
                alt=""
                fill
                sizes="(max-width: 640px) 30vw, 140px"
                className="object-cover"
              />
              {scelto && (
                <span className="absolute right-1.5 top-1.5 grid size-6 place-items-center rounded-full bg-accent text-[13px] font-bold text-bg">
                  ✓
                </span>
              )}
            </button>
          );
        })}
      </div>
      <p className="px-1 text-xs text-muted-2">
        {selected.length}/{SEED_MAX_PICKS} scelti · ne servono almeno {SEED_MIN_PICKS}
      </p>
    </div>
  );
}
```

**Verificare la firma di `posterUrl`** con `grep -n "export function posterUrl" -A 4 src/lib/config.ts` e adattare la taglia se il secondo parametro ha nomi diversi.

- [ ] **Step 3: Trasformare `OnboardingForm` in due passi**

Riscrivere `src/app/onboarding/OnboardingForm.tsx`: aggiungere la prop `seedCandidates: SeedCandidate[]`, uno stato `passo: 1 | 2` e uno `scelti: string[]`.

- Passo 1: i campi di oggi più il nuovo campo anno; il bottone **non** invia il form (`type="button"`), ma valida l'username con la stessa regex e passa a `passo = 2` — a meno che `seedCandidates.length === 0`, nel qual caso invia direttamente.
- Passo 2: `<SeedGrid …>`, un `<input type="hidden" name="seed" value={JSON.stringify(scelti)} />`, i campi del passo 1 mantenuti come `hidden` così arrivano nella stessa `FormData`, il bottone "Fine" (`type="submit"`, disabilitato sotto `SEED_MIN_PICKS`) e un "Salta" che invia il form con `scelti` vuoto.

Il campo nuovo del passo 1:

```tsx
<div className="flex flex-col gap-2">
  <div className={`${AUTH_FIELD_WRAP_CLASS} justify-between gap-2`}>
    <input
      id="birth_year"
      name="birth_year"
      inputMode="numeric"
      pattern="\d{4}"
      maxLength={4}
      placeholder="1998"
      aria-label="Anno di nascita"
      className="flex-1 bg-transparent text-[16px] text-text outline-none placeholder:text-muted"
    />
    <span className="shrink-0 text-xs text-muted-2">opzionale</span>
  </div>
  <p className="px-1 text-xs text-muted-2">
    Anno di nascita. Serve solo a consigliarti meglio: puoi non dirlo.
  </p>
</div>
```

Il titolo della schermata cambia col passo: al passo 2, sopra il foglio, "Scegline almeno 3 che ti piacciono" — vive in `page.tsx`, quindi al passo 2 il form mostra il proprio titolo dentro il foglio:

```tsx
{passo === 2 && (
  <div className="flex flex-col gap-1">
    <h2 className="text-[22px] font-bold leading-tight text-text">
      Scegline almeno 3 che ti piacciono
    </h2>
    <p className="text-[13px] text-muted">
      Serve a farci partire con il piede giusto. Puoi saltare.
    </p>
  </div>
)}
```

- [ ] **Step 4: Passare i candidati dalla pagina**

In `src/app/onboarding/page.tsx`:

```tsx
import { getSeedCandidates } from "@/lib/taste/seed-source";
```

e leggerli **in parallelo** col muro di locandine, che è già una chiamata di rete:

```tsx
const [posters, seedCandidates] = await Promise.all([
  getWallPosters(),
  getSeedCandidates().catch(() => []),
]);
```

poi `<OnboardingForm initialDisplayName={initialDisplayName} seedCandidates={seedCandidates} />`.

- [ ] **Step 5: Controlli**

Run: `pnpm typecheck && pnpm lint && pnpm test`
Expected: verde.

- [ ] **Step 6: Commit**

```bash
git add src/app/onboarding
git commit -m "feat(onboarding): anno di nascita e cinque titoli che ti piacciono"
```

---

### Task 12: l'interruttore della personalizzazione

**Files:**
- Modify: `src/app/(app)/profile/actions.ts`
- Modify: `src/app/(app)/profile/ProfileEditor.tsx`
- Modify: `src/app/(app)/profile/page.tsx`

**Interfaces:**
- Consumes: `ProfileActionResult` (già nel file).
- Produces: `setPersonalization(enabled: boolean): Promise<ProfileActionResult>`; `ProfileEditor` accetta la prop `personalizationEnabled: boolean`.

- [ ] **Step 1: Scrivere la Server Action**

In `src/app/(app)/profile/actions.ts`, in fondo:

```ts
/**
 * Accende o spegne la personalizzazione.
 *
 * Spegnere **cancella davvero**: eventi e profilo calcolato spariscono, non vengono
 * solo ignorati. I titoli seed restano: li ha scelti l'utente a mano, sono suoi, e non
 * sono telemetria.
 */
export async function setPersonalization(
  enabled: boolean,
): Promise<ProfileActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Non autenticato" };

  const { error } = await supabase.from("user_preferences").upsert(
    {
      user_id: user.id,
      personalization_enabled: enabled,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );
  if (error) return { ok: false, error: "Errore di salvataggio." };

  if (!enabled) {
    await supabase.from("user_events").delete().eq("user_id", user.id);
    await supabase.from("user_taste").delete().eq("user_id", user.id);
  }

  revalidatePath("/profile");
  revalidatePath("/");
  return { ok: true };
}
```

**Attenzione**: la delete su `user_taste` passa dal client a cookie, che ha solo una policy di **select**. Se la riga restasse, aggiungere alla migration 0024 la policy mancante:

```sql
create policy user_taste_delete_own on public.user_taste
  for delete using (auth.uid() = user_id);
```

(applicarla come migration `0026_user_taste_delete.sql` e rigenerare i tipi non serve: le policy non cambiano i tipi). Verificare con `execute_sql` che dopo lo spegnimento la riga sia sparita davvero.

- [ ] **Step 2: Aggiungere l'interruttore**

In `src/app/(app)/profile/ProfileEditor.tsx`, accanto all'interruttore "Profilo privato" (stessa marcatura, che è già un `label` con `peer sr-only`), aggiungere un secondo interruttore con:

- titolo: `Personalizza i consigli`
- descrizione: `Zapp usa quello che guardi e quello che salti per consigliarti meglio. Da spento non registra nulla e cancella quello che ha raccolto.`
- azione: `setPersonalization(next)`, ottimistica con rollback e toast d'errore, esattamente come `setProfilePrivacy`.

Aggiungere la prop `personalizationEnabled: boolean` all'interfaccia `Props` e passarla al sotto-componente.

- [ ] **Step 3: Passare il valore dalla pagina**

In `src/app/(app)/profile/page.tsx`, aggiungere `getPersonalizationEnabled()` alla `Promise.all` che già esiste e passarne il risultato a `<ProfileEditor personalizationEnabled={…} />`.

- [ ] **Step 4: Controlli**

Run: `pnpm typecheck && pnpm lint && pnpm test`
Expected: verde.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(app)/profile"
git commit -m "feat(profilo): interruttore della personalizzazione, che spento cancella lo storico"
```

---

### Task 13: collaudo contro i servizi veri, documentazione, deploy

**Files:**
- Create: `scripts/taste-dump.ts`
- Modify: `CLAUDE.md`
- Modify: `docs/superpowers/specs/2026-09-07-algoritmo-fase-a-segnali-utente-design.md` (le due correzioni dichiarate nei Global Constraints)

**Interfaces:**
- Consumes: tutto quanto sopra.
- Produces: niente di nuovo per il codice.

- [ ] **Step 1: Scrivere lo script di collaudo**

Crea `scripts/taste-dump.ts`:

```ts
/**
 * Stampa il profilo di gusto di un utente, e i primi segnali che l'hanno prodotto.
 *
 * Serve a rispondere all'unica domanda che i test unitari non possono verificare:
 * "questo profilo somiglia davvero a quello che l'utente guarda?". Se non somiglia,
 * i pesi sono sbagliati, e si vede solo così.
 *
 *   pnpm tsx scripts/taste-dump.ts <user_id>
 */
import { createServiceClient } from "../src/lib/supabase/server";
import { refreshTasteFor } from "../src/lib/taste/refresh";

async function main() {
  const userId = process.argv[2];
  if (!userId) {
    console.error("uso: pnpm tsx scripts/taste-dump.ts <user_id>");
    process.exit(1);
  }

  const scritto = await refreshTasteFor(userId);
  console.log(scritto ? "profilo ricalcolato" : "nessun segnale per questo utente");

  const supabase = createServiceClient();
  const { data: taste } = await supabase
    .from("user_taste")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  console.log("\n== profilo ==");
  console.log(JSON.stringify(taste, null, 2));

  const { count } = await supabase
    .from("user_events")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);
  console.log(`\neventi registrati: ${count ?? 0}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
```

- [ ] **Step 2: Costruire e avviare**

```bash
NEXT_DIST_DIR=.next-check pnpm build
NEXT_DIST_DIR=.next-check pnpm exec next start -p 3399
```

Expected: build senza errori; nella tabella delle route deve comparire `/api/events`.

- [ ] **Step 3: Verificare la raccolta con un browser vero**

Con l'utente di prova (`zapptest@zapp.dev`), aprire `http://localhost:3399`, scorrere la home fino in fondo, aprire una scheda titolo, tornare indietro. Poi, con `execute_sql`:

```sql
select kind, surface, count(*) from public.user_events
where user_id = '<id utente di prova>'
group by kind, surface order by count desc;
```

Atteso: righe `impression` su più superfici e almeno una `open`.

Scorrere la home una **seconda** volta nella stessa scheda del browser e rilanciare la query: il numero di `impression` **non deve crescere** (indice unico per sessione). Se cresce, il `sessionId` sta cambiando a ogni navigazione — va tenuto nel provider, che il layout monta una volta sola.

- [ ] **Step 4: Verificare il profilo**

```bash
pnpm tsx scripts/taste-dump.ts <id utente di prova>
```

Atteso: `massa` > 0, `generi` con i generi che l'utente ha davvero in libreria, `tipo` coerente con la sua percentuale di serie. Se i generi non somigliano, **fermarsi e controllare i pesi**: è il segnale che questa fase è sbagliata.

- [ ] **Step 5: Verificare l'onboarding con Playwright**

Con un utente nuovo, su iPhone 13 e desktop 1440: passo 1 → passo 2 → "Fine" con 3 scelte; poi ripetere con "Salta". Controllare che `user_preferences.birth_year` e `user_seed_picks` siano scritte nel primo caso e che nel secondo l'utente entri comunque in home.

- [ ] **Step 6: Verificare l'interruttore**

Spegnere la personalizzazione dal profilo, poi:

```sql
select
  (select count(*) from public.user_events where user_id = '<id>') as eventi,
  (select count(*) from public.user_taste  where user_id = '<id>') as profilo;
```

Atteso: entrambi `0`. Ricaricare la home e controllare nel pannello di rete che **non** parta nessuna richiesta a `/api/events`.

- [ ] **Step 7: Verificare i job**

```bash
curl -s -X POST -H "x-jobs-secret: $JOBS_SECRET" http://localhost:3399/api/jobs/taste-refresh
curl -s -X POST -H "x-jobs-secret: $JOBS_SECRET" http://localhost:3399/api/jobs/events-prune
```

Atteso: `{"ok":true,...}` per entrambi, e due righe chiuse in `job_runs`. Provare anche **senza** header: deve rispondere 401.

- [ ] **Step 8: Aggiornare la spec con le due correzioni**

Nella spec, §3.1: aggiungere che `lingua` si ricava da `titles.raw->original_language` per i soli 50 titoli di testa, perché la colonna non esiste in `titles`. Nel §6, correggere il nome della lettura in `getTasteProfile` e aggiungere i file `events.ts`, `seed-source.ts` e la migration `0025_cron_taste.sql`.

- [ ] **Step 9: Scrivere la sezione in `CLAUDE.md`**

Aggiungere, subito prima di `### Algoritmo: voti e classifiche (fase B)`, una sezione `### Algoritmo: segnali utente (fase A)` con: le quattro tabelle e perché l'anno di nascita non sta in `profiles`; il fatto che lo skip è derivato e non un evento; l'indice unico parziale sulle impression; che il client non può dichiarare `library_add`/`rate`; che `getTaste` di `hero.ts` e `getTasteProfile` di `taste/queries.ts` sono due cose diverse; che `lingua` e `persone` costano una lettura di `raw` limitata a 50 titoli, e perché; i due job e i loro orari; e **le trappole trovate davvero durante il collaudo** — quelle valgono più di tutto il resto della sezione.

- [ ] **Step 10: Commit e deploy**

```bash
git add scripts/taste-dump.ts CLAUDE.md docs/superpowers/specs
git commit -m "docs(algoritmo): fase A dei segnali utente, collaudo e trappole"
git push origin HEAD:main
```

Poi verificare che il deploy sia il proprio: `npx vercel ls` (il "Building" subito dopo il push) e, a deploy pronto, `curl -o /dev/null -w "%{http_code}" -X POST https://zapp-mu.vercel.app/api/events` → `204` senza sessione. Con `execute_sql`, controllare dopo un'ora che `job_runs` abbia una riga `taste-refresh` con `ok = true`.

---

## Note di verifica finale (dopo il Task 13)

- `pnpm typecheck && pnpm lint && pnpm test && NEXT_DIST_DIR=.next-check pnpm build` tutti verdi.
- `job_runs` con una riga riuscita per `taste-refresh` e per `events-prune`.
- La home e la scheda titolo si vedono **identiche** a prima: questa fase non cambia nulla di ciò che l'utente vede, tranne l'onboarding e l'interruttore.
