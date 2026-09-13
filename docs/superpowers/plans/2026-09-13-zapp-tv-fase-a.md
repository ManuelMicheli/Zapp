# Zapp TV — Fase A (API v1 e sessione TV) — piano di implementazione

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dare alle app native (Android TV / Fire TV, tvOS) un backend completo: sessione utente consegnata all'abbinamento, rotte JSON `/api/tv/v1/*` con bearer che riusano le query esistenti, dichiarazione del Play per attribuire Netflix/Prime.

**Architecture:** Un `AsyncLocalStorage` porta la sessione bearer dentro `createClient()` e `getViewer()`, cosi' home, libreria, scheda e action del sito servono anche la TV senza riscritture. Ogni rotta e' un adattatore "parametri -> funzione esistente -> DTO" (`src/lib/tv/`). La sessione Supabase della TV si conia nel poll dell'abbinamento (`generateLink` + `verifyOtp`), non si salva mai. La revoca la fa l'header `X-Zapp-Device` verificato a ogni chiamata.

**Tech Stack:** Next.js 15 route handlers, `@supabase/supabase-js` 2.114 (`getClaims(jwt)`, `auth.admin.generateLink`, `verifyOtp`, `refreshSession`), Vitest sui puri, `node:async_hooks`.

**Spec:** `docs/superpowers/specs/2026-09-12-zapp-tv-design.md` (§4, §5, §8, §9, §11).

## Global Constraints

- Lavoro nel worktree `D:\PROGETTI\Zapp\.claude\worktrees\tv-api`, branch `feat/tv-api` (gia' contiene la fusione di `feat/zconnection-tv`). **Mai** toccare la root `D:\PROGETTI\Zapp` ne' altri worktree. Mai `git stash`.
- Commenti e testi in italiano; Prettier (double quotes, trailing commas, printWidth 90). `pnpm format` sporca file altrui: formattare solo i file toccati (`pnpm exec prettier --write <file>`).
- Verso il client errori generici (`{ error: "…" }`), mai `error.message` di PostgREST. Dettaglio in `console.error` senza token.
- **Mai il service client per dati utente** nelle rotte TV. Solo per `pairing_codes`, `auth.admin.*`, cache TMDB (come oggi).
- Nessuna chiamata TMDB fuori da `src/lib/tmdb/client.ts`.
- Ogni rotta nuova: `export const dynamic = "force-dynamic"` e `Cache-Control: private, no-store`.
- Validazione con `src/lib/validate.ts` (`isTmdbId`, `isMediaType`, `isIntInRange`, `isUuid`).
- Prima di ogni commit: `pnpm typecheck && pnpm lint && pnpm test`. Il tree deve restare pulito (`tsconfig.json` non va toccato: `next build` con `NEXT_DIST_DIR` ci scrive dentro, non committarlo).
- Il DB live (`bbuhwzdbzxgydewmcdwd`) ha gia' `pairing_codes`, `device_commands` e l'indice (versioni `20260912130026`, `20260912201533`, `20260912204058`). **Non riapplicarle.** Le migrazioni si applicano via MCP `apply_migration`, poi `mcp generate_typescript_types` -> `src/types/database.ts`.
- Migrazioni gia' occupate su main/altri branch: `0045_scrobble_revoca`, `0046_mobile_device_platform`, `0047_push` (mobile-1). Le nostre partono da `0048`.

---

### Task 1: Migrazioni rinumerate e piattaforma `tvos`

**Files:**
- Rename: `supabase/migrations/0045_tv_pairing.sql` -> `supabase/migrations/0048_tv_pairing.sql`
- Rename: `supabase/migrations/0046_device_commands.sql` -> `supabase/migrations/0049_device_commands.sql`
- Rename: `supabase/migrations/0047_device_commands_indice.sql` -> `supabase/migrations/0050_device_commands_indice.sql`
- Create: `supabase/migrations/0051_device_platform_tvos.sql`
- Modify: `src/app/api/devices/pair/route.ts:6` (`PIATTAFORME`)
- Modify: `src/types/database.ts` (rigenerato)
- Test: `src/lib/devices/__tests__/pairing.test.ts` (esistente, deve restare verde)

**Interfaces:**
- Produces: enum `device_platform` con `tvos`; `Enums<"device_platform">` include `"tvos"`.

- [ ] **Step 1: Rinominare i tre file**

```bash
git mv supabase/migrations/0045_tv_pairing.sql supabase/migrations/0048_tv_pairing.sql
git mv supabase/migrations/0046_device_commands.sql supabase/migrations/0049_device_commands.sql
git mv supabase/migrations/0047_device_commands_indice.sql supabase/migrations/0050_device_commands_indice.sql
```

- [ ] **Step 2: Scrivere la migrazione**

`supabase/migrations/0051_device_platform_tvos.sql`:

```sql
-- Apple TV: stessa tabella devices, stesso abbinamento. Nessun ascolto (tvOS non
-- espone le sessioni di altre app), quindi nessuna colonna in piu'.
alter type public.device_platform add value if not exists 'tvos';
```

- [ ] **Step 3: Applicare via MCP**

`mcp__claude_ai_Supabase__apply_migration` con `project_id: bbuhwzdbzxgydewmcdwd`, `name: 0051_device_platform_tvos`, `query` = il contenuto del file. Poi verificare:

```sql
select unnest(enum_range(null::public.device_platform));
```

Atteso: `fire_tv, android_tv, android, browser_ext, ios, tvos`.

- [ ] **Step 4: Rigenerare i tipi**

`mcp__claude_ai_Supabase__generate_typescript_types` -> sovrascrivere `src/types/database.ts`. Controllare con `git diff --stat src/types/database.ts` che il diff sia solo l'enum (piu' eventuali tabelle di altri branch gia' applicate, come `push_tokens` di `0047_push`: e' innocuo, lascialo).

- [ ] **Step 5: Accettare `tvos` nell'abbinamento**

In `src/app/api/devices/pair/route.ts`:

```ts
const PIATTAFORME = ["fire_tv", "android_tv", "android", "tvos"] as const;
```

- [ ] **Step 6: Verificare**

Run: `pnpm typecheck && pnpm test -- src/lib/devices`
Expected: typecheck ok, `pairing.test.ts` e `launch.test.ts` verdi.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations src/types/database.ts src/app/api/devices/pair/route.ts
git commit -m "chore(tv): migrazioni TV rinumerate 0048-0050, piattaforma tvos (0051)"
```

---

### Task 2: Header della TV (funzioni pure)

**Files:**
- Create: `src/lib/tv/headers.ts`
- Test: `src/lib/tv/headers.test.ts`

**Interfaces:**
- Produces: `parseBearer(header: string | null): string | null`; `parseDeviceId(header: string | null): string | null`; `TV_DEVICE_HEADER = "x-zapp-device"`.

- [ ] **Step 1: Test**

`src/lib/tv/headers.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { parseBearer, parseDeviceId } from "./headers";

describe("parseBearer", () => {
  it("estrae il token dopo Bearer", () => {
    expect(parseBearer("Bearer abc.def.ghi")).toBe("abc.def.ghi");
  });
  it("rifiuta schema diverso, vuoto o troppo corto", () => {
    expect(parseBearer("Basic abc")).toBeNull();
    expect(parseBearer(null)).toBeNull();
    expect(parseBearer("Bearer ")).toBeNull();
    expect(parseBearer("Bearer short")).toBeNull();
  });
  it("tollera spazi attorno", () => {
    expect(parseBearer("  Bearer   abc.def.ghi  ")).toBe("abc.def.ghi");
  });
});

describe("parseDeviceId", () => {
  it("accetta un uuid", () => {
    const id = "3b241101-e2bb-4255-8caf-4136c566a962";
    expect(parseDeviceId(id)).toBe(id);
    expect(parseDeviceId(id.toUpperCase())).toBe(id);
  });
  it("rifiuta tutto il resto", () => {
    expect(parseDeviceId(null)).toBeNull();
    expect(parseDeviceId("")).toBeNull();
    expect(parseDeviceId("non-un-uuid")).toBeNull();
  });
});
```

- [ ] **Step 2: Run, deve fallire**

Run: `pnpm test -- src/lib/tv/headers`
Expected: FAIL, modulo `./headers` assente.

- [ ] **Step 3: Implementazione**

`src/lib/tv/headers.ts`:

```ts
import { isUuid } from "@/lib/validate";

/** Header con l'id del dispositivo: e' la revoca (spec §4.1 punto 8). */
export const TV_DEVICE_HEADER = "x-zapp-device";

/** Un JWT di Supabase e' lungo centinaia di caratteri: sotto i 20 non e' un token. */
const TOKEN_MIN = 20;

export function parseBearer(header: string | null): string | null {
  if (!header) return null;
  const m = header.trim().match(/^Bearer\s+(\S+)$/i);
  if (!m || m[1].length < TOKEN_MIN) return null;
  return m[1];
}

export function parseDeviceId(header: string | null): string | null {
  if (!header) return null;
  const v = header.trim().toLowerCase();
  return isUuid(v) ? v : null;
}
```

- [ ] **Step 4: Run, deve passare**

Run: `pnpm test -- src/lib/tv/headers`
Expected: PASS (6 test).

- [ ] **Step 5: Commit**

```bash
git add src/lib/tv/headers.ts src/lib/tv/headers.test.ts
git commit -m "feat(tv): parser degli header Authorization e X-Zapp-Device"
```

---

### Task 3: Il ponte bearer dentro `createClient()` e `getViewer()`

**Files:**
- Create: `src/lib/supabase/request-session.ts`
- Modify: `src/lib/supabase/server.ts`
- Modify: `src/lib/auth/viewer.ts`
- Create: `src/lib/tv/bearer.ts`
- Modify: `src/lib/supabase/middleware.ts` (`PUBLIC_PATHS`)

**Interfaces:**
- Produces: `BearerContext { accessToken: string; userId: string; email: string | null; deviceId: string }`; `bearerContext(): BearerContext | undefined`; `runWithBearer(ctx, fn)`; `createBearerClient(accessToken)`; `withBearer(request, handler: (ctx: BearerContext) => Promise<Response>): Promise<Response>`; `tvJson(body, init?)`.
- Consumes: `parseBearer`, `parseDeviceId`, `TV_DEVICE_HEADER` (Task 2).

- [ ] **Step 1: Il contesto**

`src/lib/supabase/request-session.ts`:

```ts
import "server-only";

import { AsyncLocalStorage } from "node:async_hooks";

/**
 * Sessione portata da un header `Authorization: Bearer` (app TV), non dai cookie.
 * Vive per la durata di una richiesta dentro `withBearer` (`src/lib/tv/bearer.ts`):
 * `createClient()` e `getViewer()` la leggono da qui, cosi' le query e le action del
 * sito servono la TV senza sapere da dove arriva l'utente.
 */
export interface BearerContext {
  accessToken: string;
  userId: string;
  email: string | null;
  /** Dispositivo dichiarato dalla TV, gia' verificato come suo membro. */
  deviceId: string;
}

const store = new AsyncLocalStorage<BearerContext>();

export function bearerContext(): BearerContext | undefined {
  return store.getStore();
}

export function runWithBearer<T>(ctx: BearerContext, fn: () => Promise<T>): Promise<T> {
  return store.run(ctx, fn);
}
```

- [ ] **Step 2: `createClient()` legge il contesto**

In `src/lib/supabase/server.ts` aggiungere l'import e la funzione, e il ramo in testa a `createClient`:

```ts
import { bearerContext } from "./request-session";

/**
 * Client legato a un access token portato in header (app TV). RLS attiva come col
 * cookie: PostgREST legge `auth.uid()` dal JWT. Niente storage, niente refresh: il
 * rinnovo lo fa la TV con `/api/tv/v1/auth/refresh`.
 */
export function createBearerClient(accessToken: string) {
  return createSupabaseClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    },
  );
}

/** Client Supabase legato alla sessione dell'utente (RLS attiva). */
export async function createClient() {
  const bearer = bearerContext();
  if (bearer) return createBearerClient(bearer.accessToken);

  const cookieStore = await cookies();
  // … resto invariato
```

- [ ] **Step 3: `getViewer()` legge il contesto**

In `src/lib/auth/viewer.ts`:

```ts
import { bearerContext } from "@/lib/supabase/request-session";

export const getViewer = cache(async (): Promise<Viewer | null> => {
  const bearer = bearerContext();
  if (bearer) return { id: bearer.userId, email: bearer.email };

  const supabase = await createClient();
  // … resto invariato
```

- [ ] **Step 4: `withBearer`**

`src/lib/tv/bearer.ts`:

```ts
import "server-only";

import { NextResponse, type NextRequest } from "next/server";
import { rateLimit } from "@/lib/rate-limit";
import { createBearerClient } from "@/lib/supabase/server";
import { runWithBearer, type BearerContext } from "@/lib/supabase/request-session";
import { parseBearer, parseDeviceId, TV_DEVICE_HEADER } from "./headers";

/** Risposta JSON delle rotte TV: mai in cache, mai condivisa. */
export function tvJson(body: unknown, init: ResponseInit = {}): NextResponse {
  return NextResponse.json(body, {
    ...init,
    headers: { "Cache-Control": "private, no-store", ...(init.headers ?? {}) },
  });
}

/** Tetto per utente: una TV che sfoglia fa poche richieste al secondo, non trecento al minuto. */
const LIMITE_PER_MINUTO = 300;

/**
 * Autentica una richiesta dell'app TV e corre `handler` con la sessione nel
 * contesto (`createClient()`/`getViewer()` la vedono).
 *
 * Tre controlli, nell'ordine in cui costano meno:
 * 1. firma del JWT in locale (`getClaims(token)`: JWKS in cache, zero viaggi);
 * 2. tetto di frequenza per utente;
 * 3. il dispositivo dichiarato esiste e l'utente ne e' membro: e' questo che rende
 *    efficace la revoca da `/devices` anche se il refresh token della TV e' ancora
 *    valido (spec §4.1 punto 8). Con RLS, un membro vede solo le proprie righe di
 *    `device_members`: "nessuna riga" copre sia "revocato" sia "non tuo".
 */
export async function withBearer(
  request: NextRequest,
  handler: (ctx: BearerContext) => Promise<Response>,
): Promise<Response> {
  const token = parseBearer(request.headers.get("authorization"));
  if (!token) return tvJson({ error: "Non autenticato" }, { status: 401 });

  const deviceId = parseDeviceId(request.headers.get(TV_DEVICE_HEADER));
  if (!deviceId) return tvJson({ error: "Dispositivo mancante" }, { status: 400 });

  const supabase = createBearerClient(token);
  const { data, error } = await supabase.auth.getClaims(token);
  const sub = data?.claims?.sub;
  if (error || typeof sub !== "string") {
    return tvJson({ error: "Non autenticato" }, { status: 401 });
  }

  if (!(await rateLimit(`tv:${sub}`, LIMITE_PER_MINUTO, 60))) {
    return tvJson({ error: "Troppe richieste" }, { status: 429 });
  }

  const { data: membro, error: errMembro } = await supabase
    .from("device_members")
    .select("device_id")
    .eq("device_id", deviceId)
    .eq("user_id", sub)
    .maybeSingle();
  if (errMembro) {
    console.error("[tv] device_members", errMembro.code);
    return tvJson({ error: "Non è riuscito, riprova." }, { status: 500 });
  }
  if (!membro) return tvJson({ error: "device_revoked" }, { status: 410 });

  const ctx: BearerContext = {
    accessToken: token,
    userId: sub,
    email: typeof data.claims.email === "string" ? data.claims.email : null,
    deviceId,
  };
  return runWithBearer(ctx, () => handler(ctx));
}
```

Verifica preliminare che la policy di lettura esista: `grep -n "device_members" supabase/migrations/0033_zconnection.sql` deve mostrare una policy `for select to authenticated` con `user_id = (select auth.uid())`. Se manca, aggiungerla in una migrazione `0052_device_members_select_own.sql` e applicarla via MCP (stesso giro di Task 1).

- [ ] **Step 5: Middleware**

In `src/lib/supabase/middleware.ts`, dentro `PUBLIC_PATHS`, dopo `"/api/scrobble"`:

```ts
  // L'app TV si autentica col bearer dentro `withBearer` (`src/lib/tv/bearer.ts`):
  // per il middleware e' anonima, come lo scrobble. Senza questa riga risponderebbe
  // 401 prima di leggere l'header.
  "/api/tv",
```

(`/api/devices/pair` c'e' gia' dalla fusione: verificare con `grep -n devices/pair src/lib/supabase/middleware.ts`.)

- [ ] **Step 6: Verificare**

Run: `pnpm typecheck && pnpm lint && pnpm test`
Expected: tutto verde (nessun test nuovo: `withBearer` non e' puro).

- [ ] **Step 7: Commit**

```bash
git add src/lib/supabase/request-session.ts src/lib/supabase/server.ts src/lib/auth/viewer.ts src/lib/tv/bearer.ts src/lib/supabase/middleware.ts
git commit -m "feat(tv): sessione bearer dentro createClient e getViewer (withBearer)"
```

---

### Task 4: Sessione coniata all'abbinamento, refresh, signout, `/me`

**Files:**
- Create: `src/lib/tv/session.ts`
- Modify: `src/app/api/devices/pair/[code]/route.ts`
- Create: `src/app/api/tv/v1/auth/refresh/route.ts`
- Create: `src/app/api/tv/v1/auth/signout/route.ts`
- Create: `src/app/api/tv/v1/me/route.ts`
- Create: `scripts/tv-session.mjs`

**Interfaces:**
- Produces: `Session { accessToken: string; refreshToken: string; expiresAt: number }`; `coniaSessione(userId): Promise<Session | null>`; `rinnovaSessione(refreshToken): Promise<Session | null>`; risposta del poll `{ status: "claimed", device_id, user: { id, username, avatar_url }, session: Session }`.
- Consumes: `withBearer`, `tvJson` (Task 3).

- [ ] **Step 1: `session.ts`**

```ts
import "server-only";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";

export interface Session {
  accessToken: string;
  refreshToken: string;
  /** Epoch in secondi, come lo da' Supabase. */
  expiresAt: number;
}

function anonClient() {
  return createSupabaseClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } },
  );
}

