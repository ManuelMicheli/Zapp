# Abbinamento vicino — piano di implementazione

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Il telefono trova le TV sulla rete locale e le abbina con un tocco, al posto delle sei cifre digitate col telecomando.

**Architecture:** ZappTV si annuncia con `NsdManager` mentre è sulla schermata di abbinamento e apre un server HTTP locale. Il telefono la trova col modulo nativo `zapp-discovery`, le manda il proprio `device_id`, la TV chiede conferma sullo schermo e registra il consenso sul server col token che già usa per il poll. Il telefono reclama con la propria sessione Supabase: **sulla rete locale non viaggia nessun segreto** e il poll della TV resta invariato.

**Tech Stack:** Next.js 15 App Router + TypeScript strict + Supabase (Postgres, RLS, RPC `security definer`) nel repo Zapp; Expo + moduli nativi Kotlin in ZappMobile; Android/Kotlin + Compose in ZappTV. Test: vitest sulle sole funzioni pure.

**Spec:** `docs/superpowers/specs/2026-09-14-abbinamento-vicino-design.md` — leggila prima di iniziare, il piano argomenta da lì.

## Global Constraints

- Tre repo: **Zapp** `D:\PROGETTI\Zapp\.claude\worktrees\abbinamento-vicino` (questo albero), **ZappMobile** `D:\PROGETTI\ZappMobile`, **ZappTV** `D:\PROGETTI\ZappTV`.
- UI e commenti in **italiano**. Prettier: virgolette doppie, virgole finali, `printWidth` 90.
- Le migration si applicano con gli strumenti MCP di Supabase (`apply_migration`, nome = nome del file), **mai** con `supabase db push`. Dopo: `generate_typescript_types` riscrive `src/types/database.ts`.
- Progetto Supabase: `bbuhwzdbzxgydewmcdwd`.
- `src/lib/native/protocol.ts` (Zapp) e `src/bridge/protocol.ts` (ZappMobile) sono **copie gemelle byte per byte**: si cambiano nello stesso giro.
- I messaggi del ponte si validano **campo per campo, mai un cast**.
- Vitest copre solo funzioni pure (`src/**/*.test.ts`). Il resto si verifica con `pnpm typecheck && pnpm lint && pnpm build`.
- Non si pubblica da qui: si pubblica solo via `origin/main` con `node scripts/rilascio.mjs` (vedi `CLAUDE.md`).
- Nessuna libreria UI esterna, nessun `localStorage` per dati utente.

---

### Task 1: Migration e RPC del consenso

**Files:**
- Create: `supabase/migrations/0055_abbinamento_vicino.sql`
- Modify: `src/types/database.ts` (rigenerato, non scritto a mano)

**Interfaces:**
- Consumes: niente.
- Produces: colonna `public.pairing_codes.consent_device_id uuid`; funzione `public.claim_pairing_by_consent(p_install_id uuid, p_device_id uuid) returns jsonb` (chiavi `device_id`, `name`); funzione interna `public._claim_pairing_row(p_riga public.pairing_codes, p_uid uuid) returns jsonb`.

- [ ] **Step 1: Leggi la migration esistente per non contraddirla**

Leggi `supabase/migrations/0045_tv_pairing.sql`. Contiene la tabella `pairing_codes` e la funzione `claim_pairing_code`, il cui corpo va **spostato** (non copiato) nella funzione interna.

- [ ] **Step 2: Scrivi la migration**

Crea `supabase/migrations/0055_abbinamento_vicino.sql`:

```sql
-- Abbinamento dalla rete locale: il telefono trova la TV, la TV chiede conferma
-- a schermo e registra qui il consenso. Sulla LAN non viaggia nessun segreto,
-- solo il device_id del telefono: la prova e' la sessione di chi reclama.
alter table public.pairing_codes
  add column consent_device_id uuid references public.devices (id) on delete cascade;

create index pairing_codes_consenso_idx
  on public.pairing_codes (install_id, consent_device_id)
  where consent_device_id is not null;

-- Il corpo del reclamo, estratto da claim_pairing_code: due copie di questa
-- logica divergerebbero alla prima modifica. Resta security definer perche'
-- pairing_codes e devices sono chiuse; e' revocata anche ad authenticated,
-- perche' la chiamano solo le due funzioni qui sotto — dentro le quali
-- current_user e' il proprietario, non l'utente.
create or replace function public._claim_pairing_row(
  p_riga public.pairing_codes,
  p_uid uuid
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_device public.devices;
begin
  select * into v_device from public.devices where install_id = p_riga.install_id;

  if not found then
    insert into public.devices (install_id, token_hash, name, platform)
    values (p_riga.install_id, p_riga.token_hash, p_riga.name, p_riga.platform)
    returning * into v_device;
  end if;

  insert into public.device_members (device_id, user_id)
  values (v_device.id, p_uid)
  on conflict (device_id, user_id) do nothing;

  update public.pairing_codes
  set claimed_by = p_uid, claimed_at = now()
  where code = p_riga.code;

  return jsonb_build_object('device_id', v_device.id, 'name', v_device.name);
end;
$$;

revoke all on function public._claim_pairing_row(public.pairing_codes, uuid)
  from anon, public, authenticated;

-- Invariata nel comportamento: solo il corpo se n'e' andato.
create or replace function public.claim_pairing_code(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := (select auth.uid());
  v_riga public.pairing_codes;
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

  return public._claim_pairing_row(v_riga, v_uid);
end;
$$;

revoke all on function public.claim_pairing_code(text) from anon, public;
grant execute on function public.claim_pairing_code(text) to authenticated;

-- Reclamo per consenso: tre controlli, e servono tutti e tre.
create or replace function public.claim_pairing_by_consent(
  p_install_id uuid,
  p_device_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := (select auth.uid());
  v_riga public.pairing_codes;
begin
  if v_uid is null then
    raise exception 'non autenticato' using errcode = '28000';
  end if;

  -- Il device_id viaggia in chiaro sulla rete locale: da solo non e' una prova.
  -- Chi reclama deve essere membro di quel telefono. Senza questo controllo,
  -- chi intercettasse il device_id potrebbe reclamare al posto del proprietario.
  if not exists (
    select 1 from public.device_members
    where device_id = p_device_id and user_id = v_uid
  ) then
    raise exception 'consenso non valido' using errcode = 'P0002';
  end if;

  select * into v_riga
  from public.pairing_codes
  where install_id = p_install_id
    and consent_device_id = p_device_id
    and expires_at > now()
  for update;

  if not found then
    raise exception 'consenso non valido' using errcode = 'P0002';
  end if;

  return public._claim_pairing_row(v_riga, v_uid);
end;
$$;

revoke all on function public.claim_pairing_by_consent(uuid, uuid) from anon, public;
grant execute on function public.claim_pairing_by_consent(uuid, uuid) to authenticated;
```

- [ ] **Step 3: Applica la migration**

Con lo strumento MCP `apply_migration`: `project_id` = `bbuhwzdbzxgydewmcdwd`, `name` = `0055_abbinamento_vicino`, `query` = il contenuto del file.

- [ ] **Step 4: Verifica che la colonna e le funzioni esistano**

Con `execute_sql`:

```sql
select column_name from information_schema.columns
where table_schema = 'public' and table_name = 'pairing_codes'
  and column_name = 'consent_device_id';

select proname, pg_get_function_identity_arguments(oid) as args
from pg_proc
where proname in ('claim_pairing_code', 'claim_pairing_by_consent', '_claim_pairing_row')
order by proname;
```

Atteso: una riga per la colonna, tre righe per le funzioni.

- [ ] **Step 5: Verifica che il reclamo per codice funzioni ancora**

Il rischio dello spostamento è aver rotto il flusso esistente. Con `execute_sql`:

```sql
-- niente utente: deve fallire con 28000, non con un errore di funzione mancante
select public.claim_pairing_code('000000');
```

Atteso: errore `non autenticato` (codice `28000`). Un errore diverso (per esempio "function does not exist") significa che la migration è sbagliata.

- [ ] **Step 6: Rigenera i tipi**

Con lo strumento MCP `generate_typescript_types`, e salva l'output in `src/types/database.ts`. Poi:

Run: `pnpm typecheck`
Expected: nessun errore.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/0055_abbinamento_vicino.sql src/types/database.ts
git commit -m "feat(devices): consenso di abbinamento dalla rete locale"
```

---

### Task 2: Rotta del consenso

**Files:**
- Create: `src/lib/devices/consent.ts`
- Create: `src/lib/devices/consent.test.ts`
- Create: `src/app/api/devices/pair/consent/route.ts`
- Read first: `src/app/api/devices/pair/[code]/route.ts` (l'autenticazione della TV si copia da lì)

**Interfaces:**
- Consumes: `claim_pairing_by_consent` da Task 1; `isCodiceValido` da `@/lib/devices/pairing`; `rateLimit(key, limit, windowSeconds, opzioni?)` da `@/lib/rate-limit`; `createServiceClient()` da `@/lib/supabase/server`.
- Produces: `parseCorpoConsenso(valore: unknown): { code: string; phoneDeviceId: string } | null`; rotta `POST /api/devices/pair/consent` che risponde `200 { install_id }`.

- [ ] **Step 1: Scrivi il test che fallisce**

Crea `src/lib/devices/consent.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { parseCorpoConsenso } from "./consent";

const UUID = "3f2504e0-4f89-11d3-9a0c-0305e82c3301";

describe("parseCorpoConsenso", () => {
  it("accetta un corpo conforme", () => {
    expect(parseCorpoConsenso({ code: "012345", phone_device_id: UUID })).toEqual({
      code: "012345",
      phoneDeviceId: UUID,
    });
  });

  it("rifiuta un codice che non e' di sei cifre", () => {
    expect(parseCorpoConsenso({ code: "12345", phone_device_id: UUID })).toBeNull();
    expect(parseCorpoConsenso({ code: "abcdef", phone_device_id: UUID })).toBeNull();
  });

  it("rifiuta un device_id che non e' un uuid", () => {
    expect(parseCorpoConsenso({ code: "012345", phone_device_id: "no" })).toBeNull();
  });

  it("rifiuta quello che non e' un oggetto", () => {
    expect(parseCorpoConsenso(null)).toBeNull();
    expect(parseCorpoConsenso("012345")).toBeNull();
    expect(parseCorpoConsenso([])).toBeNull();
  });
});
```

- [ ] **Step 2: Esegui il test e verifica che fallisca**

Run: `pnpm test src/lib/devices/consent.test.ts`
Expected: FAIL, "Failed to resolve import ./consent".

- [ ] **Step 3: Scrivi il parser**

Crea `src/lib/devices/consent.ts`:

```ts
/**
 * Il corpo di `POST /api/devices/pair/consent`, validato campo per campo.
 *
 * Lo manda la **TV**, non il telefono: il `phone_device_id` glielo ha appena
 * passato il telefono sulla rete locale, quindi qui e' un dato di terzi e si
 * controlla come tale. Funzione pura: si prova con vitest.
 */

import { isCodiceValido } from "./pairing";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type CorpoConsenso = { code: string; phoneDeviceId: string };

export function parseCorpoConsenso(valore: unknown): CorpoConsenso | null {
  if (typeof valore !== "object" || valore === null || Array.isArray(valore)) return null;
  const msg = valore as Record<string, unknown>;
  if (!isCodiceValido(msg.code)) return null;
  const id = msg.phone_device_id;
  if (typeof id !== "string" || !UUID_RE.test(id)) return null;
  return { code: msg.code, phoneDeviceId: id };
}
```

- [ ] **Step 4: Esegui il test e verifica che passi**

Run: `pnpm test src/lib/devices/consent.test.ts`
Expected: PASS, 4 test.

- [ ] **Step 5: Scrivi la rotta**

Crea `src/app/api/devices/pair/consent/route.ts`:

```ts
import { createHash } from "node:crypto";
import { type NextRequest, NextResponse } from "next/server";
import { parseCorpoConsenso } from "@/lib/devices/consent";
import { rateLimit } from "@/lib/rate-limit";
import { createServiceClient } from "@/lib/supabase/server";

