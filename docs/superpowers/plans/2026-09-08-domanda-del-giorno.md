# La domanda del giorno — piano di implementazione

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ogni giorno una domanda su film e serie; si risponde con un titolo e un motivo facoltativo, e il giorno dopo si apre il podio dei tre titoli più scelti prima della domanda nuova.

**Architecture:** tre tabelle nuove più una RPC aggregata per il podio (nessun cron: il podio di un giorno chiuso non cambia più, quindi sta dietro `unstable_cache` con la data come chiave). La lettura sta in `src/lib/daily/queries.ts` (server-only), la scrittura in `src/lib/daily/actions.ts` (Server Actions), la classifica in `src/lib/daily/rank.ts` (puro, Vitest). In pagina è un solo componente client montato nello slot `right` di `TopNav` dal layout `(app)`: rende l'icona accanto alla campanella e, alla prima apertura del giorno, l'overlay a tutto schermo con podio di ieri e domanda di oggi.

**Tech Stack:** Next.js 15 App Router (Server Components), TypeScript strict, Tailwind CSS 4, Framer Motion, Supabase (Postgres + RLS, `@supabase/ssr`), Vitest.

**Spec:** `docs/superpowers/specs/2026-09-08-domanda-del-giorno-design.md`

## Global Constraints

- Interfaccia in italiano, commenti del codice in italiano.
- Il giorno è **Europe/Rome**, mai UTC. In TypeScript si usa `romeDateString()` di `src/lib/cinema/dates.ts`; in SQL `(now() at time zone 'Europe/Rome')::date`.
- Nessuna policy `to public`: ogni policy nuova è `to authenticated`. Nessun grant ad `anon`.
- Ogni policy di UPDATE ripete la condizione di proprietà nel `with check`; dove serve la riga vecchia si usa un trigger.
- Ogni Server Action valida i suoi argomenti con `src/lib/validate.ts`; verso il client va sempre un messaggio generico (`"Non è riuscito, riprova."`), il dettaglio resta nei log.
- Nessun `localStorage` per dati dell'utente.
- Nessuna libreria UI esterna: primitive in `src/components/ui/`.
- Backdrop sempre `original`; locandine con `sizes` reali.
- Prettier: virgolette doppie, virgole finali, `printWidth` 90.
- Migrations: si scrive il file in `supabase/migrations/` **e** si applica con `mcp__claude_ai_Supabase__apply_migration` (mai `supabase db push` su quel progetto), poi si rigenerano i tipi in `src/types/database.ts`.
- Mai due `next build` nella stessa cartella: per verificare si usa `NEXT_DIST_DIR=.next-check`.

---

### Task 1: Migration `0022_domanda_del_giorno.sql` e tipi

**Files:**
- Create: `supabase/migrations/0022_domanda_del_giorno.sql`
- Modify: `src/types/database.ts` (rigenerato)

**Interfaces:**
- Consumes: `public.media_type`, `public.titles (id, media_type)`, `public.profiles`, `public.reports`, `public.is_blocked(uuid, uuid)` — tutti già in DB.
- Produces: tabelle `daily_questions`, `daily_answers`, `daily_question_views`; funzioni `public.is_today_question(uuid)` e `public.daily_question_podium(date)`; tipi `Tables<"daily_questions">`, `Tables<"daily_answers">`, `Tables<"daily_question_views">`.

- [ ] **Step 1: Scrivere la migration**

Crea `supabase/migrations/0022_domanda_del_giorno.sql`:

```sql
-- La domanda del giorno: una domanda al giorno, una risposta per utente
-- (un titolo + un motivo facoltativo), e il giorno dopo il podio dei tre
-- titoli più scelti. Spec: docs/superpowers/specs/2026-09-08-domanda-del-giorno-design.md

-- ============ domande ============
create table public.daily_questions (
  id uuid primary key default gen_random_uuid(),
  ask_on date not null unique,
  text text not null check (char_length(text) between 8 and 200),
  media_scope text not null default 'any'
    check (media_scope in ('movie', 'tv', 'any')),
  created_at timestamptz not null default now()
);

alter table public.daily_questions enable row level security;

-- Solo le domande già uscite: altrimenti si sfogliano in anticipo quelle future.
create policy "daily_questions_select_past" on public.daily_questions
  for select to authenticated
  using (ask_on <= (now() at time zone 'Europe/Rome')::date);

-- ============ risposte ============
create table public.daily_answers (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.daily_questions (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  title_id bigint not null,
  media_type public.media_type not null,
  reason text check (char_length(reason) <= 140),
  report_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (question_id, user_id),
  foreign key (title_id, media_type) references public.titles (id, media_type)
);

create index daily_answers_question_idx on public.daily_answers (question_id, created_at desc);

alter table public.daily_answers enable row level security;

-- `stable` e non `security definer`: la policy su daily_questions lascia già
-- vedere la domanda di oggi. Revocata da anon/public: una funzione raggiungibile
-- da PostgREST è un endpoint in più senza motivo.
create or replace function public.is_today_question(q_id uuid)
returns boolean
language sql
stable
set search_path to 'public'
as $$
  select exists (
    select 1 from public.daily_questions q
    where q.id = q_id
      and q.ask_on = (now() at time zone 'Europe/Rome')::date
  );
$$;

revoke all on function public.is_today_question(uuid) from public, anon, authenticated;

create policy "daily_answers_select" on public.daily_answers
  for select to authenticated
  using (report_count < 3 and not public.is_blocked(auth.uid(), user_id));

create policy "daily_answers_insert_own" on public.daily_answers
  for insert to authenticated
  with check (user_id = auth.uid() and public.is_today_question(question_id));

-- `with check` ripete proprietà e giorno: senza, con una sessione si riscrive
-- col PostgREST la propria risposta di ieri e si cambia una classifica pubblicata.
create policy "daily_answers_update_own" on public.daily_answers
  for update to authenticated
  using (user_id = auth.uid() and public.is_today_question(question_id))
  with check (user_id = auth.uid() and public.is_today_question(question_id));

create policy "daily_answers_delete_own" on public.daily_answers
  for delete to authenticated
  using (user_id = auth.uid() and public.is_today_question(question_id));

-- Il `with check` non vede la riga vecchia: senza questo trigger si sposta la
-- propria risposta su un'altra domanda, o la si intesta a un altro utente.
create or replace function public.daily_answers_keys_immutable()
returns trigger
language plpgsql
set search_path to 'public'
as $fn$
begin
  if new.question_id <> old.question_id or new.user_id <> old.user_id then
    raise exception 'question_id e user_id non si cambiano';
  end if;
  new.updated_at := now();
  return new;
end;
$fn$;

revoke all on function public.daily_answers_keys_immutable() from public, anon, authenticated;

create trigger daily_answers_keys_immutable
  before update on public.daily_answers
  for each row execute function public.daily_answers_keys_immutable();

-- ============ "il popup di oggi l'ho già visto" ============
-- Sta in DB e non in localStorage: regola del progetto (nessun dato utente nel
-- browser) ed è anche il motivo per cui non ricompare su un altro dispositivo.
create table public.daily_question_views (
  user_id uuid not null references public.profiles (id) on delete cascade,
  ask_on date not null,
  seen_at timestamptz not null default now(),
  primary key (user_id, ask_on)
);

alter table public.daily_question_views enable row level security;

create policy "daily_question_views_select_own" on public.daily_question_views
  for select to authenticated using (user_id = auth.uid());
create policy "daily_question_views_insert_own" on public.daily_question_views
  for insert to authenticated with check (user_id = auth.uid());

-- ============ segnalazioni: si riusa la tabella generica ============
alter table public.reports drop constraint if exists reports_target_type_check;
alter table public.reports
  add constraint reports_target_type_check
  check (target_type in ('review', 'comment', 'daily_answer'));

create or replace function public.sync_daily_answer_report_count()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare target uuid;
begin
  if coalesce(new.target_type, old.target_type) <> 'daily_answer' then
    return coalesce(new, old);
  end if;
  target := coalesce(new.target_id, old.target_id);
  update public.daily_answers a
     set report_count = (
       select count(distinct rp.reporter_id)
       from public.reports rp
       where rp.target_type = 'daily_answer' and rp.target_id = a.id
     )
   where a.id = target;
  return coalesce(new, old);
end;
$fn$;

revoke all on function public.sync_daily_answer_report_count()
  from public, anon, authenticated;

create trigger sync_daily_answer_report_count
  after insert or delete on public.reports
  for each row execute function public.sync_daily_answer_report_count();

-- ============ podio ============
-- SECURITY DEFINER come title_rating_histogram: il conteggio dev'essere su tutti
-- gli utenti, mentre le policy nascondono le righe dei bloccati. Ritorna solo
-- numeri, nessun dato personale. `day < oggi`: la classifica di oggi non si legge
-- prima di sera, altrimenti si vota guardando i risultati.
create or replace function public.daily_question_podium(day date)
returns table(
  title_id bigint,
  media_type public.media_type,
  votes bigint,
  first_at timestamptz
)
language sql
stable
security definer
set search_path to 'public'
as $$
  select a.title_id, a.media_type, count(*), min(a.created_at)
  from public.daily_answers a
  join public.daily_questions q on q.id = a.question_id
  where q.ask_on = day
    and day < (now() at time zone 'Europe/Rome')::date
  group by a.title_id, a.media_type
  order by count(*) desc, min(a.created_at) asc
  limit 3;
$$;

revoke all on function public.daily_question_podium(date) from public, anon;
grant execute on function public.daily_question_podium(date) to authenticated;

-- ============ grant ============
revoke all on public.daily_questions from anon;
revoke all on public.daily_answers from anon;
revoke all on public.daily_question_views from anon;

grant select on public.daily_questions to authenticated;
grant select, insert, delete on public.daily_answers to authenticated;
-- Mai `report_count`: lo tiene il trigger, come su `reviews`.
grant update (title_id, media_type, reason) on public.daily_answers to authenticated;
grant select, insert on public.daily_question_views to authenticated;
```

