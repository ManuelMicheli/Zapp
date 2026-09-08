# Backend pronto a molti utenti — piano di esecuzione

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** portare Zapp da 10 a ~500 account senza cambiare piano di hosting, togliendo i cinque colli di bottiglia misurati sul progetto vero.

**Architecture:** tre passaggi indipendenti e deployabili da soli — (1) database: policy RLS valutate una volta invece che per riga, indici mancanti, autovacuum; (2) limiti condivisi fra le istanze via Upstash, speso solo dove serve; (3) catalogo: `titles.raw` sfoltito da 105 MB a ~20 MB. Ogni passaggio e' misurato con un banco di prova sintetico che si cancella da solo.

**Tech Stack:** Postgres 17 (Supabase), PostgREST, Next.js 15 App Router, TypeScript strict, Vitest (solo funzioni pure), Upstash Redis REST.

**Spec:** `docs/superpowers/specs/2026-09-08-backend-multi-utente-design.md`

## Global Constraints

- Progetto Supabase: `bbuhwzdbzxgydewmcdwd`. Le migration si applicano con lo strumento MCP `apply_migration`, **non** con `supabase db push` (il progetto ha migration applicate solo via MCP, un push le riscriverebbe).
- Ogni migration nuova va anche salvata in `supabase/migrations/` con il numero progressivo successivo a `0026_title_people.sql`.
- Dopo ogni migration: rigenerare `src/types/database.ts` con lo strumento MCP `generate_typescript_types`.
- UI e commenti in italiano. Prettier: virgolette doppie, virgole finali, `printWidth` 90.
- Vitest copre **solo funzioni pure**: un modulo con `import "server-only"` non e' testabile, quindi la parte pura va estratta in un modulo separato senza `server-only`.
- Build di verifica isolata: `NEXT_DIST_DIR=.next-scale pnpm build`. Mai due build nella stessa cartella `.next`.
- Nessuna policy RLS puo' diventare piu' permissiva. Il ruolo `anon` non deve ricevere niente.
- Verso il client va sempre un messaggio generico; i dettagli restano nei log.

---

## Task 1: Banco di prova sintetico

Serve prima di tutto: senza una misura di partenza, le correzioni dopo non si possono dimostrare.

**Files:**
- Create: `supabase/migrations/0027_bench_scale.sql`
- Create: `docs/superpowers/specs/2026-09-08-backend-multi-utente-misure.md`

**Interfaces:**
- Produces: `public.bench_scale(n_utenti int, n_entry_per_utente int)` returns `jsonb` — esegue il seed, misura, pulisce e ritorna `{"query": [{"nome": text, "ms": numeric, "piano": jsonb}]}`. Usata dai Task 5 e 11.

- [ ] **Step 1: scrivere la funzione di banco**

Crea `supabase/migrations/0027_bench_scale.sql`:

```sql
-- Banco di prova per le misure di scala. Genera utenti e librerie finti, misura
-- le query vere di home/libreria/feed/profilo, poi **cancella tutto quello che ha
-- inserito** prima di tornare. Gli id finti nascono tutti dal prefisso
-- 'beeeeeee-...', cosi' la pulizia e' esatta e non tocca dati veri.
--
-- Non e' codice di produzione: nessuna route la chiama, il grant e' solo per
-- service_role.
create or replace function public.bench_scale(
  n_utenti int default 500,
  n_entry_per_utente int default 1000
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $fn$
declare
  ids uuid[];
  soggetto uuid;
  esiti jsonb := '[]'::jsonb;
  piano jsonb;
  t0 timestamptz;
  sql_text text;
  nome text;
  coppie text[][] := array[
    ['libreria', $q$select w.id, w.status, t.title from watch_entries w
        join titles t on t.id = w.title_id and t.media_type = w.media_type
        where w.user_id = %L and w.status = 'watching'
        order by w.last_watched_at desc limit 60$q$],
    ['feed', $q$select a.id from activities a
        where a.created_at > now() - interval '30 days'
        order by a.created_at desc limit 40$q$],
    ['consigli', $q$select r.id from recommendations r
        where r.to_user = %L and r.seen_at is null limit 20$q$],
    ['notifiche', $q$select n.id from notifications n
        where n.user_id = %L and n.read_at is null
        order by n.created_at desc limit 30$q$]
  ];
  i int;
begin
  -- 1. utenti finti
  select array_agg(('beeeeeee-0000-4000-8000-' || lpad(g::text, 12, '0'))::uuid)
    into ids
    from generate_series(1, n_utenti) g;

  insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                          email_confirmed_at, created_at, updated_at)
  select u, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
         'bench+' || u || '@example.invalid', '', now(), now(), now()
  from unnest(ids) u;

  insert into profiles (id, username, display_name, onboarding_completed_at)
  select u, 'bench_' || replace(u::text, '-', ''), 'Bench', now()
  from unnest(ids) u
  on conflict (id) do nothing;

  -- 2. librerie: n_entry_per_utente righe a testa, sui titoli veri gia' in cache.
  --
  -- Senza questa riga il trigger watch_entries_activity scriverebbe **una
  -- attivita' per ogni entry**, cioe' mezzo milione di righe in activities: e'
  -- lo stesso interruttore che usa la RPC dell'import Netflix per non
  -- inondare il feed.
  perform set_config('zapp.skip_activities', 'true', true);

  -- Nota: il trigger watch_entries_set_updated_at riscrive updated_at con now(),
  -- quindi le date sotto valgono solo per last_watched_at e created_at. Va bene:
  -- quello che si misura e' quante righe per utente vanno scorse, non la loro eta'.
  insert into watch_entries (user_id, title_id, media_type, status, last_watched_at,
                             created_at, updated_at)
  select u.u, t.id, t.media_type,
         (array['watching','watched','want'])[1 + (t.id % 3)]::watch_status,
         now() - (t.id % 365) * interval '1 day',
         now() - (t.id % 365) * interval '1 day',
         now() - (t.id % 365) * interval '1 day'
  from unnest(ids) u(u)
  cross join lateral (
    select id, media_type from titles order by id limit n_entry_per_utente
  ) t
  on conflict (user_id, title_id, media_type) do nothing;

  -- 3. grafo di amicizie: ognuno amico degli 8 successivi. Si inseriscono gia'
  -- 'accepted': notify_friendship scrive notifiche solo sugli inserimenti
  -- 'pending' e sui passaggi pending -> accepted, quindi cosi' non ne genera.
  insert into friendships (requester_id, addressee_id, status)
  select ids[i], ids[1 + ((i + k - 1) % n_utenti)], 'accepted'
  from generate_series(1, n_utenti) i, generate_series(1, 8) k
  on conflict (requester_id, addressee_id) do nothing;

  -- 4. attivita' e notifiche. I valori di `kind` sono vincolati da un check:
  -- activities ammette started/finished/rated/reviewed/wanted/recommended,
  -- notifications friend_request/friend_accepted/recommendation/comment/like.
  insert into activities (user_id, kind, title_id, media_type, is_private, created_at)
  select ids[1 + (g % n_utenti)], 'finished', t.id, t.media_type, false,
         now() - (g % 60) * interval '1 hour'
  from generate_series(1, 50000) g
  cross join lateral (select id, media_type from titles offset (g % 100) limit 1) t;

  insert into notifications (user_id, kind, payload, created_at)
  select ids[1 + (g % n_utenti)], 'friend_accepted',
         jsonb_build_object('from_user', ids[1 + ((g + 1) % n_utenti)]),
         now() - (g % 60) * interval '1 hour'
  from generate_series(1, 20000) g;

  analyze watch_entries;
  analyze activities;
  analyze notifications;
  analyze friendships;

  -- 5. misure, con la sessione che finge di essere il primo utente finto
  soggetto := ids[1];
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
                     json_build_object('sub', soggetto, 'role', 'authenticated')::text,
                     true);

  for i in 1 .. array_length(coppie, 1) loop
    nome := coppie[i][1];
    sql_text := format(coppie[i][2], soggetto, soggetto, soggetto);
    t0 := clock_timestamp();
    execute 'explain (analyze, buffers, format json) ' || sql_text into piano;
    esiti := esiti || jsonb_build_object(
      'nome', nome,
      'ms', round(extract(milliseconds from clock_timestamp() - t0)::numeric, 2),
      'piano', piano
    );
  end loop;

  perform set_config('role', 'postgres', true);

  -- 6. pulizia: l'ordine segue le chiavi esterne
  delete from notifications where user_id = any(ids);
  delete from activities where user_id = any(ids);
  delete from friendships where requester_id = any(ids) or addressee_id = any(ids);
  delete from watch_entries where user_id = any(ids);
  delete from profiles where id = any(ids);
  delete from auth.users where id = any(ids);

  return jsonb_build_object('utenti', n_utenti, 'query', esiti);
exception when others then
  perform set_config('role', 'postgres', true);
  delete from notifications where user_id = any(ids);
  delete from activities where user_id = any(ids);
  delete from friendships where requester_id = any(ids) or addressee_id = any(ids);
  delete from watch_entries where user_id = any(ids);
  delete from profiles where id = any(ids);
  delete from auth.users where id = any(ids);
  raise;
end;
$fn$;

revoke all on function public.bench_scale(int, int) from public, anon, authenticated;
```

