# ZConnection su TV — Piano 2: lancio e identità

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** far partire un titolo sulla TV dalla scheda di Zapp, e usare quel lancio per dare un nome alle sessioni che Netflix e Prime pubblicano senza titolo, così che finiscano in libreria col minutaggio che scorre.

**Architecture:** una coda in tabella (`device_commands`) che la TV sonda ogni 5 secondi. **La forma di lancio la decide il server**: la TV riceve pacchetti, URL ed extra già pronti e li esegue senza sapere cosa siano — se domani Netflix cambia forma si corregge in Zapp, senza aggiornare l'app. La stessa riga, dopo la consegna, **è** la dichiarazione: da lì in poi le sessioni senza nome di quella TV su quella piattaforma prendono quel titolo, finché tre regole non dicono di smettere.

**Tech Stack:** Next.js 15 App Router, Supabase (Postgres + RLS), TypeScript strict, Vitest per le funzioni pure; app TV in Kotlin senza dipendenze (SDK 34, `minSdk 22`), `org.json`, `HttpsURLConnection`.

**Spec:** `docs/superpowers/specs/2026-09-12-zconnection-tv-lancio-design.md`
**Misure che lo giustificano:** `docs/zconnection/FIRETV-SONDA-2026-09-12.md` §3
**Piano 1 (abbinamento e ascolto), già collaudato:** `docs/superpowers/plans/2026-09-12-zconnection-tv-abbinamento.md`

## Global Constraints

- **Italiano** per UI e commenti del codice; nomi di funzione in italiano dove il resto del modulo lo è.
- **`anon` non tocca niente**: ogni policy `to authenticated`, ogni `auth.uid()` dentro una policy scritto `(select auth.uid())`.
- **Ogni chiave esterna nasce col suo indice.**
- **Il controllo di proprietà si fa anche nel codice**, non solo nella RLS.
- **Verso il client sempre un messaggio generico**; il dettaglio resta nei log.
- **Validazione** con `src/lib/validate.ts` (`isUuid`, `isTmdbId`, `isMediaType`, `isSafeExternalUrl`).
- **La prossima migration è la `0046`**: sul branch esistono già due file `0045` (`0045_scrobble_revoca.sql` dal merge e `0045_tv_pairing.sql` del Piano 1). Non aggiungerne un terzo.
- **Dopo la migration**: rigenerare `src/types/database.ts` e **chiamare davvero** ogni funzione nuova.
- **Niente dipendenze nuove nell'app TV.** È la ragione per cui non si usa Realtime.
- Prettier: doppie virgolette, virgole finali, `printWidth` 90.

## Perimetro: quali piattaforme

Si lancia su **Netflix (8), Disney+ (337), Prime Video (119) e NOW (39)**: sono le quattro che `PROVIDER_ID_BY_SITE` già conosce, quindi le quattro le cui sessioni l'ingest sa ricevere.

**L'app Apple TV resta fuori**, benché la sonda sappia aprirla: `siteFromPackage` non ha il suo pacchetto, quindi le sue sessioni non entrano nemmeno oggi. Lanciarla darebbe un tasto che apre una scheda e poi non registra niente — un mezzo servizio che sembra un guasto. Si aggiunge quando si aggiunge il pacchetto all'ingest, e allora sarà una riga in due mappe.

---

### Task 1: Tabella `device_commands`

**Files:**
- Create: `supabase/migrations/0046_device_commands.sql`
- Modify: `src/types/database.ts` (rigenerato)

**Interfaces:**
- Produces: tabella `public.device_commands` con RLS; nessuna funzione SQL nuova.

- [ ] **Step 1: Scrivere la migration**

```sql
-- Coda dei comandi verso una TV collegata. Oggi ne esiste uno solo, "apri
-- questo titolo": la riga porta cosa aprire e **come**, perche' la forma di
-- lancio la decide il server (vedi la spec). La TV esegue senza sapere cosa
-- siano quei campi.
--
-- La stessa riga, dopo la consegna, e' la **dichiarazione**: da quel momento le
-- sessioni senza titolo di quella TV su quella piattaforma valgono come quel
-- titolo, finche' le regole di `src/lib/scrobble/declared.ts` non dicono basta.
-- Per questo `last_position_ms` e `last_seen_at` stanno qui e non altrove: una
-- seconda tabella direbbe le stesse cose due volte.
create table public.device_commands (
  id uuid primary key default gen_random_uuid(),
  device_id uuid not null references public.devices (id) on delete cascade,
  created_by uuid not null references public.profiles (id) on delete cascade,

  title_id bigint not null,
  media_type public.media_type not null,
  provider_id int not null,

  -- Come aprirlo. `packages` e' in ordine di preferenza: la stessa piattaforma
  -- ha nomi diversi su Fire OS e su Android TV, e quale sia installato lo sa
  -- solo il dispositivo.
  packages text[] not null check (cardinality(packages) between 1 and 4),
  data_uri text,
  extra_deeplink text,
  -- Cosa succedera' davvero, per il testo del bottone: la sonda dice che
  -- Netflix e Disney+ avviano, Prime apre la scheda, NOW apre la home.
  esito_atteso text not null check (esito_atteso in ('avvia', 'scheda', 'app')),

  created_at timestamptz not null default now(),
  -- Vita del COMANDO: oltre, non ha piu' senso eseguirlo. Una TV accesa un'ora
  -- dopo non deve mettersi a riprodurre un film da sola.
  expires_at timestamptz not null,
  delivered_at timestamptz,
  -- Com'e' andata, secondo la TV: senza, un lancio fallito sarebbe muto.
  result text check (result in ('ok', 'assente', 'errore')),

  -- Vita della DICHIARAZIONE (30 minuti dall'ultimo evento attribuito).
  last_position_ms bigint,
  last_seen_at timestamptz,

  foreign key (title_id, media_type) references public.titles (id, media_type)
    on delete cascade
);

create index device_commands_device_idx
  on public.device_commands (device_id, created_at desc);
create index device_commands_created_by_idx on public.device_commands (created_by);
create index device_commands_title_idx on public.device_commands (title_id, media_type);
-- Il ritiro dalla TV: "il piu' recente non ancora consegnato e non scaduto".
create index device_commands_da_consegnare_idx
  on public.device_commands (device_id, expires_at)
  where delivered_at is null;

alter table public.device_commands enable row level security;

-- Si vede e si scrive solo per una TV di cui si e' membro. La TV non passa di
-- qui: si autentica col token, come per lo scrobble, e legge col service role.
drop policy if exists device_commands_select_own on public.device_commands;
create policy device_commands_select_own on public.device_commands
  for select to authenticated
  using (
    exists (
      select 1 from public.device_members m
      where m.device_id = device_commands.device_id
        and m.user_id = (select auth.uid())
    )
  );

drop policy if exists device_commands_insert_own on public.device_commands;
create policy device_commands_insert_own on public.device_commands
  for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and exists (
      select 1 from public.device_members m
      where m.device_id = device_commands.device_id
        and m.user_id = (select auth.uid())
    )
  );
```