/** La risposta riguarda un abbinamento in corso: mai in cache. */
const NO_STORE = { "Cache-Control": "private, no-store" };

/**
 * La TV dice al server che l'utente, col telecomando, ha autorizzato un
 * telefono ad abbinarla.
 *
 * Si autentica col **proprio** token di abbinamento, lo stesso del poll: senza,
 * chiunque conoscesse un codice a sei cifre potrebbe regalare una TV a un
 * dispositivo qualsiasi. Il telefono, subito dopo, reclama con la propria
 * sessione: e' quella la prova, non il `phone_device_id` che passa in chiaro
 * sulla rete locale.
 */
export async function POST(request: NextRequest) {
  const corpo = parseCorpoConsenso(await request.json().catch(() => null));
  if (!corpo) {
    return NextResponse.json(
      { error: "richiesta non valida" },
      { status: 400, headers: NO_STORE },
    );
  }

  const auth = request.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (token.length < 20) {
    return NextResponse.json(
      { error: "non autorizzato" },
      { status: 401, headers: NO_STORE },
    );
  }
  const tokenHash = createHash("sha256").update(token).digest("hex");

  if (!(await rateLimit(`pair-consent:${tokenHash}`, 10, 60))) {
    return NextResponse.json(
      { error: "troppe richieste" },
      { status: 429, headers: NO_STORE },
    );
  }

  const service = createServiceClient();
  const { data: riga, error } = await service
    .from("pairing_codes")
    .select("install_id, token_hash, expires_at")
    .eq("code", corpo.code)
    .maybeSingle();

  if (error) {
    console.error("pair-consent: lettura fallita", error);
    return NextResponse.json(
      { error: "errore interno" },
      { status: 500, headers: NO_STORE },
    );
  }

  // Riga assente e hash diverso danno la stessa risposta: un 404 direbbe a uno
  // sconosciuto che quel codice esiste.
  if (!riga || riga.token_hash !== tokenHash) {
    return NextResponse.json(
      { error: "non autorizzato" },
      { status: 401, headers: NO_STORE },
    );
  }

  // Il codice ruota ogni dieci minuti e il rinnovo cancella la riga: un consenso
  // che arriva a cavallo del rinnovo cade qui. La TV mostra "Riprova" e non si
  // tenta di spostarlo sulla riga nuova — sposterebbe un'autorizzazione da un
  // codice a un altro, cioe' proprio cio' che il consenso deve impedire.
  if (new Date(riga.expires_at).getTime() <= Date.now()) {
    return NextResponse.json(
      { error: "codice scaduto" },
      { status: 410, headers: NO_STORE },
    );
  }

  const { data: telefono } = await service
    .from("devices")
    .select("id")
    .eq("id", corpo.phoneDeviceId)
    .in("platform", ["ios", "android"])
    .maybeSingle();
  if (!telefono) {
    return NextResponse.json(
      { error: "richiesta non valida" },
      { status: 400, headers: NO_STORE },
    );
  }

  const { error: errUpd } = await service
    .from("pairing_codes")
    .update({ consent_device_id: telefono.id })
    .eq("code", corpo.code)
    .eq("token_hash", tokenHash);
  if (errUpd) {
    console.error("pair-consent: update fallita", errUpd);
    return NextResponse.json(
      { error: "errore interno" },
      { status: 500, headers: NO_STORE },
    );
  }

  return NextResponse.json({ install_id: riga.install_id }, { headers: NO_STORE });
}

export const dynamic = "force-dynamic";
```

- [ ] **Step 6: Verifica tipi e stile**

Run: `pnpm typecheck && pnpm lint`
Expected: nessun errore.

- [ ] **Step 7: Commit**

```bash
git add src/lib/devices/consent.ts src/lib/devices/consent.test.ts src/app/api/devices/pair/consent/route.ts
git commit -m "feat(devices): rotta del consenso di abbinamento"
```

---

### Task 3: Server Action del reclamo per consenso

**Files:**
- Modify: `src/app/(app)/devices/actions.ts` (aggiungi in fondo, accanto a `claimPairingCode`)

**Interfaces:**
- Consumes: `claim_pairing_by_consent` da Task 1.
- Produces: `claimPairedByConsent(installId: string, deviceId: string): Promise<{ ok: true; name: string } | { ok: false; error: string }>`.

- [ ] **Step 1: Leggi `claimPairingCode`**

Aprila in `src/app/(app)/devices/actions.ts`. La nuova azione ne ricalca la struttura: sessione, tetti, RPC, `revalidatePath`. Nota gli helper già importati nel file (`isUuid`, `rateLimit`, `headers`, `revalidatePath`, `createClient`): usali, non reimportarli diversamente.

- [ ] **Step 2: Scrivi l'azione**

Aggiungi in fondo a `src/app/(app)/devices/actions.ts`:

```ts
/**
 * Reclama una TV che ha dato il consenso dalla rete locale.
 *
 * Il gemello di `claimPairingCode` per l'abbinamento vicino: qui non c'e' un
 * codice da digitare, c'e' una TV che ha gia' chiesto conferma a schermo. La
 * prova che si puo' reclamare la porta la RPC, che pretende **sia** il consenso
 * su quell'`install_id` **sia** che chi chiama sia membro di quel telefono: il
 * `device_id` passa in chiaro sulla rete locale, quindi da solo non vale.
 */