- [ ] **Step 2: applicare la migration**

Strumento MCP `apply_migration`, progetto `bbuhwzdbzxgydewmcdwd`, nome `bench_scale`, con il contenuto del file appena creato.

- [ ] **Step 3: verificare che il banco pulisca davvero**

Prima una corsa piccola. Con MCP `execute_sql`:

```sql
select jsonb_pretty(public.bench_scale(20, 50));
```

Poi, subito dopo:

```sql
select (select count(*) from auth.users) as utenti,
       (select count(*) from public.watch_entries) as entry,
       (select count(*) from public.activities) as attivita;
```

Atteso: **esattamente** 10 utenti, 4.408 entry, 109 attivita' — i valori di partenza. Se un numero e' diverso, il banco ha lasciato righe: correggere la pulizia prima di andare avanti.

- [ ] **Step 4: misura di partenza**

```sql
select jsonb_pretty(public.bench_scale(500, 1000));
```

Se va in timeout, riprovare con `(300, 600)` e annotare i parametri usati.

- [ ] **Step 5: scrivere le misure**

Crea `docs/superpowers/specs/2026-09-08-backend-multi-utente-misure.md` con una tabella: colonna `query`, colonna `prima (ms)`, colonna `dopo (ms)` (vuota per ora), e sotto i piani di esecuzione riassunti in una riga ciascuno (nodo di testa: `Seq Scan` / `Index Scan` / `Bitmap Heap Scan`, e su quale relazione).

- [ ] **Step 6: commit**

```bash
git add supabase/migrations/0027_bench_scale.sql docs/superpowers/specs/2026-09-08-backend-multi-utente-misure.md
git commit -m "test(scala): banco di prova con 500 utenti finti che si cancella da solo"
```

---

## Task 2: `my_friend_ids()` e le due policy doppie

**Files:**
- Create: `supabase/migrations/0028_rls_amici_una_volta.sql`

**Interfaces:**
- Consumes: niente.
- Produces: `public.my_friend_ids()` returns `setof uuid` — gli id degli amici accettati dell'utente corrente. Usata dalle policy di `watch_entries` e `activities`.

- [ ] **Step 1: leggere le policy attuali**

Con MCP `execute_sql`, per avere il testo esatto da cui partire:

```sql
select tablename, policyname, cmd, roles::text, qual, with_check
from pg_policies
where schemaname = 'public' and tablename in ('watch_entries', 'activities')
order by tablename, policyname;
```

Annotare i nomi: `watch_entries_select_own`, `watch_entries_select_friends`, `activities_select_own`, `activities_select_friends`.

- [ ] **Step 2: scrivere la migration**

Crea `supabase/migrations/0028_rls_amici_una_volta.sql`:

```sql
-- Due policy permissive sullo stesso comando vengono valutate **entrambe** per
-- ogni riga: leggendo la propria libreria, Postgres chiamava comunque
-- are_friends() riga per riga per la seconda policy, che non poteva mai essere
-- vera. Diventano una sola, con la condizione propria per prima cosi' che l'or
-- corto-circuiti sul caso normale.
--
-- E are_friends(auth.uid(), user_id) e' una chiamata di funzione per riga: al
-- suo posto un insieme calcolato una volta sola.

create or replace function public.my_friend_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $fn$
  select case when f.requester_id = auth.uid() then f.addressee_id
              else f.requester_id end
  from public.friendships f
  where f.status = 'accepted'
    and auth.uid() in (f.requester_id, f.addressee_id);
$fn$;

-- Stessa regola di sicurezza di are_friends: risponde solo sull'utente della
-- sessione, quindi non serve a nessuno per ricostruire il grafo altrui. Non e'
-- una RPC: fuori dalle policy non la chiama nessuno.
revoke all on function public.my_friend_ids() from public, anon;
grant execute on function public.my_friend_ids() to authenticated, service_role;

drop policy if exists watch_entries_select_own on public.watch_entries;
drop policy if exists watch_entries_select_friends on public.watch_entries;
create policy watch_entries_select on public.watch_entries
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or (not is_private and user_id in (select public.my_friend_ids()))
  );

drop policy if exists activities_select_own on public.activities;
drop policy if exists activities_select_friends on public.activities;
create policy activities_select on public.activities
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or (not is_private and user_id in (select public.my_friend_ids()))
  );
```

- [ ] **Step 3: applicare e verificare che il permesso non sia cambiato**

Applicare con MCP `apply_migration`, nome `rls_amici_una_volta`. Poi, con `execute_sql`, controllare che un estraneo non veda niente e un amico veda solo il non privato:

```sql
-- Tre soggetti veri presi dai dati: chi ha entry, un suo amico, un estraneo.
with io as (select user_id from public.watch_entries group by user_id order by count(*) desc limit 1),
     amico as (select case when f.requester_id = (select user_id from io)
                           then f.addressee_id else f.requester_id end as id
               from public.friendships f
               where f.status = 'accepted'
                 and (select user_id from io) in (f.requester_id, f.addressee_id)
               limit 1),
     estraneo as (select p.id from public.profiles p
                  where p.id <> (select user_id from io)
                    and p.id not in (select id from amico) limit 1)
select (select user_id from io) as io, (select id from amico) as amico,
       (select id from estraneo) as estraneo;
```

Poi per ciascuno dei tre id, in tre chiamate separate:

```sql
select set_config('role', 'authenticated', true),
       set_config('request.jwt.claims',
                  json_build_object('sub', '<ID>', 'role', 'authenticated')::text, true);
select count(*) from public.watch_entries;
```

Atteso: `io` vede le proprie righe piu' quelle non private dell'amico; `estraneo` vede solo le proprie. Se l'estraneo vede righe altrui, **fermarsi e ripristinare**: la policy e' sbagliata.

- [ ] **Step 4: commit**

```bash
git add supabase/migrations/0028_rls_amici_una_volta.sql
git commit -m "perf(rls): gli amici si calcolano una volta per query, non per riga"
```

---

## Task 3: le 61 policy con `(select auth.uid())`

**Files:**
- Create: `scripts/rls-initplan.mjs`
- Create: `supabase/migrations/0029_rls_initplan.sql` (generato dallo script)

**Interfaces:**
- Consumes: lo stato di `pg_policies` dopo il Task 2.
- Produces: niente per il codice; il DB non ha piu' policy con `auth.uid()` nudo.

- [ ] **Step 1: estrarre le policy da riscrivere**