function daSupabase(s: {
  access_token: string;
  refresh_token: string;
  expires_at?: number;
}): Session {
  return {
    accessToken: s.access_token,
    refreshToken: s.refresh_token,
    expiresAt: s.expires_at ?? Math.floor(Date.now() / 1000) + 3600,
  };
}

/**
 * Una sessione Supabase vera per la TV, senza password e senza mail: si genera un
 * magic link con il service role (`generateLink` non lo spedisce) e lo si consuma
 * subito con un client anonimo (`verifyOtp`). Il link non esce mai da questa
 * funzione. Si chiama solo dal poll dell'abbinamento, dopo che il telefono ha
 * reclamato il codice e la TV si e' autenticata col proprio token.
 */
export async function coniaSessione(userId: string): Promise<Session | null> {
  const admin = createServiceClient();
  const { data: utente, error: errUtente } = await admin.auth.admin.getUserById(userId);
  const email = utente?.user?.email;
  if (errUtente || !email) {
    console.error("[tv] coniaSessione: utente senza email", errUtente?.code);
    return null;
  }

  const { data: link, error: errLink } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email,
  });
  const tokenHash = link?.properties?.hashed_token;
  if (errLink || !tokenHash) {
    console.error("[tv] coniaSessione: generateLink", errLink?.code);
    return null;
  }

  const { data, error } = await anonClient().auth.verifyOtp({
    token_hash: tokenHash,
    type: "magiclink",
  });
  if (error || !data.session) {
    console.error("[tv] coniaSessione: verifyOtp", error?.code);
    return null;
  }
  return daSupabase(data.session);
}

/** Rinnovo: il refresh token e' monouso, la TV sostituisce entrambi i token. */
export async function rinnovaSessione(refreshToken: string): Promise<Session | null> {
  const { data, error } = await anonClient().auth.refreshSession({
    refresh_token: refreshToken,
  });
  if (error || !data.session) return null;
  return daSupabase(data.session);
}

/** Chiude la sessione di quel solo token (la TV), non le altre dell'utente. */
export async function chiudiSessione(accessToken: string): Promise<void> {
  const { error } = await createServiceClient().auth.admin.signOut(accessToken, "local");
  if (error) console.error("[tv] chiudiSessione", error.code);
}
```

- [ ] **Step 2: Il poll consegna la sessione**

In `src/app/api/devices/pair/[code]/route.ts`, sostituire il blocco finale (da `const { data: membri }` alla `return`) con:

```ts
  const [{ data: profilo }, session] = await Promise.all([
    service
      .from("profiles")
      .select("id, username, avatar_url")
      .eq("id", riga.claimed_by)
      .maybeSingle(),
    coniaSessione(riga.claimed_by),
  ]);

  if (!session) {
    // Il reclamo e' avvenuto ma la sessione non si conia: la TV riprova al poll
    // successivo, il codice resta finche' non scade.
    return NextResponse.json({ error: "errore interno" }, { status: 500 });
  }

  // Consegnata una volta sola: da qui il codice non si ripesca.
  await service.from("pairing_codes").delete().eq("code", code);

  return NextResponse.json({
    status: "claimed",
    device_id: device.id,
    user: profilo
      ? { id: profilo.id, username: profilo.username, avatar_url: profilo.avatar_url }
      : { id: riga.claimed_by, username: null, avatar_url: null },
    session,
  });
```

e aggiungere `import { coniaSessione } from "@/lib/tv/session";`. (Il campo `members` di prima sparisce: era usato solo dalla vecchia `ConnectedActivity` di ZConnection, che la fase B sostituisce.)

- [ ] **Step 3: Refresh e signout**

`src/app/api/tv/v1/auth/refresh/route.ts`:

```ts
import { createHash } from "node:crypto";
import type { NextRequest } from "next/server";
import { rateLimit } from "@/lib/rate-limit";
import { tvJson } from "@/lib/tv/bearer";
import { rinnovaSessione } from "@/lib/tv/session";

/** Senza bearer: e' la rotta che serve quando il bearer e' scaduto. */
export async function POST(request: NextRequest) {
  const corpo = await request.json().catch(() => null);
  const refreshToken = (corpo as { refresh_token?: unknown } | null)?.refresh_token;
  if (typeof refreshToken !== "string" || refreshToken.length < 20 || refreshToken.length > 500) {
    return tvJson({ error: "Richiesta non valida" }, { status: 400 });
  }
  const chiave = createHash("sha256").update(refreshToken).digest("hex").slice(0, 32);
  if (!(await rateLimit(`tv-refresh:${chiave}`, 10, 60))) {
    return tvJson({ error: "Troppe richieste" }, { status: 429 });
  }
  const session = await rinnovaSessione(refreshToken);
  if (!session) return tvJson({ error: "Non autenticato" }, { status: 401 });
  return tvJson({ session });
}

export const dynamic = "force-dynamic";
```

`src/app/api/tv/v1/auth/signout/route.ts`:

```ts
import type { NextRequest } from "next/server";
import { tvJson, withBearer } from "@/lib/tv/bearer";
import { chiudiSessione } from "@/lib/tv/session";

export async function POST(request: NextRequest) {
  return withBearer(request, async (ctx) => {
    await chiudiSessione(ctx.accessToken);
    return tvJson({ ok: true });
  });
}