- [ ] **Step 2: Applicare la migration**

Con MCP Supabase `apply_migration`, nome `0046_device_commands`.

- [ ] **Step 3: Verificare che la tabella esista davvero**

`apply_migration` che risponde `success` dice solo che il corpo è stato accettato. Con `execute_sql`:

```sql
select count(*) as colonne from information_schema.columns
 where table_schema='public' and table_name='device_commands';
```

Expected: 15.

- [ ] **Step 4: Rigenerare i tipi**

MCP Supabase `generate_typescript_types`, scrivere il risultato in `src/types/database.ts`, poi `pnpm exec prettier --write src/types/database.ts`.

Run: `pnpm typecheck`
Expected: pulito.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0046_device_commands.sql src/types/database.ts
git commit -m "feat(db): coda dei comandi verso una TV collegata"
```

---

### Task 2: La forma di lancio (funzione pura)

**Files:**
- Create: `src/lib/devices/launch.ts`
- Create: `src/lib/devices/__tests__/launch.test.ts`

**Interfaces:**
- Consumes: niente.
- Produces:
  - `export interface FormaLancio { packages: string[]; dataUri: string | null; extraDeeplink: string | null; esito: "avvia" | "scheda" | "app" }`
  - `export function formaDiLancio(providerId: number, url: string | null): FormaLancio | null`
  - `export const PROVIDER_LANCIABILI: number[]`

- [ ] **Step 1: Scrivere il test che fallisce**

```ts
import { describe, expect, it } from "vitest";
import { formaDiLancio } from "../launch";

describe("forma di lancio per piattaforma", () => {
  it("Netflix: l'id finisce nell'extra, non nell'URL", () => {
    // La sonda del 12/09: https://www.netflix.com/watch/<id> apre l'app e si
    // ferma alla home. Avvia solo l'extra `amzn_deeplink_data`.
    expect(formaDiLancio(8, "https://www.netflix.com/title/81234567")).toEqual({
      packages: ["com.netflix.ninja", "com.netflix.mediaclient"],
      dataUri: null,
      extraDeeplink: "81234567",
      esito: "avvia",
    });
  });

  it("Netflix: accetta anche la forma /watch/", () => {
    expect(formaDiLancio(8, "https://www.netflix.com/watch/70242311")?.extraDeeplink).toBe(
      "70242311",
    );
  });

  it("Disney+: play avvia, browse no, stesso uuid", () => {
    const uuid = "a3f1c2d4-0e5b-4a6c-8d9e-1f2a3b4c5d6e";
    expect(formaDiLancio(337, `https://www.disneyplus.com/browse/entity-${uuid}`)).toEqual({
      packages: ["com.disney.disneyplus"],
      dataUri: `https://www.disneyplus.com/play/${uuid}`,
      extraDeeplink: null,
      esito: "avvia",
    });
  });

  it("Prime Video: apre la scheda, e lo dichiara", () => {
    const gti = "amzn1.dv.gti.abcdef12-3456-7890-abcd-ef1234567890";
    const forma = formaDiLancio(119, `https://app.primevideo.com/detail?gti=${gti}`);
    expect(forma?.esito).toBe("scheda");
    expect(forma?.dataUri).toBe(`https://app.primevideo.com/detail?gti=${gti}`);
    expect(forma?.packages).toContain("com.amazon.firebat");
  });

  it("NOW: apre l'app e basta, anche senza id", () => {
    expect(formaDiLancio(39, null)).toEqual({
      packages: ["com.nowtv.it"],
      dataUri: null,
      extraDeeplink: null,
      esito: "app",
    });
  });

  it("una piattaforma che non sappiamo lanciare non si inventa", () => {
    expect(formaDiLancio(350, "https://tv.apple.com/it/movie/x/umc.cmc.1")).toBeNull();
    expect(formaDiLancio(1899, "https://example.com")).toBeNull();
  });

  it("un URL di un'altra piattaforma non passa per buono", () => {
    // Il link viene dal database, ma un dato sbagliato non deve produrre un
    // intent verso il pacchetto sbagliato.
    expect(formaDiLancio(8, "https://www.disneyplus.com/play/abc")).toBeNull();
    expect(formaDiLancio(337, "http://www.disneyplus.com/play/abc")).toBeNull();
  });

  it("Netflix senza id non parte: meglio niente che la home", () => {
    expect(formaDiLancio(8, "https://www.netflix.com/browse")).toBeNull();
  });
});
```

- [ ] **Step 2: Eseguire il test e vederlo fallire**

Run: `pnpm exec vitest run src/lib/devices/__tests__/launch.test.ts`
Expected: FAIL, `formaDiLancio` non esiste.

- [ ] **Step 3: Scrivere l'implementazione**

```ts
/**
 * Come si apre un titolo su una TV, per piattaforma.
 *
 * Pura: prende l'id della piattaforma e il link che sta in
 * `title_provider_links` (fonte `justwatch`) e restituisce cosa mandare alla TV.
 * Le forme sono **misurate**, non dedotte — sonda del 12/09/2026, §3:
 *
 * - **Netflix**: l'URL non basta. `netflix.com/watch/<id>`, `netflix://` e
 *   `nflx://` aprono l'app e si fermano alla home. Avvia solo l'extra
 *   `amzn_deeplink_data` con l'id nudo.
 * - **Disney+**: conta il percorso. `play/<uuid>` avvia, `browse/entity-<uuid>`
 *   apre la scheda. Stesso uuid: si riscrive.
 * - **Prime Video**: apre la scheda, e da li' serve un Play col telecomando.
 * - **NOW**: apre la home e non centra il titolo. Si lancia lo stesso perche'
 *   NOW poi si identifica da sola (pubblica il titolo dell'episodio).
 *
 * `packages` e' in ordine di preferenza: la stessa piattaforma ha nomi diversi
 * su Fire OS e su Android TV, e quale sia installato lo sa solo il dispositivo.
 */
