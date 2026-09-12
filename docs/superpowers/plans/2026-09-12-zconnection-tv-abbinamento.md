# ZConnection su TV — Piano 1: abbinamento e ascolto

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** collegare una TV a Zapp con un codice a 6 cifre e far arrivare in libreria, da sole, le visioni su NOW e Disney+.

**Architecture:** l'app sulla TV e' muta — abbina, legge le `MediaSession` delle app in elenco e spedisce metadati grezzi a `POST /api/scrobble`, la stessa rotta dell'estensione browser. Titolo, episodio e completamento li calcola il server con la pipeline che esiste gia' (`src/lib/scrobble/*`, `scrobble_apply`). Questo piano **non** contiene il lancio dei titoli: e' il Piano 2.

**Tech Stack:** Next.js 15 App Router, Supabase (Postgres + RLS), TypeScript strict, Vitest per le funzioni pure; app TV in Kotlin senza dipendenze (SDK 34, `minSdk 22`), JSON con `org.json`, rete con `HttpsURLConnection`.

**Spec:** `docs/superpowers/specs/2026-09-12-zconnection-fire-tv-design.md`
**Misure che la giustificano:** `docs/zconnection/FIRETV-SONDA-2026-09-12.md`

## Global Constraints

- **Italiano** per UI e commenti del codice; nomi di funzione in italiano dove il resto del modulo lo e'.
- **`anon` non tocca niente**: ogni policy `to authenticated`, ogni `auth.uid()` dentro una policy scritto `(select auth.uid())`.
- **Ogni chiave esterna nasce col suo indice.**
- **Il controllo di proprieta' si fa anche nel codice**, non solo nella RLS.
- **Verso il client sempre un messaggio generico**; il dettaglio resta nei log.
- **Validazione** con `src/lib/validate.ts` (`isUuid`, `isTmdbId`, `isMediaType`, `isSafeExternalUrl`).
- **Dopo ogni migration**: rigenerare `src/types/database.ts` e **chiamare davvero** ogni funzione nuova (`apply_migration` che risponde `success` dice solo che il corpo e' stato accettato, non che gira — migration 0036 e' costata un giro intero per questo).
- **App TV: zero dipendenze esterne.** Niente librerie QR, niente client HTTP di terzi.
- **Prettier**: virgolette doppie, virgole finali, `printWidth` 90.
- Verifica finale di ogni parte server: `pnpm typecheck && pnpm lint && pnpm test`.

---

# Parte A — Server e database

### Task 1: Tabella `pairing_codes` e RPC di reclamo

**Files:**
- Create: `supabase/migrations/0042_tv_pairing.sql`
- Modify: `src/types/database.ts` (rigenerato, non scritto a mano)

**Interfaces:**
- Consumes: `public.devices`, `public.device_members` (esistono, migration 0033)
- Produces: tabella `public.pairing_codes`; RPC `public.claim_pairing_code(p_code text) returns jsonb` che ritorna `{"device_id": uuid, "name": text}` oppure solleva eccezione.

- [ ] **Step 1: Scrivere la migration**

```sql
-- Abbinamento di una TV: la TV genera il token, il server ne vede solo l'hash.
-- Nessuna policy: ci arriva solo il service client dalle rotte. Un codice a sei
-- cifre leggibile da chiunque sarebbe un dispositivo regalato a uno sconosciuto.
create table public.pairing_codes (
  code text primary key check (code ~ '^[0-9]{6}$'),
  install_id uuid not null,
  token_hash text not null,
  name text not null,
  platform public.device_platform not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  claimed_by uuid references public.profiles (id) on delete cascade,
  claimed_at timestamptz
);

create index pairing_codes_scadenza_idx on public.pairing_codes (expires_at);
create index pairing_codes_claimed_by_idx on public.pairing_codes (claimed_by);

alter table public.pairing_codes enable row level security;
revoke all on public.pairing_codes from anon, authenticated;

-- Reclamo: crea il dispositivo se l'install_id e' nuovo, aggiunge il membro.
-- security definer perche' la tabella e' chiusa; revocata da anon e public.
create or replace function public.claim_pairing_code(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := (select auth.uid());
  v_riga public.pairing_codes;
  v_device public.devices;
begin
  if v_uid is null then
    raise exception 'non autenticato' using errcode = '28000';
  end if;

  select * into v_riga
  from public.pairing_codes
  where code = p_code and expires_at > now()
  for update;

  if not found then
    raise exception 'codice non valido' using errcode = 'P0002';
  end if;

  select * into v_device from public.devices where install_id = v_riga.install_id;

  if not found then
    insert into public.devices (install_id, token_hash, name, platform)
    values (v_riga.install_id, v_riga.token_hash, v_riga.name, v_riga.platform)
    returning * into v_device;
  end if;

  insert into public.device_members (device_id, user_id)
  values (v_device.id, v_uid)
  on conflict (device_id, user_id) do nothing;

  update public.pairing_codes
  set claimed_by = v_uid, claimed_at = now()
  where code = p_code;

  return jsonb_build_object('device_id', v_device.id, 'name', v_device.name);
end;
$$;

revoke all on function public.claim_pairing_code(text) from anon, public;
grant execute on function public.claim_pairing_code(text) to authenticated;
```

- [ ] **Step 2: Applicare la migration**

Applicare con lo strumento MCP `apply_migration` (nome: `0042_tv_pairing`), non con `supabase db push`: il progetto remoto ha migration gia' applicate fuori dal repo.

- [ ] **Step 3: Chiamare davvero la funzione**

Con MCP `execute_sql`, e' l'unico modo di sapere che gira:

```sql
insert into public.pairing_codes (code, install_id, token_hash, name, platform, expires_at)
values ('123456', gen_random_uuid(), 'hash-finto', 'TV di prova', 'fire_tv', now() + interval '10 minutes');

-- deve fallire con "non autenticato": auth.uid() e' nullo fuori da una sessione
select public.claim_pairing_code('123456');

delete from public.pairing_codes where code = '123456';
```

Atteso: la prima `select` solleva `non autenticato` (codice `28000`). Se solleva `42883` o `42P01` la funzione non gira: correggere prima di proseguire.

- [ ] **Step 4: Rigenerare i tipi**