export const dynamic = "force-dynamic";
```

- [ ] **Step 4: `/me`**

`src/app/api/tv/v1/me/route.ts`:

```ts
import type { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { tvJson, withBearer } from "@/lib/tv/bearer";

/** Attribuzione TMDB: obbligatoria ovunque si mostrino i suoi dati, TV compresa. */
const TMDB_ATTRIBUTION =
  "This product uses the TMDB API but is not endorsed or certified by TMDB.";

export async function GET(request: NextRequest) {
  return withBearer(request, async (ctx) => {
    const supabase = await createClient();
    const [{ data: profilo }, { data: device }] = await Promise.all([
      supabase
        .from("profiles")
        .select("id, username, display_name, avatar_url")
        .eq("id", ctx.userId)
        .maybeSingle(),
      supabase
        .from("devices")
        .select("id, name, platform, last_seen_at")
        .eq("id", ctx.deviceId)
        .maybeSingle(),
    ]);
    return tvJson({
      user: profilo ?? { id: ctx.userId, username: null, display_name: null, avatar_url: null },
      device: device ?? null,
      // La TV Android ha il listener: "listening" = il permesso notifiche risulta
      // attivo, e lo sa solo lei. Qui si dice se il server ha visto eventi di recente.
      listening: Boolean(device?.last_seen_at) &&
        Date.now() - new Date(device!.last_seen_at!).getTime() < 15 * 60 * 1000,
      tmdbAttribution: TMDB_ATTRIBUTION,
    });
  });
}

export const dynamic = "force-dynamic";
```

- [ ] **Step 5: Script di collaudo**

`scripts/tv-session.mjs` (Node, `--env-file=.env.local`): conia una sessione per un utente di prova e inserisce un dispositivo finto, stampa i tre valori da usare con curl. Serve a questa fase e alle app.

```js
// node --env-file=.env.local scripts/tv-session.mjs <user_id>
// Conia una sessione TV e un dispositivo finto: stampa ACCESS, REFRESH, DEVICE.
// Alla fine: node --env-file=.env.local scripts/tv-session.mjs --pulisci <DEVICE>
import { createClient } from "@supabase/supabase-js";
import { randomUUID, createHash } from "node:crypto";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
const admin = createClient(url, service, { auth: { persistSession: false } });

const [arg, valore] = process.argv.slice(2);
if (arg === "--pulisci") {
  const { error } = await admin.from("devices").delete().eq("id", valore);
  console.log(error ? `errore: ${error.message}` : "dispositivo cancellato (cascata)");
  process.exit(0);
}
const userId = arg;
if (!userId) throw new Error("uso: tv-session.mjs <user_id> | --pulisci <device_id>");

const { data: utente } = await admin.auth.admin.getUserById(userId);
const { data: link } = await admin.auth.admin.generateLink({
  type: "magiclink",
  email: utente.user.email,
});
const anonClient = createClient(url, anon, { auth: { persistSession: false } });
const { data, error } = await anonClient.auth.verifyOtp({
  token_hash: link.properties.hashed_token,
  type: "magiclink",
});
if (error) throw error;

const token = randomUUID();
const { data: device } = await admin
  .from("devices")
  .insert({
    install_id: randomUUID(),
    token_hash: createHash("sha256").update(token).digest("hex"),
    name: "TV di prova",
    platform: "android_tv",
  })
  .select("id")
  .single();
await admin.from("device_members").insert({ device_id: device.id, user_id: userId });

console.log(`ACCESS=${data.session.access_token}`);
console.log(`REFRESH=${data.session.refresh_token}`);
console.log(`DEVICE=${device.id}`);
console.log(`DEVICE_TOKEN=${token}`);
```

- [ ] **Step 6: Collaudo manuale**

Avviare l'istanza dal worktree (in un terminale a parte):

```bash
NEXT_DIST_DIR=.next-tv pnpm build && NEXT_DIST_DIR=.next-tv pnpm exec next start -p 3400
```

Poi:

```bash
node --env-file=.env.local scripts/tv-session.mjs <user_id>
curl -s http://localhost:3400/api/tv/v1/me -H "Authorization: Bearer $ACCESS" -H "X-Zapp-Device: $DEVICE"
# atteso: {"user":{...},"device":{...},"listening":false,"tmdbAttribution":"…"}
curl -s http://localhost:3400/api/tv/v1/me -H "Authorization: Bearer $ACCESS" -H "X-Zapp-Device: 00000000-0000-4000-8000-000000000000"
# atteso: 410 {"error":"device_revoked"}
curl -s http://localhost:3400/api/tv/v1/me -H "X-Zapp-Device: $DEVICE"
# atteso: 401
curl -s -X POST http://localhost:3400/api/tv/v1/auth/refresh -H "Content-Type: application/json" -d "{\"refresh_token\":\"$REFRESH\"}"
# atteso: {"session":{...}} con token nuovi
```

Abbinamento intero: `POST /api/devices/pair` con un `token_hash`, reclamare il codice da `/devices` nel browser loggato, poi `GET /api/devices/pair/<code>` con `Authorization: Bearer <token>` -> `status: claimed` con `session`. Alla fine `scripts/tv-session.mjs --pulisci $DEVICE` e cancellare da `/devices` la TV reclamata.

- [ ] **Step 7: Verificare e commit**

Run: `pnpm typecheck && pnpm lint && pnpm test`

```bash
git add src/lib/tv/session.ts "src/app/api/devices/pair/[code]/route.ts" src/app/api/tv/v1/auth src/app/api/tv/v1/me scripts/tv-session.mjs
git commit -m "feat(tv): sessione coniata all'abbinamento, refresh, signout, /me"
```

---

### Task 5: DTO e mapper delle tessere (puri)

**Files:**
- Create: `src/lib/tv/dto.ts`
- Create: `src/lib/tv/map.ts`
- Test: `src/lib/tv/map.test.ts`

**Interfaces:**
- Produces (in `dto.ts`): `MediaType`, `WatchStatus`, `TitleCard`, `ContinueCard`, `HeroCard`, `ShelfRef`, `Shelf`, `LibraryPage`, `ProviderInfo`, `ProviderOffer`, `UserEntry`, `SeasonSummary`, `TitleDetail`, `SeasonDetail`, `EpisodeItem`, `LaunchPlan`, `WatchAction`.
- Produces (in `map.ts`): `cardFromShelf(ShelfItem)`, `cardFromRanked(RankedItem)`, `cardFromChart(ChartItem)`, `cardFromSimilar(SimilarItem)`, `cardFromLibrary(LibraryItem)`, `cardFromEntry(EntryWithTitle)`, `continueFromItem(ContinueItem)`, `heroFromItem(HeroItem)`, `annoDa(unknown): string | null`.

- [ ] **Step 1: `dto.ts`**

```ts
/**
 * Contratto dell'API `/api/tv/v1`. **E' l'unica fonte**: i modelli Kotlin
 * (`ZappTV/android`) e Swift (`ZappTV/tvos`) sono copie a mano di questo file, con in
 * testa il commit da cui derivano. Cambi qui = cambi nelle due copie nello stesso giro.
 * Le immagini sono percorsi TMDB: la TV compone `https://image.tmdb.org/t/p/<size><path>`.
 */
export type MediaType = "movie" | "tv";
export type WatchStatus = "watching" | "want" | "watched" | "dropped";

export interface TitleCard {
  id: number;
  mediaType: MediaType;
  name: string;
  year: string | null;
  posterPath: string | null;
  backdropPath: string | null;
  /** ZappScore 0-10 e voti dietro; `null` se il titolo non ne ha ancora. */
  zappScore: number | null;
  zappVotes: number;
  /** Affinita' personale 0-100 e motivo in italiano: solo dagli scaffali del motore. */
  affinity: number | null;
  reason: string | null;
  /** Piattaforme IT note (flatrate) per la pillola sulla tessera; vuoto se non in cache. */
  providerIds: number[];
}

export interface ContinueCard extends TitleCard {
  entryId: string;
  /** "S1:E5" e nome dell'episodio da riprendere; null per un film. */
  episodeLabel: string | null;
  episodeName: string | null;
  shownSeason: number | null;
  shownEpisode: number | null;
  /** Grafica orizzontale ufficiale del titolo, taglia `original` gia' completa di URL. */
  imageUrl: string | null;
  runtimeLabel: string | null;
  progressPct: number | null;
  resumePositionMs: number | null;
  resumeDurationMs: number | null;
  providerId: number | null;
  /** Un dispositivo collegato lo sta riproducendo adesso. */
  live: boolean;
}

export interface HeroCard extends TitleCard {
  overview: string | null;
}

export type ShelfLayout = "poster" | "backdrop" | "numbered";

export interface ShelfRef {
  /** `foryou` | `persone:<k>` | `because:<type>:<id>` | `generi:<k>` | `decenni:<k>` | `topten` | `want` | `platform:<id>` | `toprated` | `comingsoon` */
  key: string;
  title: string;
  subtitle: string | null;
  layout: ShelfLayout;
}

export interface Shelf extends ShelfRef {
  items: TitleCard[];
}

export interface LibraryCard extends TitleCard {
  status: WatchStatus;
  /** Il voto dell'utente, non lo ZappScore. */
  rating: number | null;
}

export interface LibraryPage {
  items: LibraryCard[];
  total: number;
}

export interface ProviderInfo {
  id: number;
  name: string;
  logoPath: string | null;
}

export interface ProviderOffer extends ProviderInfo {
  kind: "flatrate" | "rent" | "buy" | "free" | "ads";
  /** `POST /play` puo' lanciare l'app su Android TV; `expected` dice cosa succedera'. */
  canLaunch: boolean;
  expected: "avvia" | "scheda" | "app" | null;
  /** Link https alla pagina del titolo sulla piattaforma, se gia' risolto. */
  url: string | null;
}

export interface UserEntry {
  status: WatchStatus;
  rating: number | null;
  season: number | null;
  episode: number | null;
  next: { season: number; episode: number } | null;
}

export interface SeasonSummary {
  number: number;
  name: string;
  episodeCount: number;
  airDate: string | null;
  posterPath: string | null;
  /** Episodi gia' visti in questa stagione. */
  watched: number;
}

export interface CastMember {
  name: string;
  character: string | null;
  profilePath: string | null;
}

export interface TitleDetail extends TitleCard {
  originalName: string | null;
  overview: string | null;
  tagline: string | null;
  genres: string[];
  runtimeMin: number | null;
  releaseDate: string | null;
  tmdbRating: number | null;
  cast: CastMember[];
  trailer: { youtubeId: string } | null;
  providers: ProviderOffer[];
  entry: UserEntry | null;
  seasons: SeasonSummary[];
  similar: TitleCard[];
  /** Tinta della locandina in esadecimale, per il fondale (spec §6). */
  palette: { primary: string; secondary: string } | null;
}

export interface EpisodeItem {
  number: number;
  name: string;
  overview: string | null;
  stillPath: string | null;
  airDate: string | null;
  runtimeMin: number | null;
  watched: boolean;
  /** Minuto a cui riprendere, se ZConnection lo sa. */
  resumeMs: number | null;
}

export interface SeasonDetail {
  number: number;
  name: string;
  overview: string | null;
  episodes: EpisodeItem[];
}

export interface LaunchPlan {
  commandId: string;
  android: { packages: string[]; dataUri: string | null; extraDeeplink: string | null } | null;
  /** Fase C: si riempie con la sonda su Apple TV. */
  tvos: { url: string } | null;
  expected: "avvia" | "scheda" | "app";
}

export type WatchAction =
  | "want"
  | "watching"
  | "watched"
  | "drop"
  | "remove"
  | "episode"
  | "rate";
```

- [ ] **Step 2: Test dei mapper**

`src/lib/tv/map.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { annoDa, cardFromChart, cardFromRanked, cardFromShelf, cardFromSimilar } from "./map";

describe("annoDa", () => {
  it("accetta stringa, numero e data intera", () => {
    expect(annoDa("2019")).toBe("2019");
    expect(annoDa(2019)).toBe("2019");
    expect(annoDa("2019-05-01")).toBe("2019");
    expect(annoDa(null)).toBeNull();
    expect(annoDa("")).toBeNull();
  });
});

describe("cardFromShelf", () => {
  it("porta voto, affinita' e motivo quando ci sono", () => {
    const card = cardFromShelf({
      id: 1,
      mediaType: "movie",
      title: "Dune",
      posterPath: "/d.jpg",
      year: "2021",
      rating: 8.1,
      affinity: 87,
      reason: "Perché ami la fantascienza",
    });
    expect(card).toEqual({
      id: 1,
      mediaType: "movie",
      name: "Dune",
      year: "2021",
      posterPath: "/d.jpg",
      backdropPath: null,
      zappScore: 8.1,
      zappVotes: 0,
      affinity: 87,
      reason: "Perché ami la fantascienza",
      providerIds: [],
    });
  });
});

describe("cardFromRanked", () => {
  it("preferisce lo ZappScore al voto TMDB e porta le piattaforme", () => {
    const card = cardFromRanked({
      id: 2,
      mediaType: "tv",
      title: "Dark",
      posterPath: "/k.jpg",
      backdropPath: "/b.jpg",
      overview: null,
      year: "2017",
      genreIds: [],
      voteAverage: 8.4,
      zappScore: 9.0,
      runtime: null,
      originalLanguage: "de",
      providerIds: [8],
      punteggio: 0.9,
      percentuale: 91,
      contributi: [],
      motivo: "Di tendenza fra i tuoi amici",
    } as never);
    expect(card.zappScore).toBe(9.0);
    expect(card.affinity).toBe(91);
    expect(card.providerIds).toEqual([8]);
    expect(card.backdropPath).toBe("/b.jpg");
  });
});

describe("cardFromChart e cardFromSimilar", () => {
  it("classifica: voti e piattaforma", () => {
    const card = cardFromChart({
      id: 3,
      mediaType: "movie",
      title: "Oppenheimer",
      posterPath: null,
      year: "2023",
      rank: 1,
      momentum: null,
      providerId: 8,
      official: true,
      score: 8.7,
      votes: 12000,
    } as never);
    expect(card.zappVotes).toBe(12000);
    expect(card.providerIds).toEqual([8]);
  });
  it("simili: l'anno e' un numero e il motivo resta", () => {
    const card = cardFromSimilar({
      id: 4,
      mediaType: "movie",
      title: "Arrival",
      posterPath: "/a.jpg",
      year: 2016,
      score: 0.7,
      reason: "Di Denis Villeneuve",
      directorId: 1,
      keywordIds: [],
      genreIds: [],
    });
    expect(card.year).toBe("2016");
    expect(card.reason).toBe("Di Denis Villeneuve");
    expect(card.zappScore).toBeNull();
  });
});
```

- [ ] **Step 3: Run, deve fallire**

Run: `pnpm test -- src/lib/tv/map`
Expected: FAIL, modulo assente.

- [ ] **Step 4: `map.ts`**

```ts
import type { ShelfItem } from "@/lib/home/shelves-rank";
import type { HeroItem } from "@/lib/home/hero-rank";
import type { RankedItem } from "@/lib/rank/types";
import type { ChartItem } from "@/lib/charts/queries";
import type { SimilarItem } from "@/lib/similar/types";
import type { EntryWithTitle, LibraryItem } from "@/lib/watch/queries";
import type { ContinueItem } from "@/lib/watch/continue";
import type { ContinueCard, HeroCard, LibraryCard, TitleCard } from "./dto";

/** Le sei sorgenti scrivono l'anno in tre modi: stringa, numero, data intera. */
export function annoDa(v: unknown): string | null {
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  if (typeof v === "string" && v.length >= 4) return v.slice(0, 4);
  return null;
}

const VUOTA = {
  backdropPath: null,
  zappScore: null,
  zappVotes: 0,
  affinity: null,
  reason: null,
  providerIds: [] as number[],
};

export function cardFromShelf(i: ShelfItem): TitleCard {
  return {
    ...VUOTA,
    id: i.id,
    mediaType: i.mediaType,
    name: i.title,
    year: annoDa(i.year),
    posterPath: i.posterPath ?? null,
    backdropPath: i.backdropPath ?? null,
    zappScore: i.rating ?? null,
    affinity: i.affinity ?? null,
    reason: i.reason ?? null,
  };
}

export function cardFromRanked(i: RankedItem): TitleCard {
  return {
    ...VUOTA,
    id: i.id,
    mediaType: i.mediaType,
    name: i.title,
    year: annoDa(i.year),
    posterPath: i.posterPath ?? null,
    backdropPath: i.backdropPath ?? null,
    zappScore: i.zappScore ?? i.voteAverage ?? null,
    affinity: i.percentuale ?? null,
    reason: i.motivo ?? null,
    providerIds: i.providerIds ?? [],
  };
}

export function cardFromChart(i: ChartItem): TitleCard {
  return {
    ...VUOTA,
    id: i.id,
    mediaType: i.mediaType,
    name: i.title,
    year: annoDa(i.year),
    posterPath: i.posterPath,
    zappScore: i.score,
    zappVotes: i.votes ?? 0,
    providerIds: [i.providerId],
  };
}

export function cardFromSimilar(i: SimilarItem): TitleCard {
  return {
    ...VUOTA,
    id: i.id,
    mediaType: i.mediaType,
    name: i.title,
    year: annoDa(i.year),
    posterPath: i.posterPath,
    reason: i.reason,
  };
}

export function cardFromLibrary(i: LibraryItem): LibraryCard {
  return {
    ...VUOTA,
    id: i.titleId,
    mediaType: i.mediaType,
    name: i.name,
    year: annoDa(i.year),
    posterPath: i.posterPath,
    zappScore: i.zappScore,
    zappVotes: i.zappVotes,
    status: i.status,
    rating: i.rating,
  };
}

export function cardFromEntry(e: EntryWithTitle): TitleCard {
  const t = e.title;
  return {
    ...VUOTA,
    id: e.title_id,
    mediaType: e.media_type,
    name: t?.title ?? "",
    year: annoDa(t?.release_date),
    posterPath: t?.poster_path ?? null,
    backdropPath: t?.backdrop_path ?? null,
    providerIds: (t?.title_providers ?? [])
      .filter((p) => p.kind === "flatrate")
      .map((p) => p.provider_id),
  };
}

export function continueFromItem(c: ContinueItem, entry: EntryWithTitle | undefined, live: boolean): ContinueCard {
  return {
    ...(entry ? cardFromEntry(entry) : { ...VUOTA, id: c.titleId, mediaType: c.mediaType, name: c.name, year: null, posterPath: null }),
    entryId: c.entryId,
    episodeLabel: c.episodeLabel,
    episodeName: c.episodeName,
    shownSeason: c.shownSeason,
    shownEpisode: c.shownEpisode,
    imageUrl: c.imageUrl,
    runtimeLabel: c.runtimeLabel,
    progressPct: c.progressPct,
    resumePositionMs: c.resumePositionMs,
    resumeDurationMs: c.resumeDurationMs,
    providerId: c.providerId,
    live,
  };
}

export function heroFromItem(h: HeroItem): HeroCard {
  return {
    ...VUOTA,
    id: h.id,
    mediaType: h.mediaType,
    name: h.title,
    year: annoDa(h.year),
    posterPath: h.posterPath,
    backdropPath: h.backdropPath,
    zappScore: h.voteAverage,
    affinity: h.affinity ?? null,
    reason: h.motivo ?? null,
    overview: h.overview,
  };
}
```

Controllare i nomi dei campi contro i tipi veri prima di salvare: `ShelfItem` (`src/lib/home/shelves-rank.ts`: `rating?`, `affinity?`, `reason?`, `backdropPath?`), `RankedItem` (`src/lib/rank/types.ts`: `zappScore`, `voteAverage`, `percentuale`, `motivo`, `providerIds`), `ChartItem` (`src/lib/charts/queries.ts`: `score`, `votes`, `providerId`), `HeroItem` (`src/lib/home/hero-rank.ts`: `affinity`, `motivo`), `title_providers.kind` (`src/types/database.ts`). Se un nome differisce, adeguare il mapper, non il tipo sorgente.

- [ ] **Step 5: Run, deve passare**

Run: `pnpm test -- src/lib/tv/map && pnpm typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/tv/dto.ts src/lib/tv/map.ts src/lib/tv/map.test.ts
git commit -m "feat(tv): contratto DTO dell'API v1 e mapper delle tessere"
```

---

### Task 6: `GET /home` (continua, hero, manifesto degli scaffali)

**Files:**
- Create: `src/lib/tv/manifest.ts`
- Test: `src/lib/tv/manifest.test.ts`
- Create: `src/app/api/tv/v1/home/route.ts`

**Interfaces:**
- Produces: `buildShelfManifest(input: ManifestInput): ShelfRef[]` con `ManifestInput { profiloRicco: boolean; rails: { key: string; titolo: string; dimensione: "persone" | "generi" | "decenni" }[]; because: BecauseSource[]; hasWant: boolean; platformIds: number[] }`; risposta `{ continue: ContinueCard[], hero: HeroCard[], shelves: ShelfRef[] }`.
- Consumes: Task 5 mapper; `getHomeData`, `getContinueItems`, `getLiveSessions`, `getWatchedPlatforms`, `getHomeHero`, `getTasteProfile`, `MASSA_MINIMA`, `getHomeRails`, `pickBecauseSources`, `SHELF_PROVIDER_IDS`.

- [ ] **Step 1: Test del manifesto**

`src/lib/tv/manifest.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildShelfManifest } from "./manifest";

const rails = [
  { key: "persona:1", titolo: "Ancora con Denis Villeneuve", dimensione: "persone" as const },
  { key: "genere:878", titolo: "Perché ami la fantascienza", dimensione: "generi" as const },
  { key: "decennio:2000", titolo: "Il meglio degli anni 2000", dimensione: "decenni" as const },
];
const because = [{ titleId: 5, mediaType: "movie" as const, name: "Dune" }];

describe("buildShelfManifest", () => {
  it("profilo ricco: prima cio' che parla di te, come la home web", () => {
    const keys = buildShelfManifest({
      profiloRicco: true,
      rails,
      because,
      hasWant: true,
      platformIds: [8, 337],
    }).map((s) => s.key);
    expect(keys).toEqual([
      "foryou",
      "persona:1",
      "because:movie:5",
      "genere:878",
      "decennio:2000",
      "topten",
      "want",
      "platform:8",
      "platform:337",
      "toprated",
      "comingsoon",
    ]);
  });

  it("profilo povero: prima le classifiche, i consigli dopo", () => {
    const keys = buildShelfManifest({
      profiloRicco: false,
      rails: [],
      because,
      hasWant: false,
      platformIds: [8],
    }).map((s) => s.key);
    expect(keys).toEqual(["topten", "platform:8", "foryou", "because:movie:5", "toprated", "comingsoon"]);
  });

  it("titoli e layout", () => {
    const shelves = buildShelfManifest({
      profiloRicco: false,
      rails: [],
      because,
      hasWant: true,
      platformIds: [],
    });
    expect(shelves.find((s) => s.key === "topten")?.layout).toBe("numbered");
    expect(shelves.find((s) => s.key === "comingsoon")?.layout).toBe("backdrop");
    expect(shelves.find((s) => s.key === "because:movie:5")?.title).toBe("Perché hai visto Dune");
    expect(shelves.find((s) => s.key === "want")?.title).toBe("Da vedere");
  });
});
```

- [ ] **Step 2: Run, deve fallire**

Run: `pnpm test -- src/lib/tv/manifest`
Expected: FAIL.

- [ ] **Step 3: `manifest.ts`**

```ts
import { PROVIDERS } from "@/lib/config";
import type { BecauseSource } from "@/lib/home/shelves-rank";
import type { ShelfRef } from "./dto";

export interface ManifestRail {
  key: string;
  titolo: string;
  dimensione: "persone" | "generi" | "decenni";
}

export interface ManifestInput {
  /** `massa >= MASSA_MINIMA`: la stessa soglia della home web. */
  profiloRicco: boolean;
  rails: ManifestRail[];
  because: BecauseSource[];
  hasWant: boolean;
  platformIds: number[];
}

function rail(r: ManifestRail): ShelfRef {
  return { key: r.key, title: r.titolo, subtitle: null, layout: "poster" };
}

function because(b: BecauseSource): ShelfRef {
  return {
    key: `because:${b.mediaType}:${b.titleId}`,
    title: `Perché hai visto ${b.name}`,
    subtitle: null,
    layout: "poster",
  };
}