export interface FormaLancio {
  packages: string[];
  dataUri: string | null;
  extraDeeplink: string | null;
  /** Cosa succedera' davvero: serve al testo del bottone. */
  esito: "avvia" | "scheda" | "app";
}

/** Le piattaforme che sappiamo lanciare **e** le cui sessioni l'ingest riceve. */
export const PROVIDER_LANCIABILI = [8, 39, 119, 337];

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function urlSicuro(raw: string | null, hostAtteso: string): URL | null {
  if (!raw) return null;
  try {
    const u = new URL(raw);
    // Solo https e solo il dominio giusto: il link viene dal database, ma un
    // dato sbagliato non deve produrre un intent verso il pacchetto sbagliato.
    if (u.protocol !== "https:" || u.hostname !== hostAtteso) return null;
    return u;
  } catch {
    return null;
  }
}

export function formaDiLancio(providerId: number, url: string | null): FormaLancio | null {
  if (providerId === 8) {
    const u = urlSicuro(url, "www.netflix.com");
    const id = u?.pathname.match(/^\/(?:title|watch)\/(\d{1,12})\/?$/)?.[1];
    // Senza id l'app si apre sulla home: meglio non offrire il lancio affatto.
    if (!id) return null;
    return {
      packages: ["com.netflix.ninja", "com.netflix.mediaclient"],
      dataUri: null,
      extraDeeplink: id,
      esito: "avvia",
    };
  }

  if (providerId === 337) {
    const u = urlSicuro(url, "www.disneyplus.com");
    const uuid = u?.pathname.match(/\/(?:play|browse\/entity)-?\/?([0-9a-f-]{36})\/?$/i)?.[1];
    if (!uuid || !UUID.test(uuid)) return null;
    return {
      packages: ["com.disney.disneyplus"],
      dataUri: `https://www.disneyplus.com/play/${uuid}`,
      extraDeeplink: null,
      esito: "avvia",
    };
  }

  if (providerId === 119) {
    const u = urlSicuro(url, "app.primevideo.com");
    const gti = u?.searchParams.get("gti");
    if (!gti || !/^amzn1\.dv\.gti\.[a-z0-9-]{10,100}$/i.test(gti)) return null;
    return {
      packages: [
        "com.amazon.firebat",
        "com.amazon.avod",
        "com.amazon.avod.thirdpartyclient",
      ],
      dataUri: `https://app.primevideo.com/detail?gti=${gti}`,
      extraDeeplink: null,
      esito: "scheda",
    };
  }

  if (providerId === 39) {
    // NOW non centra il titolo comunque: si apre l'app, il resto lo fa lei.
    return {
      packages: ["com.nowtv.it"],
      dataUri: null,
      extraDeeplink: null,
      esito: "app",
    };
  }

  return null;
}
```

- [ ] **Step 4: Eseguire i test e vederli passare**

Run: `pnpm exec vitest run src/lib/devices/__tests__/launch.test.ts`
Expected: PASS, 8 test.

- [ ] **Step 5: Commit**

```bash
git add src/lib/devices/launch.ts src/lib/devices/__tests__/launch.test.ts
git commit -m "feat(tv): la forma di lancio per piattaforma, misurata e pura"
```

---

### Task 3: La regola della dichiarazione (funzione pura)

**Files:**
- Create: `src/lib/scrobble/declared.ts`
- Create: `src/lib/scrobble/__tests__/declared.test.ts`

**Interfaces:**
- Consumes: niente.
- Produces:
  - `export interface Dichiarazione { titleId: number; mediaType: "movie" | "tv"; deliveredAt: string; lastPositionMs: number | null; lastSeenAt: string | null }`
  - `export function dichiarazioneValida(d: Dichiarazione, positionMs: number, adesso: string): boolean`
  - `export const FINESTRA_MS: number`

- [ ] **Step 1: Scrivere il test che fallisce**

```ts
import { describe, expect, it } from "vitest";
import { dichiarazioneValida, type Dichiarazione } from "../declared";

const BASE: Dichiarazione = {
  titleId: 603,
  mediaType: "movie",
  deliveredAt: "2026-09-12T20:00:00.000Z",
  lastPositionMs: null,
  lastSeenAt: null,
};

const fra = (min: number) =>
  new Date(Date.parse(BASE.deliveredAt) + min * 60_000).toISOString();

describe("quando un lancio da' ancora il nome a cio' che la TV riferisce", () => {
  it("la prima sessione dopo il lancio vale", () => {
    expect(dichiarazioneValida(BASE, 130_000, fra(3))).toBe(true);
  });

  it("lanci e vai a cena: dopo mezz'ora senza riprodurre nulla, cade", () => {
    expect(dichiarazioneValida(BASE, 130_000, fra(31))).toBe(false);
  });

  it("mentre guardi resta valida, un battito dopo l'altro", () => {
    const d = { ...BASE, lastPositionMs: 1_200_000, lastSeenAt: fra(20) };
    expect(dichiarazioneValida(d, 1_230_000, fra(20.5))).toBe(true);
  });

  it("ti alzi e torni dopo venti minuti: e' ancora quel film", () => {
    const d = { ...BASE, lastPositionMs: 1_200_000, lastSeenAt: fra(20) };
    expect(dichiarazioneValida(d, 1_260_000, fra(40))).toBe(true);
  });

  it("torni dopo un'ora: non sappiamo piu' cosa stai guardando", () => {
    const d = { ...BASE, lastPositionMs: 1_200_000, lastSeenAt: fra(20) };
    expect(dichiarazioneValida(d, 1_260_000, fra(85))).toBe(false);
  });

  it("un riavvolgimento resta legittimo", () => {
    // Dieci minuti indietro per rivedere una scena: succede.
    const d = { ...BASE, lastPositionMs: 1_800_000, lastSeenAt: fra(30) };
    expect(dichiarazioneValida(d, 1_200_000, fra(31))).toBe(true);
  });

  it("da un'ora a trenta secondi hai cambiato titolo", () => {
    const d = { ...BASE, lastPositionMs: 3_600_000, lastSeenAt: fra(60) };
    expect(dichiarazioneValida(d, 30_000, fra(61))).toBe(false);
  });

  it("ma ricominciare da capo un film appena iniziato non e' un cambio", () => {
    // Eravamo a 5 minuti: tornare a 30 secondi e' un riavvolgimento, non un
    // titolo nuovo. La regola guarda entrambi i lati, non solo la posizione nuova.
    const d = { ...BASE, lastPositionMs: 300_000, lastSeenAt: fra(5) };
    expect(dichiarazioneValida(d, 30_000, fra(6))).toBe(true);
  });
});
```

- [ ] **Step 2: Eseguire il test e vederlo fallire**

Run: `pnpm exec vitest run src/lib/scrobble/__tests__/declared.test.ts`
Expected: FAIL, `dichiarazioneValida` non esiste.

- [ ] **Step 3: Scrivere l'implementazione**

```ts
/**
 * Per quanto un lancio continua a dare il nome a cio' che la TV riferisce.
 *
 * Netflix, Prime e l'app Apple TV mandano posizione e stato perfetti e **nessun
 * titolo**: l'unico modo di sapere cosa sta suonando e' che sia stata Zapp ad
 * aprirlo. Questa funzione decide quando quella deduzione vale ancora.
 *
 * La regola e' severa di proposito. Un titolo attribuito male scrive in libreria
 * una visione che non c'e' stata, e lo fa in silenzio; una dichiarazione che cade
 * lascia una sessione anonima, che si vede.
 */