```bash
supabase gen types typescript --project-id bbuhwzdbzxgydewmcdwd > src/types/database.ts
```

Atteso: `pairing_codes` compare in `Tables`; `claim_pairing_code` compare in `Functions`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0042_tv_pairing.sql src/types/database.ts
git commit -m "feat(tv): tabella pairing_codes e RPC di reclamo"
```

---

### Task 2: Codice di abbinamento (funzioni pure)

**Files:**
- Create: `src/lib/devices/pairing.ts`
- Test: `src/lib/devices/__tests__/pairing.test.ts`

**Interfaces:**
- Produces:
  - `CODICE_TTL_MS: number` (600_000)
  - `generaCodice(casuale: () => number = Math.random): string` — 6 cifre, zeri iniziali ammessi
  - `isCodiceValido(valore: unknown): valore is string`
  - `normalizzaCodice(valore: string): string` — toglie spazi e trattini

- [ ] **Step 1: Scrivere il test che fallisce**

```ts
import { describe, expect, it } from "vitest";
import {
  CODICE_TTL_MS,
  generaCodice,
  isCodiceValido,
  normalizzaCodice,
} from "../pairing";

describe("codice di abbinamento", () => {
  it("genera sempre sei cifre, anche con zeri davanti", () => {
    expect(generaCodice(() => 0)).toBe("000000");
    expect(generaCodice(() => 0.999999)).toHaveLength(6);
    expect(generaCodice(() => 0.5)).toMatch(/^[0-9]{6}$/);
  });

  it("accetta solo sei cifre", () => {
    expect(isCodiceValido("482913")).toBe(true);
    expect(isCodiceValido("48291")).toBe(false);
    expect(isCodiceValido("4829133")).toBe(false);
    expect(isCodiceValido("48a913")).toBe(false);
    expect(isCodiceValido(482913)).toBe(false);
    expect(isCodiceValido(null)).toBe(false);
  });

  it("normalizza quello che l'utente scrive davvero", () => {
    expect(normalizzaCodice(" 482 913 ")).toBe("482913");
    expect(normalizzaCodice("482-913")).toBe("482913");
  });

  it("il codice vive dieci minuti", () => {
    expect(CODICE_TTL_MS).toBe(10 * 60 * 1000);
  });
});
```

- [ ] **Step 2: Eseguire il test e vederlo fallire**

Run: `pnpm exec vitest run src/lib/devices/__tests__/pairing.test.ts`
Expected: FAIL, `Failed to resolve import "../pairing"`.

- [ ] **Step 3: Scrivere l'implementazione minima**

```ts
/** Codice di abbinamento della TV: sei cifre, dieci minuti di vita. */

export const CODICE_TTL_MS = 10 * 60 * 1000;

/** Sei cifre con gli zeri davanti: "000000" e' un codice legittimo. */
export function generaCodice(casuale: () => number = Math.random): string {
  return String(Math.floor(casuale() * 1_000_000)).padStart(6, "0");
}

export function isCodiceValido(valore: unknown): valore is string {
  return typeof valore === "string" && /^[0-9]{6}$/.test(valore);
}

/** L'utente lo legge dalla TV e lo ribatte: spazi e trattini non sono errori. */
export function normalizzaCodice(valore: string): string {
  return valore.replace(/[\s-]/g, "");
}
```

- [ ] **Step 4: Eseguire il test e vederlo passare**

Run: `pnpm exec vitest run src/lib/devices/__tests__/pairing.test.ts`
Expected: PASS, 4 test.

- [ ] **Step 5: Commit**

```bash
git add src/lib/devices/pairing.ts src/lib/devices/__tests__/pairing.test.ts
git commit -m "feat(tv): codice di abbinamento, funzioni pure"
```

---

### Task 3: Rotte di abbinamento per la TV

**Files:**
- Create: `src/app/api/devices/pair/route.ts`
- Create: `src/app/api/devices/pair/[code]/route.ts`
- Create: `src/app/api/devices/pair/[code]/qr/route.ts`

**Interfaces:**
- Consumes: `generaCodice`, `isCodiceValido`, `CODICE_TTL_MS` (Task 2); `createServiceClient` da `@/lib/supabase/server`; `rateLimit` da `@/lib/rate-limit`.
- Produces:
  - `POST /api/devices/pair` — body `{install_id: string, token_hash: string, name: string, platform: "fire_tv"|"android_tv"|"android"}` → `{code: string, expires_at: string}`
  - `GET /api/devices/pair/{code}` — header `Authorization: Bearer <token>` → `{status: "pending"}` oppure `{status: "claimed", device_id: string, members: {username: string, avatar_url: string|null}[]}`
  - `GET /api/devices/pair/{code}/qr` — PNG 240x240 del link `<NEXT_PUBLIC_APP_URL>/devices?code=<code>`

- [ ] **Step 1: Scrivere la rotta di registrazione**

```ts
import { createHash, randomUUID } from "node:crypto";
import { type NextRequest, NextResponse } from "next/server";
import { CODICE_TTL_MS, generaCodice } from "@/lib/devices/pairing";
import { rateLimit } from "@/lib/rate-limit";
import { createServiceClient } from "@/lib/supabase/server";

const PIATTAFORME = new Set(["fire_tv", "android_tv", "android"]);

/**
 * La TV si presenta e riceve un codice da mostrare a schermo.
 *
 * Il token lo genera la TV: qui arriva solo il suo hash, e **non torna mai
 * indietro** nulla che permetta di ricostruirlo.
 */