export async function claimPairedByConsent(
  installId: string,
  deviceId: string,
): Promise<{ ok: true; name: string } | { ok: false; error: string }> {
  if (!isUuid(installId) || !isUuid(deviceId)) {
    return { ok: false, error: "Richiesta non valida." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Sessione scaduta." };

  if (!(await rateLimit(`claim-consent:${user.id}`, 10, 60, { condiviso: true }))) {
    return { ok: false, error: "Troppi tentativi, riprova fra un minuto." };
  }
  const indirizzo = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim();
  if (
    indirizzo &&
    !(await rateLimit(`claim-consent-ip:${indirizzo}`, 20, 60, { condiviso: true }))
  ) {
    return { ok: false, error: "Troppi tentativi, riprova fra un minuto." };
  }

  const { data, error } = await supabase.rpc("claim_pairing_by_consent", {
    p_install_id: installId,
    p_device_id: deviceId,
  });
  if (error) {
    console.error("claimPairedByConsent", error);
    // Messaggio unico: chi sbaglia non deve capire quale dei tre controlli e'
    // fallito.
    return { ok: false, error: "Abbinamento non riuscito, riprova." };
  }

  const nome =
    data && typeof data === "object" && typeof (data as { name?: unknown }).name === "string"
      ? (data as { name: string }).name
      : "TV";

  revalidatePath("/devices");
  return { ok: true, name: nome };
}
```

- [ ] **Step 3: Verifica tipi e stile**

Run: `pnpm typecheck && pnpm lint`
Expected: nessun errore. Se `claim_pairing_by_consent` non è nei tipi, Task 1 Step 6 non è stato fatto.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(app)/devices/actions.ts"
git commit -m "feat(devices): reclamo per consenso dalla rete locale"
```

---

### Task 4: I due messaggi del ponte (Zapp e ZappMobile)

**Files:**
- Modify: `src/lib/native/protocol.ts` (Zapp)
- Modify: `src/lib/native/protocol.test.ts` (Zapp)
- Modify: `D:\PROGETTI\ZappMobile\src\bridge\protocol.ts` (copia gemella, **identica**)
- Modify: `D:\PROGETTI\ZappMobile\src\bridge\native.ts`
- Modify: `D:\PROGETTI\ZappMobile\src\bridge\native.test.ts`

**Interfaces:**
- Consumes: niente.
- Produces: tipi `TvTrovata`, `MotivoTv`; messaggi `discoverTv` e `connectTv` (web → nativo), `tvFound`, `tvConsent`, `tvError` (nativo → web); helper `isIndirizzoPrivato(valore: unknown): valore is string` esportato da entrambi i `protocol.ts`.

- [ ] **Step 1: Scrivi i test che falliscono (repo Zapp)**

Aggiungi in fondo a `src/lib/native/protocol.test.ts`:

```ts
describe("parseNativeMessage — TV vicine", () => {
  it("accetta un tvFound con una TV Zapp", () => {
    const msg = parseNativeMessage({
      type: "tvFound",
      devices: [
        {
          kind: "zapp",
          name: "Fire TV di Mirko",
          host: "192.168.1.7",
          port: 41234,
          installId: "3f2504e0-4f89-11d3-9a0c-0305e82c3301",
        },
      ],
    });
    expect(msg).toEqual({
      type: "tvFound",
      devices: [
        {
          kind: "zapp",
          name: "Fire TV di Mirko",
          host: "192.168.1.7",
          port: 41234,
          installId: "3f2504e0-4f89-11d3-9a0c-0305e82c3301",
        },
      ],
    });
  });

  it("accetta una Fire TV senza porta ne' installId", () => {
    const msg = parseNativeMessage({
      type: "tvFound",
      devices: [{ kind: "firetv", name: "Fire TV di Mirko", host: "192.168.1.7" }],
    });
    expect(msg).toEqual({
      type: "tvFound",
      devices: [{ kind: "firetv", name: "Fire TV di Mirko", host: "192.168.1.7" }],
    });
  });

  it("scarta un indirizzo che non e' privato", () => {
    expect(
      parseNativeMessage({
        type: "tvFound",
        devices: [{ kind: "zapp", name: "TV", host: "8.8.8.8", port: 80 }],
      }),
    ).toBeNull();
  });

  it("scarta un elenco piu' lungo di sedici", () => {
    const devices = Array.from({ length: 17 }, () => ({
      kind: "firetv",
      name: "TV",
      host: "192.168.1.7",
    }));
    expect(parseNativeMessage({ type: "tvFound", devices })).toBeNull();
  });

  it("accetta tvConsent con un installId valido e scarta il resto", () => {
    expect(
      parseNativeMessage({
        type: "tvConsent",
        installId: "3f2504e0-4f89-11d3-9a0c-0305e82c3301",
      }),
    ).toEqual({ type: "tvConsent", installId: "3f2504e0-4f89-11d3-9a0c-0305e82c3301" });
    expect(parseNativeMessage({ type: "tvConsent", installId: "no" })).toBeNull();
  });

  it("accetta solo i motivi previsti in tvError", () => {
    expect(parseNativeMessage({ type: "tvError", motivo: "rifiutato" })).toEqual({
      type: "tvError",
      motivo: "rifiutato",
    });
    expect(parseNativeMessage({ type: "tvError", motivo: "boh" })).toBeNull();
  });
});
```

- [ ] **Step 2: Esegui i test e verifica che falliscano**

Run: `pnpm test src/lib/native/protocol.test.ts`
Expected: FAIL — i nuovi casi tornano `null` perché `parseNativeMessage` non li conosce.

- [ ] **Step 3: Aggiungi tipi e parser in `src/lib/native/protocol.ts`**

Ai tipi:

```ts
/** Una TV vista sulla rete locale. `zapp` la si puo' toccare, `firetv` no. */
export type TvTrovata = {
  kind: "zapp" | "firetv";
  name: string;
  host: string;
  port?: number;
  installId?: string;
};

/** Perche' un abbinamento vicino non e' andato a buon fine. */
export type MotivoTv = "rifiutato" | "scaduto" | "occupato" | "rete" | "permesso";
```

A `NativeToWeb`, tre rami in più:

```ts
  | { type: "tvFound"; devices: TvTrovata[] }
  | { type: "tvConsent"; installId: string }
  | { type: "tvError"; motivo: MotivoTv };
```

A `WebToNative`, due rami in più:

```ts
  | { type: "discoverTv"; action: "start" | "stop" }
  | { type: "connectTv"; host: string; port: number; name: string; deviceId: string };
```

Le costanti e l'helper dell'indirizzo, accanto agli altri:

```ts
/** Oltre sedici TV in una casa non e' un elenco, e' un abuso. */
const TV_MAX = 16;

const IPV4_RE = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;

/**
 * Vero solo per un IPv4 privato o link-local.
 *
 * Il guscio dice alla pagina dove ha trovato una TV, e la pagina dice al guscio
 * a chi connettersi: se passasse un indirizzo pubblico, una pagina compromessa
 * potrebbe usare il telefono per bussare a un server qualsiasi.
 */
export function isIndirizzoPrivato(valore: unknown): valore is string {
  if (typeof valore !== "string") return false;
  const m = IPV4_RE.exec(valore);
  if (!m) return false;
  const ottetti = [Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4])];
  if (ottetti.some((o) => o > 255)) return false;
  const [a, b] = ottetti;
  return (
    a === 10 ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 169 && b === 254)
  );
}

const MOTIVI_TV: readonly string[] = [
  "rifiutato",
  "scaduto",
  "occupato",
  "rete",
  "permesso",
];

/** Una TV dell'elenco, o null se un solo campo non e' conforme. */
function tvTrovata(valore: unknown): TvTrovata | null {
  if (typeof valore !== "object" || valore === null || Array.isArray(valore)) return null;
  const v = valore as Record<string, unknown>;
  if (v.kind !== "zapp" && v.kind !== "firetv") return null;
  const name = stringa(v.name, DEVICE_NAME_MAX);
  if (name === null) return null;
  if (!isIndirizzoPrivato(v.host)) return null;

  const tv: TvTrovata = { kind: v.kind, name, host: v.host };
  if (v.port !== undefined) {
    if (typeof v.port !== "number" || !Number.isInteger(v.port)) return null;
    if (v.port < 1 || v.port > 65535) return null;
    tv.port = v.port;
  }
  if (v.installId !== undefined) {
    if (typeof v.installId !== "string" || !UUID_RE.test(v.installId)) return null;
    tv.installId = v.installId;
  }
  return tv;
}
```

E in `parseNativeMessage`, tre `case` in più:

```ts
    case "tvFound": {
      if (!Array.isArray(msg.devices) || msg.devices.length > TV_MAX) return null;
      const devices: TvTrovata[] = [];
      for (const grezza of msg.devices) {
        const tv = tvTrovata(grezza);
        // Una riga malformata butta il messaggio intero: un elenco meta' buono
        // e meta' no non e' un elenco di cui fidarsi.
        if (tv === null) return null;
        devices.push(tv);
      }
      return { type: "tvFound", devices };
    }
    case "tvConsent": {
      if (typeof msg.installId !== "string" || !UUID_RE.test(msg.installId)) return null;
      return { type: "tvConsent", installId: msg.installId };
    }
    case "tvError": {
      if (typeof msg.motivo !== "string" || !MOTIVI_TV.includes(msg.motivo)) return null;
      return { type: "tvError", motivo: msg.motivo as MotivoTv };
    }
```

- [ ] **Step 4: Esegui i test e verifica che passino**

Run: `pnpm test src/lib/native/protocol.test.ts`
Expected: PASS, tutti i casi vecchi compresi.

- [ ] **Step 5: Copia il file gemello in ZappMobile**

Copia `src/lib/native/protocol.ts` (Zapp) su `D:\PROGETTI\ZappMobile\src\bridge\protocol.ts`, **byte per byte**, cambiando solo la prima riga di commento che indica la sorgente (nel file mobile dice che la sorgente è il repo Zapp). Verifica:

```bash
diff <(tail -n +2 "D:/PROGETTI/Zapp/.claude/worktrees/abbinamento-vicino/src/lib/native/protocol.ts") <(tail -n +2 "D:/PROGETTI/ZappMobile/src/bridge/protocol.ts")
```

Expected: nessuna differenza.

- [ ] **Step 6: Scrivi i test della validazione web → nativo (ZappMobile)**

In `D:\PROGETTI\ZappMobile\src\bridge\native.test.ts`, aggiungi:

```ts
describe("parseWebMessage — TV vicine", () => {
  it("accetta discoverTv", () => {
    expect(parseWebMessage(JSON.stringify({ type: "discoverTv", action: "start" }))).toEqual(
      { type: "discoverTv", action: "start" },
    );
    expect(parseWebMessage(JSON.stringify({ type: "discoverTv", action: "boh" }))).toBeNull();
  });

  it("accetta connectTv verso un indirizzo privato", () => {
    const msg = {
      type: "connectTv",
      host: "192.168.1.7",
      port: 41234,
      name: "Telefono di Manuel",
      deviceId: "3f2504e0-4f89-11d3-9a0c-0305e82c3301",
    };
    expect(parseWebMessage(JSON.stringify(msg))).toEqual(msg);
  });

  it("rifiuta connectTv verso un indirizzo pubblico", () => {
    const msg = {
      type: "connectTv",
      host: "8.8.8.8",
      port: 80,
      name: "Telefono di Manuel",
      deviceId: "3f2504e0-4f89-11d3-9a0c-0305e82c3301",
    };
    expect(parseWebMessage(JSON.stringify(msg))).toBeNull();
  });
});
```

- [ ] **Step 7: Esegui e verifica che falliscano**

Run (in `D:\PROGETTI\ZappMobile`): `npm test -- src/bridge/native.test.ts`
Expected: FAIL.

- [ ] **Step 8: Aggiungi i due rami in `native.ts` (ZappMobile)**

In `parseWebMessage`, dentro lo `switch`:

```ts
    case "discoverTv": {
      if (msg.action !== "start" && msg.action !== "stop") return null;
      return { type: "discoverTv", action: msg.action };
    }
    case "connectTv": {
      // L'indirizzo arriva dalla pagina: se non fosse privato, una pagina
      // compromessa userebbe il telefono per bussare a un server qualsiasi.
      if (!isIndirizzoPrivato(msg.host)) return null;
      if (typeof msg.port !== "number" || !Number.isInteger(msg.port)) return null;
      if (msg.port < 1 || msg.port > 65535) return null;
      const name = stringa(msg.name, 60);
      if (name === null) return null;
      if (typeof msg.deviceId !== "string" || !UUID_RE.test(msg.deviceId)) return null;
      return { type: "connectTv", host: msg.host, port: msg.port, name, deviceId: msg.deviceId };
    }
```

Aggiungi l'import di `isIndirizzoPrivato` da `./protocol`.

- [ ] **Step 9: Esegui e verifica che passino**

Run (in `D:\PROGETTI\ZappMobile`): `npm test -- src/bridge/native.test.ts`
Expected: PASS.

- [ ] **Step 10: Commit nei due repo**

```bash
# in D:\PROGETTI\Zapp\.claude\worktrees\abbinamento-vicino
git add src/lib/native/protocol.ts src/lib/native/protocol.test.ts
git commit -m "feat(ponte): messaggi per le TV sulla rete locale"

# in D:\PROGETTI\ZappMobile
git add src/bridge/protocol.ts src/bridge/native.ts src/bridge/native.test.ts
git commit -m "feat(ponte): messaggi per le TV sulla rete locale"
```

---

### Task 5: Modulo nativo `zapp-discovery` (ZappMobile, Android)

**Files:**
- Create: `D:\PROGETTI\ZappMobile\modules\zapp-discovery\expo-module.config.json`
- Create: `D:\PROGETTI\ZappMobile\modules\zapp-discovery\index.ts`
- Create: `D:\PROGETTI\ZappMobile\modules\zapp-discovery\android\build.gradle`
- Create: `D:\PROGETTI\ZappMobile\modules\zapp-discovery\android\src\main\AndroidManifest.xml`
- Create: `.../android/src/main/java/expo/modules/zappdiscovery/ZappDiscoveryModule.kt`
- Create: `.../android/src/main/java/expo/modules/zappdiscovery/Nsd.kt`
- Create: `.../android/src/main/java/expo/modules/zappdiscovery/Ssdp.kt`
- Create: `.../android/src/main/java/expo/modules/zappdiscovery/HttpLan.kt`
- Create: `D:\PROGETTI\ZappMobile\src\native\discovery-parse.ts`
- Create: `D:\PROGETTI\ZappMobile\src\native\discovery-parse.test.ts`
- Create: `D:\PROGETTI\ZappMobile\src\native\discovery.ts`
- Read first: `modules/zapp-media-session/` — stessa forma, stesse convenzioni.

**Interfaces:**
- Consumes: `TvTrovata`, `MotivoTv` da `src/bridge/protocol.ts` (Task 4).
- Produces:
  - Kotlin → JS, eventi: `onServizio` con `{ name: string, host: string, port: number, txt: Record<string,string> }`; `onSsdp` con `{ ip: string, headers: Record<string,string> }`.
  - `avviaRicerca(): void`, `fermaRicerca(): void`, `chiediAbbinamento(host, porta, nome, deviceId): Promise<{ ok: boolean; installId?: string; motivo?: MotivoTv }>`.
  - TS puro: `tvDaServizio(ev): TvTrovata | null`, `tvDaSsdp(ev): TvTrovata | null`.

> **Nota di progetto**: il Kotlin fa **solo** la rete (UDP, mDNS, socket); l'interpretazione delle risposte SSDP sta in TypeScript, così è pura e si prova con vitest — è quello che promette §13 della spec.

- [ ] **Step 1: Scrivi il test dell'interpretazione (fallisce)**

Crea `D:\PROGETTI\ZappMobile\src\native\discovery-parse.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { tvDaServizio, tvDaSsdp } from "./discovery-parse";

describe("tvDaServizio", () => {
  it("legge nome e installId dal record TXT", () => {
    expect(
      tvDaServizio({
        name: "ZappTV",
        host: "192.168.1.7",
        port: 41234,
        txt: {
          v: "1",
          id: "3f2504e0-4f89-11d3-9a0c-0305e82c3301",
          name: "Fire TV di Mirko",
          plat: "fire_tv",
        },
      }),
    ).toEqual({
      kind: "zapp",
      name: "Fire TV di Mirko",
      host: "192.168.1.7",
      port: 41234,
      installId: "3f2504e0-4f89-11d3-9a0c-0305e82c3301",
    });
  });

  it("scarta un annuncio di versione sconosciuta", () => {
    expect(
      tvDaServizio({
        name: "ZappTV",
        host: "192.168.1.7",
        port: 41234,
        txt: { v: "2", id: "3f2504e0-4f89-11d3-9a0c-0305e82c3301", name: "TV" },
      }),
    ).toBeNull();
  });

  it("scarta un annuncio senza installId valido", () => {
    expect(
      tvDaServizio({
        name: "ZappTV",
        host: "192.168.1.7",
        port: 41234,
        txt: { v: "1", id: "no", name: "TV" },
      }),
    ).toBeNull();
  });
});

describe("tvDaSsdp", () => {
  // Risposta vera della Fire TV Stick 4K, misurata il 2026-09-14.
  const FIRETV = {
    SERVER: "Linux/4.4.120+, UPnP/1.0, Portable SDK for UPnP devices",
    "X-USER-AGENT": "NRDP MDX",
    "X-FRIENDLY-NAME": "RmlyZSBUViBkaSBNaXJrbw==",
    USN: "uuid:NFANDROID2-PRV-FIRETVSTICK2018-AMAZOAFTMM-17461-40A2::upnp:rootdevice",
  };

  it("riconosce la Fire TV e ne decodifica il nome", () => {
    expect(tvDaSsdp({ ip: "192.168.1.7", headers: FIRETV })).toEqual({
      kind: "firetv",
      name: "Fire TV di Mirko",
      host: "192.168.1.7",
    });
  });

  it("ripiega su un nome generico se il base64 e' rotto", () => {
    expect(
      tvDaSsdp({ ip: "192.168.1.7", headers: { ...FIRETV, "X-FRIENDLY-NAME": "!!!" } }),
    ).toEqual({ kind: "firetv", name: "Fire TV", host: "192.168.1.7" });
  });

  it("ignora un dispositivo che non e' Amazon", () => {
    expect(
      tvDaSsdp({
        ip: "192.168.1.13",
        headers: { SERVER: "WebOS/4.0.0 UPnP/1.0", USN: "uuid:1298::upnp:rootdevice" },
      }),
    ).toBeNull();
  });

  it("ignora un indirizzo che non e' privato", () => {
    expect(tvDaSsdp({ ip: "8.8.8.8", headers: FIRETV })).toBeNull();
  });
});
```

- [ ] **Step 2: Esegui e verifica che fallisca**

Run (in `D:\PROGETTI\ZappMobile`): `npm test -- src/native/discovery-parse.test.ts`
Expected: FAIL, "Failed to resolve import ./discovery-parse".

- [ ] **Step 3: Scrivi l'interpretazione**

Crea `D:\PROGETTI\ZappMobile\src\native\discovery-parse.ts`:

```ts
/**
 * Da quello che il nativo ha sentito in rete a una TV da mostrare in elenco.
 *
 * Il Kotlin fa solo la rete e consegna dati grezzi: qui si decide che cosa
 * sono. Funzioni pure, provate con vitest — e' l'unico modo per collaudare il
 * riconoscimento senza avere una Fire TV accesa accanto.
 */

import { isIndirizzoPrivato, type TvTrovata } from "../bridge/protocol";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type EventoServizio = {
  name: string;
  host: string;
  port: number;
  txt: Record<string, string>;
};

export type EventoSsdp = { ip: string; headers: Record<string, string> };

/** Un annuncio `_zapp-tv._tcp`: e' una TV con ZappTV aperta sull'abbinamento. */
export function tvDaServizio(ev: EventoServizio): TvTrovata | null {
  if (!isIndirizzoPrivato(ev.host)) return null;
  if (!Number.isInteger(ev.port) || ev.port < 1 || ev.port > 65535) return null;
  // Versione del protocollo: una TV piu' nuova di questo telefono si ignora,
  // non si indovina.
  if (ev.txt.v !== "1") return null;
  const installId = ev.txt.id ?? "";
  if (!UUID_RE.test(installId)) return null;
  const nome = (ev.txt.name ?? "").trim().slice(0, 60);
  return {
    kind: "zapp",
    name: nome.length > 0 ? nome : "TV",
    host: ev.host,
    port: ev.port,
    installId,
  };
}

/**
 * Una risposta SSDP: e' una Fire TV?
 *
 * Misurato il 2026-09-14 su Fire TV Stick 4K: la Fire TV non si annuncia da
 * sola, ma a una M-SEARCH unicast risponde con `X-User-Agent: NRDP MDX`, uno
 * `USN` che contiene `AMAZO`, e il nome in base64 dentro `X-Friendly-Name`.
 * Il riconoscimento poggia sul servizio MDX di Netflix: se un giorno sparisse,
 * questa funzione tornerebbe null e l'utente userebbe il codice, che resta
 * sempre in pagina.
 */
export function tvDaSsdp(ev: EventoSsdp): TvTrovata | null {
  if (!isIndirizzoPrivato(ev.ip)) return null;
  const h: Record<string, string> = {};
  for (const [k, v] of Object.entries(ev.headers)) h[k.toUpperCase()] = v;

  const usn = h.USN ?? "";
  const amazon = usn.includes("AMAZO") || (h["X-USER-AGENT"] === "NRDP MDX" && usn.includes("FIRETV"));
  if (!amazon) return null;

  return { kind: "firetv", name: nomeAmichevole(h["X-FRIENDLY-NAME"]), host: ev.ip };
}

const ALFABETO = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

/**
 * Base64 a mano invece di `atob`.
 *
 * `atob` c'e' in Node e nei browser, ma nel motore di React Native e' arrivato
 * tardi e non su tutte le versioni: una funzione che casca sul telefono e passa
 * in vitest sarebbe il peggiore dei due mondi. Venti righe, nessuna dipendenza.
 */
function daBase64(testo: string): Uint8Array | null {
  const pulito = testo.replace(/=+$/, "");
  if (pulito.length === 0 || /[^A-Za-z0-9+/]/.test(pulito)) return null;
  const byte: number[] = [];
  let accumulatore = 0;
  let bit = 0;
  for (const carattere of pulito) {
    accumulatore = (accumulatore << 6) | ALFABETO.indexOf(carattere);
    bit += 6;
    if (bit >= 8) {
      bit -= 8;
      byte.push((accumulatore >> bit) & 0xff);
    }
  }
  return Uint8Array.from(byte);
}

/** Il nome viaggia in base64 UTF-8; se manca o non decodifica, si dice "Fire TV". */
function nomeAmichevole(grezzo: string | undefined): string {
  if (!grezzo) return "Fire TV";
  const byte = daBase64(grezzo);
  if (!byte) return "Fire TV";
  const nome = new TextDecoder("utf-8").decode(byte).trim();
  return nome.length >= 1 && nome.length <= 60 ? nome : "Fire TV";
}
```

- [ ] **Step 4: Esegui e verifica che passi**

Run (in `D:\PROGETTI\ZappMobile`): `npm test -- src/native/discovery-parse.test.ts`
Expected: PASS, 7 test.

- [ ] **Step 5: Commit dell'interpretazione**

```bash
git add src/native/discovery-parse.ts src/native/discovery-parse.test.ts
git commit -m "feat(discovery): riconoscimento delle TV dalle risposte di rete"
```

- [ ] **Step 6: Crea lo scheletro del modulo**

`modules/zapp-discovery/expo-module.config.json`:

```json
{
  "platforms": ["android"],
  "android": {
    "modules": ["expo.modules.zappdiscovery.ZappDiscoveryModule"]
  }
}
```

`modules/zapp-discovery/android/build.gradle`: copia quello di `modules/zapp-media-session/android/build.gradle` cambiando solo il nome del gruppo/namespace in `expo.modules.zappdiscovery`.

`modules/zapp-discovery/android/src/main/AndroidManifest.xml`:

```xml
<manifest xmlns:android="http://schemas.android.com/apk/res/android">
  <!-- MulticastLock: senza, molti dispositivi filtrano il multicast in arrivo
       e NsdManager non sente nulla. -->
  <uses-permission android:name="android.permission.CHANGE_WIFI_MULTICAST_STATE" />
  <uses-permission android:name="android.permission.INTERNET" />
  <uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />
</manifest>
```

- [ ] **Step 7: Scrivi la scoperta mDNS (Kotlin)**

`.../zappdiscovery/Nsd.kt`:

```kotlin
package expo.modules.zappdiscovery

import android.content.Context
import android.net.nsd.NsdManager
import android.net.nsd.NsdServiceInfo
import android.net.wifi.WifiManager

/** Il servizio che ZappTV annuncia mentre e' sulla schermata di abbinamento. */
const val TIPO_SERVIZIO = "_zapp-tv._tcp."

/**
 * Cerca le TV con ZappTV aperta.
 *
 * `MulticastLock` non e' un di piu': senza, il Wi-Fi scarta i pacchetti
 * multicast non indirizzati al telefono e `NsdManager` non sente nulla.
 * `resolveService` va serializzato — chiamarlo mentre un'altra risoluzione e'
 * in corso torna `FAILURE_ALREADY_ACTIVE` su molte versioni di Android.
 */
class Nsd(private val context: Context, private val onTrovato: (NsdServiceInfo) -> Unit) {
    private val manager = context.getSystemService(Context.NSD_SERVICE) as NsdManager
    private val wifi = context.applicationContext.getSystemService(Context.WIFI_SERVICE) as WifiManager
    private var lock: WifiManager.MulticastLock? = null
    private var listener: NsdManager.DiscoveryListener? = null
    private val coda = ArrayDeque<NsdServiceInfo>()
    private var inCorso = false

    fun avvia() {
        if (listener != null) return
        lock = wifi.createMulticastLock("zapp-discovery").apply {
            setReferenceCounted(false)
            acquire()
        }
        val l = object : NsdManager.DiscoveryListener {
            override fun onDiscoveryStarted(tipo: String) {}
            override fun onDiscoveryStopped(tipo: String) {}
            override fun onStartDiscoveryFailed(tipo: String, err: Int) { ferma() }
            override fun onStopDiscoveryFailed(tipo: String, err: Int) {}
            override fun onServiceFound(info: NsdServiceInfo) { accoda(info) }
            override fun onServiceLost(info: NsdServiceInfo) {}
        }
        listener = l
        manager.discoverServices(TIPO_SERVIZIO, NsdManager.PROTOCOL_DNS_SD, l)
    }

    fun ferma() {
        listener?.let { runCatching { manager.stopServiceDiscovery(it) } }
        listener = null
        lock?.let { runCatching { it.release() } }
        lock = null
        coda.clear()
        inCorso = false
    }

    @Synchronized
    private fun accoda(info: NsdServiceInfo) {
        coda.addLast(info)
        prossima()
    }

    @Synchronized
    private fun prossima() {
        if (inCorso) return
        val info = coda.removeFirstOrNull() ?: return
        inCorso = true
        manager.resolveService(info, object : NsdManager.ResolveListener {
            override fun onResolveFailed(i: NsdServiceInfo, err: Int) { fine() }
            override fun onServiceResolved(i: NsdServiceInfo) {
                onTrovato(i)
                fine()
            }
        })
    }

    @Synchronized
    private fun fine() {
        inCorso = false
        prossima()
    }
}
```

- [ ] **Step 8: Scrivi lo sweep SSDP (Kotlin)**

`.../zappdiscovery/Ssdp.kt`:

```kotlin
package expo.modules.zappdiscovery

import java.net.DatagramPacket
import java.net.DatagramSocket
import java.net.Inet4Address
import java.net.InetAddress
import java.net.NetworkInterface

/**
 * M-SEARCH **unicast** su tutta la /24.
 *
 * Misurato il 2026-09-14: la Fire TV ignora la M-SEARCH multicast ma risponde a
 * quella unicast. Sono 254 pacchetti UDP, circa un secondo: molto meno invasivo
 * di una scansione di porte, e da' il nome amichevole dentro la risposta.
 */
object Ssdp {
    private const val ATTESA_MS = 4000

    fun sweep(onRisposta: (String, Map<String, String>) -> Unit) {
        val base = indirizzoLocale() ?: return
        val ottetti = base.address
        val socket = DatagramSocket().apply { soTimeout = 400 }
        val messaggio = (
            "M-SEARCH * HTTP/1.1\r\n" +
                "HOST: 239.255.255.250:1900\r\n" +
                "MAN: \"ssdp:discover\"\r\n" +
                "MX: 1\r\n" +
                "ST: upnp:rootdevice\r\n\r\n"
            ).toByteArray()

        socket.use { s ->
            for (ultimo in 1..254) {
                val destinazione = ottetti.copyOf().also { it[3] = ultimo.toByte() }
                runCatching {
                    s.send(DatagramPacket(messaggio, messaggio.size, InetAddress.getByAddress(destinazione), 1900))
                }
            }
            val fine = System.currentTimeMillis() + ATTESA_MS
            val buffer = ByteArray(2048)
            while (System.currentTimeMillis() < fine) {
                val pacchetto = DatagramPacket(buffer, buffer.size)
                val ok = runCatching { s.receive(pacchetto); true }.getOrDefault(false)
                if (!ok) continue
                val testo = String(pacchetto.data, 0, pacchetto.length)
                onRisposta(pacchetto.address.hostAddress ?: continue, intestazioni(testo))
            }
        }
    }

    /** Le intestazioni HTTP della risposta, a chiavi maiuscole. */
    private fun intestazioni(testo: String): Map<String, String> =
        testo.lineSequence()
            .drop(1)
            .mapNotNull { riga ->
                val i = riga.indexOf(':')
                if (i <= 0) null else riga.substring(0, i).trim().uppercase() to riga.substring(i + 1).trim()
            }
            .toMap()

    private fun indirizzoLocale(): Inet4Address? =
        NetworkInterface.getNetworkInterfaces().toList()
            .filter { it.isUp && !it.isLoopback }
            .flatMap { it.inetAddresses.toList() }
            .filterIsInstance<Inet4Address>()
            .firstOrNull { !it.isLoopbackAddress && it.isSiteLocalAddress }
}
```

- [ ] **Step 9: Scrivi la richiesta HTTP sulla LAN (Kotlin)**

`.../zappdiscovery/HttpLan.kt`:

```kotlin
package expo.modules.zappdiscovery

import org.json.JSONObject
import java.net.InetSocketAddress
import java.net.Socket

/** Esito della richiesta di abbinamento alla TV. */
data class EsitoLan(val stato: Int, val corpo: String)

/**
 * Una POST HTTP scritta a mano su un socket.
 *
 * Non si usa OkHttp di proposito: dalla API 28 il traffico in chiaro e'
 * vietato alle librerie HTTP, e accenderlo (`usesCleartextTraffic`) lo
 * accenderebbe per **tutta** l'app. Il server della TV parla http sulla LAN e
 * basta: trenta righe di socket costano meno di un permesso che vale ovunque.
 */
object HttpLan {
    fun postPair(host: String, porta: Int, nome: String, deviceId: String): EsitoLan? {
        val corpo = JSONObject().put("name", nome).put("deviceId", deviceId).toString()
        val richiesta = buildString {
            append("POST /pair HTTP/1.1\r\n")
            append("Host: $host:$porta\r\n")
            append("Content-Type: application/json\r\n")
            append("Content-Length: ${corpo.toByteArray().size}\r\n")
            append("Connection: close\r\n\r\n")
            append(corpo)
        }
        return runCatching {
            Socket().use { s ->
                s.connect(InetSocketAddress(host, porta), 3000)
                // Il dialogo sulla TV aspetta un essere umano: 90 s, non 10.
                s.soTimeout = 90_000
                s.getOutputStream().write(richiesta.toByteArray())
                s.getOutputStream().flush()
                val risposta = s.getInputStream().readBytes().toString(Charsets.UTF_8)
                val stato = Regex("^HTTP/1\\.[01] (\\d{3})").find(risposta)?.groupValues?.get(1)?.toInt()
                    ?: return@use null
                val separatore = risposta.indexOf("\r\n\r\n")
                EsitoLan(stato, if (separatore < 0) "" else risposta.substring(separatore + 4))
            }
        }.getOrNull()
    }
}
```

- [ ] **Step 10: Scrivi il modulo Expo (Kotlin)**

`.../zappdiscovery/ZappDiscoveryModule.kt`:

```kotlin
package expo.modules.zappdiscovery

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch
import org.json.JSONObject

/**
 * Trova le TV sulla rete locale e parla col server locale di ZappTV.
 *
 * Qui dentro c'e' **solo rete**: mDNS, UDP, socket. Che cosa siano le risposte
 * lo decide TypeScript (`src/native/discovery-parse.ts`), che e' puro e si
 * prova senza avere una TV accesa.
 */
class ZappDiscoveryModule : Module() {
    private var nsd: Nsd? = null
    private var sweep: Job? = null
    private val scope = CoroutineScope(Dispatchers.IO)

    override fun definition() = ModuleDefinition {
        Name("ZappDiscovery")
        Events("onServizio", "onSsdp")

        Function("avviaRicerca") {
            val contesto = appContext.reactContext ?: return@Function
            nsd?.ferma()
            nsd = Nsd(contesto) { info ->
                val txt = mutableMapOf<String, String>()
                info.attributes?.forEach { (k, v) -> txt[k] = v?.toString(Charsets.UTF_8) ?: "" }
                sendEvent(
                    "onServizio",
                    mapOf(
                        "name" to (info.serviceName ?: ""),
                        "host" to (info.host?.hostAddress ?: ""),
                        "port" to info.port,
                        "txt" to txt,
                    ),
                )
            }.also { it.avvia() }

            sweep?.cancel()
            sweep = scope.launch {
                Ssdp.sweep { ip, headers -> sendEvent("onSsdp", mapOf("ip" to ip, "headers" to headers)) }
            }
        }

        Function("fermaRicerca") {
            nsd?.ferma()
            nsd = null
            sweep?.cancel()
            sweep = null
        }

        AsyncFunction("chiediAbbinamento") { host: String, porta: Int, nome: String, deviceId: String ->
            val esito = HttpLan.postPair(host, porta, nome, deviceId)
                ?: return@AsyncFunction mapOf("ok" to false, "motivo" to "rete")
            when (esito.stato) {
                200 -> {
                    val installId = runCatching { JSONObject(esito.corpo).optString("installId") }.getOrNull()
                    if (installId.isNullOrEmpty()) mapOf("ok" to false, "motivo" to "rete")
                    else mapOf("ok" to true, "installId" to installId)
                }
                403 -> mapOf("ok" to false, "motivo" to "rifiutato")
                408 -> mapOf("ok" to false, "motivo" to "scaduto")
                409 -> mapOf("ok" to false, "motivo" to "occupato")
                410 -> mapOf("ok" to false, "motivo" to "scaduto")
                else -> mapOf("ok" to false, "motivo" to "rete")
            }
        }

        OnDestroy {
            nsd?.ferma()
            sweep?.cancel()
        }
    }
}
```

- [ ] **Step 11: Scrivi il wrapper TypeScript del modulo**

`modules/zapp-discovery/index.ts`:

```ts
/**
 * `zapp-discovery` — le TV sulla rete locale.
 *
 * Il nativo fa solo rete e emette dati grezzi; l'interpretazione sta in
 * `src/native/discovery-parse.ts`. `requireOptionalNativeModule` torna `null`
 * dove il modulo non c'e' (iOS, web, Expo Go): importare questo file da li'
 * non deve far cadere l'app.
 */

import { requireOptionalNativeModule } from "expo";
import type { EventSubscription } from "expo-modules-core";

export type EsitoAbbinamento = { ok: boolean; installId?: string; motivo?: string };

type ModuloZappDiscovery = {
  avviaRicerca(): void;
  fermaRicerca(): void;
  chiediAbbinamento(
    host: string,
    porta: number,
    nome: string,
    deviceId: string,
  ): Promise<EsitoAbbinamento>;
  addListener(evento: string, ascoltatore: (ev: unknown) => void): EventSubscription;
};

const modulo = requireOptionalNativeModule<ModuloZappDiscovery>("ZappDiscovery");

export const disponibile = modulo !== null;

export function avviaRicerca(): void {
  modulo?.avviaRicerca();
}

export function fermaRicerca(): void {
  modulo?.fermaRicerca();
}

export function chiediAbbinamento(
  host: string,
  porta: number,
  nome: string,
  deviceId: string,
): Promise<EsitoAbbinamento> {
  if (!modulo) return Promise.resolve({ ok: false, motivo: "rete" });
  return modulo.chiediAbbinamento(host, porta, nome, deviceId);
}

export function ascolta(
  evento: "onServizio" | "onSsdp",
  ascoltatore: (ev: unknown) => void,
): EventSubscription | null {
  return modulo?.addListener(evento, ascoltatore) ?? null;
}
```

- [ ] **Step 12: Collega il modulo al ponte**

Crea `D:\PROGETTI\ZappMobile\src\native\discovery.ts`:

```ts
/**
 * L'orchestrazione: accende la ricerca, raccoglie quello che il nativo sente,
 * lo interpreta e manda alla pagina un elenco solo.
 *
 * Si ferma da sola dopo otto secondi: una ricerca accesa in sottofondo
 * consuma batteria e non serve a nessuno.
 */

import { avviaRicerca, ascolta, fermaRicerca } from "../../modules/zapp-discovery";
import type { TvTrovata } from "../bridge/protocol";
import {
  tvDaServizio,
  tvDaSsdp,
  type EventoServizio,
  type EventoSsdp,
} from "./discovery-parse";

const DURATA_MS = 8000;
const TV_MAX = 16;

let trovate = new Map<string, TvTrovata>();
let sottoscrizioni: { remove(): void }[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;

export function avvia(invia: (devices: TvTrovata[]) => void): void {
  ferma();
  trovate = new Map();

  const aggiungi = (tv: TvTrovata | null) => {
    if (!tv) return;
    // Una TV con ZappTV aperta vince sulla stessa vista via SSDP: e' toccabile.
    const esistente = trovate.get(tv.host);
    if (esistente?.kind === "zapp" && tv.kind === "firetv") return;
    if (trovate.size >= TV_MAX && !trovate.has(tv.host)) return;
    trovate.set(tv.host, tv);
    invia([...trovate.values()]);
  };

  const s1 = ascolta("onServizio", (ev) => aggiungi(tvDaServizio(ev as EventoServizio)));
  const s2 = ascolta("onSsdp", (ev) => aggiungi(tvDaSsdp(ev as EventoSsdp)));
  sottoscrizioni = [s1, s2].filter((s): s is { remove(): void } => s !== null);

  avviaRicerca();
  timer = setTimeout(() => ferma(), DURATA_MS);
}

export function ferma(): void {
  if (timer) clearTimeout(timer);
  timer = null;
  for (const s of sottoscrizioni) s.remove();
  sottoscrizioni = [];
  fermaRicerca();
}
```

Poi, in `D:\PROGETTI\ZappMobile\src\webview\ZappWebView.tsx`, dove si gestiscono i messaggi web → nativo (cerca lo `switch` su `parseWebMessage`), aggiungi i due rami:

```tsx
      case "discoverTv":
        if (msg.action === "start") {
          avviaScoperta((devices) => inviaAllaPagina({ type: "tvFound", devices }));
        } else {
          fermaScoperta();
        }
        break;
      case "connectTv": {
        const esito = await chiediAbbinamento(msg.host, msg.port, msg.name, msg.deviceId);
        if (esito.ok && esito.installId) {
          inviaAllaPagina({ type: "tvConsent", installId: esito.installId });
        } else {
          inviaAllaPagina({ type: "tvError", motivo: (esito.motivo ?? "rete") as MotivoTv });
        }
        break;
      }
```

Usa i nomi delle funzioni che quel file già adopera per mandare messaggi alla pagina; `avviaScoperta`/`fermaScoperta` sono `avvia`/`ferma` importati da `../native/discovery`.

- [ ] **Step 13: Verifica che compili**

Run (in `D:\PROGETTI\ZappMobile`): `npx tsc --noEmit && npm test`
Expected: nessun errore, tutti i test verdi.

- [ ] **Step 14: Commit**

```bash
git add modules/zapp-discovery src/native/discovery.ts src/webview/ZappWebView.tsx
git commit -m "feat(discovery): modulo nativo per le TV sulla rete locale"
```

---

### Task 6: `CercaTv` nella pagina dispositivi

**Files:**
- Create: `src/app/(app)/devices/CercaTv.tsx`
- Modify: `src/app/(app)/devices/DevicesClient.tsx` (inserisci `<CercaTv />` sopra il campo del codice)
- Read first: `src/app/(app)/devices/DevicesClient.tsx` e `ConnectionGuide.tsx`, per stile e struttura

**Interfaces:**
- Consumes: `claimPairedByConsent` (Task 3); `inNativeShell`, `postToNative`, `onNativeMessage` da `@/lib/native/bridge`; `TvTrovata`, `MotivoTv` da `@/lib/native/protocol`.
- Produces: componente client `CercaTv`.

- [ ] **Step 1: Scopri come la pagina conosce il proprio `deviceId`**

In `src/app/(app)/devices/DevicesClient.tsx` cerca dove viene usato il risultato di `pairOwnDevice` (restituisce `{ token, deviceId }`). Il `deviceId` del telefono serve a `CercaTv`: passalo come prop invece di rileggerlo, così il componente resta senza effetti collaterali. Se la pagina non lo tiene, prendilo dalla riga del dispositivo corrente già in elenco (quella con `install_id` uguale a quello annunciato dal guscio nel messaggio `ready`).

- [ ] **Step 2: Scrivi il componente**

Crea `src/app/(app)/devices/CercaTv.tsx`:

```tsx
"use client";

/**
 * Le TV viste sulla rete locale, dentro l'app.
 *
 * Esiste solo nel guscio nativo: da browser la scheda resta quella di sempre,
 * col codice a sei cifre. **L'elenco non sostituisce mai il codice**, lo
 * affianca: su una rete che filtra il multicast qui non compare nulla, e
 * l'utente deve avere ancora la sua strada.
 */

import { useCallback, useEffect, useState } from "react";
import { inNativeShell, onNativeMessage, postToNative } from "@/lib/native/bridge";
import type { MotivoTv, TvTrovata } from "@/lib/native/protocol";
import { claimPairedByConsent } from "./actions";

const MESSAGGI: Record<MotivoTv, string> = {
  rifiutato: "Sulla TV è stato scelto Annulla.",
  scaduto: "Nessuna risposta dalla TV. Riprova.",
  occupato: "La TV sta già rispondendo a un altro telefono.",
  rete: "Non riesco a parlare con la TV. Riprova.",
  permesso: "Zapp non può cercare sulla rete locale. Consentilo nelle impostazioni.",
};

type Stato = "fermo" | "cerco" | "collego";

export function CercaTv({ deviceId, nomeTelefono }: { deviceId: string; nomeTelefono: string }) {
  const [dentro, setDentro] = useState(false);
  const [stato, setStato] = useState<Stato>("fermo");
  const [tv, setTv] = useState<TvTrovata[]>([]);
  const [errore, setErrore] = useState<string | null>(null);
  const [fatto, setFatto] = useState<string | null>(null);

  // `inNativeShell` tocca `window`: si guarda dopo il montaggio, non durante il
  // render del server, altrimenti l'HTML del server e quello del client
  // divergono.
  useEffect(() => setDentro(inNativeShell()), []);

  useEffect(() => {
    return onNativeMessage((msg) => {
      if (msg.type === "tvFound") {
        setTv(msg.devices);
        return;
      }
      if (msg.type === "tvError") {
        setStato("fermo");
        setErrore(MESSAGGI[msg.motivo]);
        return;
      }
      if (msg.type === "tvConsent") {
        void (async () => {
          const esito = await claimPairedByConsent(msg.installId, deviceId);
          setStato("fermo");
          if (esito.ok) {
            setFatto(esito.name);
            setErrore(null);
          } else {
            setErrore(esito.error);
          }
        })();
      }
    });
  }, [deviceId]);

  const cerca = useCallback(() => {
    setErrore(null);
    setFatto(null);
    setTv([]);
    setStato("cerco");
    postToNative({ type: "discoverTv", action: "start" });
    // Il nativo si ferma da solo dopo otto secondi: qui si toglie solo
    // l'indicatore, senza spegnere niente due volte.
    setTimeout(() => setStato((s) => (s === "cerco" ? "fermo" : s)), 8000);
  }, []);

  const collega = useCallback(
    (scelta: TvTrovata) => {
      if (scelta.kind !== "zapp" || scelta.port === undefined) return;
      setErrore(null);
      setStato("collego");
      postToNative({
        type: "connectTv",
        host: scelta.host,
        port: scelta.port,
        name: nomeTelefono,
        deviceId,
      });
    },
    [deviceId, nomeTelefono],
  );

  if (!dentro) return null;

  return (
    <section className="glass rounded-2xl p-4">
      <h2 className="text-base font-semibold">TV vicine</h2>
      <p className="mt-1 text-sm text-white/60">
        Apri Zapp sulla TV, poi tocca il suo nome: niente codice da digitare.
      </p>

      <button
        type="button"
        onClick={cerca}
        disabled={stato !== "fermo"}
        className="mt-3 rounded-full bg-white/10 px-4 py-2 text-sm disabled:opacity-50"
      >
        {stato === "cerco" ? "Cerco…" : "Cerca TV"}
      </button>

      {fatto && <p className="mt-3 text-sm text-emerald-400">Collegato a {fatto}.</p>}
      {errore && <p className="mt-3 text-sm text-red-400">{errore}</p>}

      <ul className="mt-3 space-y-2">
        {tv.map((t) => (
          <li key={t.host}>
            {t.kind === "zapp" ? (
              <button
                type="button"
                onClick={() => collega(t)}
                disabled={stato === "collego"}
                className="w-full rounded-xl bg-white/5 px-3 py-2 text-left text-sm disabled:opacity-50"
              >
                <span className="font-medium">{t.name}</span>
                <span className="block text-white/50">
                  {stato === "collego" ? "Conferma sulla TV…" : "Tocca per collegare"}
                </span>
              </button>
            ) : (
              <div className="rounded-xl bg-white/5 px-3 py-2 text-sm">
                <span className="font-medium">{t.name}</span>
                <span className="block text-white/50">
                  Apri Zapp sulla TV, oppure installala dall’Appstore.
                </span>
              </div>
            )}
          </li>
        ))}
        {stato === "fermo" && tv.length === 0 && !fatto && (
          <li className="text-sm text-white/50">
            Nessuna TV trovata. Usa il codice qui sotto.
          </li>
        )}
      </ul>
    </section>
  );
}
```

- [ ] **Step 3: Inserisci il componente nella pagina**

In `src/app/(app)/devices/DevicesClient.tsx`, sopra il blocco del codice a sei cifre:

```tsx
<CercaTv deviceId={deviceIdTelefono} nomeTelefono={nomeTelefono} />
```

Le due prop vengono da Step 1. Se il telefono non è ancora abbinato, `deviceIdTelefono` è vuoto: in quel caso **non** montare il componente (senza `device_id` non c'è consenso da registrare).

- [ ] **Step 4: Verifica**

Run: `pnpm typecheck && pnpm lint && pnpm test`
Expected: nessun errore.

- [ ] **Step 5: Verifica che la pagina si costruisca davvero**

Run: `NEXT_DIST_DIR=.next-check pnpm build`
Expected: build completata. (La cartella `.next-check` è ignorata da git e non disturba altre sessioni sullo stesso albero.)

- [ ] **Step 6: Commit**

```bash
git add "src/app/(app)/devices/CercaTv.tsx" "src/app/(app)/devices/DevicesClient.tsx"
git commit -m "feat(devices): elenco delle TV vicine nella scheda dispositivi"
```

---

### Task 7: ZappTV — annuncio, server locale, dialogo

**Files:** (tutti in `D:\PROGETTI\ZappTV\android\app\src\main\java\com\zapp\tv\`)
- Create: `ui/abbinamento/Annuncio.kt`
- Create: `ui/abbinamento/ServerLocale.kt`
- Modify: `ui/abbinamento/AbbinamentoViewModel.kt`
- Modify: `ui/abbinamento/AbbinamentoScreen.kt`
- Modify: `api/DeviceApi.kt`
- Modify: `AndroidManifest.xml` (permesso multicast)

**Interfaces:**
- Consumes: rotta `POST /api/devices/pair/consent` (Task 2).
- Produces: annuncio `_zapp-tv._tcp` con TXT `v/id/name/plat`; `POST /pair` sul server locale; `DeviceApi.consenso(code: String, phoneDeviceId: String): Boolean`.

- [ ] **Step 1: Aggiungi il permesso**

In `android/app/src/main/AndroidManifest.xml`:

```xml
<uses-permission android:name="android.permission.CHANGE_WIFI_MULTICAST_STATE" />
```

- [ ] **Step 2: Scrivi l'annuncio**

Crea `ui/abbinamento/Annuncio.kt`:

```kotlin
package com.zapp.tv.ui.abbinamento

import android.content.Context
import android.net.nsd.NsdManager
import android.net.nsd.NsdServiceInfo

/**
 * Si annuncia sulla rete locale mentre la schermata di abbinamento e' a video.
 *
 * Nel record TXT non finisce **mai** il codice: chiunque sulla rete legge il
 * TXT, e il codice e' la chiave per prendersi questa TV. Ci va solo quel che e'
 * gia' pubblico — chi siamo e dove bussare.
 */
class Annuncio(context: Context, private val porta: Int, private val installId: String, private val nome: String) {
    private val manager = context.getSystemService(Context.NSD_SERVICE) as NsdManager
    private var listener: NsdManager.RegistrationListener? = null

    fun registra() {
        if (listener != null) return
        val info = NsdServiceInfo().apply {
            serviceName = "ZappTV"
            serviceType = "_zapp-tv._tcp"
            port = this@Annuncio.porta
            setAttribute("v", "1")
            setAttribute("id", installId)
            setAttribute("name", nome.take(60))
            setAttribute("plat", "fire_tv")
        }
        val l = object : NsdManager.RegistrationListener {
            override fun onServiceRegistered(info: NsdServiceInfo) {}
            override fun onRegistrationFailed(info: NsdServiceInfo, err: Int) {}
            override fun onServiceUnregistered(info: NsdServiceInfo) {}
            override fun onUnregistrationFailed(info: NsdServiceInfo, err: Int) {}
        }
        listener = l
        manager.registerService(info, NsdManager.PROTOCOL_DNS_SD, l)
    }

    fun togli() {
        listener?.let { runCatching { manager.unregisterService(it) } }
        listener = null
    }
}
```

- [ ] **Step 3: Scrivi il server locale**

Crea `ui/abbinamento/ServerLocale.kt`:

```kotlin
package com.zapp.tv.ui.abbinamento

import kotlinx.coroutines.CompletableDeferred
import org.json.JSONObject
import java.net.InetAddress
import java.net.ServerSocket
import java.net.Socket
import java.util.concurrent.atomic.AtomicBoolean

/** Chi sta bussando: il nome che il telefono ha dichiarato e il suo device_id. */
data class RichiestaVicina(val nome: String, val deviceId: String)

/**
 * Il server che risponde al telefono sulla rete locale.
 *
 * Vive **solo** mentre la schermata di abbinamento e' in primo piano. Un
 * dialogo alla volta: mentre uno e' aperto gli altri prendono 409, cosi' nessuno
 * puo' far lampeggiare conferme a comando. Accetta solo indirizzi privati.
 *
 * Non risponde con il codice: risponde con l'`install_id`, che e' gia' nel TXT.
 * Il diritto di reclamare lo da' il server di Zapp, non questa risposta.
 */
class ServerLocale(
    private val installId: String,
    private val onRichiesta: suspend (RichiestaVicina) -> Boolean,
) {
    private var socket: ServerSocket? = null
    private val occupato = AtomicBoolean(false)

    val porta: Int get() = socket?.localPort ?: 0

    fun apri(): Int {
        val s = ServerSocket(0)
        socket = s
        Thread({ ciclo(s) }, "zapp-pair-lan").apply { isDaemon = true }.start()
        return s.localPort
    }

    fun chiudi() {
        runCatching { socket?.close() }
        socket = null
    }

    private fun ciclo(s: ServerSocket) {
        while (!s.isClosed) {
            val client = runCatching { s.accept() }.getOrNull() ?: return
            Thread({ servi(client) }, "zapp-pair-lan-client").apply { isDaemon = true }.start()
        }
    }

    private fun servi(client: Socket) {
        client.use { c ->
            c.soTimeout = 95_000
            if (!privato(c.inetAddress)) return rispondi(c, 403, "{}")
            val richiesta = leggi(c) ?: return rispondi(c, 400, "{}")
            if (!occupato.compareAndSet(false, true)) return rispondi(c, 409, "{}")
            try {
                val ok = kotlinx.coroutines.runBlocking { onRichiesta(richiesta) }
                if (ok) rispondi(c, 200, JSONObject().put("installId", installId).toString())
                else rispondi(c, 403, "{}")
            } finally {
                occupato.set(false)
            }
        }
    }

    /** Legge la richiesta e ne estrae nome e deviceId; null se non e' conforme. */
    private fun leggi(c: Socket): RichiestaVicina? {
        val testo = String(c.getInputStream().readNBytes(4096), Charsets.UTF_8)
        if (!testo.startsWith("POST /pair ")) return null
        val separatore = testo.indexOf("\r\n\r\n")
        if (separatore < 0) return null
        val corpo = runCatching { JSONObject(testo.substring(separatore + 4)) }.getOrNull() ?: return null
        val nome = corpo.optString("name").trim().take(60)
        val deviceId = corpo.optString("deviceId")
        if (nome.isEmpty()) return null
        if (!Regex("^[0-9a-fA-F-]{36}$").matches(deviceId)) return null
        return RichiestaVicina(nome, deviceId)
    }

    private fun privato(indirizzo: InetAddress): Boolean =
        indirizzo.isSiteLocalAddress || indirizzo.isLinkLocalAddress || indirizzo.isLoopbackAddress

    private fun rispondi(c: Socket, stato: Int, corpo: String) {
        val testo = "HTTP/1.1 $stato OK\r\nContent-Type: application/json\r\n" +
            "Content-Length: ${corpo.toByteArray().size}\r\nConnection: close\r\n\r\n$corpo"
        runCatching { c.getOutputStream().write(testo.toByteArray()); c.getOutputStream().flush() }
    }
}
```

- [ ] **Step 4: Aggiungi la chiamata del consenso a `DeviceApi`**

In `api/DeviceApi.kt`, accanto a `statoAbbinamento`:

```kotlin
    /**
     * Dice al server che l'utente ha autorizzato un telefono a prendersi questa
     * TV. Si autentica col token del dispositivo, lo stesso del poll.
     *
     * Falso anche quando il codice e' appena scaduto (410): il codice ruota ogni
     * dieci minuti, e un consenso a cavallo del rinnovo cade. La schermata lo
     * dice e si rifa'; non si tenta di spostarlo sul codice nuovo.
     */
    suspend fun consenso(code: String, phoneDeviceId: String): Boolean = withContext(Dispatchers.IO) {
        val corpo = JSONObject()
            .put("code", code)
            .put("phone_device_id", phoneDeviceId)
            .toString()
            .toRequestBody("application/json".toMediaType())
        val richiesta = Request.Builder()
            .url("${store.baseUrl}/api/devices/pair/consent")
            .header("Authorization", "Bearer ${store.token()}")
            .post(corpo)
            .build()
        runCatching { client.newCall(richiesta).execute().use { it.isSuccessful } }.getOrDefault(false)
    }
```

Adatta `store.baseUrl` e `store.token()` ai nomi veri che il file già usa per le altre chiamate: leggi `statoAbbinamento` e copiane la forma.

- [ ] **Step 5: Collega tutto nel ViewModel**

In `ui/abbinamento/AbbinamentoViewModel.kt`:

1. Aggiungi lo stato del dialogo:

```kotlin
    /** La richiesta a cui l'utente deve rispondere col telecomando, se c'e'. */
    private val _richiesta = MutableStateFlow<RichiestaVicina?>(null)
    val richiesta: StateFlow<RichiestaVicina?> = _richiesta.asStateFlow()

    private var risposta: CompletableDeferred<Boolean>? = null
    private var server: ServerLocale? = null
    private var annuncio: Annuncio? = null
```

2. In `nuovoCodice()`, dopo che il codice è arrivato e prima di `sonda(...)`, apri server e annuncio (una volta sola, non a ogni rotazione del codice):

```kotlin
            if (server == null) {
                val s = ServerLocale(Grafo.store.installId()) { richiestaVicina ->
                    val attesa = CompletableDeferred<Boolean>()
                    risposta = attesa
                    _richiesta.value = richiestaVicina
                    val ok = attesa.await()
                    _richiesta.value = null
                    risposta = null
                    // Il consenso lo registra la TV, non il telefono: e' l'unica
                    // che ha il token di questo abbinamento.
                    ok && Grafo.deviceApi.consenso(codiceCorrente, richiestaVicina.deviceId)
                }
                server = s
                val porta = s.apri()
                annuncio = Annuncio(app, porta, Grafo.store.installId(), nomeDispositivo()).also { it.registra() }
            }
```

`codiceCorrente` è un campo nuovo, aggiornato a ogni `nuovoCodice()`. `app` è il `Context`: se il ViewModel non ne ha uno, trasformalo in `AndroidViewModel`. `nomeDispositivo()` è lo stesso nome che `DeviceApi.registra()` manda al server.

3. I due gesti dell'utente:

```kotlin
    fun conferma() { risposta?.complete(true) }
    fun rifiuta() { risposta?.complete(false) }
```

4. **Il rinnovo del codice aspetta il dialogo.** In `sonda`, prima di `nuovoCodice()` per scadenza:

```kotlin
            if (System.currentTimeMillis() >= scadenza) {
                // Rinnovare il codice mentre un dialogo e' aperto butterebbe via
                // il consenso che l'utente sta per dare: si aspetta.
                if (_richiesta.value != null) continue
                nuovoCodice()
                return
            }
```

5. Chiudi tutto quando il ViewModel muore:

```kotlin
    override fun onCleared() {
        annuncio?.togli()
        server?.chiudi()
        super.onCleared()
    }
```

- [ ] **Step 6: Mostra il dialogo**

In `ui/abbinamento/AbbinamentoScreen.kt`, raccogli `richiesta` e mostra un `AlertDialog` Compose for TV con due bottoni, **il fuoco iniziale su Annulla** (un OK preso per sbaglio con un tasto ripetuto regala la TV):

```kotlin
    val richiesta by viewModel.richiesta.collectAsState()
    richiesta?.let { r ->
        AlertDialog(
            onDismissRequest = { viewModel.rifiuta() },
            title = { Text("Collegare questo telefono?") },
            text = { Text("«${r.nome}» vuole collegarsi a Zapp su questa TV.") },
            confirmButton = { Button(onClick = { viewModel.conferma() }) { Text("Collega") } },
            dismissButton = {
                Button(
                    onClick = { viewModel.rifiuta() },
                    modifier = Modifier.focusRequester(fuocoAnnulla),
                ) { Text("Annulla") }
            },
        )
        LaunchedEffect(r) { fuocoAnnulla.requestFocus() }
    }
```

`fuocoAnnulla` è un `remember { FocusRequester() }`. Segui le convenzioni di `ui/Fuoco.kt`, che il progetto usa già per il fuoco sui televisori.

- [ ] **Step 7: Compila**

Run (in `D:\PROGETTI\ZappTV\android`): `./gradlew assembleDebug`
Expected: BUILD SUCCESSFUL.

- [ ] **Step 8: Prova il server locale dal PC, senza telefono**

Installa l'APK sulla Fire TV e aprila sulla schermata di abbinamento, poi dal PC:

```bash
ADB=/c/Users/Manum/AppData/Local/Android/Sdk/platform-tools/adb.exe
"$ADB" connect 192.168.1.7:5555
# la porta la scrive il log all'apertura del server
curl -m 95 -X POST "http://192.168.1.7:<porta>/pair" \
  -H "Content-Type: application/json" \
  --data '{"name":"Telefono di prova","deviceId":"3f2504e0-4f89-11d3-9a0c-0305e82c3301"}'
```

Expected: sulla TV compare il dialogo con "Telefono di prova"; premendo Annulla, `curl` riceve `403`; premendo Collega riceve `403` **anche** (il `deviceId` di prova non è un telefono vero, quindi la rotta del consenso risponde 400 e la TV traduce in rifiuto). È il comportamento giusto: la prova serve a vedere dialogo, fuoco e chiusura.

- [ ] **Step 9: Commit**

```bash
git add android/app/src/main
git commit -m "feat(abbinamento): annuncio in rete e conferma a schermo"
```

---

### Task 8: Collaudo sull'hardware e documentazione

**Files:**
- Modify: `docs/architecture/tv.md` (sezione abbinamento)
- Modify: `docs/architecture/mobile.md` (ponte e modulo nuovo)

**Interfaces:**
- Consumes: tutto.
- Produces: le due pagine aggiornate.

- [ ] **Step 1: Percorri il collaudo di §13 della spec**

Con la Fire TV Stick 4K e un telefono Android, nell'ordine:

1. TV sulla schermata di abbinamento → il telefono la trova col nome giusto;
2. tocco → dialogo sulla TV col nome del telefono → Collega → abbinato, e la TV entra in home da sola al poll successivo (entro tre secondi);
3. Annulla sulla TV → il telefono dice "Sulla TV è stato scelto Annulla", e il codice resta valido;
4. TV **non** sulla schermata di abbinamento → non compare come toccabile, ma compare come Fire TV con l'invito ad aprire Zapp;
5. wifi ospiti o multicast filtrato → elenco vuoto e il codice a sei cifre funziona ancora;
6. due telefoni che toccano insieme → il secondo vede "La TV sta già rispondendo a un altro telefono".

Annota gli esiti: quelli che non tornano sono difetti da sistemare prima di proseguire, non note.

- [ ] **Step 2: Aggiorna `docs/architecture/tv.md`**

Nella sezione dell'abbinamento, aggiungi un paragrafo: l'abbinamento vicino esiste, la conferma a schermo è ciò che sostituisce la prova di essere davanti alla TV, il consenso vive su `pairing_codes.consent_device_id`, il poll non è cambiato. Rimanda alla spec per il resto. **Non** duplicare qui il contenuto della spec.

- [ ] **Step 3: Aggiorna `docs/architecture/mobile.md`**

Aggiungi il modulo `zapp-discovery` accanto a `zapp-intents` e `zapp-media-session`, con la regola che lo governa: il Kotlin fa solo rete, l'interpretazione sta in TypeScript perché sia provabile. Cita i due messaggi nuovi del ponte.

- [ ] **Step 4: Verifica finale**

Run: `pnpm typecheck && pnpm lint && pnpm test`
Expected: tutto verde.

- [ ] **Step 5: Commit**

```bash
git add docs/architecture/tv.md docs/architecture/mobile.md
git commit -m "docs(tv,mobile): abbinamento vicino"
```

- [ ] **Step 6: Pubblicazione**

**Non** pubblicare da questo albero. Segui `CLAUDE.md`: commit, `git fetch origin && git merge origin/main`, `pnpm typecheck && pnpm lint && pnpm test`, poi `node scripts/rilascio.mjs`. L'app mobile e quella TV hanno il loro giro (EAS, APK), fuori da questo piano.

---

### Task 9: iOS — Bonjour e permesso rete locale (scritto, non collaudato)

**Files:** (tutti in `D:\PROGETTI\ZappMobile`)
- Create: `plugins/with-zapp-discovery.js`
- Create: `modules/zapp-discovery/ios/ZappDiscoveryModule.swift`
- Create: `modules/zapp-discovery/ios/Bonjour.swift`
- Create: `modules/zapp-discovery/ios/HttpLan.swift`
- Modify: `modules/zapp-discovery/expo-module.config.json`
- Modify: `app.config.ts` (registra il plugin)
- Read first: `plugins/with-zapp-intents.js` — stessa forma di config plugin

**Interfaces:**
- Consumes: le stesse funzioni ed eventi di Task 5 (`avviaRicerca`, `fermaRicerca`, `chiediAbbinamento`, eventi `onServizio` e `onSsdp`). **Nomi e forme identici**: `src/native/discovery.ts` non deve sapere su quale piattaforma gira.
- Produces: la stessa API su iOS.

> Questa fase **non si può collaudare** finché non esiste un build iOS di ZappMobile. Va scritta, e dichiarata non verificata: il permesso di rete locale si vede solo su un dispositivo vero, e lo Swift non si compila su Windows.

- [ ] **Step 1: Dichiara la piattaforma nel modulo**

`modules/zapp-discovery/expo-module.config.json` diventa:

```json
{
  "platforms": ["android", "ios"],
  "android": {
    "modules": ["expo.modules.zappdiscovery.ZappDiscoveryModule"]
  },
  "ios": {
    "modules": ["ZappDiscoveryModule"]
  }
}
```

- [ ] **Step 2: Scrivi il config plugin**

Crea `plugins/with-zapp-discovery.js`, sulla forma di `plugins/with-zapp-intents.js`:

```js
const { withInfoPlist } = require("expo/config-plugins");

/**
 * Su iOS cercare in rete locale è un permesso, non una capacità.
 *
 * `NSLocalNetworkUsageDescription` è il testo che l'utente legge nel prompt di
 * sistema, e `NSBonjourServices` è l'elenco chiuso dei servizi che l'app può
 * cercare: un tipo non dichiarato qui non si vede, e **senza errore**. Il
 * prompt compare al primo tentativo, cioè al tocco di "Cerca TV" — mai
 * all'apertura della scheda.
 */
module.exports = function withZappDiscovery(config) {
  return withInfoPlist(config, (cfg) => {
    cfg.modResults.NSLocalNetworkUsageDescription =
      "Zapp cerca i televisori con ZappTV sulla tua rete, per collegarli senza digitare il codice.";
    const servizi = new Set(cfg.modResults.NSBonjourServices ?? []);
    servizi.add("_zapp-tv._tcp");
    cfg.modResults.NSBonjourServices = [...servizi];
    return cfg;
  });
};
```

Poi registralo in `app.config.ts`, nell'array `plugins`, accanto a `./plugins/with-zapp-intents`:

```ts
    "./plugins/with-zapp-discovery",
```

- [ ] **Step 3: Scrivi la scoperta Bonjour**

Crea `modules/zapp-discovery/ios/Bonjour.swift`:

```swift
import Network

/// Cerca `_zapp-tv._tcp` e risolve ogni risultato in indirizzo, porta e TXT.
///
/// `NWBrowser` restituisce i record TXT già nel risultato
/// (`.bonjourWithTXTRecord`), quindi non serve una risoluzione separata come su
/// Android. Il permesso "rete locale" lo chiede il sistema al primo avvio del
/// browser: se l'utente nega, `stateUpdateHandler` finisce in `.failed` e la
/// ricerca muore in silenzio — ed è per questo che il motivo `permesso` esiste
/// nel ponte.
final class Bonjour {
  private var browser: NWBrowser?
  private let onTrovato: (String, Int, [String: String]) -> Void
  private let onPermessoNegato: () -> Void

  init(
    onTrovato: @escaping (String, Int, [String: String]) -> Void,
    onPermessoNegato: @escaping () -> Void
  ) {
    self.onTrovato = onTrovato
    self.onPermessoNegato = onPermessoNegato
  }

  func avvia() {
    ferma()
    let parametri = NWParameters()
    parametri.includePeerToPeer = false
    let b = NWBrowser(
      for: .bonjourWithTXTRecord(type: "_zapp-tv._tcp", domain: nil),
      using: parametri
    )
    b.stateUpdateHandler = { [weak self] stato in
      if case .failed = stato { self?.onPermessoNegato() }
    }
    b.browseResultsChangedHandler = { [weak self] risultati, _ in
      for risultato in risultati {
        guard case let .bonjour(txt) = risultato.metadata else { continue }
        self?.risolvi(risultato.endpoint, txt: txt.dictionary)
      }
    }
    browser = b
    b.start(queue: .global(qos: .userInitiated))
  }

  func ferma() {
    browser?.cancel()
    browser = nil
  }

  /// Da endpoint Bonjour a indirizzo IPv4 e porta: serve una connessione, la
  /// risoluzione del nome da sola non li dà.
  private func risolvi(_ endpoint: NWEndpoint, txt: [String: String]) {
    let connessione = NWConnection(to: endpoint, using: .tcp)
    connessione.stateUpdateHandler = { [weak self] stato in
      if case .failed = stato {
        connessione.cancel()
        return
      }
      guard case .ready = stato,
        case let .hostPort(host, porta) = connessione.currentPath?.remoteEndpoint
      else { return }
      if case let .ipv4(indirizzo) = host {
        self?.onTrovato(
          "\(indirizzo)".components(separatedBy: "%")[0], Int(porta.rawValue), txt)
      }
      connessione.cancel()
    }
    connessione.start(queue: .global(qos: .userInitiated))
  }
}
```

- [ ] **Step 4: Scrivi la POST sulla LAN**

Crea `modules/zapp-discovery/ios/HttpLan.swift`:

```swift
import Foundation

/// La stessa POST del lato Android, con `URLSession`.
///
/// Su iOS non serve il socket a mano: verso la rete locale l'HTTP in chiaro è
/// ammesso, e il permesso di rete locale è già il cancello che lo governa.
enum HttpLan {
  static func postPair(
    host: String, porta: Int, nome: String, deviceId: String,
    completamento: @escaping (Int, String) -> Void
  ) {
    guard let url = URL(string: "http://\(host):\(porta)/pair") else {
      completamento(0, "")
      return
    }
    var richiesta = URLRequest(url: url)
    richiesta.httpMethod = "POST"
    richiesta.setValue("application/json", forHTTPHeaderField: "Content-Type")
    richiesta.httpBody = try? JSONSerialization.data(
      withJSONObject: ["name": nome, "deviceId": deviceId]
    )
    // Il dialogo sulla TV aspetta una persona: novanta secondi, non dieci.
    richiesta.timeoutInterval = 95
    URLSession.shared.dataTask(with: richiesta) { dati, risposta, _ in
      let stato = (risposta as? HTTPURLResponse)?.statusCode ?? 0
      completamento(stato, String(data: dati ?? Data(), encoding: .utf8) ?? "")
    }.resume()
  }
}
```

- [ ] **Step 5: Scrivi il modulo**

Crea `modules/zapp-discovery/ios/ZappDiscoveryModule.swift`, con **gli stessi nomi** di funzioni ed eventi del lato Android:

```swift
import ExpoModulesCore

/// Le TV sulla rete locale, su iOS.
///
/// Stessa API del modulo Android: `src/native/discovery.ts` non deve sapere su
/// quale piattaforma gira. Lo sweep SSDP qui **non c'è**: scoprire le Fire TV
/// senza ZappTV richiede una raffica di UDP unicast che su iOS non vale il
/// permesso che consuma. Su iOS si vedono le TV con ZappTV aperta, e per tutto
/// il resto resta il codice a sei cifre.
public class ZappDiscoveryModule: Module {
  private var bonjour: Bonjour?

  public func definition() -> ModuleDefinition {
    Name("ZappDiscovery")
    Events("onServizio", "onPermesso")

    Function("avviaRicerca") {
      self.bonjour?.ferma()
      let b = Bonjour(
        onTrovato: { [weak self] host, porta, txt in
          self?.sendEvent(
            "onServizio", ["name": "ZappTV", "host": host, "port": porta, "txt": txt])
        },
        onPermessoNegato: { [weak self] in
          self?.sendEvent("onPermesso", ["negato": true])
        }
      )
      self.bonjour = b
      b.avvia()
    }

    Function("fermaRicerca") {
      self.bonjour?.ferma()
      self.bonjour = nil
    }

    AsyncFunction("chiediAbbinamento") {
      (host: String, porta: Int, nome: String, deviceId: String, promessa: Promise) in
      HttpLan.postPair(host: host, porta: porta, nome: nome, deviceId: deviceId) {
        stato, corpo in
        switch stato {
        case 200:
          let dati = corpo.data(using: .utf8) ?? Data()
          let oggetto = (try? JSONSerialization.jsonObject(with: dati)) as? [String: Any]
          if let installId = oggetto?["installId"] as? String, !installId.isEmpty {
            promessa.resolve(["ok": true, "installId": installId])
          } else {
            promessa.resolve(["ok": false, "motivo": "rete"])
          }
        case 403: promessa.resolve(["ok": false, "motivo": "rifiutato"])
        case 408, 410: promessa.resolve(["ok": false, "motivo": "scaduto"])
        case 409: promessa.resolve(["ok": false, "motivo": "occupato"])
        default: promessa.resolve(["ok": false, "motivo": "rete"])
        }
      }
    }

    OnDestroy {
      self.bonjour?.ferma()
    }
  }
}
```

- [ ] **Step 6: Aggiungi l'evento del permesso negato**

Il lato iOS emette un evento in più (`onPermesso`), che su Android non esiste: serve a dire alla pagina *"Zapp non può cercare sulla rete locale"* invece di lasciare un elenco vuoto senza spiegazione.

In `modules/zapp-discovery/index.ts`, allarga il tipo dell'evento:

```ts
export function ascolta(
  evento: "onServizio" | "onSsdp" | "onPermesso",
  ascoltatore: (ev: unknown) => void,
): EventSubscription | null {
  return modulo?.addListener(evento, ascoltatore) ?? null;
}
```

In `src/native/discovery.ts`, dentro `avvia`, aggiungi la terza sottoscrizione e un parametro per il motivo:

```ts
export function avvia(
  invia: (devices: TvTrovata[]) => void,
  errore: (motivo: MotivoTv) => void,
): void {
```

```ts
  const s3 = ascolta("onPermesso", () => {
    ferma();
    errore("permesso");
  });
  sottoscrizioni = [s1, s2, s3].filter((s): s is { remove(): void } => s !== null);
```

E in `src/webview/ZappWebView.tsx`, nel ramo `discoverTv` di Task 5 Step 12, passa la seconda funzione:

```tsx
          avviaScoperta(
            (devices) => inviaAllaPagina({ type: "tvFound", devices }),
            (motivo) => inviaAllaPagina({ type: "tvError", motivo }),
          );
```

`MotivoTv` si importa da `../bridge/protocol`. Il messaggio già esiste in `CercaTv` (Task 6): *"Zapp non può cercare sulla rete locale. Consentilo nelle impostazioni."*

- [ ] **Step 7: Verifica quel che si può verificare**

Run (in `D:\PROGETTI\ZappMobile`): `npm run typecheck && npm test`
Expected: nessun errore, test verdi. Lo Swift **non** si compila su Windows: la verifica vera arriva al primo build iOS.

- [ ] **Step 8: Scrivi che non è collaudato**

In `docs/architecture/mobile.md`, nella riga del modulo `zapp-discovery`, aggiungi che la parte iOS è scritta ma **mai eseguita**, e che al primo build vanno verificati nell'ordine:

1. il prompt di rete locale compare al tocco di "Cerca TV", non prima;
2. una TV con ZappTV aperta compare in elenco;
3. negando il permesso, la pagina resta usabile col codice a sei cifre e mostra il motivo.

- [ ] **Step 9: Commit**

```bash
git add modules/zapp-discovery plugins/with-zapp-discovery.js app.config.ts src/native/discovery.ts src/webview/ZappWebView.tsx
git commit -m "feat(discovery): lato iOS, da collaudare al primo build"
```