export interface Dichiarazione {
  titleId: number;
  mediaType: "movie" | "tv";
  /** Quando la TV ha ritirato il comando. */
  deliveredAt: string;
  /** Ultima posizione attribuita a questa dichiarazione, se ce n'e' stata una. */
  lastPositionMs: number | null;
  lastSeenAt: string | null;
}

/** Oltre questo silenzio la dichiarazione non vale piu'. */
export const FINESTRA_MS = 30 * 60 * 1000;

/**
 * Sotto questa posizione si e' "all'inizio": se prima eravamo ben oltre, non e'
 * un riavvolgimento, e' un altro titolo.
 */
const INIZIO_MS = 2 * 60 * 1000;
/** Sopra questa posizione eravamo "dentro" la visione. */
const DENTRO_MS = 10 * 60 * 1000;

export function dichiarazioneValida(
  d: Dichiarazione,
  positionMs: number,
  adesso: string,
): boolean {
  const ora = Date.parse(adesso);
  if (!Number.isFinite(ora)) return false;

  // Non si e' ancora attribuito niente: vale la distanza dal lancio.
  if (d.lastSeenAt === null || d.lastPositionMs === null) {
    const consegna = Date.parse(d.deliveredAt);
    return Number.isFinite(consegna) && ora - consegna <= FINESTRA_MS;
  }

  const ultimo = Date.parse(d.lastSeenAt);
  if (!Number.isFinite(ultimo) || ora - ultimo > FINESTRA_MS) return false;

  // Tornati quasi a zero venendo da dentro la visione: e' un altro titolo.
  if (positionMs < INIZIO_MS && d.lastPositionMs > DENTRO_MS) return false;

  return true;
}
```

- [ ] **Step 4: Eseguire i test e vederli passare**

Run: `pnpm exec vitest run src/lib/scrobble/__tests__/declared.test.ts`
Expected: PASS, 8 test.

- [ ] **Step 5: Commit**

```bash
git add src/lib/scrobble/declared.ts src/lib/scrobble/__tests__/declared.test.ts
git commit -m "feat(tv): quando un lancio da' ancora il nome a una sessione anonima"
```

---

### Task 4: La Server Action che lancia

**Files:**
- Modify: `src/app/(app)/devices/actions.ts`
- Create: `src/lib/devices/queries.ts`

**Interfaces:**
- Consumes: `formaDiLancio`, `PROVIDER_LANCIABILI` (Task 2); tabella `device_commands` (Task 1).
- Produces:
  - `export async function lanciaSullaTv(input: { deviceId: string; titleId: number; mediaType: "movie" | "tv"; providerId: number }): Promise<{ ok: true; commandId: string; esito: "avvia" | "scheda" | "app"; nome: string } | { ok: false; error: string }>`
  - `export async function esitoComando(commandId: string): Promise<{ delivered: boolean; result: string | null }>`
  - in `queries.ts`: `export async function tvCollegate(): Promise<{ id: string; name: string }[]>`

- [ ] **Step 1: Scrivere le TV collegate**

`src/lib/devices/queries.ts`:

```ts
import "server-only";

import { createClient } from "@/lib/supabase/server";

/**
 * Le TV che questo utente puo' comandare: collegate, non revocate.
 *
 * Legge col client dell'utente, quindi la RLS fa il filtro — e il codice non ha
 * bisogno di ripetere "solo le mie", che e' la parte che si dimentica.
 */
export async function tvCollegate(): Promise<{ id: string; name: string }[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("devices")
    .select("id, name, platform, revoked_at, device_members!inner(user_id)")
    .is("revoked_at", null)
    .in("platform", ["fire_tv", "android_tv"])
    .order("created_at");
  return (data ?? []).map((d) => ({ id: d.id, name: d.name }));
}
```

- [ ] **Step 2: Scrivere l'azione di lancio**

In coda a `src/app/(app)/devices/actions.ts`:

```ts
/** Vita del comando: oltre, non ha piu' senso eseguirlo. */
const COMANDO_TTL_MS = 2 * 60 * 1000;

/**
 * Chiede a una TV collegata di aprire un titolo.
 *
 * Non scrive niente in libreria: il lancio **dichiara**, non registra. Cio' che
 * finisce in libreria arriva dalla riproduzione vera, oltre i due minuti, come
 * per ogni altra sorgente.
 */
export async function lanciaSullaTv(input: {
  deviceId: string;
  titleId: number;
  mediaType: "movie" | "tv";
  providerId: number;
}): Promise<
  | { ok: true; commandId: string; esito: "avvia" | "scheda" | "app"; nome: string }
  | { ok: false; error: string }