Con MCP `execute_sql`, salvare l'elenco completo:

```sql
select tablename, policyname, cmd, roles::text as roles, permissive, qual, with_check
from pg_policies
where schemaname = 'public'
  and (qual like '%auth.uid()%' or with_check like '%auth.uid()%')
order by tablename, policyname;
```

- [ ] **Step 2: scrivere lo script che genera la migration**

Crea `scripts/rls-initplan.mjs`. Legge il JSON dell'elenco da stdin e stampa la migration su stdout. Non tocca il database: genera solo testo, cosi' la trasformazione si legge prima di applicarla.

```js
// Riscrive ogni policy sostituendo `auth.uid()` con `(select auth.uid())`.
// Postgres rivaluta una funzione volatile-per-riga: col sotto-select la
// valuta una volta e la tratta come costante (InitPlan). La condizione resta
// identica: cambia solo quante volte viene calcolata.
import { readFileSync } from "node:fs";

const CMD = { SELECT: "select", INSERT: "insert", UPDATE: "update", DELETE: "delete", ALL: "all" };

function avvolgi(testo) {
  if (!testo) return null;
  // Gia' avvolto: `( SELECT auth.uid() ...` non va toccato una seconda volta.
  return testo.replace(/(?<!select\s)auth\.uid\(\)/gi, "(select auth.uid())");
}

const righe = JSON.parse(readFileSync(process.argv[2], "utf8"));
const out = [
  "-- Generata da scripts/rls-initplan.mjs: ogni auth.uid() diventa",
  "-- (select auth.uid()), valutato una volta per query invece che per riga.",
  "-- La condizione non cambia: cambia solo il numero di valutazioni.",
  "",
];

for (const p of righe) {
  const ruoli = p.roles.replace(/[{}]/g, "");
  const using = avvolgi(p.qual);
  const check = avvolgi(p.with_check);
  out.push(`drop policy if exists ${p.policyname} on public.${p.tablename};`);
  out.push(`create policy ${p.policyname} on public.${p.tablename}`);
  out.push(`  as ${p.permissive === "PERMISSIVE" ? "permissive" : "restrictive"}`);
  out.push(`  for ${CMD[p.cmd]} to ${ruoli}`);
  if (using) out.push(`  using (${using})`);
  if (check) out.push(`  with check (${check})`);
  out.push(";");
  out.push("");
}

process.stdout.write(out.join("\n"));
```

- [ ] **Step 3: generare e rileggere la migration a occhio**

```bash
node scripts/rls-initplan.mjs policies.json > supabase/migrations/0029_rls_initplan.sql
```

Controllare a mano, riga per riga: nessun `auth.uid()` rimasto nudo, nessun `(select (select auth.uid()))`, i ruoli sono sempre `authenticated` (mai `public`, mai `anon`), il numero di blocchi `create policy` e' pari al numero di righe estratte allo Step 1.

- [ ] **Step 4: fotografare lo stato prima**

```sql
select tablename, policyname, cmd, roles::text, permissive from pg_policies
where schemaname = 'public' order by 1, 2;
```

Salvare il risultato: e' il termine di paragone dello Step 6.

- [ ] **Step 5: applicare**

MCP `apply_migration`, nome `rls_initplan`.

- [ ] **Step 6: verificare che l'insieme delle policy sia identico**

```sql
select count(*) filter (where qual ~ '(?<!select )auth\.uid\(\)'
                         or with_check ~ '(?<!select )auth\.uid\(\)') as nude,
       count(*) as totale
from pg_policies where schemaname = 'public';
```

Atteso: `nude` = 0, `totale` = 71. Poi rieseguire la query dello Step 4 e confrontare: **stesso identico insieme** di (tabella, nome, comando, ruoli, permissive). Una riga in meno significa una policy persa, cioe' un buco.

- [ ] **Step 7: l'advisor deve essere pulito**

MCP `get_advisors`, tipo `performance`. Atteso: 0 avvisi `auth_rls_initplan`, 0 `multiple_permissive_policies`.

- [ ] **Step 8: commit**

```bash
git add scripts/rls-initplan.mjs supabase/migrations/0029_rls_initplan.sql
git commit -m "perf(rls): auth.uid() valutato una volta per query, non per riga"
```

---

## Task 4: indici e autovacuum

**Files:**
- Create: `supabase/migrations/0030_indici_scala.sql`

- [ ] **Step 1: scrivere la migration**

```sql
-- Chiavi esterne senza indice: ogni lettura per quella colonna e' una scansione
-- completa. `recommendations(to_user)` e' la piu' cara, la legge la home.
create index if not exists recommendations_to_user_idx
  on public.recommendations (to_user, seen_at);
create index if not exists recommendations_title_idx
  on public.recommendations (title_id, media_type);
create index if not exists watch_entries_title_idx
  on public.watch_entries (title_id, media_type);
create index if not exists activity_likes_user_idx
  on public.activity_likes (user_id);
create index if not exists review_likes_user_idx
  on public.review_likes (user_id);
create index if not exists review_comments_user_idx
  on public.review_comments (user_id);
create index if not exists review_comments_parent_idx
  on public.review_comments (parent_id);
create index if not exists reports_reporter_idx
  on public.reports (reporter_id);
create index if not exists imports_user_idx
  on public.imports (user_id, created_at desc);

-- Il feed legge le attivita' recenti di tutti gli amici: senza un indice sul
-- tempo, l'ordinamento parte da una scansione completa della tabella.
create index if not exists activities_recenti_idx
  on public.activities (created_at desc);

-- taste_refresh_queue chiede max(updated_at) per **ogni** profilo: con il solo
-- indice (user_id, status, updated_at) deve scorrere tutte le righe dell'utente.
create index if not exists watch_entries_user_updated_idx
  on public.watch_entries (user_id, updated_at desc);
create index if not exists user_seed_picks_user_idx
  on public.user_seed_picks (user_id, created_at desc);

-- Mai usati da nessuna lettura, ma pagati a ogni scrittura.
drop index if exists public.title_provider_links_source_idx;
drop index if exists public.cinema_films_tmdb_idx;
drop index if exists public.title_charts_periodo_idx;

-- Le due tabelle che crescono per utente: con la soglia di serie (20%) il
-- vacuum su mezzo milione di righe parte dopo centomila righe morte, e nel
-- frattempo le statistiche invecchiano e i piani peggiorano.
alter table public.watch_entries set (autovacuum_vacuum_scale_factor = 0.02,
                                      autovacuum_analyze_scale_factor = 0.01);
alter table public.user_events set (autovacuum_vacuum_scale_factor = 0.02,
                                    autovacuum_analyze_scale_factor = 0.01);
```

- [ ] **Step 2: controllare i nomi veri dei tre indici da togliere**

I nomi nel blocco sopra sono quelli attesi: prima di applicare, verificarli.

```sql
select schemaname, relname as tabella, indexrelname as indice, idx_scan
from pg_stat_user_indexes
where schemaname = 'public'
  and relname in ('title_provider_links', 'cinema_films', 'title_charts')
order by relname;
```

Correggere i `drop index` con i nomi effettivi e togliere quelli con `idx_scan > 0`.

- [ ] **Step 3: applicare**

MCP `apply_migration`, nome `indici_scala`.

- [ ] **Step 4: verificare**

MCP `get_advisors`, tipo `performance`. Atteso: 0 `unindexed_foreign_keys`.

- [ ] **Step 5: commit**

```bash
git add supabase/migrations/0030_indici_scala.sql
git commit -m "perf(db): indici sulle chiavi esterne, sul feed e sulla coda dei gusti"
```

---

## Task 5: rimisura del passo 1

- [ ] **Step 1: rieseguire il banco**

```sql
select jsonb_pretty(public.bench_scale(500, 1000));
```

Con gli stessi parametri del Task 1 Step 4.

- [ ] **Step 2: riempire la colonna "dopo"**

In `docs/superpowers/specs/2026-09-08-backend-multi-utente-misure.md`. Se una query non e' migliorata, scrivere perche' invece di nasconderlo: il piano dice quale nodo domina.

- [ ] **Step 3: controllare che i conteggi siano tornati com'erano**

```sql
select (select count(*) from auth.users) as utenti,
       (select count(*) from public.watch_entries) as entry;
```

Atteso: 10 e 4.408.

- [ ] **Step 4: commit**

```bash
git add docs/superpowers/specs/2026-09-08-backend-multi-utente-misure.md
git commit -m "docs(scala): misure prima e dopo le correzioni sul database"
```

---

## Task 6: la finestra scorrevole diventa una funzione pura

Prerequisito del Task 7: oggi `rate-limit.ts` ha `import "server-only"` e non e' testabile.

**Files:**
- Create: `src/lib/rate-limit-window.ts`
- Create: `src/lib/rate-limit-window.test.ts`
- Modify: `src/lib/rate-limit.ts`

**Interfaces:**
- Produces:
  - `type Finestra = { timestamps: number[] }`
  - `consenti(finestra: Finestra, ora: number, limite: number, finestraSec: number): boolean` — muta `finestra.timestamps` togliendo i vecchi e aggiungendo `ora` se consentito.
  - `spazza(mappa: Map<string, Finestra>, ora: number, finestraSec: number, maxChiavi: number): number` — ritorna quante chiavi ha tolto.

- [ ] **Step 1: scrivere i test che falliscono**

`src/lib/rate-limit-window.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { consenti, spazza, type Finestra } from "./rate-limit-window";

describe("consenti", () => {
  it("lascia passare fino al limite e poi no", () => {
    const f: Finestra = { timestamps: [] };
    expect(consenti(f, 1000, 2, 60)).toBe(true);
    expect(consenti(f, 1001, 2, 60)).toBe(true);
    expect(consenti(f, 1002, 2, 60)).toBe(false);
  });

  it("riapre quando la finestra e' scorsa", () => {
    const f: Finestra = { timestamps: [] };
    consenti(f, 1000, 1, 60);
    expect(consenti(f, 1000 + 59_000, 1, 60)).toBe(false);
    expect(consenti(f, 1000 + 61_000, 1, 60)).toBe(true);
  });

  it("non accumula i respinti", () => {
    const f: Finestra = { timestamps: [] };
    consenti(f, 1000, 1, 60);
    consenti(f, 1001, 1, 60);
    consenti(f, 1002, 1, 60);
    expect(f.timestamps).toHaveLength(1);
  });
});

describe("spazza", () => {
  it("toglie solo le finestre esaurite", () => {
    const m = new Map<string, Finestra>([
      ["vecchia", { timestamps: [1000] }],
      ["viva", { timestamps: [100_000] }],
    ]);
    expect(spazza(m, 130_000, 60, 1000)).toBe(1);
    expect([...m.keys()]).toEqual(["viva"]);
  });

  it("svuota tutto se le chiavi sono troppe", () => {
    const m = new Map<string, Finestra>();
    for (let i = 0; i < 10; i += 1) m.set(String(i), { timestamps: [100_000] });
    spazza(m, 100_001, 60, 5);
    expect(m.size).toBe(0);
  });
});
```

- [ ] **Step 2: eseguire e vedere il rosso**

```bash
cd D:/PROGETTI/Zapp-scale && pnpm vitest run src/lib/rate-limit-window.test.ts
```

Atteso: fallisce con "Failed to resolve import ./rate-limit-window".

- [ ] **Step 3: scrivere il modulo**

`src/lib/rate-limit-window.ts` — **senza** `import "server-only"`, e' la parte pura:

```ts
/**
 * Finestra scorrevole in memoria. Sta in un modulo suo, senza `server-only`,
 * perche' Vitest non puo' importare un modulo che dichiara `server-only`.
 */
export interface Finestra {
  timestamps: number[];
}

/** true = consentito. Muta la finestra: toglie i vecchi, aggiunge l'ora se passa. */
export function consenti(
  finestra: Finestra,
  ora: number,
  limite: number,
  finestraSec: number,
): boolean {
  const taglio = ora - finestraSec * 1000;
  finestra.timestamps = finestra.timestamps.filter((t) => t > taglio);
  // Un respinto non entra nella finestra: se ci entrasse, chi insiste si
  // allungherebbe da solo la punizione oltre la finestra dichiarata.
  if (finestra.timestamps.length >= limite) return false;
  finestra.timestamps.push(ora);
  return true;
}

/** Toglie le finestre esaurite; oltre `maxChiavi` riparte da zero. Ritorna quante ne ha tolte. */
export function spazza(
  mappa: Map<string, Finestra>,
  ora: number,
  finestraSec: number,
  maxChiavi: number,
): number {
  const taglio = ora - finestraSec * 1000;
  let tolte = 0;
  for (const [chiave, finestra] of mappa) {
    const ultimo = finestra.timestamps[finestra.timestamps.length - 1];
    if (ultimo === undefined || ultimo <= taglio) {
      mappa.delete(chiave);
      tolte += 1;
    }
  }
  if (mappa.size > maxChiavi) {
    // Perdere lo stato del limitatore vale molto meno che tenere in piedi il processo.
    tolte += mappa.size;
    mappa.clear();
  }
  return tolte;
}
```

- [ ] **Step 4: verde**

```bash
pnpm vitest run src/lib/rate-limit-window.test.ts
```

Atteso: 5 test passati.

- [ ] **Step 5: far usare il modulo a `rate-limit.ts`**

In `src/lib/rate-limit.ts`: togliere `interface Window`, `sweep` e il corpo di `memoryLimit`, e importare da `./rate-limit-window`. `memoryLimit` diventa:

```ts
import { consenti, spazza, type Finestra } from "./rate-limit-window";

const memory = new Map<string, Finestra>();
const MEMORY_MAX_KEYS = 20_000;
const SWEEP_EVERY_MS = 60_000;
let lastSweep = Date.now();

function memoryLimit(key: string, limit: number, windowSeconds: number): boolean {
  const now = Date.now();
  if (now - lastSweep >= SWEEP_EVERY_MS) {
    lastSweep = now;
    spazza(memory, now, windowSeconds, MEMORY_MAX_KEYS);
  }
  const finestra = memory.get(key) ?? { timestamps: [] };
  const ok = consenti(finestra, now, limit, windowSeconds);
  memory.set(key, finestra);
  return ok;
}
```

- [ ] **Step 6: verificare**

```bash
pnpm test && pnpm typecheck && pnpm lint
```

- [ ] **Step 7: commit**

```bash
git add src/lib/rate-limit-window.ts src/lib/rate-limit-window.test.ts src/lib/rate-limit.ts
git commit -m "test(limiti): la finestra scorrevole e' una funzione pura con i suoi test"
```

---

## Task 7: limiti condivisi fra le istanze

**Files:**
- Modify: `src/lib/rate-limit.ts`
- Modify: `src/lib/social/actions.ts:55,77,214,269,325,412`
- Modify: `src/lib/cinema/location.ts:72,89`
- Modify: `src/app/(app)/import/netflix/actions.ts:43,94`
- Modify: `.env.example`

**Interfaces:**
- Consumes: `consenti`, `spazza` dal Task 6.
- Produces: `rateLimit(key, limit, windowSeconds, opzioni?: { condiviso?: boolean })`. Con `condiviso: true` e Upstash configurato usa Redis; altrimenti memoria. La firma a tre argomenti resta valida ovunque.

- [ ] **Step 1: aggiungere il parametro**

In `src/lib/rate-limit.ts`, sostituire la funzione esportata:

```ts
export interface OpzioniLimite {
  /**
   * true = il conto deve valere per tutta l'applicazione, non per l'istanza che
   * capita. Costa due comandi Upstash a chiamata, quindi si mette solo dove un
   * limite moltiplicato per il numero di lambda farebbe danno vero: chiamate a
   * servizi esterni gratuiti e scritture sociali. Il piano free e' 500.000
   * comandi al mese: un contatore condiviso sul proxy TMDB lo brucerebbe da solo.
   */
  condiviso?: boolean;
}

export async function rateLimit(
  key: string,
  limit: number,
  windowSeconds: number,
  opzioni: OpzioniLimite = {},
): Promise<boolean> {
  const haUpstash = Boolean(
    process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN,
  );
  if (opzioni.condiviso && haUpstash) {
    try {
      return await upstashLimit(key, limit, windowSeconds);
    } catch {
      return memoryLimit(key, limit, windowSeconds);
    }
  }
  return memoryLimit(key, limit, windowSeconds);
}
```

- [ ] **Step 2: marcare le chiamate che devono essere condivise**

Aggiungere `{ condiviso: true }` come quarto argomento **solo** a queste, lasciando le altre come sono:

- `src/lib/cinema/location.ts:72` e `:89` — `geocode:` (Nominatim e' pubblico e gratuito)
- `src/app/(app)/import/netflix/actions.ts:43` — `import:parse:`
- `src/app/(app)/import/netflix/actions.ts:94` — `import:match:`
- `src/lib/social/actions.ts:55` — `usersearch:`
- `src/lib/social/actions.ts:77` — `friendreq:`
- `src/lib/social/actions.ts:214` — `recommend:`
- `src/lib/social/actions.ts:269` — `review:`
- `src/lib/social/actions.ts:325` — `comment:`
- `src/lib/social/actions.ts:412` — `report:`

Restano in memoria: `tmdbproxy:`, `activitylike:`, `reviewlike:`, `friendreply:`, `friendedit:`, `notifread:`.

- [ ] **Step 3: documentare le variabili**

In `.env.example`, sopra le due righe `UPSTASH_*` gia' presenti, aggiungere:

```
# Redis condiviso (piano free di Upstash, regione eu-central-1). Senza queste due
# variabili i limiti restano per istanza: va bene in sviluppo, non in produzione
# con piu' lambda. Vanno messe su Vercel sia in Production sia in Preview.
```

- [ ] **Step 4: verificare**

```bash
pnpm test && pnpm typecheck && pnpm lint
```

- [ ] **Step 5: commit**

```bash
git add src/lib/rate-limit.ts src/lib/social/actions.ts src/lib/cinema/location.ts "src/app/(app)/import/netflix/actions.ts" .env.example
git commit -m "fix(limiti): i limiti che contano valgono per l'app, non per la singola istanza"
```

---

## Task 8: freno globale su Nominatim e posti per gli import

**Files:**
- Create: `src/lib/gate.ts`
- Modify: `src/lib/cinema/geocode.ts`
- Modify: `src/app/(app)/import/netflix/actions.ts`

**Interfaces:**
- Consumes: le variabili `UPSTASH_*`.
- Produces:
  - `attendiTurno(nome: string, alSecondo: number): Promise<boolean>` — vero quando il turno e' concesso; falso dopo i tentativi.
  - `prendiPosto(nome: string, chi: string, max: number, ttlSec: number): Promise<boolean>`
  - `lasciaPosto(nome: string, chi: string): Promise<void>`

- [ ] **Step 1: scrivere il modulo**

`src/lib/gate.ts`:

```ts
import "server-only";

/**
 * Freni che valgono per tutta l'applicazione, non per la singola istanza.
 * Diversi da `rate-limit.ts`: li' si limita **un utente**, qui si limita
 * **l'app intera** verso un servizio di terzi. Senza Upstash non frenano
 * niente e lo dicono tornando true: in sviluppo c'e' una sola istanza.
 */

function configurato(): boolean {
  return Boolean(
    process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN,
  );
}

async function comandi(cmds: (string | number)[][]): Promise<unknown[]> {
  const res = await fetch(`${process.env.UPSTASH_REDIS_REST_URL}/pipeline`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(cmds.map((c) => c.map(String))),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`upstash ${res.status}`);
  return ((await res.json()) as { result: unknown }[]).map((r) => r.result);
}

const TENTATIVI = 4;

/**
 * Turno globale: al massimo `alSecondo` chiamate al secondo in tutta l'app.
 * La chiave contiene il secondo corrente, quindi scade da sola e non serve
 * pulire niente. Serve per Nominatim, la cui policy pubblica parla di un tetto
 * complessivo: un limite per utente non lo rispetta.
 */
export async function attendiTurno(nome: string, alSecondo: number): Promise<boolean> {
  if (!configurato()) return true;
  for (let i = 0; i < TENTATIVI; i += 1) {
    const secondo = Math.floor(Date.now() / 1000);
    try {
      const [n] = (await comandi([
        ["INCR", `gate:${nome}:${secondo}`],
        ["EXPIRE", `gate:${nome}:${secondo}`, 2, "NX"],
      ])) as [number];
      if (n <= alSecondo) return true;
    } catch {
      // Upstash giu': meglio far passare che bloccare la posizione dell'utente.
      return true;
    }
    await new Promise((r) => setTimeout(r, 1100));
  }
  return false;
}

/**
 * Posti contati: al massimo `max` occupanti insieme. L'insieme ordinato tiene
 * chi e' dentro e da quando; le voci piu' vecchie di `ttlSec` cadono da sole,
 * cosi' un import interrotto non tiene il posto per sempre.
 */
export async function prendiPosto(
  nome: string,
  chi: string,
  max: number,
  ttlSec: number,
): Promise<boolean> {
  if (!configurato()) return true;
  const ora = Date.now();
  try {
    const esiti = await comandi([
      ["ZREMRANGEBYSCORE", `posti:${nome}`, 0, ora - ttlSec * 1000],
      ["ZSCORE", `posti:${nome}`, chi],
      ["ZCARD", `posti:${nome}`],
    ]);
    const dentroGia = esiti[1] !== null;
    const occupati = Number(esiti[2] ?? 0);
    if (!dentroGia && occupati >= max) return false;
    await comandi([
      ["ZADD", `posti:${nome}`, ora, chi],
      ["EXPIRE", `posti:${nome}`, ttlSec * 2],
    ]);
    return true;
  } catch {
    return true;
  }
}

export async function lasciaPosto(nome: string, chi: string): Promise<void> {
  if (!configurato()) return;
  try {
    await comandi([["ZREM", `posti:${nome}`, chi]]);
  } catch {
    // Il posto scade da solo: non vale la pena riprovare.
  }
}
```

- [ ] **Step 2: mettere il freno davanti a Nominatim**

In `src/lib/cinema/geocode.ts`, dentro la funzione che fa la `fetch` verso Nominatim (sia diretta sia inversa), prima della chiamata:

```ts
import { attendiTurno } from "@/lib/gate";

// La policy di Nominatim e' 1 richiesta al secondo **per applicazione**: un
// limite per utente non la rispetta appena ci sono due lambda.
if (!(await attendiTurno("nominatim", 1))) return null;
```

- [ ] **Step 3: contare gli import in corso**

In `src/app/(app)/import/netflix/actions.ts`, in `parseNetflixCsv`, subito dopo il controllo del limite orario:

```ts
import { lasciaPosto, prendiPosto } from "@/lib/gate";

const POSTI_IMPORT = 3;
const TTL_IMPORT_S = 1800;

if (!(await prendiPosto("import", user.id, POSTI_IMPORT, TTL_IMPORT_S))) {
  return {
    ok: false,
    error: "Ci sono gia' tre import in corso, riprova fra qualche minuto",
    candidates: [],
    totalRows: 0,
  };
}
```

E in `confirmNetflixImport`, sul blocco che porta `final: true`, dopo la scrittura della riga `imports`:

```ts
await lasciaPosto("import", user.id);
```

- [ ] **Step 4: verificare**

```bash
pnpm test && pnpm typecheck && pnpm lint && NEXT_DIST_DIR=.next-scale pnpm build
```

- [ ] **Step 5: commit**

```bash
git add src/lib/gate.ts src/lib/cinema/geocode.ts "src/app/(app)/import/netflix/actions.ts"
git commit -m "fix(quote): un solo turno al secondo verso Nominatim, tre import per volta"
```

---

## Task 9: potatura e allarme sulla dimensione

**Files:**
- Create: `supabase/migrations/0031_potatura_sociale.sql`
- Create: `src/lib/cinema/prune.ts`
- Modify: `src/lib/taste/refresh.ts` (`pruneEvents`)
- Modify: `src/app/api/jobs/[job]/route.ts` (tipo `JobName` e mappa `JOBS`)

**Interfaces:**
- Consumes: `pruneEvents` esistente.
- Produces:
  - `public.db_size_bytes()` returns `bigint`
  - `pruneEvents` ritorna in piu' `{ attivita: number; notifiche: number; dbBytes: number }`
  - `prunePlans(): Promise<{ serate: number; file: number }>` da `@/lib/cinema/prune`
  - job nuovo `plans-prune`, cron `10 3 * * *`

- [ ] **Step 1: la funzione che dice quanto pesa il database**

`supabase/migrations/0031_potatura_sociale.sql`:

```sql
-- PostgREST non espone pg_database_size: serve una funzione. Solo il service
-- client la chiama, dal job notturno.
create or replace function public.db_size_bytes()
returns bigint
language sql
stable
security definer
set search_path = public
as $fn$ select pg_database_size(current_database()); $fn$;

revoke all on function public.db_size_bytes() from public, anon, authenticated;
grant execute on function public.db_size_bytes() to service_role;
```

- [ ] **Step 2: applicare e rigenerare i tipi**

MCP `apply_migration`, nome `potatura_sociale`. Poi MCP `generate_typescript_types` e salvare in `src/types/database.ts`.

- [ ] **Step 3: estendere la potatura**

In `src/lib/taste/refresh.ts`, dentro `pruneEvents`, prima del `return`:

```ts
/** Feed e notifiche oltre questa eta' non li guarda piu' nessuno. */
const RITENZIONE_SOCIALE_GIORNI = 90;

const sogliaSociale = new Date(
  Date.now() - RITENZIONE_SOCIALE_GIORNI * 86_400_000,
).toISOString();

const { count: attivita } = await supabase
  .from("activities")
  .delete({ count: "exact" })
  .lt("created_at", sogliaSociale);

const { count: notifiche } = await supabase
  .from("notifications")
  .delete({ count: "exact" })
  .lt("created_at", sogliaSociale);

// Il piano Free si ferma a 500 MB e il progetto va in sola lettura senza
// preavviso: l'allarme deve arrivare prima, e job_runs e' gia' il posto dove
// si guarda cosa e' successo di notte.
const { data: bytes } = await supabase.rpc("db_size_bytes");
const dbBytes = Number(bytes ?? 0);
const TETTO_PIANO = 500 * 1024 * 1024;
if (dbBytes > TETTO_PIANO * 0.8) {
  console.error(
    `[jobs] database all'${Math.round((dbBytes / TETTO_PIANO) * 100)}% del piano`,
  );
}
```

E cambiare il tipo di ritorno in
`Promise<{ eliminati: number; spenti: number; attivita: number; notifiche: number; dbBytes: number }>`, aggiungendo i tre campi al `return`.

- [ ] **Step 4: togliere i biglietti delle serate passate**

Il bucket `tickets` e' privato e vale 1 GB: un PDF a serata per utente, e nessuno lo cancella mai. Va in un modulo suo — `plans.ts` dichiara `"use server"`, quindi ogni suo export diventa un endpoint HTTP e un aiutante da job non ci puo' stare.

Crea `src/lib/cinema/prune.ts`:

```ts
import "server-only";

