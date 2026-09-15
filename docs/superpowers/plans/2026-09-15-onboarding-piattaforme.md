# Fase 5 — Le piattaforme si chiedono all'iscrizione: piano di implementazione

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** chiedere all'iscrizione quali piattaforme ha l'utente, e portarlo subito —
in un tocco per piattaforma — agli import delle sue cronologie.

**Architecture:** un passo in più nell'onboarding esistente (stessa rotta, stessa
Server Action, form mai smontato), le scelte salvate in una tabella nuova
`user_platforms` con la `key` del catalogo già esistente, e una pagina `/benvenuto`
**dentro il gruppo `(app)`** che trasforma quelle scelte in una lista di azioni, una
per piattaforma. L'onboarding **raccoglie**, `/benvenuto` **esegue**: fuori da `(app)`
non c'è `ImportProvider` e un import avviato lì morirebbe al primo cambio pagina.

**Tech Stack:** Next 15 App Router, TypeScript strict, Supabase (tabella + RLS),
Tailwind 4, Vitest per le sole funzioni pure.

**Spec:** `docs/superpowers/specs/2026-09-15-import-multipiattaforma-design.md` (fase 5)

## Global Constraints

- UI e commenti in italiano. Prettier: doppi apici, virgole finali, `printWidth` 90.
- Alias `@/*` → `src/*`. Moduli server-only con `import "server-only"`; i file
  `actions.ts` sono Server Actions e **esportano solo funzioni async**.
- Vitest copre **solo funzioni pure**. Pagine, azioni e componenti si verificano con
  `pnpm typecheck && pnpm lint` e un build isolato (`NEXT_DIST_DIR=.next-check`).
- **Il catalogo delle piattaforme esiste già**: `src/lib/platforms/catalog.ts`,
  `PLATFORMS` (dieci voci con `key`, `pillola`, `providerId`, `ids`) e
  `platformByKey`. Non crearne un secondo, non duplicare i nomi.
- **Formattare e committare solo i file toccati**, mai `pnpm format` sull'albero
  intero. Nessun file di configurazione va modificato: se un build riscrive
  `tsconfig.json`, ripristinarlo.
- Migration scritte ma **non applicate** dagli implementer: le applica il controller.
- Un'altra sessione lavora sugli stessi file di `src/app/onboarding/`: **il form non
  si smonta mai**, i campi del passo 1 restano `input hidden` dentro lo stesso form,
  e `avanti()` non cambia logica di validazione.

---

### Task 1: La tabella delle piattaforme dell'utente

**Files:**
- Create: `supabase/migrations/0062_user_platforms.sql`
- Create: `src/lib/platforms/user.ts`
- Test: `src/lib/platforms/user.test.ts`