> {
  const { deviceId, titleId, mediaType, providerId } = input;
  if (!isUuid(deviceId) || !isTmdbId(titleId) || !isMediaType(mediaType)) {
    return { ok: false, error: "Richiesta non valida." };
  }
  if (!PROVIDER_LANCIABILI.includes(providerId)) {
    return { ok: false, error: "Questa piattaforma non si apre sulla TV." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Sessione scaduta." };

  if (!(await rateLimit(`lancia:${user.id}`, 20, 60, { condiviso: true }))) {
    return { ok: false, error: "Troppi lanci, riprova fra un minuto." };
  }

  // Il controllo di proprieta' si fa anche nel codice, non solo nella RLS.
  const { data: membro } = await supabase
    .from("device_members")
    .select("device_id, devices!inner(name, revoked_at)")
    .eq("device_id", deviceId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!membro || membro.devices.revoked_at !== null) {
    return { ok: false, error: "Questa TV non e' collegata." };
  }

  // Il link viene dalla cache dei link, mai dal client: e' un intent che
  // un'altra macchina eseguira'.
  const service = createServiceClient();
  const { data: link } = await service
    .from("title_provider_links")
    .select("url")
    .eq("title_id", titleId)
    .eq("media_type", mediaType)
    .eq("provider_id", providerId)
    .maybeSingle();

  const forma = formaDiLancio(providerId, link?.url ?? null);
  if (!forma) return { ok: false, error: "Di questo titolo non ho il link giusto." };

  const { data: riga, error } = await supabase
    .from("device_commands")
    .insert({
      device_id: deviceId,
      created_by: user.id,
      title_id: titleId,
      media_type: mediaType,
      provider_id: providerId,
      packages: forma.packages,
      data_uri: forma.dataUri,
      extra_deeplink: forma.extraDeeplink,
      esito_atteso: forma.esito,
      expires_at: new Date(Date.now() + COMANDO_TTL_MS).toISOString(),
    })
    .select("id")
    .single();

  if (error || !riga) {
    console.error("[tv] lancio", error?.message);
    return { ok: false, error: "Non sono riuscito a parlare con la TV." };
  }
  return {
    ok: true,
    commandId: riga.id,
    esito: forma.esito,
    nome: membro.devices.name,
  };
}

/** La TV ha ritirato il comando? Serve al bottone per smettere di girare. */
export async function esitoComando(
  commandId: string,
): Promise<{ delivered: boolean; result: string | null }> {
  if (!isUuid(commandId)) return { delivered: false, result: null };
  const supabase = await createClient();
  const { data } = await supabase
    .from("device_commands")
    .select("delivered_at, result")
    .eq("id", commandId)
    .maybeSingle();
  return { delivered: !!data?.delivered_at, result: data?.result ?? null };
}
```

Aggiungere in cima al file gli import mancanti: `createServiceClient` da `@/lib/supabase/server`, `isTmdbId`/`isMediaType` da `@/lib/validate`, `formaDiLancio`/`PROVIDER_LANCIABILI` da `@/lib/devices/launch`.

- [ ] **Step 3: Verificare**

Run: `pnpm typecheck && pnpm lint`
Expected: pulito.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(app)/devices/actions.ts" src/lib/devices/queries.ts
git commit -m "feat(tv): l'azione che chiede a una TV di aprire un titolo"
```

---

### Task 5: La rotta che la TV sonda

**Files:**
- Create: `src/app/api/devices/commands/route.ts`
- Modify: `src/lib/supabase/middleware.ts` (percorsi pubblici)

**Interfaces:**
- Consumes: tabella `device_commands` (Task 1).
- Produces: `GET /api/devices/commands` (Bearer del dispositivo) → `{ command: { id, packages, data_uri, extra_deeplink } | null }`; accetta `?esito=<id>:<ok|assente|errore>` per riferire com'e' andata.

- [ ] **Step 1: Scrivere la rotta**

```ts
import { createHash } from "node:crypto";
import { type NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { isUuid } from "@/lib/validate";
import { rateLimit } from "@/lib/rate-limit";

/**
 * La TV chiede se c'e' qualcosa da aprire.
 *
 * Restituisce **al massimo un comando** e lo segna consegnato nello stesso
 * momento: per "fai partire un film", non partire e' meglio che partire due
 * volte. Un comando scaduto non si consegna mai — una TV accesa un'ora dopo il
 * lancio non deve mettersi a riprodurre da sola.
 */
export async function GET(request: NextRequest) {
  const auth = request.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (token.length < 20) {
    return NextResponse.json({ error: "non autorizzato" }, { status: 401 });
  }
  const tokenHash = createHash("sha256").update(token).digest("hex");

  // Un sondaggio ogni 5 s sono 12 al minuto: il tetto lascia spazio a un
  // riavvio e taglia un'app impazzita.
  if (!(await rateLimit(`comandi:${tokenHash}`, 40, 60))) {
    return NextResponse.json({ error: "troppe richieste" }, { status: 429 });
  }

  const service = createServiceClient();
  const { data: device } = await service
    .from("devices")
    .select("id")
    .eq("token_hash", tokenHash)
    .is("revoked_at", null)
    .maybeSingle();
  if (!device) return NextResponse.json({ error: "non autorizzato" }, { status: 401 });

  // L'esito del comando precedente, se la TV ce l'ha mandato.
  const esito = new URL(request.url).searchParams.get("esito");
  if (esito) {
    const [id, valore] = esito.split(":");
    if (isUuid(id) && ["ok", "assente", "errore"].includes(valore)) {
      await service
        .from("device_commands")
        .update({ result: valore })
        .eq("id", id)
        .eq("device_id", device.id);
    }
  }

  const { data: comando } = await service
    .from("device_commands")
    .select("id, packages, data_uri, extra_deeplink")
    .eq("device_id", device.id)
    .is("delivered_at", null)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!comando) return NextResponse.json({ command: null });

  // Consegna al massimo una volta: si segna prima di rispondere.
  await service
    .from("device_commands")
    .update({ delivered_at: new Date().toISOString() })
    .eq("id", comando.id);

  return NextResponse.json({ command: comando });
}

export const dynamic = "force-dynamic";
```

- [ ] **Step 2: Aggiungere la rotta ai percorsi pubblici**

In `src/lib/supabase/middleware.ts`, accanto a `"/api/devices/pair"`, aggiungere `"/api/devices/commands"` con una riga di commento: la chiama la TV, che non ha un cookie di sessione e si autentica col proprio token.

- [ ] **Step 3: Verificare a mano contro un'istanza avviata**

```bash
NEXT_DIST_DIR=.next-tv pnpm build
NEXT_DIST_DIR=.next-tv pnpm exec next start -p 3400 -H 0.0.0.0
curl -s -H "Authorization: Bearer <token di prova>" http://localhost:3400/api/devices/commands
```

Expected: `{"command":null}` senza comandi in coda; `401` senza header.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/devices/commands/route.ts src/lib/supabase/middleware.ts
git commit -m "feat(tv): la rotta che consegna un comando alla volta"
```

---

### Task 6: L'ingest usa la dichiarazione

**Files:**
- Modify: `src/app/api/scrobble/route.ts`

**Interfaces:**
- Consumes: `dichiarazioneValida`, `Dichiarazione` (Task 3); `PROVIDER_ID_BY_SITE`.
- Produces: nel ramo TV, un evento senza titolo viene attribuito al titolo dichiarato invece di finire fra le sessioni anonime.

- [ ] **Step 1: Leggere la dichiarazione quando manca il titolo**

Nel ramo `daTv`, dove oggi si chiama `annotaSessioneAnonima`, prima di rinunciare:

```ts
const parsed = parseAndroidEvent(ev);
if (!parsed) {
  // Nessun titolo nei metadati (Netflix, Prime): se Zapp ha appena aperto
  // qualcosa su questa TV per questa piattaforma, sappiamo cos'e'.
  const dichiarato = await titoloDichiarato(
    service,
    device.id,
    providerId,
    ev.position_ms,
    ev.at,
  );
  if (!dichiarato) {
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
    parsed: {
      title: dichiarato.title,
      kind: dichiarato.mediaType,
      season: null,
      episode: null,
      episodeName: null,
      year: null,
    },
    at: ev.at,
    state: ev.state,
    positionMs: ev.position_ms,
    // La durata non c'e': la mette il runtime di TMDB dentro
    // `applicaEventoRiconosciuto`, che il titolo ce l'ha in cache.
    durationMs: ev.duration_ms,
    contentKey: null,
    giaRisolto: {
      titleId: dichiarato.titleId,
      mediaType: dichiarato.mediaType,
      season: null,
      episode: null,
    },
    tipoIncerto: false,
  });
  if (esito.applied) applied++;
  continue;
}
```

- [ ] **Step 2: Scrivere `titoloDichiarato`**

In coda a `route.ts`, accanto ad `annotaSessioneAnonima`:

```ts
/**
 * Il titolo che Zapp ha aperto su questa TV per questa piattaforma, se la
 * dichiarazione vale ancora.
 *
 * Aggiorna la riga a ogni evento attribuito: sono quei due campi a tenere in
 * vita la dichiarazione, e a farla cadere quando la posizione ricomincia da capo
 * (`src/lib/scrobble/declared.ts` per le regole e il perche').
 */
async function titoloDichiarato(
  service: ReturnType<typeof createServiceClient>,
  deviceId: string,
  providerId: number,
  positionMs: number,
  at: string,
): Promise<{ titleId: number; mediaType: "movie" | "tv"; title: string } | null> {
  try {
    const { data: riga } = await service
      .from("device_commands")
      .select(
        "id, title_id, media_type, delivered_at, last_position_ms, last_seen_at, titles(title)",
      )
      .eq("device_id", deviceId)
      .eq("provider_id", providerId)
      .not("delivered_at", "is", null)
      .order("delivered_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!riga?.delivered_at) return null;

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

    return {
      titleId: riga.title_id,
      mediaType: riga.media_type,
      title: riga.titles?.title ?? "",
    };
  } catch (err) {
    console.error("[scrobble] dichiarazione", err);
    return null;
  }
}
```

- [ ] **Step 3: La durata mancante la mette TMDB**

Dentro `applicaEventoRiconosciuto`, dopo aver letto `cachedTitle`, prima di `decide`:

```ts
// Netflix, Prime e l'app Apple TV non mandano la durata: senza, `decide` non
// completa mai. Il titolo pero' lo conosciamo (l'abbiamo lanciato noi), quindi
// il denominatore lo da' TMDB. Misurato il 12/09: lo stream supera il runtime
// di 1,3 minuti su un film di 132 e di 0,2 su un episodio di 46, quindi il 90%
// del runtime cade all'89% dello stream — dentro il margine.
const durataEffettiva =
  durationMs ??
  (match.mediaType === "movie" && cachedTitle.title.runtime
    ? cachedTitle.title.runtime * 60_000
    : null);
```

e usare `durataEffettiva` al posto di `durationMs` nella chiamata a `decide`.

- [ ] **Step 4: Verificare**

Run: `pnpm typecheck && pnpm lint && pnpm test`
Expected: pulito, i test esistenti restano verdi.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/scrobble/route.ts
git commit -m "feat(tv): una sessione senza nome prende il titolo che Zapp ha aperto"
```

---

### Task 7: L'app TV ritira ed esegue

**Files:**
- Create: `D:\PROGETTI\ZConnection\app\src\main\java\com\zapp\zconnection\Comandi.kt`
- Modify: `Api.kt`, `ZListener.kt`

**Interfaces:**
- Consumes: `Api`, `Store` (Piano 1).
- Produces: `Comandi(context, api).start()` / `.stop()`; in `Api`: `fun comando(esito: String?): JSONObject?`

- [ ] **Step 1: Aggiungere la chiamata in `Api.kt`**

```kotlin
    /**
     * Chiede se c'e' qualcosa da aprire, e riferisce com'e' andata l'ultima
     * volta. Il `null` e' la risposta normale: quasi sempre non c'e' niente.
     */
    fun comando(esito: String? = null): JSONObject? {
        val percorso = if (esito != null) "/api/devices/commands?esito=$esito"
        else "/api/devices/commands"
        val risposta = chiama("GET", percorso, null) ?: return null
        return risposta.optJSONObject("command")
    }
```

- [ ] **Step 2: Scrivere `Comandi.kt`**

```kotlin
package com.zapp.zconnection

import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Handler
import android.os.HandlerThread
import org.json.JSONObject

/**
 * Ritira i comandi da Zapp e li esegue.
 *
 * La forma del lancio arriva gia' decisa dal server: qui si sceglie solo quale
 * pacchetto e' davvero installato, perche' quello lo sa solo il dispositivo, e
 * si riferisce com'e' andata — un lancio fallito in silenzio sarebbe il peggiore
 * dei guasti.
 */
class Comandi(context: Context, private val api: Api) {
    private val app = context.applicationContext
    private val thread = HandlerThread("zapp-comandi").apply { start() }
    private val handler = Handler(thread.looper)
    private var esitoDaRiferire: String? = null

    private val giro = object : Runnable {
        override fun run() {
            val comando = api.comando(esitoDaRiferire)
            esitoDaRiferire = null
            if (comando != null) esegui(comando)
            handler.postDelayed(this, INTERVALLO_MS)
        }
    }

    fun start() = handler.post(giro)

    fun stop() {
        handler.removeCallbacksAndMessages(null)
        thread.quitSafely()
    }

    private fun esegui(comando: JSONObject) {
        val id = comando.optString("id")
        val pacchetto = primoInstallato(comando.optJSONArray("packages"))
        if (pacchetto == null) {
            ProbeLog.add("comando $id: app non installata")
            esitoDaRiferire = "$id:assente"
            return
        }
        val intent = Intent(Intent.ACTION_VIEW).apply {
            setPackage(pacchetto)
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            val uri = comando.optString("data_uri", "")
            if (uri.isNotEmpty()) data = Uri.parse(uri)
            val extra = comando.optString("extra_deeplink", "")
            if (extra.isNotEmpty()) {
                // La sonda del 12/09: per Netflix l'URL non basta, avvia solo
                // questo extra, e il componente va indicato sempre — altrimenti
                // compare il selettore "apri con".
                putExtra("amzn_deeplink_data", extra)
                component = ComponentName(pacchetto, "$pacchetto.MainActivity")
            }
        }
        esitoDaRiferire = try {
            app.startActivity(intent)
            ProbeLog.add("comando $id: aperto $pacchetto")
            "$id:ok"
        } catch (e: Exception) {
            ProbeLog.add("comando $id: ${e.javaClass.simpleName}")
            "$id:errore"
        }
    }

    private fun primoInstallato(nomi: org.json.JSONArray?): String? {
        if (nomi == null) return null
        for (i in 0 until nomi.length()) {
            val nome = nomi.optString(i)
            val installato = runCatching {
                @Suppress("DEPRECATION")
                app.packageManager.getPackageInfo(nome, 0)
            }.isSuccess
            if (installato) return nome
        }
        return null
    }

    companion object {
        /** Cinque secondi: "prendi il telecomando e siediti" non se ne accorge. */
        private const val INTERVALLO_MS = 5_000L
    }
}
```

Per Netflix il componente e' `com.netflix.ninja/.MainActivity`: la riga
`ComponentName(pacchetto, "$pacchetto.MainActivity")` lo costruisce. Verificare
sul dispositivo (Step 4) che l'intent parta davvero; se il nome dell'activity
non combacia, prenderlo da `adb shell dumpsys package com.netflix.ninja | grep -A2 MAIN`.

- [ ] **Step 3: Avviarlo insieme alla sonda**

In `ZListener.onListenerConnected`, accanto a `Sender` e `SessionProbe`, creare e avviare `Comandi(this, Api(Store(this)))`; fermarlo in `onListenerDisconnected`.

**Attenzione**: i comandi devono funzionare **anche in modalità base**, cioè senza il permesso notifiche — lanciare un titolo non richiede di leggere le sessioni. Se `ZListener` non è agganciato, `Comandi` va avviato comunque da `ConnectedActivity.onResume` e fermato in `onPause`.

- [ ] **Step 4: Compilare e provare sul dispositivo vero**

```bash
JAVA_HOME=... ./gradlew --no-daemon assembleDebug -PzappBase=http://<ip-pc>:3400
adb -s <ip>:5555 install -r app/build/outputs/apk/debug/app-debug.apk
```

Expected: `BUILD SUCCESSFUL`; nel log `comando <id>: aperto com.netflix.ninja` dopo un lancio da Zapp.

- [ ] **Step 5: Commit**

```bash
git commit -am "feat: ritira i comandi da Zapp e apre il titolo"
```

---

### Task 8: Il tondo TV nella scheda titolo

**Files:**
- Create: `src/components/title/GuardaSullaTv.tsx`
- Modify: `src/components/title/TitleActionsBar.tsx`

**Interfaces:**
- Consumes: `lanciaSullaTv`, `esitoComando` (Task 4); `tvCollegate` (Task 4).
- Produces: componente client `<GuardaSullaTv tv={...} titleId={...} mediaType={...} providerId={...} />`.

- [ ] **Step 1: Scrivere il componente**

```tsx
"use client";

import { useState } from "react";
import { esitoComando, lanciaSullaTv } from "@/app/(app)/devices/actions";
import { Sheet } from "@/components/ui/Sheet";

interface Tv {
  id: string;
  name: string;
}

/**
 * Apre questo titolo su una TV collegata.
 *
 * Il lancio non scrive niente in libreria: quello arriva dalla riproduzione
 * vera, oltre i due minuti. Qui si dice soltanto cosa sta succedendo — e si dice
 * anche quando **non** succede, perche' un bottone che gira per sempre e' il
 * guasto peggiore: sembra che funzioni.
 */
export function GuardaSullaTv({
  tv,
  titleId,
  mediaType,
  providerId,
}: {
  tv: Tv[];
  titleId: number;
  mediaType: "movie" | "tv";
  providerId: number;
}) {
  const [foglio, setFoglio] = useState(false);
  const [stato, setStato] = useState<string | null>(null);

  if (tv.length === 0) return null;

  async function lancia(scelta: Tv) {
    setFoglio(false);
    setStato(`Apro su ${scelta.name}…`);
    const esito = await lanciaSullaTv({
      deviceId: scelta.id,
      titleId,
      mediaType,
      providerId,
    });
    if (!esito.ok) {
      setStato(esito.error);
      return;
    }
    // Venti secondi: oltre, la TV o e' spenta o non sta ascoltando.
    for (let giro = 0; giro < 10; giro += 1) {
      await new Promise((r) => setTimeout(r, 2000));
      const { delivered, result } = await esitoComando(esito.commandId);
      if (result === "assente") {
        setStato("Su quella TV l'app non e' installata");
        return;
      }
      if (result === "errore") {
        setStato("La TV non e' riuscita ad aprirlo");
        return;
      }
      if (delivered) {
        setStato(
          esito.esito === "avvia"
            ? "Aperto sulla TV"
            : esito.esito === "scheda"
              ? "Aperta la scheda: premi Play"
              : "Aperta l'app sulla TV",
        );
        return;
      }
    }
    setStato("La TV non ha risposto — e' accesa?");
  }

  return (
    <>
      <button
        type="button"
        className="glass flex items-center gap-2 rounded-full px-4 py-2 text-sm"
        onClick={() => (tv.length === 1 ? lancia(tv[0]) : setFoglio(true))}
      >
        {/* icona TV da src/components/ui/icons */}
        <span>{stato ?? "Guarda sulla TV"}</span>
      </button>

      <Sheet open={foglio} onClose={() => setFoglio(false)} title="Su quale TV?">
        <ul className="flex flex-col gap-2 p-4">
          {tv.map((t) => (
            <li key={t.id}>
              <button
                type="button"
                className="w-full rounded-xl px-4 py-3 text-left"
                onClick={() => lancia(t)}
              >
                {t.name}
              </button>
            </li>
          ))}
        </ul>
      </Sheet>
    </>
  );
}
```

Controllare la firma vera di `Sheet` in `src/components/ui/Sheet.tsx` e adattare le prop: il resto non cambia.

- [ ] **Step 2: Metterlo nella barra delle azioni, senza mai renderlo inerte**

La pagina del titolo è un Server Component: legge lì `tvCollegate()` e **verifica che il lancio sia possibile**, perché la spec dice che senza id per quella piattaforma il tondo non deve comparire affatto — meglio assente che presente e inerte.

```ts
// nella pagina del titolo, accanto agli altri dati
const tv = await tvCollegate();
const { data: link } = tv.length
  ? await service
      .from("title_provider_links")
      .select("url")
      .eq("title_id", titleId)
      .eq("media_type", mediaType)
      .eq("provider_id", providerId)
      .maybeSingle()
  : { data: null };
const lanciabile = tv.length > 0 && !!formaDiLancio(providerId, link?.url ?? null);
```

e rendere `<GuardaSullaTv … />` solo se `lanciabile`.

- [ ] **Step 3: Verificare**

Run: `pnpm typecheck && pnpm lint && NEXT_DIST_DIR=.next-tv pnpm build`
Expected: pulito.

- [ ] **Step 4: Commit**

```bash
git add src/components/title/GuardaSullaTv.tsx src/components/title/TitleActionsBar.tsx
git commit -m "feat(tv): il tondo per aprire un titolo sulla TV"
```

---

### Task 9: Il tondo nella tessera "Continua a guardare"

**Files:**
- Modify: `src/components/home/ContinueCard.tsx`
- Modify: `src/lib/watch/continue.ts` (la tessera porta già `providerId`)

**Interfaces:**
- Consumes: `GuardaSullaTv` (Task 8).

- [ ] **Step 1: Passare le TV alla fila**

`ContinueRow` (Server Component) legge `tvCollegate()` una volta e la passa a ogni tessera: una query per la fila, non una per tessera.

- [ ] **Step 2: Rendere il tondo sulla tessera**

In `ContinueCard.tsx`, accanto al Play esistente:

```tsx
{tv.length > 0 && item.providerId !== null && item.lanciabile && (
  <GuardaSullaTv
    tv={tv}
    titleId={item.titleId}
    mediaType={item.mediaType}
    providerId={item.providerId}
  />
)}
```

`lanciabile` si calcola **nella fila**, non nella tessera: `continueItem` ha già il link della piattaforma in mano quando costruisce `providerUrl`, quindi lì si aggiunge `lanciabile: !!formaDiLancio(info.id, info.url)` al `ContinueItem`. Una tessera non deve fare query.

Su mobile il tondo sta nella stessa fascia del Play, senza allargare la tessera: se non ci sta, vince il Play e il tondo TV resta solo sulla scheda titolo — meglio una tessera leggibile che due bottoni schiacciati.

- [ ] **Step 3: Verificare**

Run: `pnpm typecheck && pnpm lint && pnpm test`
Expected: pulito, 991 test verdi.

- [ ] **Step 4: Commit**

```bash
git add src/components/home/ContinueCard.tsx src/lib/watch/continue.ts
git commit -m "feat(tv): il tondo TV anche su Continua a guardare"
```

---

### Task 10: Collaudo sulla TV vera e documentazione

**Files:**
- Modify: `docs/architecture/zconnection.md`
- Modify: `docs/architecture/scale.md`

- [ ] **Step 1: Sicurezza**

Run: `BASE=http://localhost:3400 node scripts/security-check.mjs`
Expected: nessuna regressione (50/50 al 12/09).

- [ ] **Step 2: Consulenti del database**

MCP Supabase `get_advisors` (security e performance).
Expected: nessun avviso nuovo su `device_commands`.

- [ ] **Step 3: Il giro completo, sulla Fire TV**

1. Lanciare un film **Netflix** dal telefono → parte sulla TV entro cinque secondi.
2. Guardarlo **due minuti** → compare in libreria col titolo giusto e il minutaggio che scorre.
3. Cambiare titolo col telecomando dentro Netflix, e tornare a inizio film → la dichiarazione **cade**: gli eventi tornano anonimi, in libreria non si scrive il titolo sbagliato.
4. Lanciare su **Prime** → si apre la scheda, e il bottone dice "premi Play".
5. **Spegnere la TV**, lanciare, riaccenderla dopo cinque minuti → **non parte niente** (comando scaduto).
6. Lanciare verso una TV **revocata** → il bottone non compare affatto.

- [ ] **Step 4: Aggiornare la documentazione**

In `docs/architecture/zconnection.md`, sezione "Su TV": il lancio, la dichiarazione e le sue tre regole, il completamento col runtime TMDB. In `docs/architecture/scale.md`: il costo del sondaggio (12 richieste al minuto per TV) e la soglia oltre cui conviene Realtime.

- [ ] **Step 5: Commit**

```bash
git add docs/architecture/zconnection.md docs/architecture/scale.md
git commit -m "docs: il lancio dalla TV e il suo costo"
```