- [ ] **Step 2: Applicare la migration**

Con `mcp__claude_ai_Supabase__apply_migration`, `name: "0022_domanda_del_giorno"`, `query` = il contenuto del file. Progetto `bbuhwzdbzxgydewmcdwd`.

- [ ] **Step 3: Verificare che le regole reggano davvero**

Con `mcp__claude_ai_Supabase__execute_sql`:

```sql
-- 1. le tre tabelle hanno RLS e almeno una policy, tutte to authenticated
select c.relname, c.relrowsecurity, p.polname, p.polroles::regrole[]
from pg_class c left join pg_policy p on p.polrelid = c.oid
where c.relname in ('daily_questions','daily_answers','daily_question_views');

-- 2. nessun privilegio per anon
select table_name, privilege_type, grantee
from information_schema.role_table_grants
where table_name like 'daily_%' and grantee in ('anon','public');

-- 3. il podio di oggi non si legge
select * from public.daily_question_podium((now() at time zone 'Europe/Rome')::date);
```

Atteso: (1) `relrowsecurity = true` per tutte e tre e `polroles` = `{authenticated}`; (2) **zero righe**; (3) **zero righe**.

- [ ] **Step 4: Advisor**

`mcp__claude_ai_Supabase__get_advisors` con `type: "security"`. Atteso: nessun avviso nuovo rispetto a quelli già accettati (`user_search`, `reviews_with_counts`).

- [ ] **Step 5: Rigenerare i tipi**

`mcp__claude_ai_Supabase__generate_typescript_types` e scrivere il risultato in `src/types/database.ts`. Verifica: `pnpm typecheck` passa e `Tables<"daily_answers">` esiste.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/0022_domanda_del_giorno.sql src/types/database.ts
git commit -m "feat(domanda): tabelle, policy e RPC del podio"
```

---

### Task 2: `previousDay` in `dates.ts`

**Files:**
- Modify: `src/lib/cinema/dates.ts` (accanto a `nextDay`)
- Test: `src/lib/cinema/dates.test.ts`

**Interfaces:**
- Produces: `previousDay(date: string): string` — il giorno prima di una data `YYYY-MM-DD` di Roma.

- [ ] **Step 1: Scrivere il test che fallisce**

In `src/lib/cinema/dates.test.ts`, dentro `describe("dates (Europe/Rome)")`:

```ts
it("torna indietro di un giorno anche attraverso il cambio d'ora", () => {
  expect(previousDay("2026-09-08")).toBe("2026-09-07");
  expect(previousDay("2026-03-30")).toBe("2026-03-29"); // notte del cambio d'ora
  expect(previousDay("2026-01-01")).toBe("2025-12-31");
});
```

Aggiungi `previousDay` all'import in cima al file di test.

- [ ] **Step 2: Verificare che fallisca**

Run: `pnpm vitest run src/lib/cinema/dates.test.ts`
Atteso: FAIL, `previousDay is not a function` (o errore di tipo in import).

- [ ] **Step 3: Implementare**

In `src/lib/cinema/dates.ts`, subito dopo `nextDay`:

```ts
/** Il giorno prima di `date` (mezzogiorno UTC: immune al cambio d'ora). */
export function previousDay(date: string): string {
  return romeDateString(new Date(new Date(`${date}T12:00:00Z`).getTime() - 86_400_000));
}
```

- [ ] **Step 4: Verificare che passi**

Run: `pnpm vitest run src/lib/cinema/dates.test.ts`
Atteso: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/cinema/dates.ts src/lib/cinema/dates.test.ts
git commit -m "feat(dates): previousDay, il giorno prima a Roma"
```

---

### Task 3: `src/lib/daily/rank.ts` (puro, con test)

**Files:**
- Create: `src/lib/daily/rank.ts`
- Test: `src/lib/daily/rank.test.ts`

**Interfaces:**
- Consumes: niente (modulo puro, nessun import dal progetto).
- Produces:
  - `interface PodiumCount { titleId: number; mediaType: "movie" | "tv"; votes: number; firstAt: string }`
  - `interface PodiumTitle { titleId: number; mediaType: "movie" | "tv"; title: string; posterPath: string | null; backdropPath: string | null }`
  - `interface PodiumEntry extends PodiumCount, PodiumTitle { position: number }`
  - `interface ReasonSource { titleId: number; mediaType: "movie" | "tv"; reason: string | null; createdAt: string; authorName: string | null; authorAvatar: string | null }`
  - `buildPodium(counts: PodiumCount[], titles: PodiumTitle[]): PodiumEntry[]`
  - `topReason(answers: ReasonSource[], winner: { titleId: number; mediaType: "movie" | "tv" } | undefined): ReasonSource | null`
  - `cleanReason(raw: unknown): string | null`
  - `REASON_MAX_LENGTH = 140`

- [ ] **Step 1: Scrivere i test che falliscono**