import { createServiceClient } from "@/lib/supabase/server";

/** Oltre questi giorni dalla proiezione, la serata e' storia e il biglietto non serve. */
const RITENZIONE_GIORNI = 30;
/** Quante serate per giro: il job ha 60 s e ogni file e' una chiamata allo storage. */
const PER_GIRO = 200;

/**
 * Il bucket `tickets` e' privato e sta in un piano da 1 GB: un PDF a serata per
 * utente, e finora non li toglieva nessuno. Si cancellano prima gli oggetti e
 * poi le righe: al contrario, un errore a meta' lascerebbe file di cui nessuno
 * conosce piu' il percorso.
 */
export async function prunePlans(): Promise<{ serate: number; file: number }> {
  const supabase = createServiceClient();
  const soglia = new Date(Date.now() - RITENZIONE_GIORNI * 86_400_000).toISOString();

  const { data, error } = await supabase
    .from("cinema_plans")
    .select("id, ticket_path")
    .lt("starts_at", soglia)
    .limit(PER_GIRO);
  if (error) throw new Error(`potatura serate: ${error.message}`);

  const serate = data ?? [];
  if (serate.length === 0) return { serate: 0, file: 0 };

  const percorsi = serate
    .map((p) => p.ticket_path)
    .filter((p): p is string => typeof p === "string" && p.length > 0);
  if (percorsi.length > 0) {
    await supabase.storage.from("tickets").remove(percorsi);
  }

  const { error: errRighe } = await supabase
    .from("cinema_plans")
    .delete()
    .in(
      "id",
      serate.map((p) => p.id),
    );
  if (errRighe) throw new Error(`potatura serate: ${errRighe.message}`);

  return { serate: serate.length, file: percorsi.length };
}
```

Poi in `src/app/api/jobs/[job]/route.ts`: aggiungere `"plans-prune"` al tipo `JobName`, l'import di `prunePlans` da `@/lib/cinema/prune`, e la voce nella mappa:

```ts
  "plans-prune": async () => await prunePlans(),