function platform(id: number): ShelfRef {
  return {
    key: `platform:${id}`,
    title: `Novità su ${PROVIDERS[id]?.name ?? String(id)}`,
    subtitle: null,
    layout: "poster",
  };
}

const FORYOU: ShelfRef = { key: "foryou", title: "Per te", subtitle: null, layout: "poster" };
const TOPTEN: ShelfRef = { key: "topten", title: "Top 10 Netflix", subtitle: "Questa settimana", layout: "numbered" };
const WANT: ShelfRef = { key: "want", title: "Da vedere", subtitle: null, layout: "poster" };
const TOPRATED: ShelfRef = { key: "toprated", title: "I più amati su Zapp", subtitle: "ZappScore", layout: "poster" };
const COMINGSOON: ShelfRef = { key: "comingsoon", title: "In arrivo", subtitle: null, layout: "backdrop" };

/**
 * L'ordine degli scaffali della home web (`src/app/(app)/page.tsx`), senza cinema,
 * amici e saghe (fuori dalla v1 TV, spec §13). Le rail personali stanno dove le mette
 * `PersonalRails`: "persone" accanto a "Per te", "generi" e "decenni" dopo "Perché
 * hai visto".
 */
export function buildShelfManifest(input: ManifestInput): ShelfRef[] {
  const persone = input.rails.filter((r) => r.dimensione === "persone").map(rail);
  const altre = input.rails.filter((r) => r.dimensione !== "persone").map(rail);
  const perche = input.because.map(because);
  const want = [...(input.hasWant ? [WANT] : []), ...input.platformIds.map(platform)];

  if (input.profiloRicco) {
    return [FORYOU, ...persone, ...perche, ...altre, TOPTEN, ...want, TOPRATED, COMINGSOON];
  }
  return [TOPTEN, ...want, FORYOU, ...perche, TOPRATED, COMINGSOON];
}
```

- [ ] **Step 4: Run, deve passare**

Run: `pnpm test -- src/lib/tv/manifest`
Expected: PASS (3 test).

- [ ] **Step 5: La rotta**

`src/app/api/tv/v1/home/route.ts`:

```ts
import type { NextRequest } from "next/server";
import { getHomeData } from "@/lib/watch/queries";
import { getContinueItems } from "@/lib/watch/continue";
import { getLiveSessions } from "@/lib/watch/live";
import { getWatchedPlatforms } from "@/lib/watch/platforms";
import { getHomeHero } from "@/lib/home/hero";
import { SHELF_PROVIDER_IDS } from "@/lib/home/shelves";
import { pickBecauseSources } from "@/lib/home/shelves-rank";
import { getHomeRails } from "@/lib/rank/engine";
import { MASSA_MINIMA } from "@/lib/rank/vector";
import { getTasteProfile } from "@/lib/taste/queries";
import { tvJson, withBearer } from "@/lib/tv/bearer";
import { continueFromItem, heroFromItem } from "@/lib/tv/map";
import { buildShelfManifest, type ManifestRail } from "@/lib/tv/manifest";

/**
 * La home in una risposta: "Continua a guardare" e il carosello gia' pieni (sono
 * sopra la piega), gli scaffali come **manifesto** (chiave e titolo) che la TV
 * riempie uno alla volta con `/home/shelf/{key}` scorrendo. La home web fa lo
 * stesso con i `Suspense`: nessuna funzione Vercel aspetta venti liste.
 */
export async function GET(request: NextRequest) {
  return withBearer(request, async (ctx) => {
    const [homeData, hero, profilo, railsFilm, railsSerie] = await Promise.all([
      getHomeData(),
      getHomeHero().catch(() => ({ all: [] })),
      getTasteProfile(ctx.userId).catch(() => null),
      getHomeRails("movie").catch(() => []),
      getHomeRails("tv").catch(() => []),
    ]);

    const [live, platforms] = await Promise.all([
      getLiveSessions().catch(() => []),
      getWatchedPlatforms(homeData.watching).catch(() => []),
    ]);
    const items = await getContinueItems(homeData.watching, live, platforms).catch(
      () => [],
    );
    const perEntry = new Map(homeData.watching.map((e) => [String(e.id), e]));
    const liveIds = new Set(live.map((s) => `${s.mediaType}:${s.titleId}`));

    // Le rail esistono per film e per serie con la stessa chiave: nel manifesto una
    // volta sola, `/home/shelf/{key}` le mescola come fa `PersonalRails`.
    const viste = new Set<string>();
    const rails: ManifestRail[] = [];
    for (const r of [...railsFilm, ...railsSerie]) {
      if (viste.has(r.key)) continue;
      viste.add(r.key);
      rails.push({ key: r.key, titolo: r.titolo, dimensione: r.dimensione });
    }

    return tvJson({
      continue: items.map((c) =>
        continueFromItem(c, perEntry.get(c.entryId), liveIds.has(`${c.mediaType}:${c.titleId}`)),
      ),
      hero: hero.all.map(heroFromItem),
      shelves: buildShelfManifest({
        profiloRicco: (profilo?.massa ?? 0) >= MASSA_MINIMA,
        rails,
        because: pickBecauseSources(homeData.watched, "all"),
        hasWant: homeData.want.length > 0,
        platformIds: [...SHELF_PROVIDER_IDS],
      }),
    });
  });
}

export const dynamic = "force-dynamic";
```

Verificare i nomi contro il codice vero: `LiveSession` (`src/lib/watch/live.ts`) ha `titleId`/`mediaType`? `Rail` (`src/lib/rank/types.ts`) ha `key`, `titolo`, `dimensione`? `Dimensione` e' `"persone" | "generi" | "decenni"`? `pickBecauseSources(entries, type)` accetta `EntryWithTitle[]` (e' `WatchedLike`)? Se un nome differisce, adeguare qui.

- [ ] **Step 6: Collaudo**

Con l'istanza di Task 4 attiva (ricostruire dopo le modifiche: `NEXT_DIST_DIR=.next-tv pnpm build`):

```bash
curl -s http://localhost:3400/api/tv/v1/home -H "Authorization: Bearer $ACCESS" -H "X-Zapp-Device: $DEVICE" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const j=JSON.parse(s);console.log(j.continue.length,'continue',j.hero.length,'hero');console.log(j.shelves.map(x=>x.key).join(' | '))})"
```

Atteso: qualche tessera in `continue` (se l'utente ne ha), 8-16 hero, manifesto nell'ordine del test.

- [ ] **Step 7: Verificare e commit**

Run: `pnpm typecheck && pnpm lint && pnpm test`

```bash
git add src/lib/tv/manifest.ts src/lib/tv/manifest.test.ts src/app/api/tv/v1/home/route.ts
git commit -m "feat(tv): GET /api/tv/v1/home con continua, hero e manifesto degli scaffali"
```

---

### Task 7: `GET /home/shelf/{key}` e `GET /providers`

**Files:**
- Create: `src/lib/tv/shelf-key.ts`
- Test: `src/lib/tv/shelf-key.test.ts`
- Create: `src/app/api/tv/v1/home/shelf/[key]/route.ts`
- Create: `src/app/api/tv/v1/providers/route.ts`

**Interfaces:**
- Produces: `parseShelfKey(key: string): ShelfKey | null` con `ShelfKey = { kind: "foryou" } | { kind: "rail"; key: string } | { kind: "because"; mediaType: MediaType; titleId: number } | { kind: "topten" } | { kind: "want" } | { kind: "platform"; providerId: number } | { kind: "toprated" } | { kind: "comingsoon" }`; risposta `Shelf`; `/providers` -> `{ providers: ProviderInfo[] }`.
- Consumes: mapper (Task 5); `getRankedForYou`, `getHomeRails`, `getBecauseShelf`, `getOwnedKeys`, `personalizeSimilar`, `withScores`, `getProviderChart`, `getTopRatedOnZapp`, `getPlatformShelves`, `getComingSoon`, `getHomeData`, `mixShelf`, `getProviderList`.

- [ ] **Step 1: Test della chiave**

`src/lib/tv/shelf-key.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { parseShelfKey } from "./shelf-key";

describe("parseShelfKey", () => {
  it("riconosce le chiavi fisse", () => {
    expect(parseShelfKey("foryou")).toEqual({ kind: "foryou" });
    expect(parseShelfKey("topten")).toEqual({ kind: "topten" });
    expect(parseShelfKey("want")).toEqual({ kind: "want" });
    expect(parseShelfKey("toprated")).toEqual({ kind: "toprated" });
    expect(parseShelfKey("comingsoon")).toEqual({ kind: "comingsoon" });
  });
  it("riconosce because e platform con parametri validi", () => {
    expect(parseShelfKey("because:movie:438631")).toEqual({
      kind: "because",
      mediaType: "movie",
      titleId: 438631,
    });
    expect(parseShelfKey("platform:337")).toEqual({ kind: "platform", providerId: 337 });
  });
  it("le rail passano per intero: `<dimensione>|<chiave>`, chiave opaca", () => {
    expect(parseShelfKey("generi|878")).toEqual({ kind: "rail", key: "generi|878" });
    expect(parseShelfKey("decenni|2000")).toEqual({ kind: "rail", key: "decenni|2000" });
    expect(parseShelfKey("persone|Regia:Denis Villeneuve")).toEqual({
      kind: "rail",
      key: "persone|Regia:Denis Villeneuve",
    });
    expect(parseShelfKey("persone|")).toBeNull();
    expect(parseShelfKey("attori|1")).toBeNull();
  });
  it("rifiuta il resto", () => {
    expect(parseShelfKey("because:book:1")).toBeNull();
    expect(parseShelfKey("because:movie:-1")).toBeNull();
    expect(parseShelfKey("platform:abc")).toBeNull();
    expect(parseShelfKey("")).toBeNull();
    expect(parseShelfKey("x".repeat(80))).toBeNull();
  });
});
```

- [ ] **Step 2: Run, deve fallire**

Run: `pnpm test -- src/lib/tv/shelf-key`

- [ ] **Step 3: `shelf-key.ts`**

```ts
import { isIntInRange, isMediaType, isTmdbId } from "@/lib/validate";
import type { MediaType } from "./dto";

export type ShelfKey =
  | { kind: "foryou" }
  | { kind: "rail"; key: string }
  | { kind: "because"; mediaType: MediaType; titleId: number }
  | { kind: "topten" }
  | { kind: "want" }
  | { kind: "platform"; providerId: number }
  | { kind: "toprated" }
  | { kind: "comingsoon" };

const FISSE: Record<string, ShelfKey> = {
  foryou: { kind: "foryou" },
  topten: { kind: "topten" },
  want: { kind: "want" },
  toprated: { kind: "toprated" },
  comingsoon: { kind: "comingsoon" },
};

/**
 * Le rail del motore (`buildRails`): `<dimensione>|<chiave>`, con la chiave opaca —
 * puo' avere spazi e due punti (`persone|Regia:Denis Villeneuve`). Si passa intera a
 * `getHomeRails`; la TV la codifica nel percorso con `encodeURIComponent`.
 */
const RAIL = /^(persone|generi|decenni)\|.{1,100}$/;

export function parseShelfKey(key: string): ShelfKey | null {
  if (!key || key.length > 120) return null;
  if (FISSE[key]) return FISSE[key];
  if (RAIL.test(key)) return { kind: "rail", key };
  const parti = key.split(":");
  if (parti[0] === "because" && parti.length === 3) {
    const id = Number(parti[2]);
    if (!isMediaType(parti[1]) || !isTmdbId(id)) return null;
    return { kind: "because", mediaType: parti[1], titleId: id };
  }
  if (parti[0] === "platform" && parti.length === 2) {
    const id = Number(parti[1]);
    if (!/^[0-9]{1,6}$/.test(parti[1]) || !isIntInRange(id, 1, 999999)) return null;
    return { kind: "platform", providerId: id };
  }
  return null;
}
```

Formato delle chiavi rail verificato nel Task 6 (`src/lib/rank/rails.ts`): `<dimensione>|<chiave>` con pipe, chiave opaca. Il test `"x".repeat(80)` resta nullo perche' non e' ne' fissa ne' rail; aggiungere `expect(parseShelfKey("generi|" + "x".repeat(120))).toBeNull()` per il tetto di lunghezza.

- [ ] **Step 4: Run, deve passare**

Run: `pnpm test -- src/lib/tv/shelf-key`

- [ ] **Step 5: La rotta dello scaffale**

`src/app/api/tv/v1/home/shelf/[key]/route.ts`:

```ts
import type { NextRequest } from "next/server";
import { getBecauseShelf, getComingSoon, getOwnedKeys, getPlatformShelves, mixShelf } from "@/lib/home/shelves";
import { getHomeRails, getRankedForYou } from "@/lib/rank/engine";
import { getProviderChart, getTopRatedOnZapp } from "@/lib/charts/queries";
import { personalizeSimilar } from "@/lib/similar/personal";
import { withScores } from "@/lib/ratings/cards";
import { getHomeData } from "@/lib/watch/queries";
import { tvJson, withBearer } from "@/lib/tv/bearer";
import type { TitleCard } from "@/lib/tv/dto";
import { cardFromChart, cardFromEntry, cardFromRanked, cardFromShelf, cardFromSimilar } from "@/lib/tv/map";
import { parseShelfKey, type ShelfKey } from "@/lib/tv/shelf-key";

async function items(k: ShelfKey): Promise<TitleCard[]> {
  switch (k.kind) {
    case "foryou": {
      const [movie, tv] = await Promise.all([
        getRankedForYou("movie").catch(() => []),
        getRankedForYou("tv").catch(() => []),
      ]);
      return mixShelf(movie.map(cardFromRanked), tv.map(cardFromRanked));
    }
    case "rail": {
      const [film, serie] = await Promise.all([getHomeRails("movie"), getHomeRails("tv")]);
      const f = film.find((r) => r.key === k.key)?.items ?? [];
      const s = serie.find((r) => r.key === k.key)?.items ?? [];
      return mixShelf(f.map(cardFromRanked), s.map(cardFromRanked));
    }
    case "because": {
      const [lista, owned] = await Promise.all([
        getBecauseShelf(k.mediaType, k.titleId),
        getOwnedKeys(),
      ]);
      const [personale] = await personalizeSimilar([lista], owned);
      const conVoto = await withScores(personale.map(cardFromSimilar));
      return conVoto.map((c) => ({ ...c, zappScore: c.score ?? c.zappScore, zappVotes: c.votes ?? 0 }));
    }
    case "topten":
      return (await getProviderChart(8).catch(() => [])).map(cardFromChart);
    case "want": {
      const { want } = await getHomeData();
      return want.map(cardFromEntry);
    }
    case "platform": {
      const shelf = (await getPlatformShelves()).find((p) => p.id === k.providerId);
      if (!shelf) return [];
      const conVoto = await withScores(mixShelf(shelf.movie, shelf.tv).map(cardFromShelf));
      return conVoto.map((c) => ({ ...c, zappScore: c.score ?? null, zappVotes: c.votes ?? 0, providerIds: [k.providerId] }));
    }
    case "toprated": {
      const [movie, tv] = await Promise.all([
        getTopRatedOnZapp("movie").catch(() => []),
        getTopRatedOnZapp("tv").catch(() => []),
      ]);
      return mixShelf(movie.map(cardFromChart), tv.map(cardFromChart));
    }
    case "comingsoon":
      return (await getComingSoon()).map(cardFromShelf);
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ key: string }> },
) {
  const { key } = await params;
  const parsed = parseShelfKey(key);
  if (!parsed) return tvJson({ error: "Scaffale sconosciuto" }, { status: 404 });
  return withBearer(request, async () => tvJson({ key, items: await items(parsed) }));
}

