/**
 * Verifica SQL usa-e-getta per supabase/migrations/0057_profile_progression.sql.
 *
 * Preparazione locale (nessuna dipendenza aggiunta all'app):
 * npm install --prefix artifacts/profile-progression-db --no-save --package-lock=false @electric-sql/pglite@0.5.8
 * node scripts/profile-progression-db-check.mjs
 * In alternativa PGLITE_MODULE indica il modulo PGlite gia' installato.
 *
 * Limiti della fixture: PGlite esegue PostgreSQL reale e la migrazione reale,
 * ma non avvia lo stack Supabase (Auth, PostgREST, Storage ed estensioni non
 * pertinenti). Il bootstrap replica soltanto ruoli/grant, auth.uid(), colonne,
 * vincoli e policy RLS da cui dipende profile_progression(). Non convalida le
 * altre migrazioni o la traduzione HTTP di PostgREST.
 */

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const repoRoot = path.resolve(import.meta.dirname, "..");
const migrationPath = path.join(
  repoRoot,
  "supabase",
  "migrations",
  "0057_profile_progression.sql",
);
const artifactDir = path.join(repoRoot, "artifacts", "profile-progression-db");
const reportPath = path.join(artifactDir, "report.json");
const defaultPgliteModule = path.join(
  artifactDir,
  "node_modules",
  "@electric-sql",
  "pglite",
  "dist",
  "index.js",
);

const USERS = Object.freeze({
  target: "11111111-1111-4111-8111-111111111111",
  friend: "22222222-2222-4222-8222-222222222222",
  stranger: "33333333-3333-4333-8333-333333333333",
  blocked: "44444444-4444-4444-8444-444444444444",
  missing: "99999999-9999-4999-8999-999999999999",
});

const REVIEW_IDS = Object.freeze({
  valid: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1",
  short: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2",
  hidden: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3",
  trimmedShort: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4",
});

const VALID_REVIEW =
  "Una recensione sufficientemente articolata, pensata per superare davvero gli ottanta caratteri dopo il trim.";
const UPDATED_REVIEW =
  "Aggiornamento della stessa recensione: resta abbastanza lungo, ma non deve generare un secondo conteggio.";
const WHITESPACE_PADDED_79_CHAR_REVIEW = `\n\t${"x".repeat(79)}\t\n`;

const cases = [];
let db;

function sqlLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function assertDeepEqual(actual, expected, label) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `${label}: atteso ${JSON.stringify(expected)}, ricevuto ${JSON.stringify(actual)}`,
    );
  }
}