```

E registrare il cron, con MCP `execute_sql`:

```sql
select cron.schedule('zapp-plans-prune', '10 3 * * *',
                     $$select public.call_zapp_job('plans-prune')$$);
```

- [ ] **Step 5: verificare**

```bash
pnpm test && pnpm typecheck && pnpm lint
```

- [ ] **Step 6: lanciare i job a mano**

Con il server locale avviato:

```bash
curl -X POST -H "x-jobs-secret: $JOBS_SECRET" http://localhost:3000/api/jobs/events-prune
curl -X POST -H "x-jobs-secret: $JOBS_SECRET" http://localhost:3000/api/jobs/plans-prune
```

Atteso dal primo: `{"ok":true,...,"attivita":0,"notifiche":0,"dbBytes":<numero>}` — zero perche' non ci sono ancora righe vecchie di 90 giorni, e il `dbBytes` intorno a 133.000.000. Dal secondo: `{"ok":true,"serate":N,"file":M}` con `N` pari alle serate piu' vecchie di 30 giorni (oggi `cinema_plans` ha 4 righe, quindi 0 o poche).

- [ ] **Step 7: commit**

```bash
git add supabase/migrations/0031_potatura_sociale.sql src/lib/taste/refresh.ts src/lib/cinema/prune.ts "src/app/api/jobs/[job]/route.ts" src/types/database.ts
git commit -m "feat(job): feed, notifiche e biglietti vecchi non restano per sempre"
```

---

## Task 10: `raw` sfoltito

**Files:**
- Create: `src/lib/tmdb/slim-raw.ts`
- Create: `src/lib/tmdb/slim-raw.test.ts`
- Modify: `src/lib/tmdb/mappers.ts:46,68`
- Modify: `src/lib/config.ts:15`

**Interfaces:**
- Produces: `slimRaw(dettagli: Record<string, unknown>): Record<string, unknown>` — la copia da salvare in `titles.raw`.

- [ ] **Step 1: i test che falliscono**

`src/lib/tmdb/slim-raw.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { slimRaw } from "./slim-raw";