export const dynamic = "force-dynamic";
```

`withScores` ritorna `Scored<T>` con `score`/`votes`: leggere `src/lib/ratings/cards.ts` e adeguare i due nomi se differiscono. `mixShelf` e' generico su `ShelfItem`-like (`id`, `mediaType`): se il vincolo di tipo non accetta `TitleCard`, allargare il vincolo in `shelves.ts` a `{ mediaType: "movie" | "tv" }` (una riga, retrocompatibile).

- [ ] **Step 6: `/providers`**

`src/app/api/tv/v1/providers/route.ts`:

```ts
import type { NextRequest } from "next/server";
import { getProviderList } from "@/lib/tmdb/client";
import { tvJson, withBearer } from "@/lib/tv/bearer";

/** Catalogo piattaforme IT (nome, logo): la TV lo tiene in memoria per le pillole. */
export async function GET(request: NextRequest) {
  return withBearer(request, async () => {
    const lista = await getProviderList().catch(() => []);
    return tvJson({
      providers: lista.map((p) => ({
        id: p.provider_id,
        name: p.provider_name,
        logoPath: p.logo_path ?? null,
      })),
    });
  });
}

export const dynamic = "force-dynamic";
```

- [ ] **Step 7: Collaudo**

```bash
for k in foryou topten want platform:8 toprated comingsoon; do
  printf "%s: " $k; curl -s "http://localhost:3400/api/tv/v1/home/shelf/$k" -H "Authorization: Bearer $ACCESS" -H "X-Zapp-Device: $DEVICE" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(JSON.parse(s).items.length))"
done
curl -s "http://localhost:3400/api/tv/v1/home/shelf/because:book:1" -H "Authorization: Bearer $ACCESS" -H "X-Zapp-Device: $DEVICE"   # 404
```

- [ ] **Step 8: Verificare e commit**

Run: `pnpm typecheck && pnpm lint && pnpm test`

```bash
git add src/lib/tv/shelf-key.ts src/lib/tv/shelf-key.test.ts "src/app/api/tv/v1/home/shelf/[key]/route.ts" src/app/api/tv/v1/providers/route.ts src/lib/home/shelves.ts
git commit -m "feat(tv): GET /home/shelf/{key} e /providers"
```

---

### Task 8: `GET /library` e `GET /search`

**Files:**
- Create: `src/lib/search/instant.ts`
- Modify: `src/app/api/search/route.ts` (usa `instantSearch`)
- Create: `src/app/api/tv/v1/library/route.ts`
- Create: `src/app/api/tv/v1/search/route.ts`
- Test: `src/lib/tv/library-params.test.ts`, Create: `src/lib/tv/library-params.ts`

**Interfaces:**
- Produces: `instantSearch(query: string): Promise<SearchItem[]>` (la stessa lista che oggi la rotta web mette in `results`); `parseLibraryParams(sp: URLSearchParams): { status: WatchStatus; mediaType: MediaType | null; offset: number; limit: number }`.
- Consumes: `getLibraryPage`, `cardFromLibrary`, `LIBRARY_PAGE_SIZE` (`src/app/(app)/library/limits.ts`).

- [ ] **Step 1: Test dei parametri**

`src/lib/tv/library-params.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { parseLibraryParams } from "./library-params";

const sp = (q: string) => new URLSearchParams(q);

describe("parseLibraryParams", () => {
  it("default: in corso, tutti, prima pagina", () => {
    expect(parseLibraryParams(sp(""))).toEqual({ status: "watching", mediaType: null, offset: 0, limit: 60 });
  });
  it("legge stato, tipo e pagina", () => {
    expect(parseLibraryParams(sp("status=watched&type=tv&offset=120&limit=30"))).toEqual({
      status: "watched",
      mediaType: "tv",
      offset: 120,
      limit: 30,
    });
  });
  it("tetto e valori sporchi", () => {
    const p = parseLibraryParams(sp("status=boh&type=x&offset=-5&limit=999"));
    expect(p).toEqual({ status: "watching", mediaType: null, offset: 0, limit: 60 });
  });
});
```

- [ ] **Step 2: Run, deve fallire**

Run: `pnpm test -- src/lib/tv/library-params`

- [ ] **Step 3: `library-params.ts`**

```ts
import { isIntInRange, isMediaType } from "@/lib/validate";
import type { MediaType, WatchStatus } from "./dto";

const STATI: WatchStatus[] = ["watching", "want", "watched", "dropped"];
/** Stesso passo della griglia web (`LIBRARY_PAGE_SIZE`). */
export const LIMITE_MAX = 60;

export function parseLibraryParams(sp: URLSearchParams): {
  status: WatchStatus;
  mediaType: MediaType | null;
  offset: number;
  limit: number;
} {
  const status = sp.get("status");
  const type = sp.get("type");
  const offset = Number(sp.get("offset") ?? 0);
  const limit = Number(sp.get("limit") ?? LIMITE_MAX);
  return {
    status: STATI.includes(status as WatchStatus) ? (status as WatchStatus) : "watching",
    mediaType: isMediaType(type) ? type : null,
    offset: isIntInRange(offset, 0, 100000) ? offset : 0,
    limit: isIntInRange(limit, 1, LIMITE_MAX) ? limit : LIMITE_MAX,
  };
}
```

- [ ] **Step 4: Run, deve passare; poi la rotta libreria**

`src/app/api/tv/v1/library/route.ts`:

```ts
import type { NextRequest } from "next/server";
import { getLibraryPage } from "@/lib/watch/queries";
import { tvJson, withBearer } from "@/lib/tv/bearer";
import { cardFromLibrary } from "@/lib/tv/map";
import { parseLibraryParams } from "@/lib/tv/library-params";

export async function GET(request: NextRequest) {
  const p = parseLibraryParams(request.nextUrl.searchParams);
  return withBearer(request, async () => {
    const page = await getLibraryPage(p.status, p.mediaType, p.offset, p.limit);
    return tvJson({ items: page.items.map(cardFromLibrary), total: page.total });
  });
}

export const dynamic = "force-dynamic";
```

- [ ] **Step 5: Estrarre la ricerca istantanea**

Creare `src/lib/search/instant.ts` spostando **tutto** il corpo di `GET` di `src/app/api/search/route.ts` dopo il controllo del viewer (da `const search = await searchMulti(query)` fino alla costruzione della lista) in:

```ts
import "server-only";

import { searchMulti } from "@/lib/tmdb/client";
import { searchResultTitle, searchResultYear, type SearchItem } from "@/lib/tmdb/mappers";
import { createClient } from "@/lib/supabase/server";
import { getRatings, ratingKey } from "@/lib/ratings/queries";

const RESULT_LIMIT = 20;

/**
 * Una chiamata TMDB (cache Next 5 min per query) piu' una query batch sui provider
 * gia' in cache. Condivisa dalla rotta web `/api/search` e da `/api/tv/v1/search`.
 */
export async function instantSearch(query: string): Promise<SearchItem[]> {
  // <corpo copiato tale e quale dalla rotta: searchMulti, filtro movie/tv, slice,
  //  title_providers batch, getRatings, mappa in SearchItem>
}
```

e riscrivere `src/app/api/search/route.ts` come:

```ts
export async function GET(request: NextRequest) {
  const user = await getViewer();
  if (!user) return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
  const query = request.nextUrl.searchParams.get("q")?.trim();
  if (!query || query.length < 2) return NextResponse.json({ results: [] });
  try {
    return NextResponse.json({ results: await instantSearch(query) });
  } catch (error) {
    console.error("[search]", error);
    return NextResponse.json({ error: "Ricerca non riuscita" }, { status: 502 });
  }
}
```

(mantenendo il try/catch e il messaggio d'errore che la rotta ha oggi: leggerla prima e conservare la forma della risposta, perche' la pagina `/search` la consuma). `SearchItem` si legge da `src/lib/tmdb/mappers.ts`: i campi che servono alla TV sono `id`, `mediaType`, `title`, `year`, `posterPath`, piu' provider e voto se la rotta li aggiunge.

- [ ] **Step 6: La rotta di ricerca TV**

`src/app/api/tv/v1/search/route.ts`:

```ts
import type { NextRequest } from "next/server";
import { instantSearch } from "@/lib/search/instant";
import { tvJson, withBearer } from "@/lib/tv/bearer";
import { annoDa } from "@/lib/tv/map";
import type { TitleCard } from "@/lib/tv/dto";

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (q.length < 2 || q.length > 100) return tvJson({ results: [] });
  return withBearer(request, async () => {
    try {
      const results = await instantSearch(q);
      const cards: TitleCard[] = results.map((r) => ({
        id: r.id,
        mediaType: r.mediaType,
        name: r.title,
        year: annoDa(r.year),
        posterPath: r.posterPath ?? null,
        backdropPath: null,
        zappScore: r.score ?? null,
        zappVotes: r.votes ?? 0,
        affinity: null,
        reason: null,
        providerIds: r.providerIds ?? [],
      }));
      return tvJson({ results: cards });
    } catch (error) {
      console.error("[tv] search", error);
      return tvJson({ error: "Ricerca non riuscita" }, { status: 502 });
    }
  });
}

export const dynamic = "force-dynamic";
```

Adeguare i nomi dei campi (`score`, `votes`, `providerIds`, `posterPath`) a quelli veri di `SearchItem` dopo averlo letto.

- [ ] **Step 7: Collaudo**

```bash
curl -s "http://localhost:3400/api/tv/v1/library?status=watched&limit=5" -H "Authorization: Bearer $ACCESS" -H "X-Zapp-Device: $DEVICE"
curl -s "http://localhost:3400/api/tv/v1/search?q=dune" -H "Authorization: Bearer $ACCESS" -H "X-Zapp-Device: $DEVICE"
curl -s "http://localhost:3400/api/search?q=dune" -b "<cookie di sessione del browser>"   # la rotta web risponde come prima
```

- [ ] **Step 8: Verificare e commit**

Run: `pnpm typecheck && pnpm lint && pnpm test`

```bash
git add src/lib/search/instant.ts src/app/api/search/route.ts src/lib/tv/library-params.ts src/lib/tv/library-params.test.ts src/app/api/tv/v1/library src/app/api/tv/v1/search
git commit -m "feat(tv): GET /library e /search (ricerca istantanea condivisa col sito)"
```

---

### Task 9: `GET /title/{type}/{id}`

**Files:**
- Create: `src/lib/tv/detail.ts` (puro: `toTitleDetail`)
- Test: `src/lib/tv/detail.test.ts`
- Create: `src/lib/tv/title.ts` (server-only: compone i loader)
- Create: `src/app/api/tv/v1/title/[type]/[id]/route.ts`

**Interfaces:**
- Produces: `toTitleDetail(input: DetailInput): TitleDetail` con `DetailInput { title: TitleRow; providers: TitleProviderRow[]; links: Map<number, { url: string }>; entry: EntryRow | null; trailerId: string | null; similar: TitleCard[]; palette: { primary: string; secondary: string } | null; zapp: { score: number | null; votes: number } | null }`; `loadTitleDetail(id, mediaType): Promise<TitleDetail | null>`.
- Consumes: `getTitleCached`, `resolveProviderLinks`, `formaDiLancio`, `PROVIDER_LANCIABILI`, `getOfficialTrailers`, `getSimilarTitles`, `getPosterPalette`, `scoreMap`, `nextEpisode`/`availableSeasons`, `cardFromSimilar`.

- [ ] **Step 1: Test del mapper puro**

`src/lib/tv/detail.test.ts` (fixture minima di una riga `titles` con `raw` a mano):

```ts
import { describe, expect, it } from "vitest";
import { toTitleDetail } from "./detail";

const title = {
  id: 1399,
  media_type: "tv",
  title: "Il Trono di Spade",
  original_title: "Game of Thrones",
  overview: "Nove famiglie…",
  poster_path: "/p.jpg",
  backdrop_path: "/b.jpg",
  release_date: "2011-04-17",
  vote_average: 8.4,
  vote_count: 20000,
  genres: [{ id: 18, name: "Dramma" }, { id: 10765, name: "Sci-Fi & Fantasy" }],
  runtime: 60,
  number_of_seasons: 8,
  number_of_episodes: 73,
  seasons: [
    { season_number: 0, name: "Speciali", episode_count: 10, air_date: null, poster_path: null },
    { season_number: 1, name: "Stagione 1", episode_count: 10, air_date: "2011-04-17", poster_path: "/s1.jpg" },
    { season_number: 2, name: "Stagione 2", episode_count: 10, air_date: "2012-04-01", poster_path: null },
  ],
  raw: {
    tagline: "L'inverno sta arrivando",
    credits: { cast: [{ name: "Emilia Clarke", character: "Daenerys", profile_path: "/e.jpg" }] },
  },
  fetched_at: "2026-09-01T00:00:00Z",
  external_ids: null,
} as never;

const providers = [
  { title_id: 1399, media_type: "tv", provider_id: 8, provider_name: "Netflix", logo_path: "/n.jpg", kind: "flatrate" },
  { title_id: 1399, media_type: "tv", provider_id: 39, provider_name: "NOW", logo_path: "/w.jpg", kind: "flatrate" },
] as never;

describe("toTitleDetail", () => {
  it("compone scheda, offerte lanciabili, stagioni senza speciali e prossimo episodio", () => {
    const d = toTitleDetail({
      title,
      providers,
      links: new Map([[8, { url: "https://www.netflix.com/title/70143836" }]]),
      entry: { status: "watching", rating: 9, season_number: 1, episode_number: 3, position_ms: null, position_season: null, position_episode: null } as never,
      trailerId: "abc123",
      similar: [],
      palette: { primary: "#112233", secondary: "#445566" },
      zapp: { score: 9.1, votes: 500 },
    });
    expect(d.name).toBe("Il Trono di Spade");
    expect(d.originalName).toBe("Game of Thrones");
    expect(d.tagline).toBe("L'inverno sta arrivando");
    expect(d.genres).toEqual(["Dramma", "Sci-Fi & Fantasy"]);
    expect(d.cast[0]).toEqual({ name: "Emilia Clarke", character: "Daenerys", profilePath: "/e.jpg" });
    expect(d.trailer).toEqual({ youtubeId: "abc123" });
    expect(d.providers.map((p) => [p.id, p.canLaunch, p.expected])).toEqual([
      [8, true, "avvia"],
      [39, true, "app"],
    ]);
    expect(d.providers[0].url).toBe("https://www.netflix.com/title/70143836");
    expect(d.seasons.map((s) => s.number)).toEqual([1, 2]);
    expect(d.seasons[0].watched).toBe(3);
    expect(d.entry).toEqual({ status: "watching", rating: 9, season: 1, episode: 3, next: { season: 1, episode: 4 } });
    expect(d.zappScore).toBe(9.1);
    expect(d.palette).toEqual({ primary: "#112233", secondary: "#445566" });
  });

  it("film senza entry: niente stagioni, next nullo, offerte senza link non lanciabili", () => {
    const film = { ...title, id: 27205, media_type: "movie", title: "Inception", seasons: null, runtime: 148 } as never;
    const d = toTitleDetail({
      title: film,
      providers: [{ title_id: 27205, media_type: "movie", provider_id: 8, provider_name: "Netflix", logo_path: null, kind: "flatrate" }] as never,
      links: new Map(),
      entry: null,
      trailerId: null,
      similar: [],
      palette: null,
      zapp: null,
    });
    expect(d.seasons).toEqual([]);
    expect(d.entry).toBeNull();
    expect(d.runtimeMin).toBe(148);
    expect(d.providers[0].canLaunch).toBe(false);
    expect(d.trailer).toBeNull();
  });
});
```

- [ ] **Step 2: Run, deve fallire**

Run: `pnpm test -- src/lib/tv/detail`

- [ ] **Step 3: `detail.ts`**

```ts
import { formaDiLancio } from "@/lib/devices/launch";
import { availableSeasons, nextEpisode } from "@/lib/watch/episodes";
import type { Tables } from "@/types/database";
import type { ProviderOffer, SeasonSummary, TitleCard, TitleDetail, UserEntry } from "./dto";
import { annoDa } from "./map";

type TitleRow = Tables<"titles">;
type ProviderRow = Tables<"title_providers">;
type EntryRow = Pick<
  Tables<"watch_entries">,
  "status" | "rating" | "season_number" | "episode_number" | "position_ms" | "position_season" | "position_episode"