Crea `src/lib/daily/rank.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildPodium, cleanReason, topReason, REASON_MAX_LENGTH } from "./rank";

const titles = [
  { titleId: 1, mediaType: "movie" as const, title: "Arrival", posterPath: "/a.jpg", backdropPath: "/ab.jpg" },
  { titleId: 2, mediaType: "movie" as const, title: "Sin City", posterPath: "/s.jpg", backdropPath: null },
  { titleId: 3, mediaType: "tv" as const, title: "Dark", posterPath: "/d.jpg", backdropPath: "/db.jpg" },
  { titleId: 4, mediaType: "tv" as const, title: "Fringe", posterPath: null, backdropPath: null },
];

describe("buildPodium", () => {
  it("ordina per voti e numera le posizioni", () => {
    const podium = buildPodium(
      [
        { titleId: 2, mediaType: "movie", votes: 3, firstAt: "2026-09-07T10:00:00Z" },
        { titleId: 1, mediaType: "movie", votes: 9, firstAt: "2026-09-07T11:00:00Z" },
        { titleId: 3, mediaType: "tv", votes: 5, firstAt: "2026-09-07T09:00:00Z" },
      ],
      titles,
    );
    expect(podium.map((p) => [p.position, p.title, p.votes])).toEqual([
      [1, "Arrival", 9],
      [2, "Dark", 5],
      [3, "Sin City", 3],
    ]);
  });

  it("a parità di voti vince chi è stato scelto per primo", () => {
    const podium = buildPodium(
      [
        { titleId: 1, mediaType: "movie", votes: 4, firstAt: "2026-09-07T20:00:00Z" },
        { titleId: 3, mediaType: "tv", votes: 4, firstAt: "2026-09-07T08:00:00Z" },
      ],
      titles,
    );
    expect(podium.map((p) => p.title)).toEqual(["Dark", "Arrival"]);
  });

  it("non confonde un film e una serie con lo stesso id", () => {
    const podium = buildPodium(
      [
        { titleId: 1, mediaType: "movie", votes: 2, firstAt: "2026-09-07T08:00:00Z" },
        { titleId: 1, mediaType: "tv", votes: 7, firstAt: "2026-09-07T09:00:00Z" },
      ],
      [...titles, { titleId: 1, mediaType: "tv" as const, title: "Arrival (serie)", posterPath: null, backdropPath: null }],
    );
    expect(podium.map((p) => p.title)).toEqual(["Arrival (serie)", "Arrival"]);
  });

  it("taglia a tre gradini e ne mostra meno se i titoli sono meno", () => {
    const counts = [1, 2, 3, 4].map((titleId, i) => ({
      titleId,
      mediaType: (titleId > 2 ? "tv" : "movie") as "movie" | "tv",
      votes: 10 - i,
      firstAt: "2026-09-07T08:00:00Z",
    }));
    expect(buildPodium(counts, titles)).toHaveLength(3);
    expect(buildPodium(counts.slice(0, 1), titles)).toHaveLength(1);
    expect(buildPodium([], titles)).toEqual([]);
  });

  it("scarta le righe di cui manca il titolo in cache", () => {
    const podium = buildPodium(
      [{ titleId: 99, mediaType: "movie", votes: 12, firstAt: "2026-09-07T08:00:00Z" }],
      titles,
    );
    expect(podium).toEqual([]);
  });
});

describe("topReason", () => {
  const answers = [
    { titleId: 1, mediaType: "movie" as const, reason: null, createdAt: "2026-09-07T07:00:00Z", authorName: "Ada", authorAvatar: null },
    { titleId: 1, mediaType: "movie" as const, reason: "   ", createdAt: "2026-09-07T08:00:00Z", authorName: "Bea", authorAvatar: null },
    { titleId: 1, mediaType: "movie" as const, reason: "Mi ha rotto il cuore", createdAt: "2026-09-07T09:00:00Z", authorName: "Cin", authorAvatar: "/avatars/01.png" },
    { titleId: 1, mediaType: "movie" as const, reason: "Anche a me", createdAt: "2026-09-07T10:00:00Z", authorName: "Dan", authorAvatar: null },
    { titleId: 3, mediaType: "tv" as const, reason: "Altro titolo", createdAt: "2026-09-07T06:00:00Z", authorName: "Eva", authorAvatar: null },
  ];

  it("prende il primo motivo scritto sul titolo vincitore", () => {
    expect(topReason(answers, { titleId: 1, mediaType: "movie" })?.authorName).toBe("Cin");
  });

  it("non c'è vincitore o non ci sono motivi: null", () => {
    expect(topReason(answers, undefined)).toBeNull();
    expect(topReason(answers, { titleId: 4, mediaType: "tv" })).toBeNull();
  });
});

describe("cleanReason", () => {
  it("toglie spazi e a capo di troppo", () => {
    expect(cleanReason("  ciao   \n  mondo ")).toBe("ciao mondo");
  });

  it("vuoto o non stringa: null", () => {
    expect(cleanReason("   ")).toBeNull();
    expect(cleanReason(undefined)).toBeNull();
    expect(cleanReason(42)).toBeNull();
  });

  it("taglia a 140 caratteri", () => {
    const long = "a".repeat(200);
    expect(cleanReason(long)).toHaveLength(REASON_MAX_LENGTH);
  });
});
```

- [ ] **Step 2: Verificare che falliscano**

Run: `pnpm vitest run src/lib/daily/rank.test.ts`
Atteso: FAIL, "Failed to resolve import ./rank".

- [ ] **Step 3: Implementare**

Crea `src/lib/daily/rank.ts`:

```ts
/**
 * La classifica della domanda del giorno. Funzioni pure: nessuna lettura dal DB,
 * nessun `server-only`, così stanno sotto test e girano anche nel componente client.
 */

/** Quanti hanno scelto quel titolo, e quando l'ha scelto il primo. */
export interface PodiumCount {
  titleId: number;
  mediaType: "movie" | "tv";
  votes: number;
  /** ISO della prima risposta su quel titolo: è il criterio di pareggio. */
  firstAt: string;
}

export interface PodiumTitle {
  titleId: number;
  mediaType: "movie" | "tv";
  title: string;
  posterPath: string | null;
  backdropPath: string | null;
}

export interface PodiumEntry extends PodiumCount, PodiumTitle {
  /** 1, 2, 3. */
  position: number;
}

export interface ReasonSource {
  titleId: number;
  mediaType: "movie" | "tv";
  reason: string | null;
  createdAt: string;
  authorName: string | null;
  authorAvatar: string | null;
}

export const REASON_MAX_LENGTH = 140;

const key = (t: { titleId: number; mediaType: "movie" | "tv" }) =>
  `${t.mediaType}:${t.titleId}`;

/**
 * Ordina i conteggi e li unisce ai titoli in cache. A parità di voti vince chi è
 * stato scelto per primo: un criterio deterministico, altrimenti la classifica
 * cambia fra due render.
 */
export function buildPodium(
  counts: PodiumCount[],
  titles: PodiumTitle[],
): PodiumEntry[] {
  const byKey = new Map(titles.map((t) => [key(t), t]));
  return [...counts]
    .sort((a, b) => b.votes - a.votes || a.firstAt.localeCompare(b.firstAt))
    .flatMap((count) => {
      const title = byKey.get(key(count));
      // titolo non ancora in cache: si scarta invece di mostrare un buco
      return title ? [{ ...count, ...title }] : [];
    })
    .slice(0, 3)
    .map((entry, i) => ({ ...entry, position: i + 1 }));
}

/** Il motivo da mostrare sotto il vincitore: il primo scritto su quel titolo. */
export function topReason(
  answers: ReasonSource[],
  winner: { titleId: number; mediaType: "movie" | "tv" } | undefined,
): ReasonSource | null {
  if (!winner) return null;
  const wanted = key(winner);
  return (
    answers
      .filter((a) => key(a) === wanted && cleanReason(a.reason) !== null)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0] ?? null
  );
}

/** Motivo scritto dall'utente: spazi normalizzati, vuoto → null, taglio a 140. */
export function cleanReason(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const text = raw.replace(/\s+/g, " ").trim();
  if (!text) return null;
  return text.slice(0, REASON_MAX_LENGTH);
}
```

- [ ] **Step 4: Verificare che passino**

Run: `pnpm vitest run src/lib/daily/rank.test.ts`
Atteso: PASS, 10 test.

- [ ] **Step 5: Commit**

```bash
git add src/lib/daily/rank.ts src/lib/daily/rank.test.ts
git commit -m "feat(domanda): podio, motivo in evidenza e pulizia del testo"
```

---

### Task 4: `src/lib/daily/queries.ts` (letture)

**Files:**
- Create: `src/lib/daily/queries.ts`

**Interfaces:**
- Consumes: `createClient` / `createServiceClient` da `@/lib/supabase/server`, `getViewer` da `@/lib/auth/viewer`, `romeDateString`/`previousDay` da `@/lib/cinema/dates`, `buildPodium`/`topReason`/`PodiumEntry`/`ReasonSource` da `./rank`, `TitleListRow` non serve (si selezionano solo 4 colonne).
- Produces:
  - `interface DailyQuestionRow { id: string; text: string; mediaScope: "movie" | "tv" | "any" }`
  - `interface MyAnswer { titleId: number; mediaType: "movie" | "tv"; title: string; posterPath: string | null; reason: string | null }`
  - `interface Podium { question: string; day: string; entries: PodiumEntry[]; reason: ReasonSource | null }`
  - `interface DailyAnswerItem { id: string; titleId: number; mediaType: "movie" | "tv"; title: string; posterPath: string | null; reason: string | null; createdAt: string; authorName: string; authorUsername: string | null; authorAvatar: string | null; mine: boolean }`
  - `getTodayQuestion(): Promise<DailyQuestionRow | null>` (React `cache()`)
  - `getMyAnswer(): Promise<MyAnswer | null>`
  - `hasSeenToday(): Promise<boolean>`
  - `getYesterdayPodium(): Promise<Podium | null>`
  - `getDailyAnswers(limit?: number): Promise<DailyAnswerItem[]>`