describe("slimRaw", () => {
  it("butta le offerte, che sono gia' in title_providers", () => {
    const out = slimRaw({ id: 1, "watch/providers": { results: { IT: {} } } });
    expect(out["watch/providers"]).toBeUndefined();
    expect(out.id).toBe(1);
  });

  it("butta le immagini: la galleria non esiste piu'", () => {
    expect(slimRaw({ images: { backdrops: [{}] } }).images).toBeUndefined();
  });

  it("tiene i primi 25 del cast", () => {
    const cast = Array.from({ length: 40 }, (_, i) => ({ id: i, name: `A${i}`, order: i }));
    const out = slimRaw({ credits: { cast, crew: [] } }) as {
      credits: { cast: unknown[] };
    };
    expect(out.credits.cast).toHaveLength(25);
  });

  it("del crew tiene solo i mestieri che il codice legge", () => {
    const crew = [
      { job: "Director", name: "R" },
      { job: "Screenplay", name: "S" },
      { job: "Best Boy", name: "X" },
    ];
    const out = slimRaw({ credits: { cast: [], crew } }) as {
      credits: { crew: { name: string }[] };
    };
    expect(out.credits.crew.map((c) => c.name)).toEqual(["R", "S"]);
  });

  it("tiene i primi 12 consigli", () => {
    const results = Array.from({ length: 20 }, (_, i) => ({ id: i }));
    const out = slimRaw({ recommendations: { results } }) as {
      recommendations: { results: unknown[] };
    };
    expect(out.recommendations.results).toHaveLength(12);
  });

  it("delle uscite tiene solo l'Italia", () => {
    const out = slimRaw({
      release_dates: {
        results: [{ iso_3166_1: "US" }, { iso_3166_1: "IT" }],
      },
    }) as { release_dates: { results: { iso_3166_1: string }[] } };
    expect(out.release_dates.results).toEqual([{ iso_3166_1: "IT" }]);
  });

  it("lascia intatto quello che non conosce", () => {
    const out = slimRaw({ seasons: [{ season_number: 1 }], videos: { results: [1] } });
    expect(out.seasons).toEqual([{ season_number: 1 }]);
    expect(out.videos).toEqual({ results: [1] });
  });

  it("regge un payload senza nessuna di quelle chiavi", () => {
    expect(slimRaw({ id: 7 })).toEqual({ id: 7 });
  });
});
```

- [ ] **Step 2: rosso**

```bash
pnpm vitest run src/lib/tmdb/slim-raw.test.ts
```

Atteso: "Failed to resolve import ./slim-raw".

- [ ] **Step 3: scrivere il modulo**

`src/lib/tmdb/slim-raw.ts` (funzione pura, niente `server-only`):

```ts
/**
 * Cosa finisce davvero in `titles.raw`.
 *
 * Misura del 2026-09-08 su 3.699 titoli: `watch/providers` pesava 41 KB per
 * riga ed e' gia' tutto in `title_providers`, `credits` 30 KB di cui si legge
 * il cast di testa e la regia, `recommendations` 17,5 KB di cui ne servono
 * dodici, `release_dates` 8,3 KB per novanta paesi di cui serve l'Italia, e
 * `images` era rimasta dopo che la galleria e' stata tolta. Il catalogo e'
 * condiviso da tutti gli utenti: quello che si risparmia qui si moltiplica.
 */