>;

export interface DetailInput {
  title: TitleRow;
  providers: ProviderRow[];
  /** Link https per provider, gia' risolti (solo quelli trovati). */
  links: Map<number, { url: string }>;
  entry: EntryRow | null;
  trailerId: string | null;
  similar: TitleCard[];
  palette: { primary: string; secondary: string } | null;
  zapp: { score: number | null; votes: number } | null;
}

const KINDS: ProviderOffer["kind"][] = ["flatrate", "rent", "buy", "free", "ads"];

function raw(title: TitleRow): Record<string, unknown> {
  return typeof title.raw === "object" && title.raw !== null ? (title.raw as Record<string, unknown>) : {};
}

function cast(title: TitleRow): TitleDetail["cast"] {
  const credits = raw(title).credits as { cast?: unknown } | undefined;
  const lista = Array.isArray(credits?.cast) ? credits.cast : [];
  return lista.slice(0, 12).map((c) => {
    const p = c as { name?: unknown; character?: unknown; profile_path?: unknown };
    return {
      name: typeof p.name === "string" ? p.name : "",
      character: typeof p.character === "string" ? p.character : null,
      profilePath: typeof p.profile_path === "string" ? p.profile_path : null,
    };
  });
}

function genres(title: TitleRow): string[] {
  return Array.isArray(title.genres)
    ? title.genres
        .map((g) => (g as { name?: unknown }).name)
        .filter((n): n is string => typeof n === "string")
    : [];
}

function offerte(input: DetailInput): ProviderOffer[] {
  const viste = new Set<number>();
  const out: ProviderOffer[] = [];
  for (const kind of KINDS) {
    for (const p of input.providers) {
      if (p.kind !== kind || viste.has(p.provider_id)) continue;
      viste.add(p.provider_id);
      const url = input.links.get(p.provider_id)?.url ?? null;
      const forma = formaDiLancio(p.provider_id, url);
      out.push({
        id: p.provider_id,
        name: p.provider_name,
        logoPath: p.logo_path ?? null,
        kind,
        canLaunch: forma !== null,
        expected: forma?.esito ?? null,
        url,
      });
    }
  }
  return out;
}

/** Episodi visti in una stagione, dalla coppia "ultimo episodio finito" dell'entry. */
function vistiNella(n: number, count: number, entry: EntryRow | null): number {
  if (!entry || entry.season_number == null) return 0;
  if (entry.season_number > n) return count;
  if (entry.season_number === n) return Math.min(count, entry.episode_number ?? 0);
  return 0;
}

function stagioni(title: TitleRow, entry: EntryRow | null): SeasonSummary[] {
  const lista = Array.isArray(title.seasons) ? title.seasons : [];
  return lista
    .map((s) => s as { season_number?: unknown; name?: unknown; episode_count?: unknown; air_date?: unknown; poster_path?: unknown })
    .filter((s) => typeof s.season_number === "number" && s.season_number > 0)
    .map((s) => {
      const count = typeof s.episode_count === "number" ? s.episode_count : 0;
      return {
        number: s.season_number as number,
        name: typeof s.name === "string" ? s.name : `Stagione ${s.season_number}`,
        episodeCount: count,
        airDate: typeof s.air_date === "string" ? s.air_date : null,
        posterPath: typeof s.poster_path === "string" ? s.poster_path : null,
        watched: vistiNella(s.season_number as number, count, entry),
      };
    });
}

function utente(title: TitleRow, entry: EntryRow | null): UserEntry | null {
  if (!entry) return null;
  let next: UserEntry["next"] = null;
  if (title.media_type === "tv") {
    const seasons = availableSeasons(title.seasons);
    const n = nextEpisode(seasons, entry.season_number, entry.episode_number);
    if (n) next = { season: n.season, episode: n.episode };
  }
  return {
    status: entry.status,
    rating: entry.rating,
    season: entry.season_number,
    episode: entry.episode_number,
    next,
  };
}

export function toTitleDetail(input: DetailInput): TitleDetail {
  const t = input.title;
  const r = raw(t);
  return {
    id: t.id,
    mediaType: t.media_type,
    name: t.title,
    year: annoDa(t.release_date),
    posterPath: t.poster_path,
    backdropPath: t.backdrop_path,
    zappScore: input.zapp?.score ?? null,
    zappVotes: input.zapp?.votes ?? 0,
    affinity: null,
    reason: null,
    providerIds: input.providers.filter((p) => p.kind === "flatrate").map((p) => p.provider_id),
    originalName: t.original_title,
    overview: t.overview,
    tagline: typeof r.tagline === "string" && r.tagline ? r.tagline : null,
    genres: genres(t),
    runtimeMin: t.runtime,
    releaseDate: t.release_date,
    tmdbRating: t.vote_average,
    cast: cast(t),
    trailer: input.trailerId ? { youtubeId: input.trailerId } : null,
    providers: offerte(input),
    entry: utente(t, input.entry),
    seasons: t.media_type === "tv" ? stagioni(t, input.entry) : [],
    similar: input.similar,
    palette: input.palette,
  };
}
```

Verificare contro il codice: la firma di `nextEpisode` (`src/lib/watch/episodes.ts:64`) e la forma che ritorna (`{season, episode}`?); `availableSeasons(rawOrSeasons)`; i nomi delle colonne `titles.genres`/`seasons`/`runtime`/`original_title`; `title_providers.kind` e i suoi valori. Adeguare il mapper e la fixture del test, non i tipi sorgente.

- [ ] **Step 4: Run, deve passare**

Run: `pnpm test -- src/lib/tv/detail`

- [ ] **Step 5: `title.ts` (compone i loader)**

```ts
import "server-only";

import { getViewer } from "@/lib/auth/viewer";
import { getPosterPalette } from "@/lib/colors/palette";
import { PROVIDER_LANCIABILI } from "@/lib/devices/launch";
import { resolveProviderLinks } from "@/lib/links/resolve";
import { ratingKey, scoreMap } from "@/lib/ratings/cards";
import { getSimilarTitles } from "@/lib/similar/similar";
import { createClient } from "@/lib/supabase/server";
import { getTitleCached } from "@/lib/tmdb/get-title";
import { getOfficialTrailers } from "@/lib/trailers/official";
import type { MediaType, TitleDetail } from "./dto";
import { toTitleDetail } from "./detail";
import { cardFromSimilar } from "./map";

function hex([r, g, b]: [number, number, number]): string {
  return "#" + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("");
}

/** Gli stessi loader della pagina scheda (`TitleBody.tsx`), in parallelo. */
export async function loadTitleDetail(id: number, mediaType: MediaType): Promise<TitleDetail | null> {
  const cached = await getTitleCached(id, mediaType, true);
  if (!cached) return null;
  const viewer = await getViewer();
  const supabase = await createClient();

  const providerIds = cached.providers.map((p) => p.provider_id);
  const [links, entry, trailers, similar, palette, voti] = await Promise.all([
    resolveProviderLinks(cached.title, providerIds).catch(() => new Map()),
    viewer
      ? supabase
          .from("watch_entries")
          .select("status, rating, season_number, episode_number, position_ms, position_season, position_episode")
          .eq("user_id", viewer.id)
          .eq("title_id", id)
          .eq("media_type", mediaType)
          .maybeSingle()
          .then((r) => r.data ?? null)
      : Promise.resolve(null),
    getOfficialTrailers({ id, mediaType, name: cached.title.title, year: cached.title.release_date?.slice(0, 4) ?? null }).catch(() => []),
    getSimilarTitles(id, mediaType, 12).catch(() => []),
    getPosterPalette(cached.title.poster_path).catch(() => null),
    scoreMap([{ id, mediaType }]).catch(() => new Map()),
  ]);

  const voto = voti.get(ratingKey(id, mediaType));
  return toTitleDetail({
    title: cached.title,
    providers: cached.providers,
    links,
    entry,
    trailerId: trailers[0]?.key ?? null,
    similar: similar.map(cardFromSimilar),
    palette: palette ? { primary: hex(palette.primary), secondary: hex(palette.secondary) } : null,
    zapp: voto ? { score: voto.score, votes: voto.votes } : null,
  });
}
```

`getOfficialTrailers` prende un `OfficialTrailerRequest` (`src/lib/trailers/official.ts`): leggerne i campi e passare esattamente quelli (id, tipo, nome, anno, stagione). Si passano **tutti** i `providerIds` al resolver (decide da solo cosa risolvere e cosa ha gia' in cache); l'import di `PROVIDER_LANCIABILI` va tolto se resta inutilizzato.

- [ ] **Step 6: La rotta**

`src/app/api/tv/v1/title/[type]/[id]/route.ts`:

```ts
import type { NextRequest } from "next/server";
import { isMediaType, isTmdbId } from "@/lib/validate";
import { tvJson, withBearer } from "@/lib/tv/bearer";
import { loadTitleDetail } from "@/lib/tv/title";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ type: string; id: string }> },
) {
  const { type, id } = await params;
  const numId = Number(id);
  if (!isMediaType(type) || !isTmdbId(numId)) {
    return tvJson({ error: "Richiesta non valida" }, { status: 400 });
  }
  return withBearer(request, async () => {
    const detail = await loadTitleDetail(numId, type);
    if (!detail) return tvJson({ error: "Titolo non trovato" }, { status: 404 });
    return tvJson(detail);
  });
}

export const dynamic = "force-dynamic";
```

- [ ] **Step 7: Collaudo**

```bash
curl -s http://localhost:3400/api/tv/v1/title/tv/1399 -H "Authorization: Bearer $ACCESS" -H "X-Zapp-Device: $DEVICE" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const j=JSON.parse(s);console.log(j.name,j.providers.map(p=>p.name+':'+p.expected),j.seasons.length,'stagioni',j.similar.length,'simili',j.trailer)})"
curl -s http://localhost:3400/api/tv/v1/title/movie/27205 -H "Authorization: Bearer $ACCESS" -H "X-Zapp-Device: $DEVICE" | head -c 600
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3400/api/tv/v1/title/book/1 -H "Authorization: Bearer $ACCESS" -H "X-Zapp-Device: $DEVICE"   # 400
```

- [ ] **Step 8: Verificare e commit**

Run: `pnpm typecheck && pnpm lint && pnpm test`

```bash
git add src/lib/tv/detail.ts src/lib/tv/detail.test.ts src/lib/tv/title.ts "src/app/api/tv/v1/title/[type]/[id]/route.ts"
git commit -m "feat(tv): GET /title/{type}/{id} con offerte lanciabili, trailer, simili, entry"
```

---

### Task 10: `GET /title/tv/{id}/season/{n}`

**Files:**
- Create: `src/lib/tv/season.ts` (puro: `toSeasonDetail`)
- Test: `src/lib/tv/season.test.ts`
- Create: `src/app/api/tv/v1/title/tv/[id]/season/[n]/route.ts`

**Interfaces:**
- Produces: `toSeasonDetail(season: TmdbSeasonDetails, entry: EntryRow | null): SeasonDetail`.
- Consumes: `getSeason(tvId, n)` (`src/lib/tmdb/client.ts:498`), `getTitleCached`, `EntryRow` (come Task 9).

- [ ] **Step 1: Test**

`src/lib/tv/season.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { toSeasonDetail } from "./season";

const season = {
  season_number: 2,
  name: "Stagione 2",
  overview: "La guerra…",
  episodes: [
    { episode_number: 1, name: "Il Nord ricorda", overview: "…", still_path: "/e1.jpg", air_date: "2012-04-01", runtime: 53 },
    { episode_number: 2, name: "Le terre della notte", overview: null, still_path: null, air_date: "2012-04-08", runtime: null },
    { episode_number: 3, name: "Ciò che è morto non muoia", overview: "…", still_path: "/e3.jpg", air_date: "2012-04-15", runtime: 53 },
  ],
} as never;

describe("toSeasonDetail", () => {
  it("spunta gli episodi fino all'ultimo finito e mette il minuto sull'episodio in corso", () => {
    const d = toSeasonDetail(season, {
      status: "watching",
      rating: null,
      season_number: 2,
      episode_number: 1,
      position_ms: 600000,
      position_season: 2,
      position_episode: 2,
    } as never);
    expect(d.number).toBe(2);
    expect(d.episodes.map((e) => e.watched)).toEqual([true, false, false]);
    expect(d.episodes[1].resumeMs).toBe(600000);
    expect(d.episodes[0].resumeMs).toBeNull();
    expect(d.episodes[0].runtimeMin).toBe(53);
  });
  it("stagione precedente tutta vista, successiva niente", () => {
    const vista = toSeasonDetail(season, { status: "watching", rating: null, season_number: 3, episode_number: 1, position_ms: null, position_season: null, position_episode: null } as never);
    expect(vista.episodes.every((e) => e.watched)).toBe(true);
    const futura = toSeasonDetail(season, { status: "watching", rating: null, season_number: 1, episode_number: 9, position_ms: null, position_season: null, position_episode: null } as never);
    expect(futura.episodes.some((e) => e.watched)).toBe(false);
  });
  it("senza entry niente spunte", () => {
    expect(toSeasonDetail(season, null).episodes.every((e) => !e.watched)).toBe(true);
  });
});
```

- [ ] **Step 2: Run, deve fallire**

Run: `pnpm test -- src/lib/tv/season`

- [ ] **Step 3: `season.ts`**

```ts
import type { TmdbSeasonDetails } from "@/lib/tmdb/types";
import type { Tables } from "@/types/database";
import type { SeasonDetail } from "./dto";

type EntryRow = Pick<
  Tables<"watch_entries">,
  "status" | "rating" | "season_number" | "episode_number" | "position_ms" | "position_season" | "position_episode"
>;

/**
 * Stessa regola della pagina stagione: `season_number`/`episode_number` sono
 * "l'ultimo episodio finito", `position_*` e' "dove sei adesso" (mai confonderli:
 * `docs/architecture/zconnection.md`).
 */
export function toSeasonDetail(season: TmdbSeasonDetails, entry: EntryRow | null): SeasonDetail {
  const n = season.season_number;
  const vistoFino = (() => {
    if (!entry || entry.season_number == null) return 0;
    if (entry.season_number > n) return Number.MAX_SAFE_INTEGER;
    if (entry.season_number === n) return entry.episode_number ?? 0;
    return 0;
  })();
  const inCorso =
    entry?.position_ms != null && entry.position_season === n ? entry.position_episode : null;

  return {
    number: n,
    name: season.name ?? `Stagione ${n}`,
    overview: season.overview || null,
    episodes: (season.episodes ?? []).map((e) => ({
      number: e.episode_number,
      name: e.name ?? `Episodio ${e.episode_number}`,
      overview: e.overview || null,
      stillPath: e.still_path ?? null,
      airDate: e.air_date ?? null,
      runtimeMin: typeof e.runtime === "number" ? e.runtime : null,
      watched: e.episode_number <= vistoFino,
      resumeMs: inCorso === e.episode_number ? (entry?.position_ms ?? null) : null,
    })),
  };
}
```

Verificare i nomi in `TmdbSeasonDetails`/episodi (`src/lib/tmdb/types.ts`): `runtime` puo' non esistere nel tipo (allora leggerlo come `(e as { runtime?: unknown }).runtime`).

- [ ] **Step 4: Run, deve passare**

Run: `pnpm test -- src/lib/tv/season`

- [ ] **Step 5: La rotta**

`src/app/api/tv/v1/title/tv/[id]/season/[n]/route.ts`:

```ts
import type { NextRequest } from "next/server";
import { getViewer } from "@/lib/auth/viewer";
import { createClient } from "@/lib/supabase/server";
import { getSeason } from "@/lib/tmdb/client";
import { getTitleCached } from "@/lib/tmdb/get-title";
import { isIntInRange, isTmdbId } from "@/lib/validate";
import { tvJson, withBearer } from "@/lib/tv/bearer";
import { toSeasonDetail } from "@/lib/tv/season";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; n: string }> },
) {
  const { id, n } = await params;
  const tvId = Number(id);
  const numero = Number(n);
  if (!isTmdbId(tvId) || !isIntInRange(numero, 1, 200)) {
    return tvJson({ error: "Richiesta non valida" }, { status: 400 });
  }
  return withBearer(request, async (ctx) => {
    const cached = await getTitleCached(tvId, "tv", false);
    if (!cached) return tvJson({ error: "Titolo non trovato" }, { status: 404 });
    const supabase = await createClient();
    const [season, { data: entry }] = await Promise.all([
      getSeason(tvId, numero).catch(() => null),
      supabase
        .from("watch_entries")
        .select("status, rating, season_number, episode_number, position_ms, position_season, position_episode")
        .eq("user_id", ctx.userId)
        .eq("title_id", tvId)
        .eq("media_type", "tv")
        .maybeSingle(),
    ]);
    if (!season) return tvJson({ error: "Stagione non trovata" }, { status: 404 });
    return tvJson(toSeasonDetail(season, entry ?? null));
  });
}