async function check(name, run) {
  const started = performance.now();
  try {
    await run();
    cases.push({
      name,
      status: "passed",
      durationMs: Math.round(performance.now() - started),
    });
  } catch (error) {
    cases.push({
      name,
      status: "failed",
      durationMs: Math.round(performance.now() - started),
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

async function asRole(role, uid, operation) {
  if (!new Set(["anon", "authenticated"]).has(role)) {
    throw new Error(`Ruolo di test non ammesso: ${role}`);
  }

  await db.exec("begin");
  try {
    await db.exec(`set local role ${role}`);
    await db.query("select set_config('request.jwt.claim.sub', $1, true)", [uid ?? ""]);
    const value = await operation();
    await db.exec("commit");
    return value;
  } catch (error) {
    await db.exec("rollback").catch(() => undefined);
    throw error;
  }
}

async function queryAs(role, uid, sql, params = []) {
  return asRole(role, uid, () => db.query(sql, params));
}

async function expectDenied(
  name,
  role,
  uid,
  sql,
  params = [],
  expectedCodes = ["42501"],
) {
  await check(name, async () => {
    let caught;
    try {
      await queryAs(role, uid, sql, params);
    } catch (error) {
      caught = error;
    }
    if (!caught) throw new Error("l'operazione non autorizzata e' stata accettata");
    if (!expectedCodes.includes(caught.code)) {
      throw new Error(
        `SQLSTATE inatteso: ${caught.code ?? "assente"}; atteso ${expectedCodes.join(" o ")}`,
      );
    }
  });
}

function progressionValue(result) {
  if (result.rows.length !== 1) {
    throw new Error(`La RPC ha restituito ${result.rows.length} righe anziche' una`);
  }
  const value = result.rows[0].profile_progression;
  return typeof value === "string" ? JSON.parse(value) : value;
}

async function progressionAs(viewer, target) {
  const result = await queryAs(
    "authenticated",
    viewer,
    "select public.profile_progression($1::uuid) as profile_progression",
    [target],
  );
  return progressionValue(result);
}

async function bootstrap() {
  await db.exec(`
    create role anon nologin;
    create role authenticated nologin;
    create role service_role nologin bypassrls;

    create schema auth;
    create or replace function auth.uid()
    returns uuid
    language sql
    stable
    as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
    $$;

    grant usage on schema auth, public to anon, authenticated, service_role;
    grant execute on function auth.uid() to anon, authenticated, service_role;

    create type public.media_type as enum ('movie', 'tv');
    create type public.watch_status as enum ('want', 'watching', 'watched', 'dropped');
    create type public.friendship_status as enum ('pending', 'accepted', 'blocked');

    create table public.profiles (
      id uuid primary key,
      username text unique not null check (username ~ '^[a-z0-9_]{3,20}$'),
      display_name text,
      avatar_url text,
      is_private boolean not null default false,
      onboarding_completed_at timestamptz,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );

    create table public.titles (
      id bigint not null,
      media_type public.media_type not null,
      title text not null,
      primary key (id, media_type)
    );

    create table public.friendships (
      id uuid primary key default gen_random_uuid(),
      requester_id uuid not null references public.profiles (id) on delete cascade,
      addressee_id uuid not null references public.profiles (id) on delete cascade,
      status public.friendship_status not null default 'pending',
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      unique (requester_id, addressee_id),
      check (requester_id <> addressee_id)
    );

    create table public.watch_entries (
      id uuid primary key default gen_random_uuid(),
      user_id uuid not null references public.profiles (id) on delete cascade,
      title_id bigint not null,
      media_type public.media_type not null,
      status public.watch_status not null,
      rating smallint check (rating between 1 and 10),
      season_number int,
      episode_number int,
      is_private boolean not null default false,
      started_at timestamptz,
      finished_at timestamptz,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      unique (user_id, title_id, media_type),
      foreign key (title_id, media_type) references public.titles (id, media_type)
    );

    create table public.reviews (
      id uuid primary key default gen_random_uuid(),
      user_id uuid not null references public.profiles (id) on delete cascade,
      title_id bigint not null,
      media_type public.media_type not null,
      body text not null check (char_length(body) between 1 and 5000),
      has_spoilers boolean not null default false,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      report_count integer not null default 0,
      unique (user_id, title_id, media_type),
      foreign key (title_id, media_type) references public.titles (id, media_type)
    );

    create or replace function public.are_friends(a uuid, b uuid)
    returns boolean
    language sql
    stable
    security definer
    set search_path = public
    as $$
      select case
        when auth.uid() is not null
          and a is distinct from auth.uid()
          and b is distinct from auth.uid()
          then false
        else exists (
          select 1 from public.friendships
          where status = 'accepted'
            and ((requester_id = a and addressee_id = b)
              or (requester_id = b and addressee_id = a))
        )
      end
    $$;

    create or replace function public.is_blocked(a uuid, b uuid)
    returns boolean
    language sql
    stable
    security definer
    set search_path = public
    as $$
      select case
        when auth.uid() is not null
          and a is distinct from auth.uid()
          and b is distinct from auth.uid()
          then false
        else exists (
          select 1 from public.friendships
          where status = 'blocked'
            and ((requester_id = a and addressee_id = b)
              or (requester_id = b and addressee_id = a))
        )
      end
    $$;

    create or replace function public.my_friend_ids()
    returns setof uuid
    language sql
    stable
    security definer
    set search_path = public
    as $$
      select f.addressee_id from public.friendships f
      where f.requester_id = auth.uid() and f.status = 'accepted'
      union
      select f.requester_id from public.friendships f
      where f.addressee_id = auth.uid() and f.status = 'accepted'
    $$;

    alter table public.profiles enable row level security;
    alter table public.friendships enable row level security;
    alter table public.watch_entries enable row level security;
    alter table public.reviews enable row level security;

    create policy profiles_select_visible on public.profiles
      for select to authenticated
      using (
        id = auth.uid()
        or ((not public.is_blocked(auth.uid(), id))
          and ((not is_private) or public.are_friends(auth.uid(), id)))
      );
    create policy profiles_update_own on public.profiles
      for update to authenticated
      using (auth.uid() = id)
      with check (auth.uid() = id);

    create policy friendships_select_involved on public.friendships
      for select to authenticated
      using (auth.uid() = requester_id or auth.uid() = addressee_id);

    create policy watch_entries_select on public.watch_entries
      for select to authenticated
      using (
        user_id = auth.uid()
        or (not is_private and user_id in (select public.my_friend_ids()))
      );
    create policy watch_entries_insert_own on public.watch_entries
      for insert to authenticated with check (auth.uid() = user_id);
    create policy watch_entries_update_own on public.watch_entries
      for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
    create policy watch_entries_delete_own on public.watch_entries
      for delete to authenticated using (auth.uid() = user_id);

    create policy reviews_select_visible on public.reviews
      for select to authenticated
      using (user_id = auth.uid() or report_count < 3);
    create policy reviews_insert_own on public.reviews
      for insert to authenticated with check (auth.uid() = user_id);
    create policy reviews_update_own on public.reviews
      for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
    create policy reviews_delete_own on public.reviews
      for delete to authenticated using (auth.uid() = user_id);

    grant select on public.profiles, public.friendships, public.watch_entries, public.reviews
      to authenticated;
    grant insert, update, delete on public.watch_entries to authenticated;
    grant insert (id, user_id, title_id, media_type, body, has_spoilers)
      on public.reviews to authenticated;
    grant update (user_id, title_id, media_type, body, has_spoilers)
      on public.reviews to authenticated;
    grant delete on public.reviews to authenticated;
    grant update (username, display_name, avatar_url, is_private, onboarding_completed_at)
      on public.profiles to authenticated;
    grant execute on function public.are_friends(uuid, uuid), public.is_blocked(uuid, uuid),
      public.my_friend_ids() to authenticated;
    revoke all on all tables in schema public from anon;
    revoke all on all functions in schema public from anon;
  `);
}

async function seedFixtures() {
  const profiles = [
    [USERS.target, "target_user", "Target", true],
    [USERS.friend, "friend_user", "Friend", false],
    [USERS.stranger, "stranger_user", "Stranger", false],
    [USERS.blocked, "blocked_user", "Blocked", false],
  ]
    .map(
      ([id, username, displayName, isPrivate]) =>
        `(${sqlLiteral(id)}::uuid, ${sqlLiteral(username)}, ${sqlLiteral(displayName)}, ${isPrivate})`,
    )
    .join(",\n");

  const titles = [
    [101, "movie", "Film pubblico uno"],
    [102, "movie", "Film pubblico due"],
    [103, "movie", "Film privato"],
    [104, "movie", "Film in visione"],
    [105, "movie", "Film abbandonato"],
    [201, "tv", "Serie pubblica"],
  ]
    .map(([id, type, title]) => `(${id}, ${sqlLiteral(type)}, ${sqlLiteral(title)})`)
    .join(",\n");

  await db.exec(`
    insert into public.profiles (id, username, display_name, is_private) values
      ${profiles};

    insert into public.titles (id, media_type, title) values
      ${titles};

    insert into public.friendships (requester_id, addressee_id, status) values
      (${sqlLiteral(USERS.target)}::uuid, ${sqlLiteral(USERS.friend)}::uuid, 'accepted'),
      (${sqlLiteral(USERS.target)}::uuid, ${sqlLiteral(USERS.blocked)}::uuid, 'blocked');

    insert into public.watch_entries
      (user_id, title_id, media_type, status, rating, is_private)
    values
      (${sqlLiteral(USERS.target)}::uuid, 101, 'movie', 'watched', 8, false),
      (${sqlLiteral(USERS.target)}::uuid, 102, 'movie', 'watched', 7, false),
      (${sqlLiteral(USERS.target)}::uuid, 103, 'movie', 'watched', 9, true),
      (${sqlLiteral(USERS.target)}::uuid, 104, 'movie', 'watching', 5, false),
      (${sqlLiteral(USERS.target)}::uuid, 105, 'movie', 'dropped', null, false),
      (${sqlLiteral(USERS.target)}::uuid, 201, 'tv', 'watched', 6, false);

    insert into public.reviews
      (id, user_id, title_id, media_type, body, report_count)
    values
      (${sqlLiteral(REVIEW_IDS.valid)}::uuid, ${sqlLiteral(USERS.target)}::uuid,
        101, 'movie', ${sqlLiteral(VALID_REVIEW)}, 0),
      (${sqlLiteral(REVIEW_IDS.short)}::uuid, ${sqlLiteral(USERS.target)}::uuid,
        102, 'movie', 'Troppo breve per il percorso.', 0),
      (${sqlLiteral(REVIEW_IDS.hidden)}::uuid, ${sqlLiteral(USERS.target)}::uuid,
        103, 'movie', ${sqlLiteral(VALID_REVIEW)}, 3),
      (${sqlLiteral(REVIEW_IDS.trimmedShort)}::uuid, ${sqlLiteral(USERS.target)}::uuid,
        104, 'movie', ${sqlLiteral(WHITESPACE_PADDED_79_CHAR_REVIEW)}, 0);
  `);
}

async function runChecks() {
  await check("il proprietario vede tutti i conteggi correnti", async () => {
    assertDeepEqual(
      await progressionAs(USERS.target, USERS.target),
      { films: 3, series: 1, ratings: 5, reviews: 1 },
      "conteggi proprietario",
    );
  });

  await check("un amico non riceve dati delle entry private", async () => {
    assertDeepEqual(
      await progressionAs(USERS.friend, USERS.target),
      { films: 2, series: 1, ratings: 4, reviews: 1 },
      "conteggi amico",
    );
  });

  await check("uno sconosciuto non riceve il percorso privato", async () => {
    assertDeepEqual(
      await progressionAs(USERS.stranger, USERS.target),
      null,
      "risposta sconosciuto",
    );
  });

  await check("un profilo inesistente restituisce null", async () => {
    assertDeepEqual(
      await progressionAs(USERS.target, USERS.missing),
      null,
      "risposta profilo mancante",
    );
  });

  await check(
    "un non amico non riceve il percorso anche se il profilo e' pubblico",
    async () => {
      await db.query(
        "update public.profiles set is_private = false where id = $1::uuid",
        [USERS.target],
      );
      assertDeepEqual(
        await progressionAs(USERS.stranger, USERS.target),
        null,
        "risposta non amico per profilo pubblico",
      );
    },
  );

  await check("un utente bloccato non riceve neppure il percorso pubblico", async () => {
    assertDeepEqual(
      await progressionAs(USERS.blocked, USERS.target),
      null,
      "risposta bloccato",
    );
  });

  await check("upsert dello stesso voto e recensione non gonfia i conteggi", async () => {
    await asRole("authenticated", USERS.target, async () => {
      await db.query(
        `insert into public.watch_entries
          (user_id, title_id, media_type, status, rating, is_private)
         values ($1::uuid, 101, 'movie', 'watched', 10, false)
         on conflict (user_id, title_id, media_type)
         do update set rating = excluded.rating`,
        [USERS.target],
      );
      await db.query(
        `insert into public.reviews
          (id, user_id, title_id, media_type, body, has_spoilers)
         values ($1::uuid, $2::uuid, 101, 'movie', $3, false)
         on conflict (user_id, title_id, media_type)
         do update set body = excluded.body`,
        ["bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", USERS.target, UPDATED_REVIEW],
      );
    });
    assertDeepEqual(
      await progressionAs(USERS.target, USERS.target),
      { films: 3, series: 1, ratings: 5, reviews: 1 },
      "conteggi dopo upsert",
    );
  });

  await check("rimuovere dati ricalcola i conteggi", async () => {
    await asRole("authenticated", USERS.target, async () => {
      await db.query(
        "delete from public.watch_entries where user_id = $1::uuid and title_id = 102 and media_type = 'movie'",
        [USERS.target],
      );
      await db.query("delete from public.reviews where id = $1::uuid", [
        REVIEW_IDS.valid,
      ]);
    });
    assertDeepEqual(
      await progressionAs(USERS.target, USERS.target),
      { films: 2, series: 1, ratings: 4, reviews: 0 },
      "conteggi dopo rimozione",
    );
  });

  await expectDenied(
    "un utente non puo' inserire un profilo con verifica forgiata",
    "authenticated",
    "55555555-5555-4555-8555-555555555555",
    `insert into public.profiles
      (id, username, display_name, verified_at, verified_role)
     values ($1::uuid, 'forged_user', 'Forged', now(), 'critic')`,
    ["55555555-5555-4555-8555-555555555555"],
  );

  await expectDenied(
    "un utente non puo' aggiornare la propria verifica",
    "authenticated",
    USERS.target,
    "update public.profiles set verified_at = now(), verified_role = 'critic' where id = $1::uuid",
    [USERS.target],
  );

  await check("i grant escludono ogni scrittura delle colonne di verifica", async () => {
    const result = await db.query(`
      select
        has_column_privilege('authenticated', 'public.profiles', 'id', 'INSERT')
          as insert_id,
        has_column_privilege('authenticated', 'public.profiles', 'username', 'INSERT')
          as insert_username,
        has_column_privilege('authenticated', 'public.profiles', 'verified_at', 'INSERT')
          as insert_verified_at,
        has_column_privilege('authenticated', 'public.profiles', 'verified_role', 'INSERT')
          as insert_verified_role,
        has_column_privilege('authenticated', 'public.profiles', 'verified_at', 'UPDATE')
          as update_verified_at,
        has_column_privilege('authenticated', 'public.profiles', 'verified_role', 'UPDATE')
          as update_verified_role,
        has_column_privilege('authenticated', 'public.profiles', 'display_name', 'UPDATE')
          as update_display_name
    `);
    assertDeepEqual(
      result.rows[0],
      {
        insert_id: true,
        insert_username: true,
        insert_verified_at: false,
        insert_verified_role: false,
        update_verified_at: false,
        update_verified_role: false,
        update_display_name: true,
      },
      "grant colonne verifica",
    );
  });

  await check("la modifica legittima del nome profilo resta consentita", async () => {
    await queryAs(
      "authenticated",
      USERS.target,
      "update public.profiles set display_name = 'Nome aggiornato' where id = $1::uuid",
      [USERS.target],
    );
    const result = await queryAs(
      "authenticated",
      USERS.target,
      "select display_name from public.profiles where id = $1::uuid",
      [USERS.target],
    );
    assertDeepEqual(result.rows[0]?.display_name, "Nome aggiornato", "nome profilo");
  });

  await check(
    "l'assegnazione e la revoca manuale della verifica funzionano",
    async () => {
      await db.query(
        "update public.profiles set verified_at = '2026-09-14T12:00:00Z', verified_role = 'director' where id = $1::uuid",
        [USERS.target],
      );
      let result = await db.query(
        "select verified_at is not null as verified, verified_role::text as role from public.profiles where id = $1::uuid",
        [USERS.target],
      );
      assertDeepEqual(
        result.rows[0],
        { verified: true, role: "director" },
        "assegnazione manuale",
      );

      await db.query(
        "update public.profiles set verified_at = null, verified_role = null where id = $1::uuid",
        [USERS.target],
      );
      result = await db.query(
        "select verified_at, verified_role::text as role from public.profiles where id = $1::uuid",
        [USERS.target],
      );
      assertDeepEqual(
        result.rows[0],
        { verified_at: null, role: null },
        "revoca manuale",
      );
    },
  );

  await check("un ruolo di verifica non valido viene rifiutato", async () => {
    let caught;
    try {
      await db.query(
        "update public.profiles set verified_at = now(), verified_role = 'producer' where id = $1::uuid",
        [USERS.target],
      );
    } catch (error) {
      caught = error;
    }
    if (!caught) throw new Error("il ruolo non ammesso 'producer' e' stato salvato");
    if (caught.code !== "22P02") {
      throw new Error(
        `SQLSTATE inatteso per enum non valido: ${caught.code ?? "assente"}`,
      );
    }
  });

  await check("un ruolo senza identita' verificata viene rifiutato", async () => {
    let caught;
    try {
      await db.query(
        "update public.profiles set verified_at = null, verified_role = 'actor' where id = $1::uuid",
        [USERS.target],
      );
    } catch (error) {
      caught = error;
    }
    if (!caught) throw new Error("un ruolo senza verified_at e' stato salvato");
    if (caught.code !== "23514") {
      throw new Error(
        `SQLSTATE inatteso per vincolo verifica: ${caught.code ?? "assente"}`,
      );
    }
  });

  await expectDenied(
    "anon non puo' eseguire profile_progression",
    "anon",
    null,
    "select public.profile_progression($1::uuid)",
    [USERS.target],
  );
}

async function main() {
  const startedAt = new Date();
  let migrationSql = "";
  let fatalError = null;

  try {
    migrationSql = await readFile(migrationPath, "utf8");
    const moduleSetting = process.env.PGLITE_MODULE;
    const moduleSpecifier = moduleSetting
      ? moduleSetting.startsWith("file:") || !path.isAbsolute(moduleSetting)
        ? moduleSetting
        : pathToFileURL(moduleSetting).href
      : pathToFileURL(defaultPgliteModule).href;
    const { PGlite } = await import(moduleSpecifier);
    db = new PGlite();
    await db.waitReady;

    await bootstrap();
    await db.exec(migrationSql);
    await seedFixtures();
    await runChecks();
  } catch (error) {
    fatalError = error instanceof Error ? error.message : String(error);
  } finally {
    if (db) await db.close().catch(() => undefined);
  }

  const failed = cases.filter((entry) => entry.status === "failed").length;
  const report = {
    status: fatalError || failed > 0 ? "failed" : "passed",
    migration: path.relative(repoRoot, migrationPath).replaceAll("\\", "/"),
    migrationSha256: migrationSql
      ? createHash("sha256").update(migrationSql).digest("hex")
      : null,
    pgliteModule:
      process.env.PGLITE_MODULE ?? path.relative(repoRoot, defaultPgliteModule),
    startedAt: startedAt.toISOString(),
    durationMs: Date.now() - startedAt.getTime(),
    totals: { passed: cases.length - failed, failed, total: cases.length },
    fixtureLimitations:
      "PGlite con bootstrap minimo di ruoli, auth.uid(), grants, RLS e tabelle dipendenti; non copre Auth/PostgREST/Storage o migrazioni estranee.",
    cases,
    fatalError,
  };

  await mkdir(artifactDir, { recursive: true });
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (report.status !== "passed") process.exitCode = 1;
}

await main();