export async function POST(request: NextRequest) {
  const corpo = await request.json().catch(() => null);
  if (!corpo || typeof corpo !== "object") {
    return NextResponse.json({ error: "richiesta non valida" }, { status: 400 });
  }

  const { install_id: installId, token_hash: tokenHash, name, platform } = corpo;
  const validi =
    typeof installId === "string" &&
    /^[0-9a-f-]{36}$/i.test(installId) &&
    typeof tokenHash === "string" &&
    /^[0-9a-f]{64}$/.test(tokenHash) &&
    typeof name === "string" &&
    name.length > 0 &&
    name.length <= 60 &&
    typeof platform === "string" &&
    PIATTAFORME.has(platform);

  if (!validi) {
    return NextResponse.json({ error: "richiesta non valida" }, { status: 400 });
  }

  // Per installazione, non per IP: una TV che riparte in ciclo non deve
  // poter riempire la tabella.
  if (!(await rateLimit(`pair:${installId}`, 10, 600, { condiviso: true }))) {
    return NextResponse.json({ error: "troppe richieste" }, { status: 429 });
  }

  const service = createServiceClient();
  await service.from("pairing_codes").delete().eq("install_id", installId);

  const scadenza = new Date(Date.now() + CODICE_TTL_MS).toISOString();
  for (let tentativo = 0; tentativo < 5; tentativo += 1) {
    const code = generaCodice();
    const { error } = await service.from("pairing_codes").insert({
      code,
      install_id: installId,
      token_hash: tokenHash,
      name,
      platform,
      expires_at: scadenza,
    });
    if (!error) return NextResponse.json({ code, expires_at: scadenza });
    if (error.code !== "23505") {
      console.error("pair: insert fallita", error);
      return NextResponse.json({ error: "errore interno" }, { status: 500 });
    }
  }
  return NextResponse.json({ error: "errore interno" }, { status: 500 });
}

export const dynamic = "force-dynamic";
```

- [ ] **Step 2: Scrivere la rotta di sondaggio**

```ts
import { createHash } from "node:crypto";
import { type NextRequest, NextResponse } from "next/server";
import { isCodiceValido } from "@/lib/devices/pairing";
import { rateLimit } from "@/lib/rate-limit";
import { createServiceClient } from "@/lib/supabase/server";

/**
 * La TV chiede se qualcuno ha reclamato il suo codice.
 *
 * Si autentica col proprio token: senza, chiunque conoscesse un codice a sei
 * cifre saprebbe a chi appartiene la TV.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ code: string }> },
) {
  const { code } = await params;
  if (!isCodiceValido(code)) {
    return NextResponse.json({ error: "codice non valido" }, { status: 400 });
  }

  const auth = request.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (token.length < 20) {
    return NextResponse.json({ error: "non autorizzato" }, { status: 401 });
  }
  const tokenHash = createHash("sha256").update(token).digest("hex");

  if (!(await rateLimit(`pair-poll:${tokenHash}`, 120, 60))) {
    return NextResponse.json({ error: "troppe richieste" }, { status: 429 });
  }

  const service = createServiceClient();
  const { data: riga, error } = await service
    .from("pairing_codes")
    .select("claimed_by, install_id, token_hash")
    .eq("code", code)
    .maybeSingle();

  if (error) {
    console.error("pair-poll: lettura fallita", error);
    return NextResponse.json({ error: "errore interno" }, { status: 500 });
  }
  if (!riga || riga.token_hash !== tokenHash) {
    return NextResponse.json({ error: "non autorizzato" }, { status: 401 });
  }
  if (!riga.claimed_by) return NextResponse.json({ status: "pending" });

  const { data: device } = await service
    .from("devices")
    .select("id")
    .eq("install_id", riga.install_id)
    .maybeSingle();

  if (!device) return NextResponse.json({ status: "pending" });

  const { data: membri } = await service
    .from("device_members")
    .select("profiles(username, avatar_url)")
    .eq("device_id", device.id);

  await service.from("pairing_codes").delete().eq("code", code);

  return NextResponse.json({
    status: "claimed",
    device_id: device.id,
    members: (membri ?? []).map((m) => m.profiles).filter(Boolean),
  });
}

export const dynamic = "force-dynamic";
```

- [ ] **Step 3: Scrivere la rotta del QR**

Il QR lo disegna il server con la dipendenza `qrcode` gia' presente (la usano i biglietti del cinema): cosi' l'app TV resta senza dipendenze.

```ts
import { type NextRequest, NextResponse } from "next/server";
import QRCode from "qrcode";
import { isCodiceValido } from "@/lib/devices/pairing";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ code: string }> },
) {
  const { code } = await params;
  if (!isCodiceValido(code)) {
    return NextResponse.json({ error: "codice non valido" }, { status: 400 });
  }
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "";
  const png = await QRCode.toBuffer(`${base}/devices?code=${code}`, {
    width: 240,
    margin: 1,
  });
  return new NextResponse(new Uint8Array(png), {
    headers: { "content-type": "image/png", "cache-control": "no-store" },
  });
}

export const dynamic = "force-dynamic";
```

- [ ] **Step 4: Aggiungere le rotte ai percorsi pubblici del middleware**

In `src/lib/supabase/middleware.ts`, dentro `PUBLIC_PATHS`, aggiungere `/api/devices/pair`. La TV non ha cookie di sessione: senza questa riga ogni chiamata prende un 307 verso `/login` e non se ne accorge nessuno (e' gia' successo con `/api/jobs`). Non e' un buco: quelle rotte hanno un'autenticazione propria (token del dispositivo) o non espongono nulla (registrazione e QR).

- [ ] **Step 5: Verificare a mano contro un'istanza avviata**

```bash
NEXT_DIST_DIR=.next-check pnpm build
NEXT_DIST_DIR=.next-check pnpm exec next start -p 3399 &
curl -s -X POST localhost:3399/api/devices/pair \
  -H 'content-type: application/json' \
  -d '{"install_id":"11111111-1111-1111-1111-111111111111","token_hash":"'"$(printf 'zc_prova' | sha256sum | cut -d' ' -f1)"'","name":"TV di prova","platform":"fire_tv"}'
```

Atteso: `{"code":"NNNNNN","expires_at":"..."}`. Poi:

```bash
curl -s localhost:3399/api/devices/pair/NNNNNN -H 'Authorization: Bearer zc_prova'
```

Atteso: `{"status":"pending"}`. Con un token sbagliato: `401`. Con un codice inesistente: `401`.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/devices/pair src/lib/supabase/middleware.ts
git commit -m "feat(tv): rotte di abbinamento e QR del codice"
```

---

### Task 4: Reclamo del codice da Zapp

**Files:**
- Modify: `src/app/(app)/devices/actions.ts`
- Modify: `src/app/(app)/devices/DevicesClient.tsx`

**Interfaces:**
- Consumes: `claim_pairing_code` (Task 1), `normalizzaCodice`/`isCodiceValido` (Task 2)
- Produces: `claimPairingCode(code: string): Promise<{ok: true; name: string} | {ok: false; error: string}>`

- [ ] **Step 1: Scrivere la Server Action**

In `src/app/(app)/devices/actions.ts`, in coda:

```ts
/**
 * Reclama il codice mostrato da una TV. Il grosso lo fa la RPC, che e'
 * `security definer` perche' `pairing_codes` e' chiusa a tutti.
 */