export const dynamic = "force-dynamic";
```

(`getViewer` importato solo se serve; se non usato, toglierlo: lint fallisce sugli import inutilizzati.)

- [ ] **Step 6: Collaudo**

```bash
curl -s http://localhost:3400/api/tv/v1/title/tv/1399/season/1 -H "Authorization: Bearer $ACCESS" -H "X-Zapp-Device: $DEVICE" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const j=JSON.parse(s);console.log(j.name,j.episodes.length,'episodi',j.episodes.filter(e=>e.watched).length,'visti')})"
```

- [ ] **Step 7: Verificare e commit**

Run: `pnpm typecheck && pnpm lint && pnpm test`

```bash
git add src/lib/tv/season.ts src/lib/tv/season.test.ts "src/app/api/tv/v1/title/tv/[id]/season/[n]/route.ts"
git commit -m "feat(tv): GET /title/tv/{id}/season/{n} con spunte e minuto da riprendere"
```

---

### Task 11: `POST /watch`

**Files:**
- Create: `src/lib/tv/watch-body.ts` (puro)
- Test: `src/lib/tv/watch-body.test.ts`
- Create: `src/app/api/tv/v1/watch/route.ts`

**Interfaces:**
- Produces: `parseWatchBody(body: unknown): WatchBody | null` con `WatchBody { titleId: number; mediaType: MediaType; action: WatchAction; season: number | null; episode: number | null; rating: number | null }`; risposta = `ActionResult` di `src/lib/watch/actions.ts` (`{ ok, error?, prev, entry }`).
- Consumes: `addWant`, `startWatching`, `markWatched`, `dropTitle`, `removeEntry`, `setProgress`, `setRating` (`src/lib/watch/actions.ts`: leggere le firme esatte alle righe 185-336 prima di chiamarle).

- [ ] **Step 1: Test**

`src/lib/tv/watch-body.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { parseWatchBody } from "./watch-body";

describe("parseWatchBody", () => {
  it("azione semplice", () => {
    expect(parseWatchBody({ titleId: 27205, mediaType: "movie", action: "want" })).toEqual({
      titleId: 27205,
      mediaType: "movie",
      action: "want",
      season: null,
      episode: null,
      rating: null,
    });
  });
  it("episodio richiede stagione ed episodio su una serie", () => {
    expect(parseWatchBody({ titleId: 1399, mediaType: "tv", action: "episode", season: 2, episode: 5 })?.episode).toBe(5);
    expect(parseWatchBody({ titleId: 1399, mediaType: "tv", action: "episode" })).toBeNull();
    expect(parseWatchBody({ titleId: 27205, mediaType: "movie", action: "episode", season: 1, episode: 1 })).toBeNull();
  });
  it("rate richiede un voto 1-10", () => {
    expect(parseWatchBody({ titleId: 27205, mediaType: "movie", action: "rate", rating: 8 })?.rating).toBe(8);
    expect(parseWatchBody({ titleId: 27205, mediaType: "movie", action: "rate", rating: 11 })).toBeNull();
    expect(parseWatchBody({ titleId: 27205, mediaType: "movie", action: "rate" })).toBeNull();
  });
  it("rifiuta il resto", () => {
    expect(parseWatchBody(null)).toBeNull();
    expect(parseWatchBody({ titleId: -1, mediaType: "movie", action: "want" })).toBeNull();
    expect(parseWatchBody({ titleId: 1, mediaType: "book", action: "want" })).toBeNull();
    expect(parseWatchBody({ titleId: 1, mediaType: "movie", action: "explode" })).toBeNull();
  });
});
```

- [ ] **Step 2: Run, deve fallire**

Run: `pnpm test -- src/lib/tv/watch-body`

- [ ] **Step 3: `watch-body.ts`**

```ts
import { isIntInRange, isMediaType, isTmdbId } from "@/lib/validate";
import type { MediaType, WatchAction } from "./dto";

export interface WatchBody {
  titleId: number;
  mediaType: MediaType;
  action: WatchAction;
  season: number | null;
  episode: number | null;
  rating: number | null;
}

const AZIONI: WatchAction[] = ["want", "watching", "watched", "drop", "remove", "episode", "rate"];

export function parseWatchBody(body: unknown): WatchBody | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  if (!isTmdbId(b.titleId) || !isMediaType(b.mediaType)) return null;
  if (typeof b.action !== "string" || !AZIONI.includes(b.action as WatchAction)) return null;
  const action = b.action as WatchAction;

  const season = isIntInRange(b.season, 1, 200) ? b.season : null;
  const episode = isIntInRange(b.episode, 1, 2000) ? b.episode : null;
  const rating = isIntInRange(b.rating, 1, 10) ? b.rating : null;

  if (action === "episode" && (b.mediaType !== "tv" || season === null || episode === null)) return null;
  if (action === "rate" && rating === null) return null;

  return { titleId: b.titleId, mediaType: b.mediaType, action, season, episode, rating };
}
```

- [ ] **Step 4: Run, deve passare**

Run: `pnpm test -- src/lib/tv/watch-body`

- [ ] **Step 5: La rotta**

`src/app/api/tv/v1/watch/route.ts`:

```ts
import type { NextRequest } from "next/server";
import {
  addWant,
  dropTitle,
  markWatched,
  removeEntry,
  setProgress,
  setRating,
  startWatching,
  type ActionResult,
} from "@/lib/watch/actions";
import { tvJson, withBearer } from "@/lib/tv/bearer";
import { parseWatchBody, type WatchBody } from "@/lib/tv/watch-body";

/**
 * Le stesse Server Action della scheda web, chiamate come funzioni: leggono
 * l'utente da `getViewer()`, che dentro `withBearer` e' quello del token.
 */
async function esegui(b: WatchBody): Promise<ActionResult> {
  switch (b.action) {
    case "want":
      return addWant(b.titleId, b.mediaType);
    case "watching":
      return startWatching(b.titleId, b.mediaType);
    case "watched":
      return markWatched(b.titleId, b.mediaType);
    case "drop":
      return dropTitle(b.titleId, b.mediaType);
    case "remove":
      return removeEntry(b.titleId, b.mediaType);
    case "episode":
      return setProgress(b.titleId, b.season!, b.episode!);
    case "rate":
      return setRating(b.titleId, b.mediaType, b.rating!);
  }
}

export async function POST(request: NextRequest) {
  const body = parseWatchBody(await request.json().catch(() => null));
  if (!body) return tvJson({ error: "Richiesta non valida" }, { status: 400 });
  return withBearer(request, async () => {
    const esito = await esegui(body);
    return tvJson(esito, { status: esito.ok ? 200 : 400 });
  });
}

export const dynamic = "force-dynamic";
```

**Le firme vanno lette prima** (`src/lib/watch/actions.ts` righe 185-336): se `setProgress` prende anche `mediaType` o un oggetto, o `removeEntry` vuole `prev`, adeguare `esegui`. Le action chiamano `revalidatePath`: in un route handler e' lecito e innocuo.

- [ ] **Step 6: Collaudo**

```bash
curl -s -X POST http://localhost:3400/api/tv/v1/watch -H "Authorization: Bearer $ACCESS" -H "X-Zapp-Device: $DEVICE" -H "Content-Type: application/json" -d '{"titleId":27205,"mediaType":"movie","action":"want"}'
# atteso: {"ok":true,"prev":null,"entry":{"status":"want",...}}
curl -s -X POST http://localhost:3400/api/tv/v1/watch -H "Authorization: Bearer $ACCESS" -H "X-Zapp-Device: $DEVICE" -H "Content-Type: application/json" -d '{"titleId":27205,"mediaType":"movie","action":"remove"}'
# atteso: {"ok":true,...}; su /library nel browser il titolo compare e sparisce
```

- [ ] **Step 7: Verificare e commit**

Run: `pnpm typecheck && pnpm lint && pnpm test`

```bash
git add src/lib/tv/watch-body.ts src/lib/tv/watch-body.test.ts src/app/api/tv/v1/watch/route.ts
git commit -m "feat(tv): POST /watch sulle Server Action esistenti"
```

---

### Task 12: `POST /play`, `POST /play/result` e la regola della dichiarazione

**Files:**
- Create: `src/lib/scrobble/declared.ts` (puro)
- Test: `src/lib/scrobble/__tests__/declared.test.ts`
- Create: `src/app/api/tv/v1/play/route.ts`
- Create: `src/app/api/tv/v1/play/result/route.ts`

**Interfaces:**
- Produces: `Dichiarazione { titleId: number; mediaType: MediaType; deliveredAt: string; lastPositionMs: number | null; lastSeenAt: string | null }`; `FINESTRA_MS = 30 * 60 * 1000`; `dichiarazioneValida(d, positionMs, adesso): boolean`; `LaunchPlan` (Task 5) come risposta di `/play`.
- Consumes: `formaDiLancio` (`src/lib/devices/launch.ts`), `resolveProviderLinks`, `getTitleCached`, `isTmdbId`/`isMediaType`/`isIntInRange`/`isUuid`.

- [ ] **Step 1: Test della regola**

`src/lib/scrobble/__tests__/declared.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { dichiarazioneValida, FINESTRA_MS } from "../declared";

const base = {
  titleId: 1,
  mediaType: "movie" as const,
  deliveredAt: "2026-09-13T20:00:00.000Z",
  lastPositionMs: null,
  lastSeenAt: null,
};
const t = (min: number) => new Date(Date.parse(base.deliveredAt) + min * 60_000).toISOString();

describe("dichiarazioneValida", () => {
  it("vale nella finestra dopo la consegna", () => {
    expect(dichiarazioneValida(base, 0, t(1))).toBe(true);
    expect(dichiarazioneValida(base, 0, t(29))).toBe(true);
    expect(dichiarazioneValida(base, 0, t(31))).toBe(false);
  });
  it("ogni evento attribuito la tiene in vita", () => {
    const viva = { ...base, lastPositionMs: 1_800_000, lastSeenAt: t(29) };
    expect(dichiarazioneValida(viva, 1_830_000, t(58))).toBe(true);
    expect(dichiarazioneValida(viva, 1_830_000, t(60))).toBe(false);
  });
  it("una posizione che riparte da zero e' un altro titolo", () => {
    const viva = { ...base, lastPositionMs: 1_800_000, lastSeenAt: t(10) };
    expect(dichiarazioneValida(viva, 0, t(11))).toBe(false);
    // ma un riavvolgimento di poco resta lo stesso titolo
    expect(dichiarazioneValida(viva, 1_500_000, t(11))).toBe(true);
  });
  it("la finestra e' di trenta minuti", () => {
    expect(FINESTRA_MS).toBe(30 * 60 * 1000);
  });
});
```

- [ ] **Step 2: Run, deve fallire**

Run: `pnpm test -- declared`

- [ ] **Step 3: `declared.ts`**

```ts
/**
 * La dichiarazione: "su questa TV, su questa piattaforma, sta andando questo
 * titolo perche' l'ha lanciato Zapp". Serve alle piattaforme che non pubblicano
 * il titolo nei metadati (Netflix, Prime, app Apple TV: sonda del 12/09/2026).
 *
 * Pura. La riga sta in `device_commands` (`delivered_at`, `last_position_ms`,
 * `last_seen_at`); chi la legge e' l'ingest di `/api/scrobble` (Task 13).
 */
export interface Dichiarazione {
  titleId: number;
  mediaType: "movie" | "tv";
  deliveredAt: string;
  lastPositionMs: number | null;
  lastSeenAt: string | null;
}

/** Trenta minuti dall'ultimo evento attribuito (o dalla consegna). */
export const FINESTRA_MS = 30 * 60 * 1000;

/**
 * Un riavvolgimento sotto questa quota e' ancora lo stesso titolo; una posizione
 * che torna vicino a zero da molto piu' avanti e' un altro titolo scelto a mano
 * (l'episodio successivo su Netflix riparte da zero: la serie e' la stessa, e
 * l'ingest lo gestisce per stagione/episodio, non qui).
 */
const RIAVVOLGIMENTO_MAX_MS = 10 * 60 * 1000;

export function dichiarazioneValida(
  d: Dichiarazione,
  positionMs: number,
  adesso: string,
): boolean {
  const riferimento = Date.parse(d.lastSeenAt ?? d.deliveredAt);
  const ora = Date.parse(adesso);
  if (!Number.isFinite(riferimento) || !Number.isFinite(ora)) return false;
  if (ora - riferimento > FINESTRA_MS) return false;
  if (d.lastPositionMs != null && d.lastPositionMs - positionMs > RIAVVOLGIMENTO_MAX_MS) {
    return false;
  }
  return true;
}
```

- [ ] **Step 4: Run, deve passare**

Run: `pnpm test -- declared`

- [ ] **Step 5: `POST /play`**

`src/app/api/tv/v1/play/route.ts`:

```ts
import type { NextRequest } from "next/server";
import { formaDiLancio } from "@/lib/devices/launch";
import { resolveProviderLink } from "@/lib/links/resolve";
import { createClient } from "@/lib/supabase/server";
import { getTitleCached } from "@/lib/tmdb/get-title";
import { isIntInRange, isMediaType, isTmdbId } from "@/lib/validate";
import { tvJson, withBearer } from "@/lib/tv/bearer";
import type { LaunchPlan } from "@/lib/tv/dto";

/** Oltre due minuti il comando non ha piu' senso (spec ZConnection §6). */
const COMANDO_TTL_MS = 2 * 60 * 1000;

/**
 * La TV chiede come aprire un titolo su una piattaforma e, nello stesso gesto,
 * **dichiara** che sta per guardarlo: la riga di `device_commands` nasce gia'
 * consegnata (`delivered_at = now()`), perche' qui non c'e' nessuna coda da
 * sondare — e' la TV stessa a chiedere. Da questo momento gli eventi senza titolo
 * di quella TV valgono come questo titolo (`src/lib/scrobble/declared.ts`).
 */
export async function POST(request: NextRequest) {
  const b = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!b || !isTmdbId(b.titleId) || !isMediaType(b.mediaType) || !isIntInRange(b.providerId, 1, 999999)) {
    return tvJson({ error: "Richiesta non valida" }, { status: 400 });
  }
  const titleId = b.titleId;
  const mediaType = b.mediaType;
  const providerId = b.providerId;

  return withBearer(request, async (ctx) => {
    const cached = await getTitleCached(titleId, mediaType, false);
    if (!cached) return tvJson({ error: "Titolo non trovato" }, { status: 404 });

    const link = await resolveProviderLink(cached.title, providerId).catch(() => null);
    const forma = formaDiLancio(providerId, link?.url ?? null);
    if (!forma) return tvJson({ error: "Questa piattaforma non si apre dalla TV" }, { status: 409 });

    const supabase = await createClient();
    const adesso = new Date();
    const { data: riga, error } = await supabase
      .from("device_commands")
      .insert({
        device_id: ctx.deviceId,
        created_by: ctx.userId,
        title_id: titleId,
        media_type: mediaType,
        provider_id: providerId,
        packages: forma.packages,
        data_uri: forma.dataUri,
        extra_deeplink: forma.extraDeeplink,
        esito_atteso: forma.esito,
        expires_at: new Date(adesso.getTime() + COMANDO_TTL_MS).toISOString(),
        delivered_at: adesso.toISOString(),
      })
      .select("id")
      .single();
    if (error || !riga) {
      console.error("[tv] play: insert", error?.code);
      return tvJson({ error: "Non è riuscito, riprova." }, { status: 500 });
    }

    const piano: LaunchPlan = {
      commandId: riga.id,
      android: { packages: forma.packages, dataUri: forma.dataUri, extraDeeplink: forma.extraDeeplink },
      tvos: null,
      expected: forma.esito,
    };
    return tvJson(piano);
  });
}