/** Quanti interpreti: la scheda ne mostra al massimo una ventina. */
const CAST_MAX = 25;
/** Mestieri letti dalla scheda tecnica, dal profilo di gusto e da `title_people`. */
const MESTIERI = new Set([
  "Director",
  "Writer",
  "Screenplay",
  "Story",
  "Creator",
  "Producer",
  "Executive Producer",
]);
/** Quanti consigli: il motore dei simili ne pesca al massimo una decina. */
const RECO_MAX = 12;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function soloItalia(v: unknown): unknown {
  if (!isRecord(v) || !Array.isArray(v.results)) return v;
  return {
    ...v,
    results: v.results.filter(
      (r) => isRecord(r) && r.iso_3166_1 === "IT",
    ),
  };
}

export function slimRaw(dettagli: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...dettagli };

  delete out["watch/providers"];
  delete out.images;

  if (isRecord(out.credits)) {
    const cast = Array.isArray(out.credits.cast) ? out.credits.cast : [];
    const crew = Array.isArray(out.credits.crew) ? out.credits.crew : [];
    out.credits = {
      cast: cast.slice(0, CAST_MAX),
      crew: crew.filter((c) => isRecord(c) && typeof c.job === "string" && MESTIERI.has(c.job)),
    };
  }

  if (isRecord(out.recommendations) && Array.isArray(out.recommendations.results)) {
    out.recommendations = {
      ...out.recommendations,
      results: out.recommendations.results.slice(0, RECO_MAX),
    };
  }

  if (out.release_dates !== undefined) out.release_dates = soloItalia(out.release_dates);
  if (out.content_ratings !== undefined) out.content_ratings = soloItalia(out.content_ratings);

  return out;
}
```

- [ ] **Step 4: verde**

```bash
pnpm vitest run src/lib/tmdb/slim-raw.test.ts
```

Atteso: 8 test passati.

- [ ] **Step 5: usarlo nei mapper**

In `src/lib/tmdb/mappers.ts`, in cima:

```ts
import { slimRaw } from "./slim-raw";
```

Riga 46 (`mapMovieToTitleInsert`) e riga 68 (`mapTvToTitleInsert`): sostituire

```ts
    raw: movie as unknown as Json,
```

con

```ts
    raw: slimRaw(movie as unknown as Record<string, unknown>) as unknown as Json,
```

e l'equivalente con `tv`. **Non** toccare `mapProvidersToInserts` ne' la chiamata TMDB: `watch/providers` serve ancora nella risposta, e' la sorgente di `title_providers`; sparisce solo da `raw`.

- [ ] **Step 6: far riscrivere i titoli vecchi**

In `src/lib/config.ts`, riga 15, alzare la data e aggiungere la ragione al commento sopra:

```ts
/**
 * Righe di `titles` scaricate prima di questa data hanno un `raw` incompleto
 * (video solo in italiano prima di `include_video_language`; **keyword mancanti**
 * prima del motore dei consigli, 2026-09-07) o gonfio (offerte, cast intero e
 * immagini prima della dieta del 2026-09-08): sulla scheda titolo vengono
 * riscaricate una volta anche se il TTL non e' scaduto.
 */
export const TITLE_CACHE_EPOCH = new Date("2026-09-08T12:00:00Z").getTime();
```

- [ ] **Step 7: controllare i consumatori uno per uno**

Aprire ognuno e verificare che legga solo campi che `slimRaw` conserva. Nessuno deve cambiare; se uno legge qualcosa di tagliato, **allargare `slimRaw`**, non rompere il componente.

- `src/components/title/TitleBody.tsx:88,119,177` — `credits.cast`, `seasons`
- `src/components/title/TitleAbout.tsx:26`
- `src/components/title/TechnicalSheet.tsx:10`
- `src/components/title/SeriesProgress.tsx:35`, `TitleActions.tsx:52` — `availableSeasons`
- `src/app/(app)/title/tv/[id]/season/[n]/page.tsx:103`
- `src/lib/similar/similar.ts:53,58` — `recommendations.results`
- `src/lib/taste/refresh.ts:155,157,160` — `original_language`, `credits`
- `src/app/api/preview/[mediaType]/[id]/route.ts:56`, `src/app/api/jobs/trailers/route.ts:57` — `videos`
- `src/app/(app)/import/netflix/actions.ts:266` — `availableSeasons`
- SQL: `public.title_people` (migration 0026) legge `raw->credits->crew` con `job = 'Director'` e i primi 4 del cast — compatibile
- SQL: `titles.seasons` (migration 0010) e' una colonna generata da `raw->'seasons'` — `seasons` resta, quindi non cambia

- [ ] **Step 8: verificare**

```bash
pnpm test && pnpm typecheck && pnpm lint && NEXT_DIST_DIR=.next-scale pnpm build
```

- [ ] **Step 9: commit**

```bash
git add src/lib/tmdb/slim-raw.ts src/lib/tmdb/slim-raw.test.ts src/lib/tmdb/mappers.ts src/lib/config.ts
git commit -m "perf(catalogo): in titles.raw resta solo quello che il codice legge davvero"
```

---

## Task 11: compattare i titoli gia' salvati

**Files:**
- Create: `supabase/migrations/0032_compatta_raw.sql`
- Modify: `docs/superpowers/specs/2026-09-08-backend-multi-utente-misure.md`

- [ ] **Step 1: misurare prima**

```sql
select count(*) as titoli,
       pg_size_pretty(pg_total_relation_size('public.titles')) as peso,
       pg_size_pretty(pg_database_size(current_database())) as database;