- [ ] **Step 1: Scrivere il modulo**

Crea `src/lib/daily/queries.ts`:

```ts
import "server-only";
import { cache } from "react";
import { unstable_cache } from "next/cache";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { getViewer } from "@/lib/auth/viewer";
import { previousDay, romeDateString } from "@/lib/cinema/dates";
import {
  buildPodium,
  topReason,
  type PodiumCount,
  type PodiumEntry,
  type ReasonSource,
} from "./rank";

export interface DailyQuestionRow {
  id: string;
  text: string;
  mediaScope: "movie" | "tv" | "any";
}

export interface MyAnswer {
  titleId: number;
  mediaType: "movie" | "tv";
  title: string;
  posterPath: string | null;
  reason: string | null;
}

export interface Podium {
  /** Il testo della domanda di ieri: senza, il podio non si capisce. */
  question: string;
  day: string;
  entries: PodiumEntry[];
  reason: ReasonSource | null;
}

export interface DailyAnswerItem {
  id: string;
  titleId: number;
  mediaType: "movie" | "tv";
  title: string;
  posterPath: string | null;
  reason: string | null;
  createdAt: string;
  /** "Un utente" quando il profilo è privato: le policy non lo mostrano agli estranei. */
  authorName: string;
  authorUsername: string | null;
  authorAvatar: string | null;
  mine: boolean;
}

/** Colonne del titolo che servono a podio ed elenco: mai `raw` (27 KB a riga). */
const TITLE_COLS = "id, media_type, title, poster_path, backdrop_path";

/** La domanda di oggi (Europe/Rome). Una lettura per richiesta. */
export const getTodayQuestion = cache(async (): Promise<DailyQuestionRow | null> => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("daily_questions")
    .select("id, text, media_scope")
    .eq("ask_on", romeDateString())
    .maybeSingle();
  if (!data) return null;
  return {
    id: data.id,
    text: data.text,
    mediaScope: data.media_scope as DailyQuestionRow["mediaScope"],
  };
});

/**
 * La mia risposta di oggi. Il join `!inner` sulla domanda evita di aspettare
 * `getTodayQuestion`: così la lettura parte in parallelo alle altre.
 */
export async function getMyAnswer(): Promise<MyAnswer | null> {
  const viewer = await getViewer();
  if (!viewer) return null;
  const supabase = await createClient();
  const { data } = await supabase
    .from("daily_answers")
    .select(
      `title_id, media_type, reason,
       question:daily_questions!inner(ask_on),
       title:titles!daily_answers_title_id_media_type_fkey(${TITLE_COLS})`,
    )
    .eq("user_id", viewer.id)
    .eq("question.ask_on", romeDateString())
    .maybeSingle();
  if (!data?.title) return null;
  return {
    titleId: data.title_id,
    mediaType: data.media_type,
    title: data.title.title,
    posterPath: data.title.poster_path,
    reason: data.reason,
  };
}

/** Il popup di oggi è già stato aperto? (riga in `daily_question_views`) */
export async function hasSeenToday(): Promise<boolean> {
  const viewer = await getViewer();
  if (!viewer) return true;
  const supabase = await createClient();
  const { data } = await supabase
    .from("daily_question_views")
    .select("ask_on")
    .eq("user_id", viewer.id)
    .eq("ask_on", romeDateString())
    .maybeSingle();
  return data != null;
}

/**
 * I conteggi del podio di un giorno chiuso non cambiano più: si calcolano una
 * volta per tutti e restano in cache con la data come chiave. Dentro
 * `unstable_cache` non si possono leggere i cookie, quindi qui va il service
 * client; la RPC ritorna **solo numeri**, nessun dato personale (i motivi e i
 * nomi si leggono più sotto con la sessione dell'utente, così i bloccati
 * restano nascosti a chi li ha bloccati).
 */
const cachedCounts = (day: string) =>
  unstable_cache(
    async (): Promise<PodiumCount[]> => {
      const supabase = createServiceClient();
      const { data } = await supabase.rpc("daily_question_podium", { day });
      return (data ?? []).map((r) => ({
        titleId: Number(r.title_id),
        mediaType: r.media_type,
        votes: Number(r.votes),
        firstAt: r.first_at,
      }));
    },
    ["daily-podium", day],
    { revalidate: 60 * 60 * 24 * 30 },
  )();

export async function getYesterdayPodium(): Promise<Podium | null> {
  const viewer = await getViewer();
  if (!viewer) return null;
  const day = previousDay(romeDateString());
  const supabase = await createClient();

  const [counts, questionRes] = await Promise.all([
    cachedCounts(day),
    supabase.from("daily_questions").select("id, text").eq("ask_on", day).maybeSingle(),
  ]);
  const question = questionRes.data;
  if (!question || counts.length === 0) return null;

  const ids = counts.map((c) => c.titleId);
  const [titlesRes, answersRes] = await Promise.all([
    supabase.from("titles").select(TITLE_COLS).in("id", ids),
    supabase
      .from("daily_answers")
      .select(
        `title_id, media_type, reason, created_at,
         author:profiles(display_name, username, avatar_url)`,
      )
      .eq("question_id", question.id)
      .not("reason", "is", null)
      .in("title_id", ids)
      .order("created_at", { ascending: true })
      .limit(200),
  ]);

  const entries = buildPodium(
    counts,
    (titlesRes.data ?? []).map((t) => ({
      titleId: Number(t.id),
      mediaType: t.media_type,
      title: t.title,
      posterPath: t.poster_path,
      backdropPath: t.backdrop_path,
    })),
  );
  const sources: ReasonSource[] = (answersRes.data ?? []).map((a) => ({
    titleId: Number(a.title_id),
    mediaType: a.media_type,
    reason: a.reason,
    createdAt: a.created_at,
    authorName: a.author?.display_name ?? a.author?.username ?? null,
    authorAvatar: a.author?.avatar_url ?? null,
  }));

  return { question: question.text, day, entries, reason: topReason(sources, entries[0]) };
}

/**
 * Le risposte di oggi, **dalla più recente**: mai per voti, perché una
 * classifica parziale in giornata farebbe rispondere guardando i risultati.
 */
export async function getDailyAnswers(limit = 60): Promise<DailyAnswerItem[]> {
  const [viewer, question] = await Promise.all([getViewer(), getTodayQuestion()]);
  if (!viewer || !question) return [];
  const supabase = await createClient();
  const { data } = await supabase
    .from("daily_answers")
    .select(
      `id, title_id, media_type, reason, created_at, user_id,
       author:profiles(display_name, username, avatar_url),
       title:titles!daily_answers_title_id_media_type_fkey(${TITLE_COLS})`,
    )
    .eq("question_id", question.id)
    .order("created_at", { ascending: false })
    .limit(limit);

  return (data ?? []).flatMap((row) => {
    if (!row.title) return [];
    return [
      {
        id: row.id,
        titleId: Number(row.title_id),
        mediaType: row.media_type,
        title: row.title.title,
        posterPath: row.title.poster_path,
        reason: row.reason,
        createdAt: row.created_at,
        // profilo privato: le policy non lo restituiscono agli estranei
        authorName: row.author?.display_name ?? row.author?.username ?? "Un utente",
        authorUsername: row.author?.username ?? null,
        authorAvatar: row.author?.avatar_url ?? null,
        mine: row.user_id === viewer.id,
      },
    ];
  });
}
```

- [ ] **Step 2: Verificare i tipi**

Run: `pnpm typecheck`
Atteso: nessun errore. Se PostgREST tipizza `author`/`title` come array, aggiungere `.maybeSingle()` non serve: si estrae con `Array.isArray(x) ? x[0] : x` in una funzione locale `one()`, come si fa già altrove nel progetto per gli embed.

- [ ] **Step 3: Commit**

```bash
git add src/lib/daily/queries.ts
git commit -m "feat(domanda): letture di domanda, risposta, podio ed elenco"
```

---

### Task 5: `src/lib/daily/actions.ts` (scritture)

**Files:**
- Create: `src/lib/daily/actions.ts`