**Interfaces:**
- Consumes: `PLATFORMS`, `platformByKey` da `src/lib/platforms/catalog.ts`.
- Produces:
  - `function chiaviValide(grezze: unknown): string[]` — **pura**: prende quello che
    arriva dal client, tiene solo le `key` che esistono nel catalogo, senza doppioni,
    al massimo quante sono le piattaforme del catalogo.
  - `async function getUserPlatforms(userId: string): Promise<string[]>` (server-only)
  - `async function setUserPlatforms(userId: string, keys: string[]): Promise<void>`
    (server-only, sostituisce l'insieme: cancella quelle tolte, inserisce le nuove)

- [ ] **Step 1: Write the failing test**

Create `src/lib/platforms/user.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { chiaviValide } from "./user";

describe("chiaviValide", () => {
  it("tiene solo le chiavi del catalogo", () => {
    expect(chiaviValide(["netflix", "pippo", "now"])).toEqual(["netflix", "now"]);
  });

  it("toglie i doppioni", () => {
    expect(chiaviValide(["netflix", "netflix"])).toEqual(["netflix"]);
  });

  it("regge quello che arriva storto dal client", () => {
    expect(chiaviValide(null)).toEqual([]);
    expect(chiaviValide("netflix")).toEqual([]);
    expect(chiaviValide([1, true, null, "disney-plus"])).toEqual(["disney-plus"]);
  });

  it("non accetta piu' chiavi di quante ne esistano", () => {
    const tante = Array.from({ length: 50 }, (_, i) => `x${i}`).concat("netflix");
    expect(chiaviValide(tante)).toEqual(["netflix"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/lib/platforms/user.test.ts`
Expected: FAIL — il modulo non esiste.

- [ ] **Step 3: Write minimal implementation**

`src/lib/platforms/user.ts` — attenzione: `chiaviValide` è **pura** e sta in cima al
file, ma le due funzioni sotto usano Supabase. Se aggiungere `import "server-only"`
rompesse il test (lo rompe: Vitest non gira in ambiente server), **sposta
`chiaviValide` in un file suo** `src/lib/platforms/keys.ts` senza `server-only`, e
lascia in `user.ts` solo le due funzioni con l'import server-only. Scegli tu, ma il
test deve girare.

```ts
import { PLATFORMS } from "./catalog";

/** Quello che arriva dal client non è mai una chiave valida finché non lo verifichi. */
export function chiaviValide(grezze: unknown): string[] {
  if (!Array.isArray(grezze)) return [];
  const conosciute = new Set(PLATFORMS.map((p) => p.key));
  const fuori: string[] = [];
  for (const g of grezze) {
    if (typeof g !== "string" || !conosciute.has(g) || fuori.includes(g)) continue;
    fuori.push(g);
  }
  return fuori;
}
```

Le due funzioni con Supabase seguono lo schema degli altri `queries.ts`/`actions.ts`
del progetto (client da `@/lib/supabase/server`); `setUserPlatforms` cancella le righe
dell'utente che non sono più fra le scelte e inserisce quelle nuove con
`upsert(..., { ignoreDuplicates: true })`.

Create `supabase/migrations/0062_user_platforms.sql`:

```sql
-- Zapp — migration 0061: le piattaforme che l'utente dichiara di avere.
-- Chiesta all'iscrizione per portarlo subito agli import delle sue cronologie, ma
-- il dato serve anche oltre: la home filtrata per piattaforma e il "dove lo guardo"
-- leggono lo stesso elenco. La chiave e' la `key` del catalogo condiviso
-- (src/lib/platforms/catalog.ts), non un id TMDB: il catalogo mappa gia' la key su
-- providerId e sugli id secondari (Prime con pubblicita', canali Amazon).

create table if not exists public.user_platforms (
  user_id uuid not null references auth.users(id) on delete cascade,
  platform_key text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, platform_key)
);

alter table public.user_platforms enable row level security;

create policy "user_platforms_select_own" on public.user_platforms
  for select using (auth.uid() = user_id);
create policy "user_platforms_insert_own" on public.user_platforms
  for insert with check (auth.uid() = user_id);
create policy "user_platforms_delete_own" on public.user_platforms
  for delete using (auth.uid() = user_id);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/lib/platforms/ && pnpm typecheck`
Expected: PASS entrambi. `src/types/database.ts` **non** va toccato a mano: i tipi li
rigenera il controller dopo aver applicato la migration, e finché non l'ha fatto
`user.ts` può tipizzare le sue righe a mano con un commento che lo dice.

- [ ] **Step 5: Commit**

```bash
git add src/lib/platforms/ supabase/migrations/0062_user_platforms.sql
git commit -m "feat(platforms): salva le piattaforme che l'utente dichiara di avere"
```

---

### Task 2: Il passo "Cosa hai?" nell'onboarding

**Files:**
- Modify: `src/app/onboarding/OnboardingForm.tsx`
- Modify: `src/app/onboarding/actions.ts`
- Create: `src/app/onboarding/PlatformPicker.tsx`

**Interfaces:**
- Consumes: `PLATFORMS` dal catalogo; `chiaviValide` e `setUserPlatforms` dal Task 1.
- Produces: un campo `platforms` (JSON di chiavi) nel `FormData` di
  `completeOnboarding`; redirect finale a `/benvenuto` quando c'è almeno una
  piattaforma, altrimenti `/` come oggi.

- [ ] **Step 1: Il componente delle pillole**

`PlatformPicker.tsx`, client component: riceve `scelte: string[]` e
`onToggle: (key: string) => void`, mostra `PLATFORMS` come pillole a due colonne su
telefono, con lo stato selezionato evidente (bordo e sfondo, non solo un colore di
testo). Nessuna icona esterna: si usa `pillola` del catalogo come etichetta. Segui lo
stile delle pillole già presenti in app (cerca `rounded-full` nei componenti di
`src/components/ui/` e riusa le classi, non inventarne di nuove).

- [ ] **Step 2: Il passo nel form**

In `OnboardingForm.tsx`:
- `passo` diventa `0 | 1 | 2 | 3`;
- stato nuovo `const [piattaforme, setPiattaforme] = useState<string[]>([])`;
- un `input type="hidden" name="platforms"` con `JSON.stringify(piattaforme)`, nello
  stesso form degli altri campi;
- al passo 2 il bottone non invia più: porta al passo 3 (se la griglia dei gusti non
  esiste, `conGriglia === false`, il passo 3 arriva subito dopo il passo 1);
- il passo 3 ha titolo **"Cosa guardi?"**, una riga di spiegazione ("Serve a riempirti
  la libreria: ti porto subito a recuperare quello che hai già visto."), le pillole, e
  **due** bottoni: "Continua" (invia) e "Salta" (invia con l'elenco vuoto). Nessuno
  dei due blocca l'iscrizione.
- **Non toccare** `avanti()`, la validazione dello username, l'effetto su
  `[data-onb-intro]` né la logica dei `cercati`.

- [ ] **Step 3: La scrittura nella Server Action**

In `completeOnboarding`, **dopo** l'update di `profiles` e prima del `redirect`:

```ts
// Le piattaforme dichiarate: servono a /benvenuto per proporre subito gli import
// giusti, e alla home filtrata. Un JSON storto non impedisce l'iscrizione, come
// per i seed.
const chiavi = chiaviValide(safeJson(formData.get("platforms")));
if (chiavi.length > 0) {
  await setUserPlatforms(user.id, chiavi).catch((e: unknown) =>
    console.error("[onboarding] piattaforme non salvate:", e),
  );
}
```

e il redirect finale diventa `redirect(chiavi.length > 0 ? "/benvenuto" : "/")`.
`safeJson` è un helper locale che restituisce `null` invece di lanciare.

**Trappola, segnalata dalla sessione che ha scritto questo file:** `redirect()` in Next
**lancia** un'eccezione per navigare. Il `redirect` va quindi lasciato **fuori** da
qualunque `try/catch`, altrimenti il catch se lo mangia e l'azione torna senza portare
l'utente da nessuna parte. Vale anche per il `.catch()` sulla scrittura delle
piattaforme: deve avvolgere solo quella, mai la navigazione.

- [ ] **Step 4: Verifica**

Run: `pnpm typecheck && pnpm lint && pnpm test`
Expected: tutti verdi.

- [ ] **Step 5: Commit**

```bash
git add src/app/onboarding/
git commit -m "feat(onboarding): chiedi quali piattaforme ha l'utente"
```

---

### Task 3: La pagina `/benvenuto`

**Files:**
- Create: `src/app/(app)/benvenuto/page.tsx`
- Create: `src/lib/platforms/azioni.ts`
- Test: `src/lib/platforms/azioni.test.ts`

**Interfaces:**
- Consumes: `getUserPlatforms` (Task 1), `PLATFORMS`/`platformByKey`.
- Produces:
  - `interface AzionePiattaforma { key: string; nome: string; titolo: string; dettaglio: string; tempo: string; href: string | null; esterno: boolean; caricaSlug: string | null }`
  - `function azioniPer(chiavi: string[]): { subito: AzionePiattaforma[]; attesa: AzionePiattaforma[]; senzaStrada: string[] }`
    — **pura**, coperta da Vitest.

- [ ] **Step 1: Write the failing test**

Create `src/lib/platforms/azioni.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { azioniPer } from "./azioni";

describe("azioniPer", () => {
  it("mette per prime le piattaforme che si importano subito", () => {
    const { subito, attesa } = azioniPer(["disney-plus", "netflix"]);
    expect(subito.map((a) => a.key)).toEqual(["netflix"]);
    expect(attesa.map((a) => a.key)).toEqual(["disney-plus"]);
  });

  it("Netflix manda alla pagina della cronologia, non a un modulo", () => {
    const [netflix] = azioniPer(["netflix"]).subito;
    expect(netflix.href).toContain("netflix.com/viewingactivity");
    expect(netflix.esterno).toBe(true);
    expect(netflix.caricaSlug).toBe("netflix");
  });

  it("NOW non ha un portale: si chiede per email", () => {
    const [now] = azioniPer(["now"]).attesa;
    expect(now.href?.startsWith("mailto:privacy@sky.it")).toBe(true);
  });

  it("le piattaforme senza export non ricevono una card finta", () => {
    const { subito, attesa, senzaStrada } = azioniPer(["raiplay", "hbo-max"]);
    expect(subito).toEqual([]);
    expect(attesa).toEqual([]);
    expect(senzaStrada).toEqual(["RaiPlay", "HBO Max"]);
  });

  it("ignora le chiavi che non esistono", () => {
    expect(azioniPer(["pippo"])).toEqual({ subito: [], attesa: [], senzaStrada: [] });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/lib/platforms/azioni.test.ts`
Expected: FAIL — il modulo non esiste.

- [ ] **Step 3: Write minimal implementation**

`src/lib/platforms/azioni.ts`, puro. Gli indirizzi sono **verificati il 2026-09-15** e
vanno usati esattamente così:

| key | dove manda | tempo |
| --- | --- | --- |
| `netflix` | `https://www.netflix.com/viewingactivity` | "un minuto" |
| `prime-video` | `https://www.amazon.it/hz/privacy-central/data-requests/preview.html` | "qualche giorno" |
| `apple-tv` | `https://privacy.apple.com` | "3-7 giorni" |
| `disney-plus` | `https://privacy.thewaltdisneycompany.com/en/current-privacy-policy/data-subject-rights-portal/` | "fino a 30 giorni" |
| `now` | `mailto:privacy@sky.it?subject=...&body=...` | "fino a 30 giorni" |

`netflix` va in `subito` (la cronologia si scarica dalla pagina, senza chiedere
niente a nessuno); le altre quattro in `attesa`. Le cinque piattaforme restanti del
catalogo (`paramount-plus`, `raiplay`, `discovery-plus`, `hbo-max`,
`mediaset-infinity`) finiscono in `senzaStrada`, che porta i **nomi** (`pillola` del
catalogo), non le chiavi.

Il `mailto` di NOW ha oggetto e corpo già scritti, in italiano, con la richiesta di
accesso ai dati ai sensi dell'art. 15 GDPR e la cronologia di visione nominata
esplicitamente: è l'unica piattaforma senza portale self-service, e lasciare l'utente
a scrivere da solo una richiesta legale significa non farla scrivere a nessuno.
Ricorda `encodeURIComponent`.

`caricaSlug` è lo slug della sorgente di import dove l'utente torna col file:
`"netflix"` per Netflix, `"export"` per tutte le altre.

- [ ] **Step 4: La pagina**

`src/app/(app)/benvenuto/page.tsx`, Server Component: legge `getViewer()` come le
altre pagine di `(app)`, poi `getUserPlatforms`, poi `azioniPer`. Mostra:
- un titolo ("Recuperiamo quello che hai già visto") e una riga di spiegazione;
- le card di `subito`, poi quelle di `attesa`, ognuna con **una** azione primaria (un
  link che apre il sito, `target="_blank" rel="noopener noreferrer"`) e un link
  secondario "Carica il file" verso `/import/<caricaSlug>`;
- in fondo, se `senzaStrada` non è vuoto, **una riga sola**: "Di RaiPlay, Infinity,
  Discovery+, Paramount+ e HBO Max non esiste ancora un modo di importare la
  cronologia: quello che guardi lì lo segni tu, titolo per titolo." (costruita dai
  nomi veri, non scritta a mano — ZConnection non copre nessuna di queste cinque,
  solo Netflix, Prime, Disney+ e NOW: non promettere quello che non fa);
- un link "Lo faccio dopo" che porta a `/`.
Nessuno stato "fatto/richiesto" in questa fase: la memoria delle richieste arriva con
la fase 3 e questa pagina è progettata per riceverla senza essere riscritta.

**Attenzione al layout, segnalato dalla sessione che lavora su queste rotte:**
`/benvenuto` sta dentro `(app)` e ne eredita il guscio completo, `DailyQuestionLauncher`
compreso — il popup della domanda del giorno può aprirsi **sopra** la schermata di
benvenuto di uno appena iscritto, che è il momento peggiore. Sopprimi il launcher su
questa rotta (guarda come il layout decide di mostrarlo e aggiungi l'eccezione lì, non
con un `display:none`), e nel commento scrivi perché.

- [ ] **Step 5: Verifica e commit**

```bash
pnpm test src/lib/platforms/ && pnpm typecheck && pnpm lint
NEXT_DIST_DIR=.next-check pnpm build
git add src/lib/platforms/azioni.ts src/lib/platforms/azioni.test.ts "src/app/(app)/benvenuto/"
git commit -m "feat(benvenuto): una card per piattaforma, una sola azione per card"
```

---

### Task 4: L'aggancio dall'hub `/import` e la riga nel profilo

**Files:**
- Modify: `src/app/(app)/import/page.tsx`

- [ ] **Step 1: In cima all'hub**

Se l'utente ha almeno una piattaforma dichiarata (`getUserPlatforms`), l'hub mostra
in cima un riquadro che rimanda a `/benvenuto` ("Hai detto che guardi su Netflix e
Disney+: recupera lì la tua cronologia"), costruito coi nomi veri del catalogo. Se non
ne ha dichiarata nessuna, l'hub resta identico a oggi.

- [ ] **Step 2: Verifica e commit**

```bash
pnpm typecheck && pnpm lint
git add "src/app/(app)/import/page.tsx"
git commit -m "feat(import): dall'hub si torna alle proprie piattaforme"
```

---

### Task 5: Documentazione e cancello

**Files:**
- Modify: `docs/architecture/social.md` (voce "Import multi-sorgente")
- Modify: `docs/architecture/legal.md` **solo se** serve dire che `user_platforms` è
  un dato personale dichiarato dall'utente e cancellato con l'account (verificare che
  la cascata di cancellazione lo copra: la FK ha `on delete cascade`, quindi dovrebbe
  bastare — se la pagina elenca le tabelle una per una, aggiungerla).

- [ ] **Step 1: Scrivere**

In `social.md`, dentro la voce dell'import: il passo nuovo dell'onboarding, **perché**
le azioni non stanno lì ma su `/benvenuto` (fuori da `(app)` non c'è `ImportProvider`,
e un import avviato lì morirebbe al primo cambio pagina), la tabella `user_platforms`
con la `key` del catalogo condiviso, e il fatto che NOW non ha un portale e si passa
da un `mailto` già scritto. Non elencare i nomi delle funzioni: si leggono dal codice.

- [ ] **Step 2: Cancello**

```bash
pnpm typecheck && pnpm lint && pnpm test
NEXT_DIST_DIR=.next-check pnpm build
```
Tutti verdi, poi cancella `.next-check`. Nessun push, nessun rilascio.

- [ ] **Step 3: Commit**

```bash
git add docs/
git commit -m "docs(onboarding): racconta il passo delle piattaforme e /benvenuto"
```

---

## Self-review

**Copertura della spec (fase 5):**

| Requisito | Task |
| --- | --- |
| Passo "Cosa hai?" con le pillole del catalogo, "Salta" sempre visibile | 2 |
| Stessa rotta, stessa Server Action, form mai smontato | 2 |
| `user_platforms` con la `key` del catalogo, RLS proprietario | 1 |
| `/benvenuto` dentro `(app)`, una card per piattaforma, una sola azione | 3 |
| Ordine per attesa crescente | 3 |
| Riga onesta per le piattaforme senza export | 3 |
| Link esterni in scheda nuova | 3 |
| Indirizzi dei portali verificati | 3 (tabella nel task) |
| La lista riappare in `/import` | 4 |
| Stati "richiesto/fatto" e promemoria | **fuori**: sono la fase 3, e la pagina è fatta per riceverli senza riscritture |
| Card nel profilo | **fuori**: si valuta dopo la fase 3, quando c'è uno stato da mostrare |

**Type consistency:** `chiaviValide` nasce nel Task 1 e la usa il Task 2;
`AzionePiattaforma`/`azioniPer` nascono nel Task 3 e li usa solo la sua pagina;
`getUserPlatforms` nasce nel Task 1 e la usano i Task 3 e 4.

**Rischio noto:** un'altra sessione lavora sugli stessi file di `src/app/onboarding/`.
Il Task 2 va rimandato se quella sessione non ha finito, e in ogni caso va riletto
`OnboardingForm.tsx` prima di modificarlo, non dato per come è scritto qui.
