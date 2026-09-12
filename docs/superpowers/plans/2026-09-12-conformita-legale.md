# Conformità legale — fondamenta (sottoprogetto 1) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dare a Zapp informativa privacy, condizioni d'uso, consensi dimostrabili, controllo dell'età, cancellazione account, export dei dati e il meccanismo di segnalazione richiesto dal DSA, senza togliere nessuna funzionalità.

**Architecture:** Tre pagine statiche in un route group `(legal)` fuori dall'autenticazione; una tabella `user_consents` versionata che registra *a quale testo* e *quando* l'utente ha acconsentito; un gate nel layout `(app)` che riusa il `Promise.all` già presente, quindi senza round trip in più; due Server Action (consensi, cancellazione) e un route handler per l'export.

**Tech Stack:** Next.js 15 App Router, TypeScript strict, Supabase (Postgres + RLS + Storage), Tailwind 4, Vitest per le sole funzioni pure.

**Spec:** `docs/superpowers/specs/2026-09-12-conformita-legale-design.md`

## Global Constraints

Valgono per **ogni** task. Non ripetute nei singoli task.

- **Lingua:** interfaccia e commenti in italiano. Mai inglese in pagina.
- **Titolare:** `Manuel Micheli`. Email: il segnaposto letterale `<EMAIL_PRIVACY>` ovunque serva un contatto. Non inventare un indirizzo.
- **Versioni dei documenti:** `terms` e `privacy` = `"2026-09-12"`; `personalization` e `scrobble` = `"1"`.
- **RLS:** ogni policy nuova usa `(select auth.uid())`, mai `auth.uid()` nudo. **Una sola policy permissiva per comando.** Ogni policy è `to authenticated`. `anon` va revocato su tabella e sequenze.
- **Test:** Vitest copre **solo funzioni pure** (`src/**/*.test.ts`). Per tutto il resto la verifica è `pnpm typecheck && pnpm lint && pnpm build` più gli script Playwright. Non scrivere test Vitest per componenti o per codice che tocca il DB: non girano in questo progetto.
- **Prettier:** virgolette doppie, virgole finali, `printWidth` 90. Lanciare `pnpm format` prima di ogni commit.
- **Moduli server:** iniziano con `import "server-only";`. `actions.ts` = `"use server"`, `queries.ts` = letture server-only.
- **Errori verso il client:** sempre un messaggio generico. `error.message` di PostgREST racconta colonne, vincoli e policy: il dettaglio resta in `console.error`.
- **Dopo ogni migration:** rigenerare `src/types/database.ts`.
- **Build in parallelo:** se serve un build di verifica mentre un'altra sessione lavora, usare `NEXT_DIST_DIR=.next-check`.
- **Numerazione migration:** si parte da `0043` (l'ultima applicata è `0042_title_comments_moderation.sql`).

---

### Task 1: `versions.ts` — quali consensi mancano

Il cuore puro del sistema. È l'unica parte di questo piano con test Vitest veri, perché è l'unica funzione pura.

**Files:**
- Create: `src/lib/legal/versions.ts`
- Test: `src/lib/legal/versions.test.ts`

**Interfaces:**
- Consumes: niente
- Produces: `VERSIONI`, `type TipoConsenso`, `type RigaConsenso`, `consensiMancanti(righe: RigaConsenso[]): TipoConsenso[]`, `CONSENSI_OBBLIGATORI`, `haConsenso(righe, tipo): boolean`

- [ ] **Step 1: Scrivere il test che fallisce**

```ts
// src/lib/legal/versions.test.ts
import { describe, expect, it } from "vitest";
import {
  consensiMancanti,
  haConsenso,
  VERSIONI,
  type RigaConsenso,
} from "./versions";

const riga = (
  kind: RigaConsenso["kind"],
  version: string,
  revoked_at: string | null = null,
): RigaConsenso => ({ kind, version, granted_at: "2026-09-12T10:00:00Z", revoked_at });

describe("consensiMancanti", () => {
  it("senza righe mancano tutti e due gli obbligatori", () => {
    expect(consensiMancanti([])).toEqual(["terms", "privacy"]);
  });

  it("con entrambi gli obbligatori alla versione corrente non manca niente", () => {
    const righe = [
      riga("terms", VERSIONI.terms),
      riga("privacy", VERSIONI.privacy),
    ];
    expect(consensiMancanti(righe)).toEqual([]);
  });

  it("una versione vecchia non vale: il testo accettato era un altro", () => {
    const righe = [riga("terms", "2020-01-01"), riga("privacy", VERSIONI.privacy)];
    expect(consensiMancanti(righe)).toEqual(["terms"]);
  });

  it("una riga revocata non vale", () => {
    const righe = [
      riga("terms", VERSIONI.terms, "2026-09-13T10:00:00Z"),
      riga("privacy", VERSIONI.privacy),
    ];
    expect(consensiMancanti(righe)).toEqual(["terms"]);
  });

  it("revocata e poi riconcessa vale: conta la riga attiva, non la storia", () => {
    const righe = [
      riga("terms", VERSIONI.terms, "2026-09-13T10:00:00Z"),
      riga("terms", VERSIONI.terms),
      riga("privacy", VERSIONI.privacy),
    ];
    expect(consensiMancanti(righe)).toEqual([]);
  });

  it("i facoltativi non entrano mai fra i mancanti", () => {
    const righe = [riga("terms", VERSIONI.terms), riga("privacy", VERSIONI.privacy)];
    expect(consensiMancanti(righe)).not.toContain("personalization");
    expect(consensiMancanti(righe)).not.toContain("scrobble");
  });
});

describe("haConsenso", () => {
  it("è falso per un facoltativo mai concesso", () => {
    expect(haConsenso([], "scrobble")).toBe(false);
  });

  it("è vero per un facoltativo attivo alla versione corrente", () => {
    expect(haConsenso([riga("scrobble", VERSIONI.scrobble)], "scrobble")).toBe(true);
  });

  it("è falso se la versione del facoltativo è vecchia", () => {
    expect(haConsenso([riga("scrobble", "0")], "scrobble")).toBe(false);
  });
});
```

- [ ] **Step 2: Lanciare il test e verificare che fallisca**

Run: `pnpm test -- versions`
Expected: FAIL — `Cannot find module './versions'`

- [ ] **Step 3: Scrivere l'implementazione minima**

```ts
// src/lib/legal/versions.ts

/**
 * Le versioni correnti dei testi a cui l'utente acconsente.
 *
 * Alzarne una **rimette in coda quel consenso per tutti**: il gate del layout
 * `(app)` torna a chiederlo e la vecchia accettazione resta nello storico. È
 * l'unico modo di rispondere alla domanda che conta davvero — "a cosa aveva
 * acconsentito questa persona il giorno X" — che un booleano non sa reggere
 * (art. 7(1) GDPR: il titolare deve essere in grado di *dimostrare* il consenso).
 *
 * Per `terms` e `privacy` la versione è la data di pubblicazione del testo; per i
 * due facoltativi è un contatore, perché non hanno un documento proprio.
 */
export const VERSIONI = {
  terms: "2026-09-12",
  privacy: "2026-09-12",
  personalization: "1",
  scrobble: "1",
} as const;

export type TipoConsenso = keyof typeof VERSIONI;

export interface RigaConsenso {
  kind: TipoConsenso;
  version: string;
  granted_at: string;
  revoked_at: string | null;
}

/**
 * Senza questi due l'app non si usa: sono il contratto e l'informativa.
 * `personalization` e `scrobble` sono facoltativi — mancanti, la funzione resta
 * spenta e basta, non si blocca niente.
 */
export const CONSENSI_OBBLIGATORI: TipoConsenso[] = ["terms", "privacy"];

/** true se esiste una riga attiva (non revocata) alla versione corrente. */
export function haConsenso(righe: RigaConsenso[], tipo: TipoConsenso): boolean {
  return righe.some(
    (r) => r.kind === tipo && r.version === VERSIONI[tipo] && r.revoked_at === null,
  );
}

/** Gli obbligatori che mancano, nell'ordine in cui vanno mostrati. */
export function consensiMancanti(righe: RigaConsenso[]): TipoConsenso[] {
  return CONSENSI_OBBLIGATORI.filter((tipo) => !haConsenso(righe, tipo));
}
```

- [ ] **Step 4: Lanciare il test e verificare che passi**

Run: `pnpm test -- versions`
Expected: PASS, 9 test

- [ ] **Step 5: Commit**

```bash
pnpm format
git add src/lib/legal/versions.ts src/lib/legal/versions.test.ts
git commit -m "feat(legal): versioni dei consensi e calcolo dei mancanti"
```

---

### Task 2: migration `0043_consensi.sql`

**Files:**
- Create: `supabase/migrations/0043_consensi.sql`
- Modify: `src/types/database.ts` (rigenerato)

**Interfaces:**
- Consumes: `TipoConsenso` del Task 1 — i valori del `check` devono coincidere esattamente
- Produces: tabella `public.user_consents`

- [ ] **Step 1: Scrivere la migration**

```sql
-- supabase/migrations/0043_consensi.sql
-- Consensi versionati: quale testo, quando, e se è stato revocato.
-- Un booleano non basta (art. 7(1) GDPR): non dice a cosa si è acconsentito.

create table public.user_consents (
  user_id    uuid        not null references public.profiles(id) on delete cascade,
  kind       text        not null check (kind in ('terms', 'privacy', 'personalization', 'scrobble')),
  version    text        not null check (char_length(version) between 1 and 32),
  granted_at timestamptz not null default now(),
  revoked_at timestamptz,
  primary key (user_id, kind, version)
);

-- Il gate del layout legge tutte le righe di un utente a ogni richiesta.
create index user_consents_utente_idx on public.user_consents (user_id);

alter table public.user_consents enable row level security;

-- Una sola policy permissiva per comando: due si valuterebbero entrambe per riga.
create policy user_consents_select_own on public.user_consents
  for select to authenticated using (user_id = (select auth.uid()));

create policy user_consents_insert_own on public.user_consents
  for insert to authenticated with check (user_id = (select auth.uid()));

-- L'update esiste solo per revocare. Il `with check` ripete la proprietà:
-- senza, si potrebbe spostare la riga su un altro utente.
create policy user_consents_update_own on public.user_consents
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- Nessuna policy di delete: la revoca è una data, non una riga che sparisce.
-- Cancellare la prova di un consenso passato è esattamente ciò che non si vuole.

revoke all on table public.user_consents from anon;
grant select, insert on public.user_consents to authenticated;
-- Grant per colonna, ma **due** colonne, non una sola.
--
-- `revoked_at` serve alla revoca. `granted_at` serve alla riconcessione: l'upsert
-- di PostgREST genera un `on conflict do update` su **tutte** le colonne del
-- payload, non solo su quelle che cambiano, quindi con il solo grant su
-- `revoked_at` ogni riconcessione fallirebbe con "permission denied for column".
-- È la trappola già documentata in security.md per `profiles` e `reviews`.
--
-- Restano fuori `user_id`, `kind` e `version`: sono la chiave primaria, quindi
-- riscriverle significherebbe un'altra riga, non la stessa modificata. Il testo
-- accettato resta inalterabile.
grant update (granted_at, revoked_at) on public.user_consents to authenticated;

-- Personalizzazione spenta per chi si iscrive da adesso. Le righe esistenti NON
-- si toccano: il default vale solo per gli insert futuri, ed è voluto — i 16
-- utenti attuali scelgono dal foglio, non gli si cambia la home sotto i piedi.
alter table public.user_preferences
  alter column personalization_enabled set default false;
```

- [ ] **Step 2: Applicare la migration**

Applicare con lo strumento MCP Supabase `apply_migration` (progetto `bbuhwzdbzxgydewmcdwd`, nome `0043_consensi`), coerentemente con le ultime migration del progetto.

- [ ] **Step 3: Verificare che la tabella risponda davvero**

`apply_migration` che risponde `success` dice solo che il corpo è stato accettato. Lanciare con `execute_sql`:

```sql
-- 1. inserimento
insert into public.user_consents (user_id, kind, version)
select id, 'terms', '2026-09-12' from public.profiles limit 1
returning user_id, kind, version, revoked_at;

-- 2. revoca
update public.user_consents set revoked_at = now() where kind = 'terms';

-- 3. riconcessione: è il passo che il grant per colonna può far fallire, perché
--    l'upsert riscrive anche `granted_at`. Se questo va, va anche l'applicazione.
insert into public.user_consents (user_id, kind, version, granted_at, revoked_at)
select user_id, kind, version, now(), null from public.user_consents where kind = 'terms'
on conflict (user_id, kind, version)
do update set granted_at = excluded.granted_at, revoked_at = excluded.revoked_at
returning granted_at, revoked_at;

select count(*) as righe from public.user_consents;
delete from public.user_consents where kind = 'terms';

select column_default from information_schema.columns
where table_name = 'user_preferences' and column_name = 'personalization_enabled';
```

Expected: l'insert restituisce una riga; la riconcessione restituisce `revoked_at`
nullo e un `granted_at` aggiornato; il count è 1; il default risulta `false`.

I passi 2 e 3 non sono zelo: `apply_migration` che risponde `success` dice solo
che il corpo è stato accettato, non che la tabella si lascia usare. È la lezione
di `0036`, dove un `min(uuid)` inesistente ha tenuto ferma un'intera
funzionalità con la migration dichiarata applicata.

- [ ] **Step 4: Rigenerare i tipi**

Run: `supabase gen types typescript --project-id bbuhwzdbzxgydewmcdwd > src/types/database.ts`
Poi `pnpm typecheck` per confermare che nulla si sia rotto.

- [ ] **Step 5: Controllare gli advisor**

Lanciare `get_advisors` (Supabase MCP) per `security`. Nessun avviso nuovo su `user_consents`. Gli avvisi preesistenti su `user_search` e `reviews_with_counts` sono accettati e documentati.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/0043_consensi.sql src/types/database.ts
git commit -m "feat(legal): tabella user_consents versionata, personalizzazione spenta di default"
```

---

### Task 3: lettura e scrittura dei consensi

**Files:**
- Create: `src/lib/legal/queries.ts`
- Create: `src/lib/legal/actions.ts`

**Interfaces:**
- Consumes: `VERSIONI`, `RigaConsenso`, `TipoConsenso`, `consensiMancanti` (Task 1); tabella `user_consents` (Task 2)
- Produces: `getConsensi(): Promise<RigaConsenso[]>`, `concediConsenso(tipo: TipoConsenso)`, `revocaConsenso(tipo: TipoConsenso)`, `accettaDocumenti(): Promise<{ ok: boolean }>`

- [ ] **Step 1: Scrivere le query**

```ts
// src/lib/legal/queries.ts
import "server-only";

import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { getViewer } from "@/lib/auth/viewer";
import type { RigaConsenso } from "./versions";

/**
 * Tutte le righe di consenso del viewer, storico compreso.
 *
 * In React `cache()` perché il layout `(app)` e la pagina profilo la chiedono
 * nella stessa richiesta: una lettura sola, condivisa.
 */
export const getConsensi = cache(async (): Promise<RigaConsenso[]> => {
  const viewer = await getViewer();
  if (!viewer) return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("user_consents")
    .select("kind, version, granted_at, revoked_at")
    .eq("user_id", viewer.id);
  if (error) {
    console.error("[legal] lettura consensi:", error);
    return [];
  }
  return (data ?? []) as RigaConsenso[];
});
```

- [ ] **Step 2: Scrivere le action**

```ts
// src/lib/legal/actions.ts
"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { rateLimit } from "@/lib/rate-limit";
import { CONSENSI_OBBLIGATORI, VERSIONI, type TipoConsenso } from "./versions";

const TIPI = Object.keys(VERSIONI) as TipoConsenso[];

/** Ogni Server Action è un endpoint HTTP: l'argomento lo scrive chiunque. */
function tipoValido(v: unknown): v is TipoConsenso {
  return typeof v === "string" && (TIPI as string[]).includes(v);
}

/**
 * Registra un consenso alla versione corrente. Idempotente: riconcedere qualcosa
 * che è già attivo non crea una riga nuova, riconcedere qualcosa di revocato
 * azzera `revoked_at` sulla riga esistente (la chiave primaria è
 * `user_id, kind, version`).
 */
export async function concediConsenso(
  tipo: TipoConsenso,
): Promise<{ ok: boolean; error?: string }> {
  if (!tipoValido(tipo)) return { ok: false, error: "Richiesta non valida." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Sessione scaduta." };

  if (!(await rateLimit(`consenso:${user.id}`, 30, 60))) {
    return { ok: false, error: "Troppe richieste. Riprova fra poco." };
  }

  const { error } = await supabase
    .from("user_consents")
    .upsert(
      {
        user_id: user.id,
        kind: tipo,
        version: VERSIONI[tipo],
        granted_at: new Date().toISOString(),
        revoked_at: null,
      },
      { onConflict: "user_id,kind,version" },
    );

  if (error) {
    console.error("[legal] concessione consenso:", error);
    return { ok: false, error: "Non è stato possibile salvare. Riprova." };
  }

  await allineaInterruttore(supabase, user.id, tipo, true);
  revalidatePath("/", "layout");
  return { ok: true };
}

/** Revoca: scrive la data, non cancella la riga. */
export async function revocaConsenso(
  tipo: TipoConsenso,
): Promise<{ ok: boolean; error?: string }> {
  if (!tipoValido(tipo)) return { ok: false, error: "Richiesta non valida." };
  if (CONSENSI_OBBLIGATORI.includes(tipo)) {
    // Revocare termini o informativa significa voler smettere di usare Zapp:
    // la strada è la cancellazione dell'account, che è esplicita e completa.
    return {
      ok: false,
      error: "Per revocare termini e informativa elimina l'account dal profilo.",
    };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Sessione scaduta." };

  const { error } = await supabase
    .from("user_consents")
    .update({ revoked_at: new Date().toISOString() })
    .eq("user_id", user.id)
    .eq("kind", tipo)
    .eq("version", VERSIONI[tipo])
    .is("revoked_at", null);

  if (error) {
    console.error("[legal] revoca consenso:", error);
    return { ok: false, error: "Non è stato possibile salvare. Riprova." };
  }

  await allineaInterruttore(supabase, user.id, tipo, false);
  revalidatePath("/", "layout");
  return { ok: true };
}

/** Accettazione di termini e informativa insieme, dal passo 0 dell'onboarding. */
export async function accettaDocumenti(): Promise<{ ok: boolean; error?: string }> {
  for (const tipo of CONSENSI_OBBLIGATORI) {
    const esito = await concediConsenso(tipo);
    if (!esito.ok) return esito;
  }
  return { ok: true };
}

/**
 * `personalization_enabled` resta come interruttore rapido del profilo e come
 * colonna che il job `taste-refresh` legge. La fonte di verità è
 * `user_consents`: qui si tiene allineata, così non esistono due risposte
 * diverse alla stessa domanda.
 *
 * Spegnendo la personalizzazione si cancellano anche i dati raccolti, che è il
 * comportamento già documentato: la revoca non è "smetti di guardare", è
 * "dimentica quello che hai visto".
 */
async function allineaInterruttore(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  tipo: TipoConsenso,
  attivo: boolean,
): Promise<void> {
  if (tipo !== "personalization") return;
  await supabase
    .from("user_preferences")
    .upsert(
      {
        user_id: userId,
        personalization_enabled: attivo,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );
  if (!attivo) {
    await supabase.from("user_events").delete().eq("user_id", userId);
    await supabase.from("user_taste").delete().eq("user_id", userId);
  }
}
```

- [ ] **Step 3: Verificare**

Run: `pnpm typecheck && pnpm lint`
Expected: nessun errore.

- [ ] **Step 4: Commit**

```bash
pnpm format
git add src/lib/legal/queries.ts src/lib/legal/actions.ts
git commit -m "feat(legal): lettura e scrittura dei consensi"
```

---

### Task 4: le tre pagine pubbliche

**Files:**
- Create: `src/app/(legal)/layout.tsx`
- Create: `src/app/(legal)/privacy/page.tsx`
- Create: `src/app/(legal)/termini/page.tsx`
- Create: `src/app/(legal)/licenze/page.tsx`
- Create: `src/components/legal/LegalPage.tsx`
- Modify: `src/lib/supabase/middleware.ts` (costante `PUBLIC_PATHS`, righe 23-30)

**Interfaces:**
- Consumes: niente dai task precedenti
- Produces: le rotte `/privacy`, `/termini`, `/licenze`; il componente `LegalPage({ titolo, aggiornato, children })`

- [ ] **Step 1: Aprire le rotte nel middleware**

In `src/lib/supabase/middleware.ts`, sostituire la costante esistente:

```ts
const PUBLIC_PATHS = [
  "/login",
  "/signup",
  "/auth",
  "/share/recommendation",
  "/api/jobs",
  "/api/scrobble",
  // Documenti legali: devono essere leggibili **prima** di avere un account.
  // Un'informativa raggiungibile solo da loggati non informa nessuno.
  "/privacy",
  "/termini",
  "/licenze",
];
```

- [ ] **Step 2: Scrivere il guscio comune**

```tsx
// src/components/legal/LegalPage.tsx
import Link from "next/link";
import { BackButton } from "@/components/layout/BackButton";

/**
 * Guscio delle pagine legali: leggibili da sloggati, quindi **non leggono mai il
 * database** — il ruolo `anon` non ha grant su niente e una query qui fallirebbe
 * in silenzio. Solo testo statico, quindi la pagina resta prerenderizzata.
 */
export function LegalPage({
  titolo,
  aggiornato,
  children,
}: {
  titolo: string;
  aggiornato: string;
  children: React.ReactNode;
}) {
  return (
    <main className="mx-auto w-full max-w-[760px] px-5 pb-16 pt-[calc(env(safe-area-inset-top,0px)+24px)] lg:px-10">
      <div className="mb-6 flex items-center gap-3">
        <BackButton />
        <span className="text-[13px] text-muted">Zapp</span>
      </div>
      <h1 className="text-[28px] font-semibold leading-tight text-text">{titolo}</h1>
      <p className="mt-2 text-[13px] text-muted-2">Ultimo aggiornamento: {aggiornato}</p>
      <div className="legal-body mt-8 space-y-6 text-[15px] leading-relaxed text-muted">
        {children}
      </div>
      <nav className="mt-12 flex flex-wrap gap-4 border-t border-border pt-6 text-[13px]">
        <Link href="/privacy" className="text-accent-soft">
          Informativa privacy
        </Link>
        <Link href="/termini" className="text-accent-soft">
          Condizioni d&apos;uso
        </Link>
        <Link href="/licenze" className="text-accent-soft">
          Licenze e attribuzioni
        </Link>
      </nav>
    </main>
  );
}
```

- [ ] **Step 3: Scrivere il layout del route group**

```tsx
// src/app/(legal)/layout.tsx
export default function LegalLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return <>{children}</>;
}
```

- [ ] **Step 4: Scrivere `/privacy`**

Il testo va scritto per intero. Struttura obbligata (le nove sezioni della spec, § 1). Contenuto minimo, da non ridurre:

```tsx
// src/app/(legal)/privacy/page.tsx
import type { Metadata } from "next";
import { LegalPage } from "@/components/legal/LegalPage";

export const metadata: Metadata = {
  title: "Informativa privacy · Zapp",
  description: "Come Zapp tratta i dati personali di chi lo usa.",
};

export default function PrivacyPage() {
  return (
    <LegalPage titolo="Informativa privacy" aggiornato="12 settembre 2026">
      <section>
        <h2>1. Chi tratta i tuoi dati</h2>
        <p>
          Il titolare del trattamento è Manuel Micheli. Per qualsiasi richiesta
          relativa ai tuoi dati puoi scrivere a <code>&lt;EMAIL_PRIVACY&gt;</code>.
        </p>
      </section>

      <section>
        <h2>2. Quali dati raccogliamo e da dove</h2>
        <ul>
          <li>
            <strong>Account</strong>: indirizzo email, nome utente, nome visualizzato,
            avatar. Li fornisci tu registrandoti.
          </li>
          <li>
            <strong>Anno di nascita</strong>: lo chiediamo in fase di primo accesso e
            serve solo a calibrare i consigli sui decenni. Non compare mai sul tuo
            profilo pubblico.
          </li>
          <li>
            <strong>Libreria</strong>: i film e le serie che segni come da vedere, in
            corso, visti o abbandonati, con i voti e i progressi per episodio.
          </li>
          <li>
            <strong>Import Netflix</strong>: se carichi il file della tua cronologia
            Netflix, leggiamo titoli e date per riempire la libreria. Il file non viene
            conservato: restano solo le voci riconosciute.
          </li>
          <li>
            <strong>ZConnection</strong>: se colleghi l&apos;estensione per il browser e
            dai il consenso, riceviamo il titolo, la stagione, l&apos;episodio, la
            posizione nel video e la piattaforma di ciò che stai guardando. Non
            riceviamo immagini, audio, credenziali né il contenuto di altre schede.
          </li>
          <li>
            <strong>Contenuti sociali</strong>: amicizie, recensioni, commenti,
            consigli, liste, risposte alla domanda del giorno.
          </li>
          <li>
            <strong>Personalizzazione</strong>: se dai il consenso, registriamo quali
            copertine vedi e apri, per costruire un profilo di gusto.
          </li>
          <li>
            <strong>Cinema</strong>: la posizione che dichiari o concedi, i cinema
            preferiti, le serate salvate e i biglietti che carichi.
          </li>
        </ul>
      </section>

      <section>
        <h2>3. Perché li trattiamo e con quale base giuridica</h2>
        <ul>
          <li>
            Fornire il servizio (account, libreria, funzioni sociali):{" "}
            <em>esecuzione del contratto</em>, art. 6(1)(b) GDPR.
          </li>
          <li>
            Personalizzare i consigli: <em>consenso</em>, art. 6(1)(a). Puoi revocarlo
            in qualsiasi momento dal profilo; revocandolo cancelliamo i dati raccolti a
            questo scopo.
          </li>
          <li>
            Registrare automaticamente le visioni tramite ZConnection:{" "}
            <em>consenso</em>, art. 6(1)(a), richiesto separatamente quando colleghi un
            dispositivo.
          </li>
          <li>
            Sicurezza e prevenzione degli abusi (limiti di frequenza, moderazione):{" "}
            <em>legittimo interesse</em>, art. 6(1)(f).
          </li>
        </ul>
      </section>

      <section>
        <h2>4. Chi altro vede i tuoi dati</h2>
        <p>
          Ci appoggiamo a fornitori che trattano i dati per nostro conto: Supabase
          (database, autenticazione e archiviazione dei file, server nell&apos;Unione
          Europea), Vercel (hosting e funzioni, esecuzione a Francoforte, società
          statunitense) e Upstash (limiti di frequenza).
        </p>
        <p>
          Altri servizi vengono interrogati dai nostri server senza ricevere nulla che
          ti riguardi: TMDB per il catalogo, Open-Meteo per il meteo, Nominatim e
          OpenStreetMap per la geocodifica, MyMovies e i circuiti cinematografici per
          gli orari. Due eccezioni, perché li contatta direttamente il tuo browser e
          quindi vedono il tuo indirizzo IP: <code>image.tmdb.org</code> per le
          locandine e <code>youtube-nocookie.com</code> per i trailer.
        </p>
        <p>
          Gli altri utenti vedono ciò che decidi tu: il profilo privato nasconde
          libreria, attività e statistiche.
        </p>
      </section>

      <section>
        <h2>5. Trasferimenti fuori dall&apos;Unione Europea</h2>
        <p>
          Vercel e Google sono società statunitensi. I trasferimenti avvengono sulla
          base delle clausole contrattuali tipo della Commissione europea e, dove
          applicabile, dell&apos;EU-US Data Privacy Framework.
        </p>
      </section>

      <section>
        <h2>6. Per quanto tempo li conserviamo</h2>
        <ul>
          <li>Dati dell&apos;account e libreria: finché tieni l&apos;account.</li>
          <li>Dati di personalizzazione: 90 giorni, poi cancellati automaticamente.</li>
          <li>Sessioni di visione di ZConnection: 90 giorni.</li>
          <li>Biglietti caricati: finché non elimini la serata o l&apos;account.</li>
          <li>
            Alla cancellazione dell&apos;account tutto viene eliminato subito. Le copie
            di sicurezza del database vengono sovrascritte secondo la rotazione del
            nostro fornitore, entro 30 giorni.
          </li>
        </ul>
      </section>

      <section>
        <h2>7. I tuoi diritti</h2>
        <p>
          Puoi accedere ai tuoi dati, correggerli, cancellarli, limitarne il
          trattamento, opporti e riceverli in formato leggibile da una macchina. Due di
          questi diritti li eserciti da solo, subito, dal tuo profilo: <em>Scarica i
          miei dati</em> e <em>Elimina l&apos;account</em>. Per tutto il resto scrivi a{" "}
          <code>&lt;EMAIL_PRIVACY&gt;</code>: rispondiamo entro trenta giorni.
        </p>
      </section>

      <section>
        <h2>8. Reclamo</h2>
        <p>
          Se ritieni che il trattamento violi il Regolamento puoi rivolgerti al Garante
          per la protezione dei dati personali (www.garanteprivacy.it) o
          all&apos;autorità dello Stato in cui risiedi.
        </p>
      </section>

      <section>
        <h2>9. Cookie</h2>
        <p>
          Zapp usa un solo cookie, quello che tiene aperta la tua sessione. È
          tecnicamente necessario a farti restare collegato, quindi non richiede il tuo
          consenso e non esiste un banner da chiudere. Non usiamo strumenti di analisi,
          non profiliamo la navigazione e non condividiamo nulla con circuiti
          pubblicitari.
        </p>
      </section>

      <section>
        <h2>10. Minori</h2>
        <p>
          Per iscriverti devi avere almeno 14 anni, la soglia prevista in Italia
          dall&apos;art. 2-quinquies del Codice Privacy.
        </p>
      </section>
    </LegalPage>
  );
}
```

- [ ] **Step 5: Scrivere `/termini`**

Stessa forma, con queste sezioni (testo da scrivere per esteso allo stesso livello di dettaglio del passo precedente):

1. **Cos&apos;è Zapp** — un diario di film e serie che dice dove un titolo è disponibile e apre la piattaforma ufficiale. Zapp **non riproduce contenuti** e non è affiliato a nessuna piattaforma.
2. **Chi può iscriversi** — almeno 14 anni, un account per persona, dati veri.
3. **Cosa non si può pubblicare** — contenuti illeciti, offensivi, discriminatori, pornografici, spam, dati altrui, spoiler non marcati come tali.
4. **Moderazione e segnalazioni (DSA)** — chiunque può segnalare un contenuto dal pulsante di segnalazione. Le segnalazioni vengono esaminate; se un contenuto viene rimosso, l&apos;autore riceve una notifica con il motivo e può contestarla scrivendo a `<EMAIL_PRIVACY>`; chi ha segnalato riceve l&apos;esito. Punto di contatto per autorità e utenti: `<EMAIL_PRIVACY>`, in italiano o in inglese.
5. **Contenuti di terzi** — dati e immagini da TMDB, orari da MyMovies e dai circuiti, trailer da YouTube. I marchi citati appartengono ai rispettivi titolari.
6. **Servizio gratuito, nessuna garanzia** — Zapp è offerto così com&apos;è, senza garanzia di continuità; gli orari dei cinema e la disponibilità sulle piattaforme possono essere inesatti.
7. **Chiusura dell&apos;account** — l&apos;utente può cancellarlo quando vuole dal profilo; il titolare può sospenderlo in caso di violazione, con avviso.
8. **Modifiche** — le modifiche rilevanti vengono notificate in app e richiedono una nuova accettazione.
9. **Legge applicabile** — legge italiana; per i consumatori resta competente il foro del luogo di residenza.

- [ ] **Step 6: Scrivere `/licenze`**

Voci obbligatorie:

- **TMDB** — testo esatto già in uso: «This product uses the TMDB API but is not endorsed or certified by TMDB.»
- **OpenStreetMap / Nominatim** — «© OpenStreetMap contributors», licenza ODbL.
- **Open-Meteo** — dati meteo di Open-Meteo.com, licenza CC BY 4.0.
- **YouTube** — i trailer sono incorporati tramite il player di YouTube.
- **MyMovies e circuiti cinematografici** — fonte degli orari, con link.
- **Inter** — font, SIL Open Font License 1.1.
- **jsQR** e **pdf.js** — lettura dei QR e dei PDF dei biglietti, con le rispettive licenze.
- **Marchi** — «I marchi e i loghi citati appartengono ai rispettivi titolari. Zapp non è affiliata, sponsorizzata o approvata da nessuna delle piattaforme o dei circuiti citati.»

- [ ] **Step 7: Verificare che rispondano da sloggati**

```bash
NEXT_DIST_DIR=.next-check pnpm build
NEXT_DIST_DIR=.next-check pnpm exec next start -p 3399
```

In un'altra shell:

```bash
for p in privacy termini licenze; do
  echo -n "$p -> "; curl -s -o /dev/null -w "%{http_code}\n" "http://localhost:3399/$p"
done
```

Expected: `200` per tutte e tre. Un `307` significa che il middleware le sta ancora proteggendo.

- [ ] **Step 8: Commit**

```bash
pnpm format
git add "src/app/(legal)" src/components/legal/LegalPage.tsx src/lib/supabase/middleware.ts
git commit -m "feat(legal): informativa, condizioni d'uso e licenze pubbliche"
```

---

### Task 5: il gate dei consensi nel layout

**Files:**
- Modify: `src/app/(app)/layout.tsx`
- Create: `src/components/legal/ConsentCheckbox.tsx`
- Create: `src/components/legal/ConsentGate.tsx`

**Interfaces:**
- Consumes: `getConsensi` (Task 3), `consensiMancanti` (Task 1), `accettaDocumenti` (Task 3), le rotte del Task 4
- Produces: `ConsentCheckbox({ checked, onChange })` — **riusato dal Task 6** nel passo 0 dell'onboarding

- [ ] **Step 0: Estrarre la casella condivisa**

La stessa casella serve qui e al passo 0 dell'onboarding (Task 6). Va scritta una volta sola: due copie dello stesso blocco divergono alla prima correzione del testo, e il testo è quello che l'utente accetta.

```tsx
// src/components/legal/ConsentCheckbox.tsx
"use client";

import Link from "next/link";

/**
 * La casella di accettazione di termini e informativa.
 *
 * **Non è mai pre-spuntata**: una casella già segnata non è consenso valido
 * (CGUE C-673/17, Planet49). I due link si aprono in scheda nuova, così chi si
 * ferma a leggere non perde la schermata da cui è partito.
 *
 * Vive qui e non dentro `ConsentGate` perché la usano in due — il gate del
 * layout e il passo 0 dell'onboarding — e il testo accettato dev'essere lo
 * stesso in entrambi, per sempre.
 */
export function ConsentCheckbox({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="mt-8 flex cursor-pointer items-start gap-3 rounded-[14px] bg-surface-2 p-4">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-1 size-5 accent-[var(--color-accent)]"
      />
      <span className="text-[14px] leading-relaxed text-text">
        Ho letto e accetto le{" "}
        <Link href="/termini" target="_blank" className="text-accent-soft underline">
          condizioni d&apos;uso
        </Link>{" "}
        e l&apos;
        <Link href="/privacy" target="_blank" className="text-accent-soft underline">
          informativa privacy
        </Link>
        .
      </span>
    </label>
  );
}
```

- [ ] **Step 1: Scrivere il foglio bloccante**

```tsx
// src/components/legal/ConsentGate.tsx
"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { accettaDocumenti } from "@/lib/legal/actions";

/**
 * Mostrato al posto dell'app quando mancano i consensi obbligatori.
 *
 * La casella **non è mai pre-spuntata**: una casella già segnata non è consenso
 * (CGUE C-673/17, Planet49). I due link si aprono in scheda nuova, così chi legge
 * non perde questa schermata.
 */
export function ConsentGate() {
  const [accettato, setAccettato] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const invia = () => {
    setErrore(null);
    startTransition(async () => {
      const esito = await accettaDocumenti();
      if (!esito.ok) {
        setErrore(esito.error ?? "Non è stato possibile salvare. Riprova.");
        return;
      }
      router.refresh();
    });
  };

  return (
    <main className="mx-auto flex min-h-svh w-full max-w-[520px] flex-col justify-center px-5 pb-16">
      <h1 className="text-[26px] font-semibold leading-tight text-text">
        Abbiamo aggiornato i documenti
      </h1>
      <p className="mt-3 text-[15px] leading-relaxed text-muted">
        Prima di continuare ti chiediamo di leggere e accettare le condizioni
        d&apos;uso e l&apos;informativa sulla privacy. Servono a dirti cosa facciamo dei
        tuoi dati e cosa puoi aspettarti da Zapp.
      </p>

      <ConsentCheckbox checked={accettato} onChange={setAccettato} />

      {errore && <p className="mt-4 text-[13px] text-danger">{errore}</p>}

      <Button
        className="mt-6"
        disabled={!accettato || pending}
        onClick={invia}
      >
        {pending ? "Salvataggio…" : "Continua"}
      </Button>
    </main>
  );
}
```

- [ ] **Step 2: Innestare il gate nel layout**

In `src/app/(app)/layout.tsx`, estendere il `Promise.all` esistente e aggiungere il controllo dopo i due `redirect`:

```tsx
import { getConsensi } from "@/lib/legal/queries";
import { consensiMancanti } from "@/lib/legal/versions";
import { ConsentGate } from "@/components/legal/ConsentGate";

// …

  // Tutte e tre riusano `getViewer()` tramite React cache e partono insieme:
  // il gate dei consensi non costa un round trip in più.
  const [profile, segnaliAttivi, consensi] = await Promise.all([
    getViewerProfile(),
    getPersonalizationEnabled(),
    getConsensi(),
  ]);
  if (!profile) redirect("/login");
  if (!profile.onboarding_completed_at) redirect("/onboarding");

  // Mancano termini o informativa (utente iscritto prima della loro esistenza, o
  // testo aggiornato dopo la sua accettazione): niente app finché non accetta.
  if (consensiMancanti(consensi).length > 0) {
    return (
      <PageShell>
        <ConsentGate />
      </PageShell>
    );
  }
```

- [ ] **Step 3: Verificare a mano**

```bash
NEXT_DIST_DIR=.next-check pnpm build && NEXT_DIST_DIR=.next-check pnpm exec next start -p 3399
```

Con un utente di prova già registrato e **senza** righe in `user_consents`: aprire `http://localhost:3399/` e verificare che compaia il gate al posto della home, che il bottone sia disabilitato finché la casella è vuota, e che dopo l'accettazione la home appaia. Poi, via `execute_sql`, controllare che esistano due righe (`terms`, `privacy`) con `revoked_at` nullo.

- [ ] **Step 4: Commit**

```bash
pnpm format
git add "src/app/(app)/layout.tsx" src/components/legal/ConsentGate.tsx
git commit -m "feat(legal): gate dei consensi obbligatori nel layout app"
```

---

### Task 6: onboarding — passo 0 e età minima

**Files:**
- Modify: `src/app/onboarding/OnboardingForm.tsx`
- Modify: `src/app/onboarding/actions.ts`
- Modify: `src/app/(auth)/login/page.tsx`
- Modify: `src/app/(auth)/signup/page.tsx`

**Interfaces:**
- Consumes: `accettaDocumenti` (Task 3)
- Produces: `ETA_MINIMA = 14` esportata da `src/app/onboarding/actions.ts`

- [ ] **Step 1: Aggiungere il blocco dell'età nella action**

In `src/app/onboarding/actions.ts`, esportare la costante e sostituire il blocco dell'anno di nascita. **Il controllo va spostato prima dell'update di `profiles`**: oggi l'anno si scrive dopo, quindi un rifiuto lascerebbe l'onboarding già completato.

```ts
/** Soglia italiana dell'art. 2-quinquies del Codice Privacy: 14 anni, non 16. */
export const ETA_MINIMA = 14;
```

Subito dopo il controllo su `USERNAME_RE`, prima dell'update:

```ts
  // L'anno di nascita è obbligatorio e si verifica **prima** di completare
  // l'onboarding: scriverlo dopo l'update di `profiles` lascerebbe dentro un
  // minore con l'account già attivo.
  const anno = Number(String(formData.get("birth_year") ?? "").trim());
  const annoCorrente = new Date().getFullYear();
  if (!Number.isInteger(anno) || anno < 1900 || anno > annoCorrente) {
    return { error: "Inserisci il tuo anno di nascita." };
  }
  if (annoCorrente - anno < ETA_MINIMA) {
    return {
      error: `Per usare Zapp devi avere almeno ${ETA_MINIMA} anni.`,
    };
  }
```

E sostituire il vecchio blocco `if (annoValido)` con la scrittura incondizionata (l'anno è già stato validato):

```ts
  // Anno di nascita: solo l'anno, e in una tabella privata — `profiles` la legge
  // chiunque. Serve a calibrare i decenni del profilo di gusto, ed è l'unico uso.
  await supabase
    .from("user_preferences")
    .upsert(
      { user_id: user.id, birth_year: anno, updated_at: new Date().toISOString() },
      { onConflict: "user_id" },
    );
```

- [ ] **Step 2: Aggiungere il passo 0 al form**

In `OnboardingForm.tsx`: cambiare il tipo dello stato da `useState<1 | 2>(1)` a `useState<0 | 1 | 2>(0)`, e rendere al passo 0 il componente `ConsentCheckbox` creato dal Task 5 (`@/components/legal/ConsentCheckbox`). **Non riscrivere la casella**: il testo accettato deve restare identico fra qui e il gate, e due copie divergono alla prima correzione. Alla conferma chiamare `accettaDocumenti()`; solo se torna `ok` si passa al passo 1.

Il passo 0 **non** deve smontare i passi successivi, per la stessa ragione già documentata: rimontarli perderebbe quel che l'utente ha scritto. Usare la stessa tecnica del passo 2 (resta montato e nascosto).

Accanto al campo dell'anno di nascita, aggiungere la riga che spiega il perché:

```tsx
<p className="mt-1.5 text-[12px] text-muted-2">
  Serve solo a calibrare i consigli sui decenni. Non compare sul tuo profilo.
</p>
```

- [ ] **Step 3: Aggiungere l'informativa preventiva ai fogli di auth**

In `login/page.tsx` e `signup/page.tsx`, sotto il bottone principale:

```tsx
<p className="mt-4 text-center text-[12px] leading-relaxed text-muted-2">
  Continuando accetti le{" "}
  <Link href="/termini" className="text-accent-soft" prefetch={false}>
    condizioni d&apos;uso
  </Link>{" "}
  e l&apos;
  <Link href="/privacy" className="text-accent-soft" prefetch={false}>
    informativa privacy
  </Link>
  .
</p>
```

`prefetch={false}` per la stessa ragione già nota fra login e signup: sono pagine statiche che nessuno apre quasi mai, e il payload RSC peserebbe sulla prima schermata.

- [ ] **Step 4: Verificare**

Run: `pnpm typecheck && pnpm lint && NEXT_DIST_DIR=.next-check pnpm build`

A mano, con un utente nuovo: il passo 0 compare per primo; il bottone è disabilitato finché la casella è vuota; inserendo un anno di nascita che dà meno di 14 anni la action rifiuta e **l'onboarding non risulta completato** (verificare con `select onboarding_completed_at from profiles where id = …`, deve essere ancora nullo).

- [ ] **Step 5: Commit**

```bash
pnpm format
git add src/app/onboarding "src/app/(auth)"
git commit -m "feat(legal): accettazione in onboarding, età minima 14, informativa nei fogli di auth"
```

---

### Task 7: sezione "Privacy e dati" nel profilo

**Files:**
- Create: `src/components/legal/PrivacySection.tsx`
- Modify: `src/app/(app)/profile/page.tsx`

**Interfaces:**
- Consumes: `getConsensi` (Task 3), `haConsenso` (Task 1), `concediConsenso`/`revocaConsenso` (Task 3)
- Produces: nessuna

- [ ] **Step 1: Scrivere la sezione**

Componente client con due interruttori (Personalizza i consigli, Registra le visioni con ZConnection), ciascuno legato a `concediConsenso`/`revocaConsenso` con aggiornamento ottimistico, più i tre link ai documenti.

**Nessun bottone segnaposto.** *Scarica i miei dati* arriva col Task 8 e *Elimina l&apos;account* col Task 9, ciascuno insieme al codice che lo fa funzionare: un bottone che non fa niente è un difetto anche quando è previsto, e finirebbe giustamente in revisione. Il componente espone un&apos;area vuota in fondo (`{children}`) dove i due task successivi innestano il proprio bottone senza riscrivere il resto.

Sotto ogni interruttore, una riga che dice cosa comporta spegnerlo:

- personalizzazione: «Spegnendola cancelliamo i dati di navigazione già raccolti e la home torna uguale per tutti.»
- scrobble: «Spegnendola i dispositivi collegati smettono di aggiornare la libreria.»

L'interruttore esistente della personalizzazione in `ProfileEditor.tsx` va **rimosso**: ne resta uno solo, qui, altrimenti esistono due comandi per la stessa cosa e uno dei due non scrive il consenso.

- [ ] **Step 2: Innestarla nel profilo**

In `src/app/(app)/profile/page.tsx`, montare `<PrivacySection consensi={consensi} />` prima del footer con l'attribuzione TMDB, aggiungendo `getConsensi()` al `Promise.all` già presente in pagina. Nel footer, accanto all'attribuzione, i tre link ai documenti.

- [ ] **Step 3: Verificare**

Run: `pnpm typecheck && pnpm lint`
A mano: accendere e spegnere ciascun interruttore e controllare con `execute_sql` che `user_consents` guadagni una riga alla concessione e una `revoked_at` valorizzata alla revoca; che spegnendo la personalizzazione `user_events` e `user_taste` di quell'utente si svuotino.

- [ ] **Step 4: Commit**

```bash
pnpm format
git add src/components/legal/PrivacySection.tsx "src/app/(app)/profile"
git commit -m "feat(legal): sezione Privacy e dati nel profilo"
```

---

### Task 8: export dei dati

**Files:**
- Create: `src/app/api/account/export/route.ts`
- Modify: `src/components/legal/PrivacySection.tsx` (attivare il bottone)

**Interfaces:**
- Consumes: `getViewer`, `rateLimit`
- Produces: `GET /api/account/export` → JSON con `Content-Disposition: attachment`

- [ ] **Step 1: Scrivere il route handler**

```ts
// src/app/api/account/export/route.ts
import { createClient } from "@/lib/supabase/server";
import { rateLimit } from "@/lib/rate-limit";

/**
 * Portabilità dei dati (art. 20 GDPR).
 *
 * Route handler e non Server Action: deve restituire un file, e una Server Action
 * non sa impostare `Content-Disposition`.
 *
 * Client a cookie, quindi RLS attiva: per costruzione esce solo ciò che l'utente
 * ha diritto di vedere di sé. Il service client qui sarebbe un errore.
 */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new Response("Non autorizzato", { status: 401 });

  // Condiviso: è una lettura pesante, e il limite deve valere per tutta
  // l'applicazione, non per la singola lambda.
  if (!(await rateLimit(`export:${user.id}`, 1, 3600, { condiviso: true }))) {
    return new Response("Hai già scaricato i tuoi dati da poco. Riprova fra un'ora.", {
      status: 429,
    });
  }

  // La colonna che lega la riga all'utente **non è `user_id` ovunque**: quattro
  // tabelle usano un nome diverso, e chiedere `user_id` a `title_lists` non dà
  // zero righe — dà un errore 400 che finirebbe nel `catch` e svuoterebbe la voce
  // in silenzio. Verificato sullo schema il 2026-09-12.
  const TABELLE: Array<readonly [string, string]> = [
    ["profiles", "id"],
    ["user_preferences", "user_id"],
    ["user_consents", "user_id"],
    ["watch_entries", "user_id"],
    ["episode_watches", "user_id"],
    ["imports", "user_id"],
    ["reviews", "user_id"],
    ["review_comments", "user_id"],
    ["title_comments", "user_id"],
    ["title_lists", "owner_id"],
    ["title_list_items", "added_by"],
    ["user_seed_picks", "user_id"],
    ["user_taste", "user_id"],
    ["search_history", "user_id"],
    ["user_locations", "user_id"],
    ["cinema_favorites", "user_id"],
    ["cinema_plans", "user_id"],
    ["daily_answers", "user_id"],
    ["watch_sessions", "user_id"],
    ["device_members", "user_id"],
  ];

  const dati: Record<string, unknown> = {};
  await Promise.all(
    TABELLE.map(async ([tabella, colonna]) => {
      const { data, error } = await supabase
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .from(tabella as any)
        .select("*")
        .eq(colonna, user.id);
      if (error) {
        console.error(`[export] ${tabella}:`, error);
        dati[tabella] = [];
        return;
      }
      dati[tabella] = data ?? [];
    }),
  );

  // Tabelle con due colonne utente: una `.eq()` sola non le copre.
  // `.or()` con un id interpolato è sicuro **qui** perché `user.id` viene dalla
  // sessione verificata sopra, mai dal client — è l'opposto del caso di
  // `removeFriend`, dove l'id dell'altro utente arrivava da fuori e un valore con
  // virgole riscriveva la condizione.
  const { data: amicizie } = await supabase
    .from("friendships")
    .select("*")
    .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`);
  dati.friendships = amicizie ?? [];

  const { data: consigli } = await supabase
    .from("recommendations")
    .select("*")
    .or(`from_user.eq.${user.id},to_user.eq.${user.id}`);
  dati.recommendations = consigli ?? [];

  // `devices` non ha una colonna utente: il legame passa da `device_members`.
  const idDispositivi = ((dati.device_members ?? []) as Array<{ device_id: string }>)
    .map((m) => m.device_id);
  if (idDispositivi.length > 0) {
    const { data: dispositivi } = await supabase
      .from("devices")
      .select("*")
      .in("id", idDispositivi);
    dati.devices = dispositivi ?? [];
  } else {
    dati.devices = [];
  }

  // I biglietti sono file da megabyte: si elencano, non si incorporano.
  const { data: files } = await supabase.storage.from("tickets").list(user.id, {
    limit: 100,
  });
  dati.tickets_files = (files ?? []).map((f) => ({
    nome: f.name,
    dimensione: f.metadata?.size ?? null,
    creato: f.created_at,
  }));

  const corpo = JSON.stringify(
    {
      esportato_il: new Date().toISOString(),
      utente: { id: user.id, email: user.email },
      dati,
    },
    null,
    2,
  );

  const data = new Date().toISOString().slice(0, 10);
  return new Response(corpo, {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="zapp-dati-${data}.json"`,
      "cache-control": "no-store",
    },
  });
}
```

Nota sull'`.or()`: qui l'interpolazione è sicura perché `user.id` viene dalla sessione verificata e non dal client — è l'opposto del caso di `removeFriend`, dove l'id dell'altro utente arrivava da fuori. Scriverlo nel commento.

- [ ] **Step 2: Collegare il bottone**

In `PrivacySection.tsx` il bottone *Scarica i miei dati* è un `<a href="/api/account/export">`, non un `fetch`: il browser deve gestire il download.

- [ ] **Step 3: Verificare**

Run: `pnpm typecheck && pnpm lint`
A mano: `curl -b <cookie di sessione> -i http://localhost:3399/api/account/export | head -20` → `200`, `content-disposition` presente, e il JSON contiene almeno `watch_entries` non vuoto per un utente con libreria. Una seconda chiamata subito dopo → `429`.

- [ ] **Step 4: Commit**

```bash
pnpm format
git add src/app/api/account/export src/components/legal/PrivacySection.tsx
git commit -m "feat(legal): export dei dati dell'utente"
```

---

### Task 9: cancellazione dell'account

**Files:**
- Create: `src/lib/account/actions.ts`
- Create: `src/components/legal/DeleteAccountSheet.tsx`
- Create: `src/app/(legal)/addio/page.tsx`
- Modify: `src/components/legal/PrivacySection.tsx`

**Interfaces:**
- Consumes: `createServiceClient` da `@/lib/supabase/server`, `rateLimit`
- Produces: `deleteAccount(formData: FormData): Promise<{ ok: boolean; error?: string }>`

- [ ] **Step 1: Scrivere la Server Action**

```ts
// src/lib/account/actions.ts
"use server";

import { redirect } from "next/navigation";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { rateLimit } from "@/lib/rate-limit";

/**
 * Cancellazione dell'account (art. 17 GDPR).
 *
 * La catena delle chiavi esterne è già completa — `auth.users` → `profiles` con
 * `on delete cascade`, e da lì altre 26 tabelle, più 8 dirette — quindi
 * `deleteUser` svuota da solo tutto Postgres. Restano fuori tre cose, e sono le
 * tre che questo codice fa a mano: i file nel bucket, i dispositivi rimasti senza
 * membri e le loro sessioni.
 */
export async function deleteAccount(
  formData: FormData,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Sessione scaduta." };

  if (!(await rateLimit(`elimina:${user.id}`, 3, 3600, { condiviso: true }))) {
    return { ok: false, error: "Troppi tentativi. Riprova più tardi." };
  }

  // Conferma: si digita il proprio nome utente. Un "sei sicuro?" si clicca per
  // riflesso; questo no.
  const conferma = String(formData.get("conferma") ?? "").trim().toLowerCase();
  const { data: profilo } = await supabase
    .from("profiles")
    .select("username")
    .eq("id", user.id)
    .maybeSingle();
  if (!profilo?.username || conferma !== profilo.username.toLowerCase()) {
    return { ok: false, error: "Il nome utente non corrisponde." };
  }

  const service = createServiceClient();

  // 1. i file dei biglietti: lo storage non ha cascate.
  const { data: files } = await service.storage.from("tickets").list(user.id, {
    limit: 1000,
  });
  if (files && files.length > 0) {
    await service.storage
      .from("tickets")
      .remove(files.map((f) => `${user.id}/${f.name}`));
  }

  // 2. i dispositivi di cui era l'unico membro. `devices.id` non ha una FK verso
  // l'utente: cancellando `device_members` resterebbero orfani per sempre.
  const { data: miei } = await service
    .from("device_members")
    .select("device_id")
    .eq("user_id", user.id);
  for (const { device_id } of miei ?? []) {
    const { count } = await service
      .from("device_members")
      .select("user_id", { count: "exact", head: true })
      .eq("device_id", device_id);
    if ((count ?? 0) <= 1) {
      await service.from("watch_sessions").delete().eq("device_id", device_id);
      await service.from("pending_scrobbles").delete().eq("device_id", device_id);
      await service.from("devices").delete().eq("id", device_id);
    }
  }

  // 3. l'utente. DEROGA CONSAPEVOLE alla regola "service client mai sui dati
  // utente": è l'unica API che cancella la riga `auth.users`, e senza quella
  // l'account resterebbe in piedi. È accettabile perché l'id viene dalla sessione
  // verificata qui sopra e non è mai un parametro del client, perché tocca solo
  // questo utente, e perché è l'ultima istruzione dopo tutti i controlli.
  const { error } = await service.auth.admin.deleteUser(user.id);
  if (error) {
    console.error("[account] cancellazione:", error);
    return { ok: false, error: "Non è stato possibile eliminare l'account. Riprova." };
  }

  await supabase.auth.signOut();
  redirect("/addio");
}
```

- [ ] **Step 2: Scrivere il foglio di conferma**

`DeleteAccountSheet.tsx`: un `Sheet` con il riepilogo di cosa sparisce (libreria, recensioni, amicizie, liste, biglietti, dispositivi collegati), il promemoria «Prima di continuare puoi scaricare i tuoi dati» con il link all'export, il campo dove digitare il nome utente e il bottone distruttivo, disabilitato finché il campo non corrisponde.

- [ ] **Step 3: Scrivere la pagina di addio**

`src/app/(legal)/addio/page.tsx`: pagina pubblica (aggiungere `/addio` a `PUBLIC_PATHS`) che conferma l'eliminazione e rimanda a `/signup`. Senza, dopo il `signOut` si finirebbe su `/login` senza sapere se è andata a buon fine.

- [ ] **Step 4: Verificare con un utente che ha dati in ogni gruppo**

È l'unico modo di accorgersi di una tabella dimenticata. Creare un utente finto con: una entry in libreria, un'amicizia, una recensione, una lista, un dispositivo con una sessione, un file nel bucket. Poi cancellarlo e lanciare:

```sql
-- sostituire :uid con l'id dell'utente finto
select 'watch_entries' t, count(*) from watch_entries where user_id = :uid
union all select 'reviews', count(*) from reviews where user_id = :uid
union all select 'friendships', count(*) from friendships where requester_id = :uid or addressee_id = :uid
union all select 'title_lists', count(*) from title_lists where owner_id = :uid
union all select 'user_consents', count(*) from user_consents where user_id = :uid
union all select 'watch_sessions', count(*) from watch_sessions where user_id = :uid
union all select 'device_members', count(*) from device_members where user_id = :uid
union all select 'profiles', count(*) from profiles where id = :uid;
```

Expected: tutti `0`. E `select * from storage.objects where bucket_id = 'tickets' and name like :uid || '/%'` → nessuna riga.

- [ ] **Step 5: Commit**

```bash
pnpm format
git add src/lib/account "src/app/(legal)/addio" src/components/legal/DeleteAccountSheet.tsx src/components/legal/PrivacySection.tsx src/lib/supabase/middleware.ts
git commit -m "feat(legal): cancellazione dell'account con pulizia di storage e dispositivi"
```

---

### Task 10: DSA — l&apos;esito della segnalazione si comunica

**Files:**
- Create: `supabase/migrations/0044_dsa_notifiche.sql`
- Modify: `src/types/database.ts` (rigenerato)
- Modify: `src/components/social/` (resa delle due notifiche nuove)

**Interfaces:**
- Consumes: tabella `reports`, trigger di conteggio esistenti
- Produces: due valori nuovi per `notifications.kind`: `content_hidden`, `report_outcome`

- [ ] **Step 1: Scrivere la migration**

Il vincolo attuale è
`CHECK (kind = ANY (ARRAY['friend_request','friend_accepted','recommendation','comment','like']))`:
va riscritto, non esteso, come già fatto per `like`.

```sql
-- supabase/migrations/0044_dsa_notifiche.sql
-- DSA art. 16: chi subisce una rimozione deve sapere che è avvenuta e perché;
-- chi segnala deve conoscere l'esito. Finora non arrivava niente a nessuno.

alter table public.notifications drop constraint notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
  check (kind in (
    'friend_request', 'friend_accepted', 'recommendation', 'comment', 'like',
    'content_hidden', 'report_outcome'
  ));
```

Poi il trigger. **Lo schema qui sotto è verificato sul database il 2026-09-12**, non
dedotto: `notifications` ha `user_id, kind, payload jsonb, read_at, created_at` — e
**nessuna** colonna `actor_id`, `title_id` o `media_type`, che vivono dentro
`payload`. La forma del payload segue quella già in uso (`{from_user, title_id,
media_type, …}`), perché la resa esistente legge quelle chiavi.

`report_count` esiste su **tre** tabelle, non su una: `reviews`, `title_comments` e
`daily_answers`, tutte con le stesse colonne `id, user_id, title_id, media_type`.
Il trigger le copre tutte e tre: un meccanismo che avvisa per le recensioni e tace
sui commenti sarebbe un obbligo DSA fatto a metà. Il tipo di bersaglio arriva da
`TG_ARGV[0]` e coincide coi valori ammessi da `reports.target_type`
(`review | comment | daily_answer | title_comment`).

```sql
create or replace function public.notify_content_hidden()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  tipo_bersaglio text := tg_argv[0];
begin
  -- Solo l'attraversamento della soglia, non ogni segnalazione successiva:
  -- senza questa guardia, dalla quarta in poi l'autore riceve una notifica per
  -- ciascuna segnalazione.
  if new.report_count < 3 or coalesce(old.report_count, 0) >= 3 then
    return new;
  end if;

  -- All'autore: cosa è sparito. Nessun `from_user`: è il sistema, non una persona.
  insert into public.notifications (user_id, kind, payload)
  values (
    new.user_id,
    'content_hidden',
    jsonb_build_object(
      'target_type', tipo_bersaglio,
      'target_id', new.id,
      'title_id', new.title_id,
      'media_type', new.media_type
    )
  );

  -- A chi ha segnalato: l'esito. `distinct` perché la stessa persona potrebbe
  -- aver segnalato più volte lo stesso contenuto.
  insert into public.notifications (user_id, kind, payload)
  select distinct
    r.reporter_id,
    'report_outcome',
    jsonb_build_object(
      'target_type', tipo_bersaglio,
      'target_id', new.id,
      'title_id', new.title_id,
      'media_type', new.media_type,
      'outcome', 'hidden'
    )
  from public.reports r
  where r.target_type = tipo_bersaglio and r.target_id = new.id;

  return new;
end;
$$;

create trigger notify_content_hidden_reviews
  after update of report_count on public.reviews
  for each row execute function public.notify_content_hidden('review');

create trigger notify_content_hidden_title_comments
  after update of report_count on public.title_comments
  for each row execute function public.notify_content_hidden('title_comment');

create trigger notify_content_hidden_daily_answers
  after update of report_count on public.daily_answers
  for each row execute function public.notify_content_hidden('daily_answer');

-- Le funzioni di trigger si revocano sempre: sono SECURITY DEFINER e senza questo
-- Supabase le espone come /rest/v1/rpc/notify_content_hidden.
revoke execute on function public.notify_content_hidden() from public, anon, authenticated;
```

- [ ] **Step 2: Applicare e verificare eseguendo**

Applicare con `apply_migration`, poi **provocare davvero** il caso con `execute_sql`: inserire tre segnalazioni finte su una recensione di prova e controllare che compaiano le notifiche, infine ripulire. `apply_migration` che risponde `success` non dimostra che il trigger giri.

- [ ] **Step 3: Rendere le due notifiche**

Nel componente che rende le notifiche, aggiungere i due casi con l'icona del tipo. Seguono la forma già esistente: quelle senza titolo usano il banner con sfumatura accent e icona in filigrana, così l'elenco non diventa misto.

- [ ] **Step 4: Rigenerare i tipi e verificare**

```bash
supabase gen types typescript --project-id bbuhwzdbzxgydewmcdwd > src/types/database.ts
pnpm typecheck && pnpm lint
```

- [ ] **Step 5: Commit**

```bash
pnpm format
git add supabase/migrations/0044_dsa_notifiche.sql src/types/database.ts src/components/social
git commit -m "feat(legal): notifica di rimozione ed esito della segnalazione (DSA art. 16)"
```

---

### Task 11: i documenti interni

**Files:**
- Create: `docs/legal/registro-trattamenti.md`
- Create: `docs/legal/valutazione-dpia.md`
- Create: `docs/legal/data-breach.md`
- Create: `docs/legal/moderazione.md`
- Create: `docs/legal/fornitori.md`

**Interfaces:** nessuna. Sono documenti, non codice.

- [ ] **Step 1: Registro dei trattamenti (art. 30)**

Tabella con una riga per finalità: finalità, base giuridica, categorie di interessati, categorie di dati, destinatari, trasferimenti, termine di cancellazione, misure di sicurezza. Le finalità sono quelle della sezione 3 dell'informativa. In testa, la ragione per cui il registro serve: l'esenzione sotto i 250 dipendenti vale solo per trattamenti occasionali, e questi sono continuativi.

- [ ] **Step 2: Valutazione DPIA (art. 35)**

Va scritta la **conclusione negativa con la motivazione**, non omessa: con 16 utenti non c'è monitoraggio sistematico su larga scala. E l'innesco che la fa rifare: superati i 1.000 utenti, oppure all'aggiunta di una categoria di dati o di una piattaforma a ZConnection.

- [ ] **Step 3: Procedura data breach (art. 33)**

Chi se ne accorge e come, come si valuta il rischio, notifica al Garante entro 72 ore con cosa scriverci, quando si avvisano gli interessati, registro degli incidenti (anche quelli non notificati: l'art. 33(5) lo richiede).

- [ ] **Step 4: Procedura di moderazione**

Come si esamina una segnalazione, in quanto tempo, cosa si comunica all'autore e al segnalante, come si contesta. Annotare che Zapp è micro-impresa ex art. 19 DSA e quindi esente dagli obblighi più pesanti — l'esenzione va dichiarata, non data per scontata.

- [ ] **Step 5: Elenco fornitori**

Una riga per responsabile: nome, cosa fa, sede, **data di accettazione del DPA** (da riempire a mano dopo averli accettati in dashboard), garanzia per i trasferimenti extra-UE.

- [ ] **Step 6: Commit**

```bash
git add docs/legal
git commit -m "docs(legal): registro trattamenti, DPIA, data breach, moderazione, fornitori"
```

---

### Task 12: script di verifica e chiusura

**Files:**
- Create: `scripts/legal-check.mjs`
- Modify: `CLAUDE.md` (riga della mappa dei sottosistemi)
- Create: `docs/architecture/legal.md`

**Interfaces:** nessuna.

- [ ] **Step 1: Scrivere lo script**

`scripts/legal-check.mjs`, sul modello di `nav-check.mjs`, con **le due trappole già note** e da non ripetere:

- contesto Playwright con `serviceWorkers: "block"`, altrimenti il service worker ripresenta l'HTML di una build precedente e i click vanno a vuoto
- la domanda del giorno va segnata come già vista in `daily_question_views` **prima** di aprire il browser: l'overlay copre tutto e il suo bottone di chiusura non è cliccabile durante l'animazione

Cosa verifica, creando un utente finto e cancellandolo alla fine:

1. `/privacy`, `/termini`, `/licenze` rispondono 200 **da sloggati**
2. un utente senza consensi vede il gate al posto della home, e il bottone è disabilitato finché la casella è vuota
3. dopo l'accettazione esistono due righe in `user_consents` e la home si apre
4. `/api/account/export` risponde 200 con un JSON non vuoto; la seconda chiamata nell'ora risponde 429
5. dopo la cancellazione, nessuna delle tabelle dell'inventario contiene righe di quell'utente e il bucket non ha file sotto il suo id

- [ ] **Step 2: Lanciare tutta la verifica**

```bash
pnpm test
pnpm typecheck && pnpm lint
NEXT_DIST_DIR=.next-check pnpm build
NEXT_DIST_DIR=.next-check pnpm exec next start -p 3399 &
node scripts/security-check.mjs
node --env-file=.env.local scripts/legal-check.mjs
```

`security-check.mjs` va rilanciato perché il middleware è cambiato: le tre rotte nuove devono risultare pubbliche di proposito e non devono comparire fra le rotte protette bucate.

- [ ] **Step 3: Documentare il sottosistema**

`docs/architecture/legal.md` con: la scelta del consenso versionato e perché un booleano non basta; il fatto che la cascata FK era già completa; la deroga del service client nella cancellazione; l'elenco delle tabelle che l'export deve coprire e la regola che **chi aggiunge una tabella con dati utente deve aggiungerla all'export**, altrimenti il diritto di portabilità si buca in silenzio.

Aggiungere la riga nella tabella di `CLAUDE.md`:

```markdown
| [legal.md](docs/architecture/legal.md) | Consensi, documenti pubblici, cancellazione ed export, obblighi DSA. |
```

- [ ] **Step 4: Commit**

```bash
pnpm format
git add scripts/legal-check.mjs docs/architecture/legal.md CLAUDE.md
git commit -m "test(legal): verifica end-to-end e documentazione del sottosistema"
```

---

## Cosa resta fuori da questo piano

Dichiarato perché nessuno lo cerchi qui:

- **Sottoprogetto 2** (ZConnection per il Chrome Web Store): consenso `scrobble` nella schermata di collegamento, revoca che cancella le sessioni, `scripts/build-extension.mjs`, scheda store. Spec a parte.
- **Sottoprogetto 3** (attribuzioni e fonti terze): User-Agent onesto su Netflix Tudum, chip YouTube, `robots.txt` di MyMovies, attribuzioni Open-Meteo e OpenStreetMap. Spec a parte. La pagina `/licenze` del Task 4 è il posto dove atterreranno.
- **Email di contatto**: nei testi resta il segnaposto `<EMAIL_PRIVACY>`. Va sostituito ovunque prima di considerare pubblicabili i documenti.
- **DPA**: vanno accettati a mano nelle dashboard di Supabase, Vercel e Upstash, e le date annotate in `docs/legal/fornitori.md`.