**Interfaces:**
- Consumes: `getTodayQuestion`, `getDailyAnswers` da `./queries`; `cleanReason` da `./rank`; `getOrFetchTitle` da `@/lib/tmdb/cache`; `isMediaType`, `isTmdbId`, `isUuid` da `@/lib/validate`; `rateLimit` da `@/lib/rate-limit`.
- Produces:
  - `interface DailyResult { ok: boolean; error?: string }`
  - `answerDailyQuestion(titleId: unknown, mediaType: unknown, reason: unknown): Promise<DailyResult>`
  - `markDailyQuestionSeen(): Promise<void>`
  - `reportDailyAnswer(answerId: unknown): Promise<DailyResult>`
  - `fetchDailyAnswers(): Promise<DailyAnswerItem[]>`

- [ ] **Step 1: Scrivere il modulo**

Crea `src/lib/daily/actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { rateLimit } from "@/lib/rate-limit";
import { getOrFetchTitle } from "@/lib/tmdb/cache";
import { isMediaType, isTmdbId, isUuid } from "@/lib/validate";
import { romeDateString } from "@/lib/cinema/dates";
import { cleanReason } from "./rank";
import { getDailyAnswers, getTodayQuestion, type DailyAnswerItem } from "./queries";

export interface DailyResult {
  ok: boolean;
  error?: string;
}

/** Messaggio unico verso il client: il dettaglio PostgREST resta nei log. */
const GENERIC_ERROR = "Non è riuscito, riprova.";
const INVALID: DailyResult = { ok: false, error: "Richiesta non valida." };
const TOO_MANY: DailyResult = { ok: false, error: "Troppe richieste, riprova più tardi." };

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Non autenticato");
  return { supabase, user };
}

/**
 * Risponde alla domanda di oggi (o cambia la risposta già data).
 *
 * Gli argomenti arrivano da chiunque abbia una sessione, non dal nostro
 * componente: si validano tutti. `question_id` non si accetta mai dal client,
 * lo legge il server; il vincolo "solo la domanda di oggi" sta anche nella RLS.
 */
export async function answerDailyQuestion(
  titleId: unknown,
  mediaType: unknown,
  reason: unknown,
): Promise<DailyResult> {
  let supabase, user;
  try {
    ({ supabase, user } = await requireUser());
  } catch {
    return { ok: false, error: "Devi aver fatto accesso." };
  }
  if (!isTmdbId(titleId) || !isMediaType(mediaType)) return INVALID;
  const text = cleanReason(reason);

  // una risposta al giorno per regola; il limite è contro il pestaggio dell'endpoint
  if (!(await rateLimit(`daily-answer:${user.id}`, 20, 3600))) return TOO_MANY;

  const question = await getTodayQuestion();
  if (!question) return { ok: false, error: "Oggi non c'è nessuna domanda." };
  if (question.mediaScope !== "any" && question.mediaScope !== mediaType) {
    return INVALID;
  }

  // la FK composta su `titles` esige la riga: la si scarica ora, e da qui in poi
  // è in cache per tutti
  const title = await getOrFetchTitle(titleId, mediaType);
  if (!title) return { ok: false, error: GENERIC_ERROR };

  const { error } = await supabase.from("daily_answers").upsert(
    {
      question_id: question.id,
      user_id: user.id,
      title_id: titleId,
      media_type: mediaType,
      reason: text,
    },
    { onConflict: "question_id,user_id" },
  );
  if (error) {
    console.error("answerDailyQuestion", error);
    return { ok: false, error: GENERIC_ERROR };
  }
  revalidatePath("/");
  return { ok: true };
}

/** "Il popup di oggi l'ho visto": si scrive alla chiusura o all'invio. */
export async function markDailyQuestionSeen(): Promise<void> {
  try {
    const { supabase, user } = await requireUser();
    await supabase
      .from("daily_question_views")
      .upsert(
        { user_id: user.id, ask_on: romeDateString() },
        { onConflict: "user_id,ask_on", ignoreDuplicates: true },
      );
  } catch (e) {
    // non deve mai rompere la chiusura del popup
    console.error("markDailyQuestionSeen", e);
  }
}

/** Segnala il motivo di una risposta: 3 segnalazioni distinte e sparisce. */
export async function reportDailyAnswer(answerId: unknown): Promise<DailyResult> {
  let supabase, user;
  try {
    ({ supabase, user } = await requireUser());
  } catch {
    return { ok: false, error: "Devi aver fatto accesso." };
  }
  if (!isUuid(answerId)) return INVALID;
  if (!(await rateLimit(`daily-report:${user.id}`, 10, 3600))) return TOO_MANY;

  const { error } = await supabase
    .from("reports")
    .upsert(
      { target_type: "daily_answer", target_id: answerId, reporter_id: user.id },
      { onConflict: "target_type,target_id,reporter_id", ignoreDuplicates: true },
    );
  if (error) {
    console.error("reportDailyAnswer", error);
    return { ok: false, error: GENERIC_ERROR };
  }
  return { ok: true };
}

/** L'elenco per il pannello: chiesto solo quando il pannello si apre. */
export async function fetchDailyAnswers(): Promise<DailyAnswerItem[]> {
  return getDailyAnswers();
}
```

- [ ] **Step 2: Verificare i tipi e le regole di lint**

Run: `pnpm typecheck && pnpm lint`
Atteso: nessun errore.

- [ ] **Step 3: Commit**

```bash
git add src/lib/daily/actions.ts
git commit -m "feat(domanda): rispondi, segna come visto, segnala"
```

---

### Task 6: podio e composer (i due contenuti dell'overlay)

**Files:**
- Create: `src/components/daily/DailyPodium.tsx`
- Create: `src/components/daily/DailyComposer.tsx`

**Interfaces:**
- Consumes: `Podium` da `@/lib/daily/queries`, `answerDailyQuestion` da `@/lib/daily/actions`, `posterUrl` da `@/lib/config`, `Avatar` da `@/components/social/Avatar`, `useToast` da `@/components/ui/Toaster`, `SearchItem` da `@/lib/tmdb/mappers`.
- Produces:
  - `<DailyPodium podium={Podium} />`
  - `<DailyComposer question={{ id, text, mediaScope }} current={MyAnswer | null} onSaved={(a: MyAnswer) => void} />`

- [ ] **Step 1: Scrivere il podio**

Crea `src/components/daily/DailyPodium.tsx`:

```tsx
"use client";

import Image from "next/image";
import Link from "next/link";
import { posterUrl } from "@/lib/config";
import { Avatar } from "@/components/social/Avatar";
import type { Podium } from "@/lib/daily/queries";

/** Il primo gradino è più grande e centrale; gli altri due ruotano verso di lui. */
const SHAPE = [
  { width: "w-40 lg:w-52", rotate: "", order: "order-2", lift: "-mt-6 lg:-mt-10" },
  { width: "w-28 lg:w-36", rotate: "[transform:perspective(900px)_rotateY(16deg)]", order: "order-1", lift: "mt-4" },
  { width: "w-28 lg:w-36", rotate: "[transform:perspective(900px)_rotateY(-16deg)]", order: "order-3", lift: "mt-4" },
];

export function DailyPodium({ podium }: { podium: Podium }) {
  return (
    <div className="flex h-full flex-col justify-center gap-8 px-5 lg:px-10">
      <div>
        <p className="text-[11px] uppercase tracking-[0.18em] text-muted-2">
          La domanda di ieri
        </p>
        <h2 className="mt-2 text-[22px] font-light leading-snug text-text lg:text-[30px]">
          {podium.question}
        </h2>
      </div>

      <ul className="flex items-end justify-center gap-3 lg:gap-6">
        {podium.entries.map((entry, i) => {
          const shape = SHAPE[i] ?? SHAPE[0];
          return (
            <li key={`${entry.mediaType}:${entry.titleId}`} className={`${shape.order} ${shape.lift}`}>
              <Link href={`/title/${entry.mediaType}/${entry.titleId}`} className="block">
                <div
                  className={`relative aspect-[2/3] overflow-hidden rounded-[18px] border border-white/10 shadow-[0_24px_60px_rgba(0,0,0,0.6)] ${shape.width} ${shape.rotate}`}
                >
                  {entry.posterPath ? (
                    <Image
                      src={posterUrl(entry.posterPath, "w342")!}
                      alt=""
                      fill
                      sizes="(max-width: 1023px) 160px, 208px"
                      className="object-cover"
                    />
                  ) : (
                    <div className="size-full bg-surface-2" />
                  )}
                </div>
                <p className="mt-3 text-center text-[26px] font-light tabular-nums text-text lg:text-[34px]">
                  {entry.position}
                </p>
                <p className="line-clamp-2 text-center text-[13px] text-text lg:text-[15px]">
                  {entry.title}
                </p>
                <p className="text-center text-[12px] text-muted">
                  {entry.votes} {entry.votes === 1 ? "voto" : "voti"}
                </p>
              </Link>
            </li>
          );
        })}
      </ul>

      {podium.reason && (
        <figure className="mx-auto flex max-w-[560px] items-start gap-3 rounded-[20px] border border-border bg-surface/70 px-4 py-3">
          <Avatar url={podium.reason.authorAvatar} name={podium.reason.authorName ?? "Un utente"} size={36} />
          <blockquote className="text-[14px] leading-relaxed text-text">
            «{podium.reason.reason}»
            <figcaption className="mt-1 text-[12px] text-muted">
              {podium.reason.authorName ?? "Un utente"}
            </figcaption>
          </blockquote>
        </figure>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Scrivere il composer**

Crea `src/components/daily/DailyComposer.tsx`:

```tsx
"use client";