```

Annotare i tre valori.

- [ ] **Step 2: scrivere la compattazione**

`supabase/migrations/0032_compatta_raw.sql`:

```sql
-- Stessa dieta di src/lib/tmdb/slim-raw.ts, applicata alle righe gia' salvate:
-- senza questo passaggio i titoli vecchi si sgonfierebbero solo alla prima
-- apertura, cioe' quasi mai per la coda lunga del catalogo. Nessuna chiamata a
-- TMDB: si tagliano chiavi di un JSON che c'e' gia'.
--
-- `titles.seasons` e' una colonna generata da raw->'seasons' (migration 0010):
-- 'seasons' non viene toccata, quindi il valore generato non cambia.
update public.titles t
set raw = (
  (t.raw - 'watch/providers' - 'images')
  || case when t.raw ? 'credits' then jsonb_build_object('credits', jsonb_build_object(
       'cast', coalesce((
         select jsonb_agg(e.c order by e.ord)
         from jsonb_array_elements(coalesce(t.raw->'credits'->'cast', '[]'::jsonb))
              with ordinality as e(c, ord)
         where e.ord <= 25
       ), '[]'::jsonb),
       'crew', coalesce((
         select jsonb_agg(c)
         from jsonb_array_elements(coalesce(t.raw->'credits'->'crew', '[]'::jsonb)) as c
         where c->>'job' in ('Director','Writer','Screenplay','Story','Creator',
                             'Producer','Executive Producer')
       ), '[]'::jsonb)
     )) else '{}'::jsonb end
  || case when t.raw ? 'recommendations' then jsonb_build_object('recommendations',
       (t.raw->'recommendations') || jsonb_build_object('results', coalesce((
         select jsonb_agg(e.r order by e.ord)
         from jsonb_array_elements(coalesce(t.raw->'recommendations'->'results', '[]'::jsonb))
              with ordinality as e(r, ord)
         where e.ord <= 12
       ), '[]'::jsonb))
     ) else '{}'::jsonb end
  || case when t.raw ? 'release_dates' then jsonb_build_object('release_dates',
       jsonb_build_object('results', coalesce((
         select jsonb_agg(r)
         from jsonb_array_elements(coalesce(t.raw->'release_dates'->'results', '[]'::jsonb)) as r
         where r->>'iso_3166_1' = 'IT'
       ), '[]'::jsonb))
     ) else '{}'::jsonb end
  || case when t.raw ? 'content_ratings' then jsonb_build_object('content_ratings',
       jsonb_build_object('results', coalesce((
         select jsonb_agg(r)
         from jsonb_array_elements(coalesce(t.raw->'content_ratings'->'results', '[]'::jsonb)) as r
         where r->>'iso_3166_1' = 'IT'
       ), '[]'::jsonb))
     ) else '{}'::jsonb end
)
where t.raw ? 'watch/providers' or t.raw ? 'images' or t.raw ? 'credits'
   or t.raw ? 'recommendations' or t.raw ? 'release_dates' or t.raw ? 'content_ratings';
```

- [ ] **Step 3: applicare**

MCP `apply_migration`, nome `compatta_raw`. Se va in timeout, rilanciare lo stesso `update` con in coda `and t.id in (select id from public.titles order by id limit 1000 offset N)` a scaglioni.

- [ ] **Step 4: recuperare lo spazio**

L'`update` riscrive le righe ma lo spazio vecchio resta occupato finche' il vacuum non passa.

```sql
vacuum full analyze public.titles;
```

- [ ] **Step 5: misurare dopo**

Rieseguire la query dello Step 1. Atteso: `titles` intorno ai 20 MB, database intorno ai 45 MB. Scrivere prima/dopo nel file delle misure.

- [ ] **Step 6: controllare che una scheda titolo sia ancora intera**

```sql
select id, title,
       jsonb_array_length(raw->'credits'->'cast') as cast,
       jsonb_array_length(raw->'credits'->'crew') as crew,
       jsonb_array_length(raw->'recommendations'->'results') as consigli,
       raw ? 'seasons' as ha_stagioni,
       raw ? 'videos' as ha_video,
       raw ? 'watch/providers' as ha_offerte
from public.titles order by id limit 5;
```

Atteso: `cast` <= 25, `crew` piccolo ma > 0 per i film con regista, `ha_video` vero, `ha_offerte` **falso**.

- [ ] **Step 7: aprire l'app e guardare una scheda**

Con `NEXT_DIST_DIR=.next-scale pnpm build` e `NEXT_DIST_DIR=.next-scale pnpm exec next start -p 3399`, aprire una scheda film e una serie: cast presente, scheda tecnica piena, simili pieni, trailer che parte, stagioni al loro posto.

- [ ] **Step 8: commit**

```bash
git add supabase/migrations/0032_compatta_raw.sql docs/superpowers/specs/2026-09-08-backend-multi-utente-misure.md
git commit -m "perf(catalogo): il catalogo gia' salvato si sgonfia da 105 a ~20 MB"
```

---

## Task 12: verifica finale

- [ ] **Step 1: la catena completa**

```bash
cd D:/PROGETTI/Zapp-scale
pnpm test && pnpm typecheck && pnpm lint && NEXT_DIST_DIR=.next-scale pnpm build
```

- [ ] **Step 2: sicurezza**

Con l'istanza avviata su 3399:

```bash
node scripts/security-check.mjs http://localhost:3399
```

Le policy sono cambiate: questo controllo va rifatto per forza.

- [ ] **Step 3: advisor del database**

MCP `get_advisors` tipo `security` e tipo `performance`. Attesi: nessun avviso nuovo rispetto a quelli gia' accettati nel README, 0 `auth_rls_initplan`, 0 `unindexed_foreign_keys`, 0 `multiple_permissive_policies`.

- [ ] **Step 4: rimisurare il banco**

```sql
select jsonb_pretty(public.bench_scale(500, 1000));
```

Chiudere la tabella delle misure e verificare che i conteggi veri siano tornati (10 utenti, 4.408 entry).

- [ ] **Step 5: aggiornare CLAUDE.md**

Aggiungere alla sezione "Sicurezza" o a una nuova sezione "Scala" le tre regole nate da qui:

- ogni policy nuova scrive `(select auth.uid())`, mai `auth.uid()` nudo;
- ogni chiave esterna nuova nasce con il suo indice;
- `titles.raw` contiene solo quello che il codice legge: chi aggiunge un campo lo aggiunge anche a `slimRaw`, altrimenti sparisce al primo aggiornamento del titolo.

- [ ] **Step 6: commit**

```bash
git add CLAUDE.md docs/superpowers/specs/2026-09-08-backend-multi-utente-misure.md
git commit -m "docs: le tre regole di scala nate dal lavoro sul backend"
```