export async function claimPairingCode(
  code: string,
): Promise<{ ok: true; name: string } | { ok: false; error: string }> {
  const pulito = normalizzaCodice(String(code ?? ""));
  if (!isCodiceValido(pulito)) {
    return { ok: false, error: "Codice non valido." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Sessione scaduta." };

  if (!(await rateLimit(`claim:${user.id}`, 10, 60, { condiviso: true }))) {
    return { ok: false, error: "Troppi tentativi, riprova fra un minuto." };
  }

  const { data, error } = await supabase.rpc("claim_pairing_code", { p_code: pulito });
  if (error) {
    console.error("claimPairingCode", error);
    return { ok: false, error: "Codice non valido o scaduto." };
  }

  revalidatePath("/devices");
  const nome = (data as { name?: string } | null)?.name ?? "TV";
  return { ok: true, name: nome };
}
```

Aggiungere in testa al file gli import mancanti: `import { isCodiceValido, normalizzaCodice } from "@/lib/devices/pairing";`.

- [ ] **Step 2: Aggiungere il campo in `/devices`**

In `DevicesClient.tsx`, sopra l'elenco dei dispositivi, una sezione "Collega una TV" con un `input` `inputMode="numeric"` `maxLength={7}`, un bottone "Collega", e il toast di esito. Se l'URL porta `?code=NNNNNN` (e' il QR), il campo nasce compilato.

```tsx
const [codice, setCodice] = useState(cercaCodiceNellUrl());
const [inCorso, setInCorso] = useState(false);

async function collega() {
  setInCorso(true);
  const esito = await claimPairingCode(codice);
  setInCorso(false);
  if (esito.ok) {
    toast.success(`${esito.name} collegata`);
    setCodice("");
    router.refresh();
  } else {
    toast.error(esito.error);
  }
}
```

- [ ] **Step 3: Verificare**

Run: `pnpm typecheck && pnpm lint`
Expected: pulito.

Poi, con l'istanza avviata: inserire un codice inesistente → "Codice non valido o scaduto."; inserire quello creato nel Task 3 Step 5 → compare il dispositivo in elenco.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(app)/devices"
git commit -m "feat(tv): reclamo del codice di abbinamento da Zapp"
```

---

### Task 5: Metadati Android → titolo (funzioni pure)

**Files:**
- Create: `src/lib/scrobble/android.ts`
- Create: `src/lib/scrobble/__tests__/android.test.ts`
- Modify: `src/lib/scrobble/types.ts`

**Interfaces:**
- Consumes: `Site`, `ParsedMedia`, `PlaybackState` da `./types`; `parseMedia` da `./parse`
- Produces:
  - `interface AndroidEvent { id: string; at: string; package: string; state: PlaybackState; position_ms: number; duration_ms: number | null; title: string | null; }`
  - `siteFromPackage(pkg: string): Site | null`
  - `parseAndroidEvent(ev: AndroidEvent): ParsedMedia | null`
  - `riproduzioneVera(ev: Pick<AndroidEvent, "position_ms" | "duration_ms" | "state">): boolean`
  - `SOGLIA_ANTEPRIMA_MS = 120_000`, `DURATA_MINIMA_MS = 300_000`

- [ ] **Step 1: Scrivere il test che fallisce**

I valori sono quelli catturati dalla sonda del 12/09, non inventati.

```ts
import { describe, expect, it } from "vitest";
import {
  type AndroidEvent,
  parseAndroidEvent,
  riproduzioneVera,
  siteFromPackage,
} from "../android";

function evento(parti: Partial<AndroidEvent>): AndroidEvent {
  return {
    id: "1",
    at: "2026-09-12T13:38:51.000Z",
    package: "com.nowtv.it",
    state: "playing",
    position_ms: 249_755,
    duration_ms: 2_772_000,
    title: "Al Britani",
    ...parti,
  };
}

describe("package -> piattaforma", () => {
  it("riconosce i package visti sulla Fire TV", () => {
    expect(siteFromPackage("com.nowtv.it")).toBe("now");
    expect(siteFromPackage("com.disney.disneyplus")).toBe("disney");
    expect(siteFromPackage("com.netflix.ninja")).toBe("netflix");
    expect(siteFromPackage("com.amazon.firebat")).toBe("prime");
  });

  it("ignora tutto il resto", () => {
    expect(siteFromPackage("com.spotify.tv.android")).toBeNull();
    expect(siteFromPackage("com.amazon.firetv.youtube")).toBeNull();
  });
});

describe("metadati Android -> titolo", () => {
  it("legge il titolo di NOW", () => {
    const parsed = parseAndroidEvent(evento({}));
    expect(parsed?.title).toBe("Al Britani");
  });

  it("legge il titolo di Disney+", () => {
    const parsed = parseAndroidEvent(
      evento({
        package: "com.disney.disneyplus",
        title: "Big Hero 6",
        duration_ms: 6_557_000,
        position_ms: 98_335,
      }),
    );
    expect(parsed?.title).toBe("Big Hero 6");
  });

  it("tace dove i metadati non ci sono", () => {
    // Netflix, Prime e Apple TV su Fire OS danno metadata:size=0: il titolo
    // per loro lo dichiara Zapp lanciandolo (Piano 2), non si indovina qui.
    expect(parseAndroidEvent(evento({ package: "com.netflix.ninja", title: null }))).toBeNull();
    expect(parseAndroidEvent(evento({ package: "com.amazon.firebat", title: null }))).toBeNull();
  });

  it("tace su un package fuori elenco", () => {
    expect(parseAndroidEvent(evento({ package: "com.spotify.tv.android" }))).toBeNull();
  });
});

describe("soglia anti-anteprima", () => {
  it("accetta una riproduzione vera", () => {
    expect(
      riproduzioneVera({ position_ms: 249_755, duration_ms: 2_772_000, state: "playing" }),
    ).toBe(true);
  });

  it("scarta l'anteprima del catalogo", () => {
    // Netflix e Prime riproducono le anteprime come sessioni vere: playing,
    // posizione che avanza da zero. Sotto i due minuti non si scrive niente.
    expect(
      riproduzioneVera({ position_ms: 8_257, duration_ms: null, state: "playing" }),
    ).toBe(false);
  });

  it("scarta una clip breve anche se e' andata avanti", () => {
    expect(
      riproduzioneVera({ position_ms: 130_000, duration_ms: 180_000, state: "playing" }),
    ).toBe(false);
  });

  it("non conta cio' che non sta suonando", () => {
    expect(
      riproduzioneVera({ position_ms: 249_755, duration_ms: 2_772_000, state: "paused" }),
    ).toBe(false);
  });
});
```

- [ ] **Step 2: Eseguire il test e vederlo fallire**

Run: `pnpm exec vitest run src/lib/scrobble/__tests__/android.test.ts`
Expected: FAIL, `Failed to resolve import "../android"`.

- [ ] **Step 3: Scrivere l'implementazione**

```ts
import { parseMedia } from "./parse";
import type { ParsedMedia, PlaybackState, Site } from "./types";

/** Prima che la libreria si muova: due minuti di riproduzione continua. */
export const SOGLIA_ANTEPRIMA_MS = 120_000;
/** Sotto i cinque minuti non e' un film ne' un episodio: e' una clip. */
export const DURATA_MINIMA_MS = 300_000;

/** Cosa la TV ha visto, senza interpretazioni. */
export interface AndroidEvent {
  id: string;
  at: string;
  package: string;
  state: PlaybackState;
  position_ms: number;
  duration_ms: number | null;
  /** `MediaMetadata.TITLE`. Nullo su Netflix, Prime e Apple TV (sonda 12/09). */
  title: string | null;
}

const SITI: Record<string, Site> = {
  "com.netflix.ninja": "netflix",
  "com.netflix.mediaclient": "netflix",
  "com.amazon.firebat": "prime",
  "com.amazon.avod": "prime",
  "com.amazon.avod.thirdpartyclient": "prime",
  "com.disney.disneyplus": "disney",
  "com.nowtv.it": "now",
};

export function siteFromPackage(pkg: string): Site | null {
  return SITI[pkg] ?? null;
}

/**
 * Titolo dai metadati della `MediaSession`.
 *
 * Solo NOW e Disney+ li pubblicano (sonda 12/09): per gli altri si torna
 * `null` e l'identita' la dichiara Zapp lanciando il titolo. NOW da' il nome
 * dell'**episodio**, non della serie: lo risolve piu' avanti `matchTitle`.
 */
export function parseAndroidEvent(ev: AndroidEvent): ParsedMedia | null {
  if (!siteFromPackage(ev.package)) return null;
  const titolo = ev.title?.trim();
  if (!titolo) return null;
  const parsed = parseMedia(titolo, null, null);
  return parsed.kind === "unknown" ? null : parsed;
}

/**
 * Vero solo se cio' che suona merita di toccare la libreria: Netflix e Prime
 * riproducono le anteprime del catalogo come sessioni indistinguibili da un
 * film, e su una TV non c'e' un titolo che le smentisca.
 */
export function riproduzioneVera(
  ev: Pick<AndroidEvent, "position_ms" | "duration_ms" | "state">,
): boolean {
  if (ev.state !== "playing") return false;
  if (ev.position_ms < SOGLIA_ANTEPRIMA_MS) return false;
  if (ev.duration_ms !== null && ev.duration_ms < DURATA_MINIMA_MS) return false;
  return true;
}
```

- [ ] **Step 4: Eseguire i test e vederli passare**

Run: `pnpm exec vitest run src/lib/scrobble/__tests__/android.test.ts`
Expected: PASS, 10 test.

- [ ] **Step 5: Commit**

```bash
git add src/lib/scrobble/android.ts src/lib/scrobble/__tests__/android.test.ts
git commit -m "feat(tv): metadati Android verso titolo, con soglia anti-anteprima"
```

---

### Task 6: L'ingest accetta gli eventi della TV

**Files:**
- Modify: `src/app/api/scrobble/route.ts`

**Interfaces:**
- Consumes: `parseAndroidEvent`, `riproduzioneVera`, `siteFromPackage`, `AndroidEvent` (Task 5); `PROVIDER_ID_BY_SITE` da `@/lib/scrobble/sites`
- Produces: la stessa rotta accetta ora un corpo `{ source: "android", events: AndroidEvent[] }` oltre a quello del browser.

- [ ] **Step 1: Distinguere le due forme del corpo**

Nella `POST`, dopo l'autenticazione a token e prima del ciclo sugli eventi:

```ts
// Il browser manda RawEvent (ha un URL), la TV manda AndroidEvent (ha un
// package). Stesso token, stessa pipeline, sorgenti diverse.
const daTv = corpo?.source === "android";
```

- [ ] **Step 2: Estrarre il corpo del ciclo in una funzione condivisa**

Il ciclo `for (const raw of events)` della `POST` contiene ~200 righe che valgono
identiche per la TV: `matchTitle`, `getOrFetchTitle`, la verifica del nome, la
risoluzione dell'episodio, `decide()`, `scrobble_apply`. **Non duplicarle.** Si
estrae tutto cio' che segue il `parsed` in una funzione locale nello stesso file,
con questa firma esatta:

```ts
/** Cio' che vale identico per il browser e per la TV, dal titolo riconosciuto in giu'. */
async function applicaEventoRiconosciuto(input: {
  service: ReturnType<typeof createServiceClient>;
  deviceId: string;
  tokenHash: string;
  site: Site;
  providerId: number;
  parsed: ParsedMedia;
  at: string;
  state: PlaybackState;
  positionMs: number;
  durationMs: number | null;
  /** Solo il browser ce l'ha: serve alla card del popup. */
  contentKey: string | null;
}): Promise<{ applied: boolean; card: Record<string, unknown> | null }>;
```

Il ramo del browser diventa: `parseEvent(raw)` -> se `null` scarta -> altrimenti
chiama `applicaEventoRiconosciuto` con `site: raw.site` e
`contentKey: raw.contentKey ?? null`. **Nessun cambiamento di comportamento**: i test
`ingest.test.ts`, `now-ingest.test.ts` e `disney-ingest.test.ts` devono restare verdi
**senza essere toccati**. Eseguirli prima dell'estrazione, annotare il numero di test
passati, e riottenere lo stesso numero dopo.

- [ ] **Step 3: Aggiungere il ramo della TV**

```ts
if (daTv) {
  const eventi = Array.isArray(corpo.events) ? (corpo.events as AndroidEvent[]) : [];
  for (const ev of eventi.slice(0, 50)) {
    acknowledged.push(ev.id);

    // La whitelist vale anche lato server: non ci si fida del client.
    const site = siteFromPackage(ev.package);
    if (!site) {
      ignored++;
      continue;
    }

    // Netflix e Prime riproducono le anteprime del catalogo come sessioni vere:
    // sotto i due minuti non si tocca niente (sonda 12/09).
    if (!riproduzioneVera(ev)) {
      ignored++;
      continue;
    }

    const providerId = PROVIDER_ID_BY_SITE[site];
    const parsed = parseAndroidEvent(ev);
    if (!parsed) {
      // Sessione anonima (Netflix, Prime, Apple TV su Fire OS): il titolo lo
      // dichiarera' Zapp lanciandolo, che e' il Piano 2. Intanto si registra,
      // altrimenti il guasto e' muto.
      await annotaSessioneAnonima(service, device.id, providerId, ev.at);
      nonRiconosciuti++;
      ignored++;
      continue;
    }

    const esito = await applicaEventoRiconosciuto({
      service,
      deviceId: device.id,
      tokenHash,
      site,
      providerId,
      parsed,
      at: ev.at,
      state: ev.state,
      positionMs: ev.position_ms,
      durationMs: ev.duration_ms,
      contentKey: null,
    });
    if (esito.applied) applied++;
  }
}
```

- [ ] **Step 4: Scrivere `annotaSessioneAnonima`**

`annotaNonRiconosciuto` esiste gia' nello stesso file e pretende un `ParsedMedia`.
Per una sessione senza titolo serve una funzione sorella, che **segue lo stesso
modello**: `pending_scrobbles` non ha una colonna chiave, la deduplicazione si fa
leggendo `raw->>key`.

```ts
/**
 * Una sessione di cui non sappiamo il titolo (Netflix, Prime, Apple TV su Fire
 * OS). La chiave e' `(provider, giorno)` e non l'istante: col battito da 30 s un
 * film guardato per due ore scriverebbe 240 righe identiche.
 */
async function annotaSessioneAnonima(
  service: ReturnType<typeof createServiceClient>,
  deviceId: string,
  providerId: number,
  at: string,
): Promise<void> {
  try {
    const key = `anon:${providerId}:${at.slice(0, 10)}`;
    const { data: gia } = await service
      .from("pending_scrobbles")
      .select("id")
      .eq("device_id", deviceId)
      .eq("reason", "unknown_title")
      .eq("raw->>key", key)
      .limit(1)
      .maybeSingle();
    if (gia) return;

    await service.from("pending_scrobbles").insert({
      device_id: deviceId,
      reason: "unknown_title",
      provider_id: providerId,
      raw: { key, at, provider_id: providerId, anonima: true },
    });
  } catch (err) {
    console.error("[scrobble] annota sessione anonima", err);
  }
}
```

- [ ] **Step 4: Verificare**

Run: `pnpm typecheck && pnpm lint && pnpm test`
Expected: pulito, e i test di `android.test.ts` passano.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/scrobble/route.ts
git commit -m "feat(tv): ingest degli eventi Android sulla rotta scrobble"
```

---

# Parte B — App sulla TV

L'app vive in `D:\PROGETTI\ZConnection` (repo separato, non versionato con Zapp). Il codice della sonda (`MainActivity`, `ProbeAccessibility`, `AdbKey`, `AdbClient`) e' **usa-e-getta**: va rimosso, non evoluto. Si tiene `SessionProbe`, che e' gia' quello che serve.

Build: `JAVA_HOME="/c/Program Files/Eclipse Adoptium/jdk-17.0.20.101-hotspot" ./gradlew --no-daemon assembleDebug` con la sandbox disattivata (serve rete). Installazione: `adb -s <ip>:5555 install -r app/build/outputs/apk/debug/app-debug.apk`.

### Task 7: Memoria locale e client HTTP

**Files:**
- Create: `app/src/main/java/com/zapp/zconnection/Store.kt`
- Create: `app/src/main/java/com/zapp/zconnection/Api.kt`
- Delete: `AdbKey.kt`, `AdbClient.kt`, `ProbeAccessibility.kt`, `res/xml/accessibility_probe.xml`

**Interfaces:**
- Produces:
  - `Store(context)`: `installId: String` (generato e persistito), `token: String` (`zc_` + 32 byte base64url), `tokenHash: String`, `deviceId: String?`, `nome: String`
  - `Api(store)`: `fun registra(): Pair<String, String>` (codice, scadenza); `fun statoAbbinamento(code: String): String?` (device_id o null); `fun manda(eventi: List<JSONObject>): Boolean`

- [ ] **Step 1: Scrivere `Store.kt`**

```kotlin
package com.zapp.zconnection

import android.content.Context
import android.os.Build
import android.util.Base64
import java.security.MessageDigest
import java.security.SecureRandom
import java.util.UUID

/** Identita' del dispositivo. Il token lo generiamo noi: il server ne vede solo l'hash. */
class Store(context: Context) {
    private val prefs = context.getSharedPreferences("zconnection", Context.MODE_PRIVATE)

    val installId: String
        get() = prefs.getString("install_id", null) ?: UUID.randomUUID().toString().also {
            prefs.edit().putString("install_id", it).apply()
        }

    val token: String
        get() = prefs.getString("token", null) ?: nuovoToken().also {
            prefs.edit().putString("token", it).apply()
        }

    val tokenHash: String
        get() = MessageDigest.getInstance("SHA-256")
            .digest(token.toByteArray())
            .joinToString("") { "%02x".format(it) }

    var deviceId: String?
        get() = prefs.getString("device_id", null)
        set(v) = prefs.edit().putString("device_id", v).apply()

    val nome: String get() = Build.MODEL ?: "TV"

    /** Dimentica tutto: usata sul 401, quando il dispositivo e' stato revocato. */
    fun dimentica() = prefs.edit().clear().apply()

    private fun nuovoToken(): String {
        val b = ByteArray(32)
        SecureRandom().nextBytes(b)
        return "zc_" + Base64.encodeToString(b, Base64.NO_WRAP or Base64.URL_SAFE or Base64.NO_PADDING)
    }
}
```

- [ ] **Step 2: Scrivere `Api.kt`**

`BASE_URL` e' una costante compilata (`https://zapp-mu.vercel.app`); la build `debug` la legge da `SharedPreferences` se presente, per puntare a un'istanza locale.

```kotlin
package com.zapp.zconnection

import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

class Api(private val store: Store, private val base: String = BASE_URL) {

    /** Registra il dispositivo e ritorna (codice, scadenza). */
    fun registra(): Pair<String, String>? {
        val corpo = JSONObject()
            .put("install_id", store.installId)
            .put("token_hash", store.tokenHash)
            .put("name", store.nome)
            .put("platform", "fire_tv")
        val risposta = chiama("POST", "/api/devices/pair", corpo, autenticata = false) ?: return null
        return risposta.getString("code") to risposta.getString("expires_at")
    }

    /** Ritorna il device_id quando qualcuno ha reclamato il codice, altrimenti null. */
    fun statoAbbinamento(code: String): String? {
        val risposta = chiama("GET", "/api/devices/pair/$code", null) ?: return null
        return if (risposta.optString("status") == "claimed") risposta.getString("device_id") else null
    }

    fun manda(eventi: List<JSONObject>): Boolean {
        val corpo = JSONObject()
            .put("source", "android")
            .put("events", JSONArray(eventi))
        return chiama("POST", "/api/scrobble", corpo) != null
    }

    private fun chiama(
        metodo: String,
        percorso: String,
        corpo: JSONObject?,
        autenticata: Boolean = true,
    ): JSONObject? {
        return try {
            val c = (URL(base + percorso).openConnection() as HttpURLConnection).apply {
                requestMethod = metodo
                connectTimeout = 8000
                readTimeout = 12000
                if (autenticata) setRequestProperty("Authorization", "Bearer ${store.token}")
                if (corpo != null) {
                    doOutput = true
                    setRequestProperty("Content-Type", "application/json")
                }
            }
            if (corpo != null) c.outputStream.use { it.write(corpo.toString().toByteArray()) }
            when (c.responseCode) {
                in 200..299 -> JSONObject(c.inputStream.bufferedReader().readText())
                401 -> { store.dimentica(); null }
                else -> null
            }
        } catch (e: Exception) {
            ProbeLog.add("rete: ${e.javaClass.simpleName}")
            null
        }
    }

    companion object {
        const val BASE_URL = "https://zapp-mu.vercel.app"
    }
}
```

- [ ] **Step 3: Rimuovere il codice della sonda**

```bash
cd D:/PROGETTI/ZConnection
rm app/src/main/java/com/zapp/zconnection/AdbKey.kt \
   app/src/main/java/com/zapp/zconnection/AdbClient.kt \
   app/src/main/java/com/zapp/zconnection/ProbeAccessibility.kt \
   app/src/main/res/xml/accessibility_probe.xml
```

Togliere dal manifest il `<service android:name=".ProbeAccessibility">`. **Tenere** `INTERNET` e il `NotificationListenerService`.

- [ ] **Step 4: Compilare**

Run: `JAVA_HOME=... ./gradlew --no-daemon assembleDebug`
Expected: `BUILD SUCCESSFUL`.

- [ ] **Step 5: Commit**

Il repo dell'app non e' versionato insieme a Zapp: se non e' ancora un repo git, `git init` e primo commit `feat: identita' del dispositivo e client HTTP`.

---

### Task 8: Schermata di abbinamento

**Files:**
- Create: `app/src/main/java/com/zapp/zconnection/PairingActivity.kt`
- Modify: `app/src/main/AndroidManifest.xml` (diventa l'activity di lancio)

**Interfaces:**
- Consumes: `Store`, `Api` (Task 7)
- Produces: al termine dell'abbinamento avvia `ConnectedActivity` (Task 10)

- [ ] **Step 1: Scrivere la schermata**

Fondo nero, codice a 6 cifre in grande (72sp, spaziato), sotto il QR scaricato da `/api/devices/pair/{code}/qr` con una `HttpURLConnection` e `BitmapFactory`, e la riga "Apri Zapp → Profilo → Dispositivi e inserisci questo codice". Un `Handler` sonda `statoAbbinamento(code)` **ogni 3 secondi**; alla risposta salva `deviceId` e passa a `ConnectedActivity`. Se il codice scade (10 minuti) se ne chiede un altro da solo, senza che l'utente tocchi niente.

- [ ] **Step 2: Renderla l'activity di lancio**

Nel manifest, spostare `MAIN` + `LAUNCHER` + `LEANBACK_LAUNCHER` su `PairingActivity` e togliere l'`intent-filter` da `MainActivity` (che viene eliminata nel Task 10).

- [ ] **Step 3: Provare sul dispositivo vero**

Installare, aprire, verificare: compare un codice; inserirlo in Zapp da telefono; entro tre secondi la TV passa alla schermata successiva. Con un codice mai inserito, la schermata resta e dopo dieci minuti il codice cambia.

- [ ] **Step 4: Commit**

```bash
git add app/src/main/java/com/zapp/zconnection/PairingActivity.kt app/src/main/AndroidManifest.xml
git commit -m "feat: schermata di abbinamento con codice e QR"
```

---

### Task 9: Servizio di ascolto e invio

**Files:**
- Create: `app/src/main/java/com/zapp/zconnection/Sender.kt`
- Modify: `app/src/main/java/com/zapp/zconnection/ProbeListener.kt` (diventa `ZListener`)
- Modify: `app/src/main/java/com/zapp/zconnection/SessionProbe.kt`

**Interfaces:**
- Consumes: `Api` (Task 7), `SessionProbe` (esistente)
- Produces: `Sender.accoda(ev: JSONObject)`, invio a lotti di 50 con backoff; coda su file, massimo 200 eventi.

- [ ] **Step 1: Far produrre a `SessionProbe` eventi invece di righe di log**

Sostituire le chiamate a `ProbeLog.add` nei callback con la costruzione di un `JSONObject` nella forma di `AndroidEvent` (Task 5): `id` (UUID), `at` (ISO 8601 UTC), `package`, `state` (`playing`/`paused`/`stopped`/`buffering`), `position_ms`, `duration_ms` (da `MediaMetadata.METADATA_KEY_DURATION`, `null` se assente o zero), `title` (`METADATA_KEY_TITLE`, `null` se vuoto).

**Battito ogni 30 secondi** oltre ai cambi di stato: Prime non notifica la posizione durante la riproduzione (sonda §4), quindi senza battito la sessione sembrerebbe ferma.

- [ ] **Step 2: Scrivere `Sender.kt`**

Coda in memoria + file (`filesDir/coda.json`), invio quando la coda supera 1 elemento o ogni 30 s, lotti da 50, backoff 5 s → 15 s → 60 s sugli errori di rete. Sul `401` la coda si svuota e si torna a `PairingActivity`: il dispositivo e' stato revocato.

- [ ] **Step 3: Provare sul dispositivo vero**

Far partire un episodio su NOW e uno su Disney+; verificare in Supabase (MCP `execute_sql`) che compaiano righe in `watch_sessions` per quel `device_id`, e che dopo due minuti di riproduzione l'entry appaia in `watch_entries`.

- [ ] **Step 4: Commit**

```bash
git commit -am "feat: lettura delle sessioni e invio a lotti"
```

---

### Task 10: Schermate Permesso e Collegata

**Files:**
- Create: `app/src/main/java/com/zapp/zconnection/PermissionActivity.kt`
- Create: `app/src/main/java/com/zapp/zconnection/ConnectedActivity.kt`
- Delete: `app/src/main/java/com/zapp/zconnection/MainActivity.kt`

**Interfaces:**
- Consumes: `Store` (Task 7)
- Produces: nessuna, sono terminali.

- [ ] **Step 1: Scrivere `PermissionActivity`**

Dice **cosa manca e cosa sblocca**, non chiede. Tre casi, decisi a runtime:

1. `Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS` risolve (Android TV): un bottone la apre.
2. Non risolve (Fire OS): si mostra l'indirizzo IP del dispositivo e la frase "Apri Zapp → Dispositivi → Attiva il tracciamento completo: ti guida dal computer". **Nessun tentativo di concedersi il permesso da solo**: la sonda del 12/09 ha dimostrato che adbd non serve i chiamanti locali.
3. Permesso gia' concesso: la schermata non compare affatto.

Il controllo e' quello gia' scritto nella sonda (`Settings.Secure.getString(contentResolver, "enabled_notification_listeners")`), rifatto a ogni `onResume`.

- [ ] **Step 2: Scrivere `ConnectedActivity`**

Nome del dispositivo, membri abbinati, stato ("Tracciamento completo" o "Modalita' base"), ultimo evento inviato, e due voci: "Aggiungi persona" (nuovo codice con lo stesso `install_id`) e "Scollega questa TV" (`dimentica()` e ritorno a `PairingActivity`).

- [ ] **Step 3: Eliminare `MainActivity`**

Era la schermata della sonda. Togliere anche i riferimenti nel manifest.

- [ ] **Step 4: Provare sul dispositivo vero**

Con permesso concesso: `ConnectedActivity` dice "Tracciamento completo". Revocarlo (`settings put secure enabled_notification_listeners ''` da adb) e riaprire: dice "Modalita' base" e non si rompe.

- [ ] **Step 5: Commit**

```bash
git commit -am "feat: schermate permesso e collegata"
```

---

# Parte C — Collaudo

### Task 11: Collaudo end-to-end sulla TV

**Files:** nessuno.

- [ ] **Step 1: Sicurezza**

Run: `node scripts/security-check.mjs` contro un'istanza avviata.
Expected: nessuna regressione su header, rotte protette, open redirect.

- [ ] **Step 2: Consulenti del database**

MCP Supabase `get_advisors` (security e performance) dopo la migration 0042.
Expected: nessun avviso nuovo su `pairing_codes` o `claim_pairing_code`.

- [ ] **Step 3: Il giro completo, a mano**

Playwright non riproduce contenuti protetti: questa parte si fa sulla TV vera.

1. Installare l'app su una Fire TV mai abbinata → compare un codice.
2. Inserirlo in Zapp da telefono → la TV passa a "Collegata" entro tre secondi.
3. Guardare **due minuti** di un episodio su NOW → l'entry compare in libreria con la stagione/episodio giusti.
4. Guardare **due minuti** di un film su Disney+ → compare in libreria.
5. Sfogliare il catalogo Netflix senza aprire niente per un minuto → **nessuna** entry nuova (e' la prova della soglia anti-anteprima).
6. Revocare il dispositivo da `/devices` → alla richiesta successiva la TV torna al codice.

- [ ] **Step 4: Aggiornare la documentazione**

Aggiungere a `docs/architecture/zconnection.md` una sezione "Su TV" con: le due modalita', la soglia anti-anteprima e il perche', i package riconosciuti, e il rimando alla sonda. **Non duplicare** cio' che sta nella spec: qui va solo quello che serve a chi tocca il codice.

- [ ] **Step 5: Commit**

```bash
git add docs/architecture/zconnection.md
git commit -m "docs: ZConnection su TV, abbinamento e ascolto"
```

---

## Cosa resta al Piano 2

Coda `device_commands`, sondaggio dei comandi, deep link per piattaforma (le forme verificate stanno nella sonda §3), il tondo TV nella scheda titolo con il foglio di scelta fra piu' TV, la modalita' base con "Da confermare", e la correlazione fra un lancio e la sessione anonima che ne segue su Netflix, Prime e Apple TV.