import Image from "next/image";
import { useEffect, useRef, useState, useTransition } from "react";
import { posterUrl } from "@/lib/config";
import { REASON_MAX_LENGTH } from "@/lib/daily/rank";
import { answerDailyQuestion } from "@/lib/daily/actions";
import type { DailyQuestionRow, MyAnswer } from "@/lib/daily/queries";
import { useToast } from "@/components/ui/Toaster";
import type { SearchItem } from "@/lib/tmdb/mappers";

/** Ricerca del titolo, motivo facoltativo, invio. */
export function DailyComposer({
  question,
  current,
  onSaved,
}: {
  question: DailyQuestionRow;
  current: MyAnswer | null;
  onSaved: (answer: MyAnswer) => void;
}) {
  const { show } = useToast();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchItem[]>([]);
  const [picked, setPicked] = useState<MyAnswer | null>(current);
  const [reason, setReason] = useState(current?.reason ?? "");
  const [pending, startTransition] = useTransition();
  const abortRef = useRef<AbortController | null>(null);

  // stessa ricerca istantanea di /cerca: 60 ms dopo il tasto, la precedente si annulla
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`, {
          signal: controller.signal,
        });
        if (!res.ok) return;
        const data = (await res.json()) as { results: SearchItem[] };
        setResults(
          data.results.filter(
            (r) => question.mediaScope === "any" || r.mediaType === question.mediaScope,
          ),
        );
      } catch {
        // richiesta annullata o rete giù: si tiene l'elenco precedente
      }
    }, 60);
    return () => clearTimeout(timer);
  }, [query, question.mediaScope]);

  function submit() {
    if (!picked) return;
    startTransition(async () => {
      const res = await answerDailyQuestion(picked.titleId, picked.mediaType, reason);
      if (!res.ok) {
        show(res.error ?? "Non è riuscito, riprova.");
        return;
      }
      onSaved({ ...picked, reason: reason.trim() || null });
      show("Risposta salvata");
    });
  }

  return (
    <div className="flex h-full flex-col gap-5 px-5 py-6 lg:px-10">
      <div>
        <p className="text-[11px] uppercase tracking-[0.18em] text-muted-2">
          La domanda di oggi
        </p>
        <h2 className="mt-2 text-[24px] font-light leading-snug text-text lg:text-[34px]">
          {question.text}
        </h2>
      </div>

      {picked ? (
        <div className="flex items-center gap-4 rounded-[20px] border border-border bg-surface p-4">
          <div className="relative aspect-[2/3] w-20 shrink-0 overflow-hidden rounded-[14px]">
            {picked.posterPath && (
              <Image
                src={posterUrl(picked.posterPath, "w342")!}
                alt=""
                fill
                sizes="80px"
                className="object-cover"
              />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[16px] text-text">{picked.title}</p>
            <button
              type="button"
              className="mt-1 text-[13px] text-accent-soft"
              onClick={() => setPicked(null)}
            >
              Cambia titolo
            </button>
          </div>
        </div>
      ) : (
        <>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={
              question.mediaScope === "tv" ? "Cerca una serie…" : "Cerca un titolo…"
            }
            className="w-full rounded-[14px] bg-surface-2 px-4 py-3 text-[15px] text-text outline-none placeholder:text-muted-2"
          />
          <ul className="grid grid-cols-3 gap-3 overflow-y-auto md:grid-cols-4 lg:grid-cols-6">
            {results.map((r) => (
              <li key={`${r.mediaType}:${r.id}`}>
                <button
                  type="button"
                  className="w-full text-left"
                  onClick={() =>
                    setPicked({
                      titleId: r.id,
                      mediaType: r.mediaType,
                      title: r.title,
                      posterPath: r.posterPath,
                      reason: null,
                    })
                  }
                >
                  <div className="relative aspect-[2/3] overflow-hidden rounded-[14px] bg-surface-2">
                    {r.posterPath && (
                      <Image
                        src={posterUrl(r.posterPath, "w342")!}
                        alt=""
                        fill
                        sizes="(max-width: 767px) 30vw, 140px"
                        className="object-cover"
                      />
                    )}
                  </div>
                  <p className="mt-1.5 line-clamp-2 text-[12px] text-text">{r.title}</p>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      {picked && (
        <>
          <label className="block">
            <span className="text-[13px] text-muted">Perché? (facoltativo)</span>
            <textarea
              value={reason}
              maxLength={REASON_MAX_LENGTH}
              rows={2}
              onChange={(e) => setReason(e.target.value)}
              className="mt-1.5 w-full resize-none rounded-[14px] bg-surface-2 px-4 py-3 text-[15px] text-text outline-none placeholder:text-muted-2"
              placeholder="Una riga, se ti va"
            />
            <span className="block text-right text-[12px] tabular-nums text-muted-2">
              {reason.length}/{REASON_MAX_LENGTH}
            </span>
          </label>
          <p className="text-[12px] text-muted-2">
            La tua risposta è visibile a tutti su Zapp. Con il profilo privato compare
            senza il tuo nome.
          </p>
          <button
            type="button"
            disabled={pending}
            onClick={submit}
            className="w-full rounded-[14px] bg-accent px-4 py-3 text-[15px] font-medium text-accent-pale disabled:opacity-60"
          >
            {current ? "Aggiorna la risposta" : "Invia"}
          </button>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Verificare tipi e lint**

Run: `pnpm typecheck && pnpm lint`
Atteso: nessun errore. Se `SearchItem` non espone `mediaType`/`posterPath` con questi nomi, leggerne la definizione in `src/lib/tmdb/mappers.ts` e usare i nomi veri (non inventare campi).

- [ ] **Step 4: Commit**

```bash
git add src/components/daily/DailyPodium.tsx src/components/daily/DailyComposer.tsx
git commit -m "feat(domanda): podio a tre gradini e composer della risposta"
```

---

### Task 7: overlay, icona e montaggio nel layout

**Files:**
- Create: `src/components/daily/DailyAnswerList.tsx`
- Create: `src/components/daily/DailyQuestion.tsx`
- Create: `src/components/daily/DailyQuestionLauncher.tsx`
- Modify: `src/app/(app)/layout.tsx`

**Interfaces:**
- Consumes: `DailyPodium`, `DailyComposer`, `fetchDailyAnswers`, `markDailyQuestionSeen`, `reportDailyAnswer`, `getTodayQuestion`, `getMyAnswer`, `hasSeenToday`, `getYesterdayPodium`, `backdropUrl` da `@/lib/config`, `getPosterPalette` da `@/lib/colors/palette`, `AmbientBackdrop` da `@/components/title/AmbientBackdrop`.
- Produces: `<DailyQuestionLauncher />` (server, da mettere nello slot `right` di `TopNav`).

- [ ] **Step 1: L'elenco delle risposte**

Crea `src/components/daily/DailyAnswerList.tsx`:

```tsx
"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { posterUrl } from "@/lib/config";
import { Avatar } from "@/components/social/Avatar";
import { fetchDailyAnswers, reportDailyAnswer } from "@/lib/daily/actions";
import type { DailyAnswerItem } from "@/lib/daily/queries";
import { useToast } from "@/components/ui/Toaster";

/** Le risposte di oggi, dalla più recente. Mai per voti: vedi la spec. */
export function DailyAnswerList() {
  const { show } = useToast();
  const [items, setItems] = useState<DailyAnswerItem[] | null>(null);
  const [hidden, setHidden] = useState<string[]>([]);

  useEffect(() => {
    let alive = true;
    fetchDailyAnswers().then((rows) => {
      if (alive) setItems(rows);
    });
    return () => {
      alive = false;
    };
  }, []);

  if (!items) return <p className="px-5 py-6 text-[13px] text-muted">Caricamento…</p>;
  if (items.length === 0) {
    return (
      <p className="px-5 py-6 text-[13px] text-muted">
        Ancora nessuna risposta oggi. Sii il primo.
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-3 px-5 pb-8 lg:px-10">
      {items
        .filter((a) => !hidden.includes(a.id))
        .map((a) => (
          <li
            key={a.id}
            className="flex items-center gap-3 rounded-[20px] border border-border bg-surface p-3"
          >
            <Link href={`/title/${a.mediaType}/${a.titleId}`} className="shrink-0">
              <div className="relative aspect-[2/3] w-12 overflow-hidden rounded-[10px] bg-surface-2">
                {a.posterPath && (
                  <Image
                    src={posterUrl(a.posterPath, "w185")!}
                    alt=""
                    fill
                    sizes="48px"
                    className="object-cover"
                  />
                )}
              </div>
            </Link>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[14px] text-text">{a.title}</p>
              {a.reason && <p className="text-[13px] text-muted">«{a.reason}»</p>}
              <div className="mt-1 flex items-center gap-2">
                <Avatar url={a.authorAvatar} name={a.authorName} size={20} />
                <span className="text-[12px] text-muted-2">{a.authorName}</span>
              </div>
            </div>
            {!a.mine && a.reason && (
              <button
                type="button"
                className="text-[12px] text-muted-2"
                onClick={async () => {
                  const res = await reportDailyAnswer(a.id);
                  show(res.ok ? "Segnalata" : (res.error ?? "Non è riuscito, riprova."));
                  if (res.ok) setHidden((h) => [...h, a.id]);
                }}
              >
                Segnala
              </button>
            )}
          </li>
        ))}
    </ul>
  );
}
```

- [ ] **Step 2: L'overlay e l'icona**

Crea `src/components/daily/DailyQuestion.tsx`:

```tsx
"use client";

import Image from "next/image";
import { AnimatePresence, motion } from "framer-motion";
import { createPortal } from "react-dom";
import { useEffect, useRef, useState } from "react";
import { backdropUrl } from "@/lib/config";
import { markDailyQuestionSeen } from "@/lib/daily/actions";
import type { DailyQuestionRow, MyAnswer, Podium } from "@/lib/daily/queries";
import { DailyPodium } from "./DailyPodium";
import { DailyComposer } from "./DailyComposer";
import { DailyAnswerList } from "./DailyAnswerList";

/**
 * La domanda del giorno: un'icona accanto alla campanella e un overlay a tutto
 * schermo. L'overlay si apre da solo alla prima apertura del giorno (nessuna
 * riga in `daily_question_views`), poi si "riduce" verso l'icona.
 *
 * Due schermate su scorrimento orizzontale con snap, puntini e frecce: lo stesso
 * schema di `ScanMode`.
 */
export function DailyQuestion({
  question,
  podium,
  answer,
  seen,
}: {
  question: DailyQuestionRow | null;
  podium: Podium | null;
  answer: MyAnswer | null;
  seen: boolean;
}) {
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const [mine, setMine] = useState<MyAnswer | null>(answer);
  const scroller = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);

  useEffect(() => setMounted(true), []);

  // prima apertura del giorno: si apre da solo, e la riga "visto" si scrive subito
  useEffect(() => {
    if (!seen && (question || podium)) {
      setOpen(true);
      void markDailyQuestionSeen();
    }
  }, [seen, question, podium]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open]);

  if (!question && !podium) return null;

  const slides = [
    podium ? <DailyPodium key="podium" podium={podium} /> : null,
    question ? (
      <div key="today" className="flex h-full flex-col overflow-y-auto">
        <DailyComposer
          question={question}
          current={mine}
          onSaved={(a) => setMine(a)}
        />
        {mine && <DailyAnswerList />}
      </div>
    ) : null,
  ].filter(Boolean) as React.ReactNode[];

  function go(delta: number) {
    const el = scroller.current;
    if (!el) return;
    const next = Math.min(Math.max(index + delta, 0), slides.length - 1);
    el.scrollTo({ left: next * el.clientWidth, behavior: "smooth" });
    setIndex(next);
  }

  const hero = podium?.entries[0]?.backdropPath ?? null;

  return (
    <>
      <button
        type="button"
        aria-label="La domanda del giorno"
        onClick={() => setOpen(true)}
        className="glass relative flex size-10 items-center justify-center rounded-full text-text"
      >
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M9.2 9a2.8 2.8 0 1 1 3.6 2.7c-.8.3-1.3 1-1.3 1.9v.4" />
          <path d="M12 17.5h.01" />
          <circle cx="12" cy="12" r="9" />
        </svg>
        {!mine && (
          <span className="absolute right-1.5 top-1.5 size-[9px] rounded-full border-2 border-bg bg-accent" />
        )}
      </button>

      {mounted &&
        createPortal(
          <AnimatePresence>
            {open && (
              <motion.div
                className="fixed inset-0 z-[60] overflow-hidden bg-bg"
                initial={{ opacity: 0, scale: 0.92 }}
                animate={{ opacity: 1, scale: 1 }}
                // si richiude verso l'angolo in alto a destra, dov'è l'icona
                exit={{ opacity: 0, scale: 0.2, x: "38%", y: "-42%" }}
                transition={{ type: "spring", stiffness: 260, damping: 30 }}
                role="dialog"
                aria-modal="true"
              >
                {hero && (
                  <div className="pointer-events-none absolute inset-0 -z-10">
                    <Image
                      src={backdropUrl(hero, "original")!}
                      alt=""
                      fill
                      unoptimized
                      className="ken-burns object-cover opacity-40"
                    />
                    <div className="absolute inset-0 bg-gradient-to-b from-black/70 via-black/80 to-black" />
                  </div>
                )}

                <div
                  ref={scroller}
                  onScroll={(e) => {
                    const el = e.currentTarget;
                    setIndex(Math.round(el.scrollLeft / Math.max(el.clientWidth, 1)));
                  }}
                  className="flex h-full snap-x snap-mandatory overflow-x-auto overflow-y-hidden"
                >
                  {slides.map((slide, i) => (
                    <section key={i} className="h-full w-full shrink-0 snap-center">
                      {slide}
                    </section>
                  ))}
                </div>

                <button
                  type="button"
                  aria-label="Chiudi"
                  onClick={() => setOpen(false)}
                  className="glass absolute right-5 top-[calc(env(safe-area-inset-top,0px)+12px)] flex size-10 items-center justify-center rounded-full text-text"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
                    <path d="M6 6l12 12M18 6L6 18" />
                  </svg>
                </button>

                {slides.length > 1 && (
                  <div className="absolute inset-x-0 bottom-[calc(env(safe-area-inset-bottom,0px)+16px)] flex items-center justify-center gap-4">
                    <button type="button" aria-label="Indietro" onClick={() => go(-1)} className="glass size-9 rounded-full text-text">‹</button>
                    <div className="flex gap-1.5">
                      {slides.map((_, i) => (
                        <span
                          key={i}
                          className={`size-1.5 rounded-full ${i === index ? "bg-text" : "bg-white/30"}`}
                        />
                      ))}
                    </div>
                    <button type="button" aria-label="Avanti" onClick={() => go(1)} className="glass size-9 rounded-full text-text">›</button>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>,
          document.body,
        )}
    </>
  );
}
```

- [ ] **Step 3: Il launcher server**

Crea `src/components/daily/DailyQuestionLauncher.tsx`:

```tsx
import {
  getMyAnswer,
  getTodayQuestion,
  getYesterdayPodium,
  hasSeenToday,
} from "@/lib/daily/queries";
import { DailyQuestion } from "./DailyQuestion";

/**
 * Legge tutto in una sola andata (mai un await sequenziale che non serve) e
 * passa i dati al componente client. Sta dietro `Suspense` nel layout: la
 * pagina non lo aspetta.
 */
export async function DailyQuestionLauncher() {
  const [question, podium, answer, seen] = await Promise.all([
    getTodayQuestion(),
    getYesterdayPodium(),
    getMyAnswer(),
    hasSeenToday(),
  ]);
  if (!question && !podium) return null;
  return <DailyQuestion question={question} podium={podium} answer={answer} seen={seen} />;
}
```

- [ ] **Step 4: Montarlo nel layout**

In `src/app/(app)/layout.tsx`, aggiungi l'import

```tsx
import { DailyQuestionLauncher } from "@/components/daily/DailyQuestionLauncher";
```

e sostituisci lo slot `right` di `TopNav` con:

```tsx
          <TopNav
            right={
              <>
                <Suspense fallback={null}>
                  <DailyQuestionLauncher />
                </Suspense>
                <Suspense fallback={null}>
                  <NotificationsBell />
                </Suspense>
              </>
            }
          />
```

- [ ] **Step 5: Verificare**

Run: `pnpm typecheck && pnpm lint`
Atteso: nessun errore.

- [ ] **Step 6: Commit**

```bash
git add src/components/daily src/app/\(app\)/layout.tsx
git commit -m "feat(domanda): overlay all'apertura e icona accanto alla campanella"
```

---

### Task 8: le domande (seed)

**Files:**
- Create: `scripts/seed-daily-questions.ts`

**Interfaces:**
- Consumes: `createServiceClient` da `@/lib/supabase/server` (script server, chiave service role da `.env.local`).
- Produces: righe in `daily_questions` a partire da domani, una al giorno.

- [ ] **Step 1: Scrivere lo script**

Crea `scripts/seed-daily-questions.ts`:

```ts
/**
 * Riempie `daily_questions`: una domanda al giorno a partire da domani.
 * Idempotente (`ask_on` è unique, si ignorano i duplicati), quindi si può
 * rilanciare quando si aggiungono domande in fondo all'elenco.
 *
 * pnpm tsx --env-file=.env.local scripts/seed-daily-questions.ts
 */
import { createServiceClient } from "../src/lib/supabase/server";
import { nextDay, romeDateString } from "../src/lib/cinema/dates";

type Scope = "movie" | "tv" | "any";

const QUESTIONS: [string, Scope][] = [
  ["Quale film rivedresti per primo se perdessi la memoria?", "movie"],
  ["La serie che hai finito in un fine settimana solo.", "tv"],
  ["Il film che ti ha fatto piangere e non lo ammetti con nessuno.", "movie"],
  ["Quello che tutti odiano e tu difendi a ogni cena.", "any"],
  ["La sigla che non salti mai.", "tv"],
  ["Il film che consiglieresti a chi dice di non amare il cinema.", "movie"],
  ["La serie che ti ha rovinato il sonno.", "tv"],
  ["Il finale che ti ha fatto arrabbiare di più.", "any"],
  ["Il film che hai visto più volte in assoluto.", "movie"],
  ["La serie che avresti voluto vedere per la prima volta di nuovo.", "tv"],
  // … fino a 80 voci: stesso tono, una riga, mai più di 200 caratteri.
];

async function main() {
  const supabase = createServiceClient();
  let day = nextDay(romeDateString());
  const rows = QUESTIONS.map(([text, media_scope]) => {
    const row = { ask_on: day, text, media_scope };
    day = nextDay(day);
    return row;
  });
  const { error } = await supabase
    .from("daily_questions")
    .upsert(rows, { onConflict: "ask_on", ignoreDuplicates: true });
  if (error) throw error;
  console.log(`${rows.length} domande, dal ${rows[0].ask_on} al ${rows[rows.length - 1].ask_on}`);
}

void main();
```

- [ ] **Step 2: Completare l'elenco a 80 domande**

Scrivi altre 70 voci nello stesso tono: una riga, italiano, mai più di 200 caratteri, `media_scope` coerente col testo (se la domanda dice "serie" → `"tv"`, se dice "film" → `"movie"`, altrimenti `"any"`). Nessun duplicato.

- [ ] **Step 3: Eseguire**

Run: `pnpm tsx --env-file=.env.local scripts/seed-daily-questions.ts`
Atteso: stampa "80 domande, dal … al …".

Verifica con `mcp__claude_ai_Supabase__execute_sql`:

```sql
select count(*), min(ask_on), max(ask_on) from public.daily_questions;
```

Atteso: 80 righe, `min(ask_on)` = domani.

- [ ] **Step 4: Inserire a mano la domanda di oggi per la prova**

```sql
insert into public.daily_questions (ask_on, text, media_scope)
values ((now() at time zone 'Europe/Rome')::date,
        'Quale film rivedresti per primo se perdessi la memoria?', 'movie')
on conflict (ask_on) do nothing;
```

- [ ] **Step 5: Commit**

```bash
git add scripts/seed-daily-questions.ts
git commit -m "feat(domanda): 80 domande da qui in avanti"
```

---

### Task 9: verifica e documentazione

**Files:**
- Modify: `CLAUDE.md` (una sezione "La domanda del giorno" sotto Social)

**Interfaces:**
- Consumes: tutto il lavoro precedente.
- Produces: build verde, controlli di sicurezza passati, CLAUDE.md aggiornato.

- [ ] **Step 1: Test e tipi**

Run: `pnpm test && pnpm typecheck && pnpm lint`
Atteso: tutti verdi, compresi `rank.test.ts` e `dates.test.ts`.

- [ ] **Step 2: Build isolata e avvio**

Run:
```bash
NEXT_DIST_DIR=.next-check pnpm build
NEXT_DIST_DIR=.next-check pnpm exec next start -p 3399
```
Atteso: build senza errori, server su :3399.

- [ ] **Step 3: Controllo di sicurezza**

Run: `node scripts/security-check.mjs` (contro l'istanza su :3399, come da suo README interno)
Atteso: nessuna violazione nuova (header, rotte protette, CSP).

- [ ] **Step 4: Prova nel browser**

Con Playwright su Chrome installato (`channel: "chrome"`), da loggato:

1. `http://localhost:3399/` → l'overlay si apre da solo; screenshot a 390×844 e 1440×900.
2. Rispondi con un titolo e un motivo → toast "Risposta salvata", l'elenco di oggi mostra la tua risposta.
3. Ricarica la pagina → **l'overlay non si riapre**, l'icona è accanto alla campanella senza pallino.
4. Tocca l'icona → si riapre il pannello con la tua risposta.

- [ ] **Step 5: Prova del giorno dopo**

Con `execute_sql`, sposta indietro la domanda di prova e la risposta:

```sql
update public.daily_questions
   set ask_on = ask_on - 1
 where ask_on = (now() at time zone 'Europe/Rome')::date;
delete from public.daily_question_views
 where ask_on = (now() at time zone 'Europe/Rome')::date;
```

Ricarica: compare il podio di ieri. Poi verifica che la risposta di ieri **non** sia più modificabile:

```sql
-- con la sessione di un utente qualsiasi, via PostgREST, ci si aspetta 0 righe aggiornate
update public.daily_answers set reason = 'cambiata' where id = '<id di ieri>';
```

Atteso: nessuna riga aggiornata (la policy `daily_answers_update_own` non la copre più).

- [ ] **Step 6: Documentare in CLAUDE.md**

Aggiungi in fondo alla sezione **Social (phase 4)** un blocco che dica: dove vivono i moduli (`src/lib/daily/`, `src/components/daily/`), che il giorno è Europe/Rome, che il podio di oggi non è leggibile per scelta (`day < oggi` nella RPC), che le risposte di oggi si elencano per data e non per voti, che un profilo privato compare come "Un utente", e che il podio sta in `unstable_cache` con la data come chiave (nessun cron).

- [ ] **Step 7: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: la domanda del giorno in CLAUDE.md"
```

---

## Note per chi esegue

- **Profili privati.** `profiles_select_visible` non mostra un profilo privato agli estranei: la sua risposta compare come "Un utente". Non si tocca quella policy; il composer lo dice prima dell'invio.
- **Se PostgREST tipizza gli embed come array**, estrarre con una funzione locale invece di cambiare la query.
- **Nessun `revalidatePath` sul podio**: la sua chiave di cache è la data, e un giorno chiuso non cambia più.