export const dynamic = "force-dynamic";
```

`resolveProviderLink(title, providerId)` esiste (`src/lib/links/resolve.ts:166`): leggerne la firma e la forma del ritorno. L'insert passa dalla policy `device_commands_insert_own` (`created_by = auth.uid()` e membro del dispositivo): e' il controllo di proprieta' fatto dal DB, in aggiunta a quello di `withBearer`.

- [ ] **Step 6: `POST /play/result`**

`src/app/api/tv/v1/play/result/route.ts`:

```ts
import type { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isUuid } from "@/lib/validate";
import { tvJson, withBearer } from "@/lib/tv/bearer";

const ESITI = ["ok", "assente", "errore"] as const;

/** Com'e' andata secondo la TV: senza, un lancio fallito sarebbe muto. */
export async function POST(request: NextRequest) {
  const b = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!b || !isUuid(b.commandId) || !ESITI.includes(b.result as (typeof ESITI)[number])) {
    return tvJson({ error: "Richiesta non valida" }, { status: 400 });
  }
  return withBearer(request, async (ctx) => {
    const supabase = await createClient();
    const { error } = await supabase
      .from("device_commands")
      .update({ result: b.result as string })
      .eq("id", b.commandId as string)
      .eq("device_id", ctx.deviceId);
    if (error) {
      console.error("[tv] play/result", error.code);
      return tvJson({ error: "Non è riuscito, riprova." }, { status: 500 });
    }
    return tvJson({ ok: true });
  });
}

export const dynamic = "force-dynamic";
```

Serve una policy di **update** su `device_commands` per i membri (oggi ci sono solo select e insert: `supabase/migrations/0049_device_commands.sql`). Migrazione `0052_device_commands_update.sql`:

```sql
-- La TV riferisce l'esito del lancio e l'ingest aggiorna la dichiarazione:
-- entrambi per conto di un membro del dispositivo.
drop policy if exists device_commands_update_own on public.device_commands;
create policy device_commands_update_own on public.device_commands
  for update to authenticated
  using (
    exists (
      select 1 from public.device_members m
      where m.device_id = device_commands.device_id
        and m.user_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1 from public.device_members m
      where m.device_id = device_commands.device_id
        and m.user_id = (select auth.uid())
    )
  );
```

Applicarla via MCP (`apply_migration`, nome `0052_device_commands_update`) e rigenerare i tipi. (Se in Task 3 e' servita una `0052` per `device_members`, questa diventa `0053`.)

- [ ] **Step 7: Collaudo**

```bash
curl -s -X POST http://localhost:3400/api/tv/v1/play -H "Authorization: Bearer $ACCESS" -H "X-Zapp-Device: $DEVICE" -H "Content-Type: application/json" -d '{"titleId":1399,"mediaType":"tv","providerId":8}'
# atteso: {"commandId":"…","android":{"packages":["com.netflix.ninja",…],"extraDeeplink":"70143836",…},"tvos":null,"expected":"avvia"}
curl -s -X POST http://localhost:3400/api/tv/v1/play/result -H "Authorization: Bearer $ACCESS" -H "X-Zapp-Device: $DEVICE" -H "Content-Type: application/json" -d '{"commandId":"<id>","result":"ok"}'
# atteso: {"ok":true}; in DB: select result, delivered_at from device_commands where id = '<id>';
```

- [ ] **Step 8: Verificare e commit**

Run: `pnpm typecheck && pnpm lint && pnpm test`

```bash
git add src/lib/scrobble/declared.ts src/lib/scrobble/__tests__/declared.test.ts src/app/api/tv/v1/play supabase/migrations/0052_device_commands_update.sql src/types/database.ts
git commit -m "feat(tv): POST /play con dichiarazione in device_commands, /play/result, regola declared.ts"
```

---

### Task 13: L'ingest usa la dichiarazione (Netflix e Prime si attribuiscono)

**Files:**
- Modify: `src/app/api/scrobble/route.ts` (ramo TV, dove oggi un evento senza titolo finisce fra le sessioni anonime: cercare il commento "dichiarera' Zapp lanciandolo, che e' il Piano 2" attorno alla riga 770)

**Interfaces:**
- Consumes: `dichiarazioneValida`, `Dichiarazione` (Task 12); `siteFromPackage` (`src/lib/scrobble/android.ts`); `PROVIDER_ID_BY_SITE` o equivalente mappa `Site -> provider_id` (se non esiste, definirla qui: `netflix: 8, prime: 119, disney: 337, now: 39`).
- Produces: nel ramo TV, un evento **senza titolo** di un package fra quelli dichiarati viene attribuito a `{titleId, mediaType}` della dichiarazione valida piu' recente di quel dispositivo per quel provider; la riga di `device_commands` si aggiorna (`last_position_ms`, `last_seen_at`) a ogni evento attribuito.

- [ ] **Step 1: Leggere il ramo TV**

Aprire `src/app/api/scrobble/route.ts` e individuare: (a) dove gli eventi Android vengono parsati (`parseAndroidEvent`) e (b) dove un evento senza `title` viene messo da parte (il commento sul Piano 2). Il piano di ZConnection `docs/superpowers/plans/2026-09-12-zconnection-tv-lancio.md`, Task 6, descrive lo stesso intervento con il codice completo: usarlo come riferimento, ma i nomi da usare sono quelli qui sotto.

- [ ] **Step 2: La lettura della dichiarazione**

Aggiungere nel route (vicino alle altre funzioni di supporto del ramo TV):

```ts
import { dichiarazioneValida } from "@/lib/scrobble/declared";

const PROVIDER_PER_SITO: Record<Site, number> = { netflix: 8, prime: 119, disney: 337, now: 39 };

/**
 * Il titolo dichiarato per questa TV su questa piattaforma, se la dichiarazione
 * vale ancora. Aggiorna la riga a ogni evento attribuito: sono `last_position_ms` e
 * `last_seen_at` a tenerla in vita, e a farla cadere quando la posizione riparte
 * da capo (`src/lib/scrobble/declared.ts` per le regole e il perche').
 */
async function titoloDichiarato(
  service: ReturnType<typeof createServiceClient>,
  deviceId: string,
  site: Site,
  positionMs: number,
  at: string,
): Promise<{ titleId: number; mediaType: "movie" | "tv" } | null> {
  try {
    const { data: riga } = await service
      .from("device_commands")
      .select("id, title_id, media_type, delivered_at, last_position_ms, last_seen_at")
      .eq("device_id", deviceId)
      .eq("provider_id", PROVIDER_PER_SITO[site])
      .not("delivered_at", "is", null)
      .order("delivered_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!riga || !riga.delivered_at) return null;
    const valida = dichiarazioneValida(
      {
        titleId: riga.title_id,
        mediaType: riga.media_type,
        deliveredAt: riga.delivered_at,
        lastPositionMs: riga.last_position_ms,
        lastSeenAt: riga.last_seen_at,
      },
      positionMs,
      at,
    );
    if (!valida) return null;
    await service
      .from("device_commands")
      .update({ last_position_ms: positionMs, last_seen_at: at })
      .eq("id", riga.id);
    return { titleId: riga.title_id, mediaType: riga.media_type };
  } catch (err) {
    console.error("[scrobble] dichiarazione", err);
    return null;
  }
}
```

Il **service client** qui e' legittimo: la rotta e' autenticata dal token del dispositivo, non da un utente, e `device_commands` per quel `device_id` e' un dato del dispositivo (stessa regola dello scrobble oggi: `scrobble_apply` e' `security definer`).

- [ ] **Step 3: Usarla dove manca il titolo**

Nel punto (b): quando `parseAndroidEvent(ev)` ritorna `null` **perche' manca il titolo** (Netflix/Prime) e il package e' riconosciuto (`siteFromPackage(ev.package)` non nullo), prima di scartare l'evento chiamare `titoloDichiarato(service, deviceId, site, ev.position_ms, ev.at)`: se torna un titolo, proseguire con quel `{titleId, mediaType}` come se il match TMDB fosse gia' fatto (saltare `matchTitle`), applicando le regole gia' esistenti (`riproduzioneVera` per i due minuti, `decide` per il completamento con la durata presa da `titles.runtime`, `scrobble_apply` per la scrittura). Per una serie la stagione/episodio restano ignoti: `scrobble_apply` riceve `season/episode = null` e la posizione; la deduzione dell'episodio dal ritorno a zero e' fuori da questa fase (spec §5.4 di ZConnection).

- [ ] **Step 4: Collaudo con eventi finti**

Dopo un `POST /play` di Task 12 (Netflix, titolo 1399):

```bash
curl -s -X POST http://localhost:3400/api/scrobble -H "Authorization: Bearer $DEVICE_TOKEN" -H "Content-Type: application/json" -d '{"source":"android","events":[{"id":"e1","at":"'"$(date -u +%Y-%m-%dT%H:%M:%SZ)"'","package":"com.netflix.ninja","state":"playing","position_ms":180000,"duration_ms":null,"title":null}]}'
```

Atteso: in `watch_sessions` una riga per il dispositivo con `title_id = 1399`; in `device_commands` la riga con `last_position_ms = 180000`. Poi un evento a `position_ms: 0` dopo la stessa dichiarazione con `last_position_ms` alto: non attribuito (finisce come prima fra le sessioni anonime). Ripulire: `scripts/tv-session.mjs --pulisci $DEVICE`.

- [ ] **Step 5: Verificare e commit**

Run: `pnpm typecheck && pnpm lint && pnpm test && node scripts/security-check.mjs`
(`security-check.mjs` va lanciato con l'istanza attiva: leggere in testa allo script come si configura `BASE`.)

```bash
git add src/app/api/scrobble/route.ts
git commit -m "feat(scrobble): sulla TV un evento senza titolo vale come il titolo dichiarato dal Play"
```

---

### Task 14: Documentazione, memoria del contratto, verifica finale

**Files:**
- Create: `docs/architecture/tv.md`
- Modify: `CLAUDE.md` (riga in tabella; nella sezione "Vitest copre" aggiungere `src/lib/tv/`)
- Modify: `docs/architecture/zconnection.md` (la riga "Il lancio dei titoli dalla TV non c'e'" cambia: c'e', da `/api/tv/v1/play`)
- Modify: `docs/superpowers/specs/2026-09-12-zapp-tv-design.md` §5.3 (`providers: ProviderChip[]` -> `providerIds` + `/providers`; niente scaffale `saga` in v1)

- [ ] **Step 1: `docs/architecture/tv.md`**

Scrivere la pagina con questa struttura (una riga per fatto che il codice non dice, come le altre pagine):

```markdown
# Zapp TV (API per le app native)

Spec: `docs/superpowers/specs/2026-09-12-zapp-tv-design.md`. Le app: repo `D:\PROGETTI\ZappTV`.

## Contratto
- `src/lib/tv/dto.ts` e' l'unica fonte; Kotlin e Swift lo copiano a mano con il commit in testa.
- Rotte: tabella (metodo, rotta, cosa ritorna) copiata dalla spec §5.2, aggiornata ai nomi veri.
- Immagini: percorsi TMDB, la TV compone `image.tmdb.org/t/p/<size>`.

## Sessione
- Coniata nel poll dell'abbinamento (`coniaSessione`): generateLink + verifyOtp, mai salvata.
- `withBearer`: firma locale, tetto 300/min per utente, `X-Zapp-Device` obbligatorio = revoca (410).
- Il ponte: `AsyncLocalStorage` in `request-session.ts`; `createClient()` e `getViewer()` lo leggono. **Trappola**: React `cache()` non memoizza fuori da un render, quindi in una rotta `getViewer()` puo' essere chiamato N volte: e' gratis (legge il contesto), ma i loader `cache(...)` del sito (hero, rails) ricalcolano se chiamati due volte nella stessa rotta — chiamarli una volta e passare il risultato.

## Home
- `/home` = continua + hero + manifesto; gli scaffali si caricano uno alla volta. Perche' (funzione Vercel, Hobby).
- Le chiavi degli scaffali (`shelf-key.ts`) e l'ordine (`manifest.ts` = `page.tsx` senza cinema/amici/saghe).

## Play e dichiarazione
- `/play` scrive `device_commands` gia' consegnato; `declared.ts` le regole; l'ingest le usa (Task 13). Cosa NON fa: episodio della serie dal ritorno a zero.
- tvOS: `LaunchPlan.tvos` nullo fino alla sonda (fase C).

## Collaudo
- `scripts/tv-session.mjs <user_id>` -> ACCESS/REFRESH/DEVICE/DEVICE_TOKEN; `--pulisci`.
- Istanza: `NEXT_DIST_DIR=.next-tv pnpm build && NEXT_DIST_DIR=.next-tv pnpm exec next start -p 3400`.
- I curl di riferimento per ogni rotta (copiare quelli dei task).
```

- [ ] **Step 2: CLAUDE.md**

Nella tabella dei sottosistemi aggiungere la riga:

```markdown
| [tv.md](docs/architecture/tv.md) | API `/api/tv/v1` per le app native TV, sessione bearer, `withBearer`, dichiarazione del Play. |
```

e in "Vitest copre solo le funzioni pure di…" aggiungere `di src/lib/tv/ (headers, map, manifest, shelf-key, library-params, detail, season, watch-body) e di src/lib/scrobble/declared.ts`.

- [ ] **Step 3: zconnection.md e spec**

In `docs/architecture/zconnection.md`, sezione "Su TV", sostituire il punto "Il lancio dei titoli dalla TV non c'e'" con: "**Il lancio dal telecomando passa da `/api/tv/v1/play`** (`docs/architecture/tv.md`): la riga di `device_commands` nasce consegnata ed e' la dichiarazione che l'ingest usa per Netflix e Prime. Il tondo TV nella scheda web (comando dal telefono, coda sondata) resta il Piano 2 di `2026-09-12-zconnection-tv-lancio.md`, Task 4-5 e 8-9."

Nella spec §5.3 sostituire `providers: ProviderChip[]` con `providerIds: number[]` (+ rotta `GET /providers` in §5.2) e in §5.2 togliere `saga` dall'elenco delle chiavi.

- [ ] **Step 4: Verifica finale completa**

```bash
pnpm typecheck && pnpm lint && pnpm test
git status --short          # deve essere vuoto tranne i file di questo task
git diff --stat origin/main..HEAD | tail -3
```

Ricostruire l'istanza e ripassare **tutti** i curl dei task 4-13 con una sessione nuova (`tv-session.mjs`), poi `--pulisci`. Registrare in `tv.md` qualunque differenza trovata fra il piano e il codice vero.

- [ ] **Step 5: Commit**

```bash
git add docs/architecture/tv.md CLAUDE.md docs/architecture/zconnection.md docs/superpowers/specs/2026-09-12-zapp-tv-design.md
git commit -m "docs(tv): pagina di architettura, indice, contratto allineato"
```

- [ ] **Step 6: Rilascio (solo con l'ok dell'utente)**

Seguire `CLAUDE.md` "Come si pubblica": `git fetch origin && git merge origin/main`, verifiche, `node scripts/rilascio.mjs --prova`, poi `node scripts/rilascio.mjs`. Prima del rilascio avvisare le sessioni vive (`ListAgents` / `SendMessage`) perche' il merge porta anche `feat/zconnection-tv` (scrobble route, devices page) in main.
