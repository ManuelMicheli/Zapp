# Fase 3 — Wizard delle richieste dati, con memoria e promemoria: piano

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** per Disney+, NOW e Apple TV la richiesta formale dei dati è l'unica strada
al pregresso. Il problema non è chiederla: è che l'utente se ne dimentica. Questa fase
la **ricorda al posto suo**.

**Architecture:** una pagina per piattaforma che apre il portale giusto e segna la
richiesta in `import_requests`; le card di `/benvenuto` che da "da fare" passano a
"richiesta il 15/09, di solito arriva entro il 22"; un job che, al giorno stimato,
inserisce una riga in `notifications` — e da lì la push parte da sola, perché
l'infrastruttura esiste già e non va toccata.

**Tech Stack:** Next 15 App Router, TypeScript strict, Supabase (tabella + RLS +
pg_cron), Vitest per le sole funzioni pure.

**Spec:** `docs/superpowers/specs/2026-09-15-import-multipiattaforma-design.md` (fase 3)

## Global Constraints

- UI e commenti in italiano. Prettier: doppi apici, virgole finali, `printWidth` 90.
- Moduli server-only con `import "server-only"`; i file `actions.ts` esportano solo
  funzioni async. Vitest copre **solo funzioni pure**.
- **Formattare e committare solo i file toccati**, mai `pnpm format` sull'albero
  intero. Nessun file di configurazione va modificato: se un build riscrive
  `tsconfig.json`, ripristinarlo.
- Migration scritte ma **non applicate** dagli implementer: le applica il controller.
  Il numero `0063` è già stato annunciato alle altre sessioni.
- **Non toccare l'infrastruttura delle push.** `drainNotifications` trasforma già in
  push ogni riga di `notifications`, chiamata da un trigger a ogni insert e dal cron
  ogni cinque minuti. Il job del promemoria **inserisce righe e basta**.
- Gli indirizzi dei portali stanno in **un posto solo**, `src/lib/platforms/azioni.ts`,
  già scritto e verificato: non duplicarli, non riscriverli.

---

### Task 1: `import_requests` e il tipo di notifica

**Files:**
- Create: `supabase/migrations/0063_import_requests.sql`
- Create: `src/lib/import/richieste.ts` + `src/lib/import/richieste.test.ts`

**Interfaces:**
- Produces (puro, Vitest): `GIORNI_ATTESA: Record<string, number>` e
  `function stimaArrivo(richiestaISO: string, platformKey: string): string` — data
  ISO (solo giorno) in cui l'export dovrebbe essere pronto.
- Produces (server-only): `segnaRichiesta(userId, key)`, `richiesteAperte(userId)`,
  `chiudiRichieste(userId, keys)`.

Attese, dalla spec: Apple 7 giorni, Amazon/Prime 5, Disney+ 30, NOW 30.

- [ ] **Step 1: il test che fallisce**

```ts
import { describe, expect, it } from "vitest";
import { stimaArrivo } from "./richieste";

describe("stimaArrivo", () => {
  it("sposta la data dei giorni tipici della piattaforma", () => {
    expect(stimaArrivo("2026-09-15", "apple-tv")).toBe("2026-09-22");
    expect(stimaArrivo("2026-09-15", "prime-video")).toBe("2026-09-20");
    expect(stimaArrivo("2026-09-15", "disney-plus")).toBe("2026-10-15");
  });

  it("attraversa il cambio di mese e di anno", () => {
    expect(stimaArrivo("2026-12-28", "apple-tv")).toBe("2027-01-04");
  });

  it("una piattaforma senza attesa nota vale trenta giorni", () => {
    expect(stimaArrivo("2026-09-15", "pippo")).toBe("2026-10-15");
  });
});
```

- [ ] **Step 2: verifica il RED** — `pnpm test src/lib/import/richieste.test.ts`

- [ ] **Step 3: implementa**

`stimaArrivo` lavora in **UTC** (`Date.UTC` + `toISOString().slice(0, 10)`): con l'ora
locale, una richiesta fatta la sera d'estate slitta di un giorno e la stima mente.

`supabase/migrations/0063_import_requests.sql`:

```sql
-- Zapp — migration 0063: le richieste dei dati alle piattaforme.
-- Disney+, NOW e Apple TV non hanno una cronologia scaricabile: l'unica strada al
-- pregresso e' la richiesta formale, che arriva dopo giorni. Senza memoria,
-- l'utente la chiede e se ne dimentica: qui si segna quando l'ha chiesta e quando
-- dovrebbe arrivare, e un job glielo ricorda.

create table if not exists public.import_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  platform_key text not null,
  requested_at timestamptz not null default now(),
  expected_at date not null,
  state text not null default 'requested'
    check (state in ('requested', 'imported', 'dismissed')),
  reminded_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists import_requests_user_idx
  on public.import_requests (user_id, state);
-- Il job cerca le richieste scadute e non ancora ricordate: questo indice e' la
-- sua unica query.
create index if not exists import_requests_due_idx
  on public.import_requests (expected_at)
  where state = 'requested' and reminded_at is null;

alter table public.import_requests enable row level security;
```

più le policy `select`/`insert`/`update`/`delete` per il proprietario, **con la stessa
forma della `0061`** (`(select auth.uid())`, `to authenticated`, `drop policy if
exists` prima di ogni `create`), e l'allargamento del vincolo sui tipi di notifica:

```sql
alter table public.notifications drop constraint notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
  check (kind in (
    'friend_request', 'friend_accepted', 'recommendation', 'comment', 'like',
    'content_hidden', 'report_outcome', 'export_pronto'
  ));
```

**Copia l'elenco dei tipi esistenti dalla `0044`, non a memoria**: perderne uno
significa rompere in silenzio una notifica viva.

- [ ] **Step 4: GREEN + `pnpm typecheck && pnpm lint`**
- [ ] **Step 5: commit**

---

### Task 2: La pagina della richiesta

**Files:**
- Create: `src/app/(app)/import/richiesta/[piattaforma]/page.tsx`
- Create: `src/app/(app)/import/richiesta/[piattaforma]/RichiestaClient.tsx`
- Modify: `src/lib/import/richieste.ts` (la Server Action che segna la richiesta)

Una pagina per `apple-tv`, `disney-plus`, `now`, `prime-video` (`generateStaticParams`
sulle quattro chiavi; qualunque altra → `notFound()`).

Contiene: il nome della piattaforma, i passi esatti per chiedere i dati, il bottone
che **apre il portale** (l'`href` viene da `azioniPer`, non riscritto qui) e il
bottone **"L'ho richiesta"**, che segna la richiesta e torna a `/benvenuto`.

Per NOW il portale non esiste: il bottone apre il `mailto` già scritto. Il testo della
pagina deve dirlo, invece di far credere che ci sia un sito.

Se esiste già una richiesta aperta per quella piattaforma, la pagina lo dice
("l'hai chiesta il 15 settembre, di solito arriva entro il 22") e offre **"Carica il
file"** invece di far segnare una seconda richiesta.

- [ ] Verifica: `pnpm typecheck && pnpm lint`, build isolato, commit.

---

### Task 3: Gli stati nelle card di `/benvenuto`

**Files:**
- Modify: `src/app/(app)/benvenuto/page.tsx`
- Modify: `src/lib/platforms/azioni.ts` (+ test)

Le card delle piattaforme "ad attesa" passano da **una** a **tre** forme:
1. **da fare** → "Richiedi i tuoi dati" (porta a `/import/richiesta/<key>`);
2. **richiesta** → "Richiesta il 15 settembre, di solito arriva entro il 22" +
   "Carica il file";
3. **fatta** → la card scende in fondo, spenta, con "Importato".

La funzione che decide resta **pura e testata**: prende le chiavi e le richieste
aperte, restituisce le card già ordinate. La pagina non contiene logica di stato.

- [ ] TDD sulla funzione pura, poi la pagina; verifica e commit.

---

### Task 4: Il promemoria

**Files:**
- Modify: `src/app/api/jobs/[job]/route.ts` (job `promemoria-export`)
- Modify: `src/lib/push/compose.ts` (testo del tipo `export_pronto`)
- Modify: `supabase/migrations/0063_import_requests.sql` (la riga di `cron.schedule`)

Il job, una volta al giorno: prende le richieste con `state = 'requested'`,
`expected_at <= today`, `reminded_at is null`; per ognuna inserisce una riga in
`notifications` (`kind: 'export_pronto'`, payload con la chiave della piattaforma) e
scrive `reminded_at = now()`. **Niente push scritte a mano**: le manda `drainNotifications`.

Il testo: "L'export di Apple dovrebbe essere pronto — controlla la posta e caricalo
in Zapp". **Dovrebbe**, non "è": l'email la riceve l'utente, noi non la vediamo. La
notifica porta a `/benvenuto`.

Un secondo sollecito dopo altri sette giorni se lo stato è ancora `requested`, poi
silenzio: due promemoria sono un aiuto, il terzo è molestia.

`cron.schedule` nella stessa migration, con lo stesso schema degli altri job
(`0021_jobs_cron.sql`) — **leggilo e imita quello**, chiave e URL compresi.

- [ ] Verifica e commit.

---

### Task 5: Chiudere la richiesta quando l'import riesce

**Files:**
- Modify: `src/app/(app)/import/actions.ts`

Quando un import dalla sorgente `export` scrive almeno un titolo, le richieste aperte
di quell'utente passano a `state = 'imported'`. Non sappiamo **quale** piattaforma
fosse (lo sniffer non lo chiede): si chiudono tutte quelle aperte, ed è la scelta
giusta — meglio un promemoria in meno che un promemoria per una cosa già fatta.

Scrivilo nel commento, perché sembra un errore e non lo è.

- [ ] Verifica e commit.

---

### Task 6: Documentazione e cancello

**Files:**
- Modify: `docs/architecture/social.md`

Cosa scrivere: perché la stima è una stima (l'email non la vediamo), perché i
promemoria sono due e non di più, perché all'import si chiudono **tutte** le richieste
aperte, e che il promemoria non ha codice di push suo — inserisce una notifica e
l'infrastruttura esistente fa il resto.

- [ ] Cancello completo: `pnpm typecheck && pnpm lint && pnpm test`, poi
      `NEXT_DIST_DIR=.next-check pnpm build`; cancella `.next-check`; niente push.

---

## Self-review

| Requisito della spec (fase 3) | Task |
| --- | --- |
| `import_requests` con stato | 1 |
| Stima di arrivo per piattaforma | 1 |
| Pagina che apre il portale e segna la richiesta | 2 |
| Stato nelle card di `/benvenuto` | 3 |
| Push al giorno stimato, testo "dovrebbe" | 4 |
| Secondo sollecito dopo 7 giorni, poi basta | 4 |
| L'import chiude la richiesta | 5 |
| La push atterra su `/benvenuto` | 4 |

**Rischio noto:** allargare `notifications_kind_check` significa riscrivere il vincolo
per intero. Se si perde un tipo esistente, la notifica corrispondente smette di essere
scritta **in silenzio** — il trigger fallisce dentro una transazione che nessuno
guarda. L'elenco va copiato dalla `0044`, non ricordato.
