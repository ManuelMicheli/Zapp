# Aggiornamenti istantanei — piano di implementazione

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ogni azione dell'app cambia lo schermo nell'istante del tocco, senza aspettare la risposta del server.

**Architecture:** ottimismo locale con il server che resta la verità. Un modulo nuovo, `src/lib/ui/optimistic.ts`, offre due agganci con la stessa API `run(prossimoValore, azione, opzioni)`: `useOptimisticValue` (su `useOptimistic`, il valore torna a seguire il server appena la transizione chiude) per le azioni che rirendono la pagina aperta, e `useMirroredValue` (stato + risincronizzazione) per quelle che rivalidano **altre** rotte, dove `useOptimistic` tornerebbe indietro. I componenti smettono di aspettare `await` prima di aggiornarsi.

**Tech Stack:** Next.js 15 App Router, React 19 (`useOptimistic`, `useTransition`), TypeScript strict, Vitest (solo Node, solo funzioni pure), Tailwind 4.

**Spec:** `docs/superpowers/specs/2026-09-07-aggiornamenti-istantanei-design.md`

## Global Constraints

- Commenti e testi in **italiano**; UI in italiano.
- Prettier: virgolette doppie, virgole finali, `printWidth 90`. Solo `src/**/*.{ts,tsx,css}`.
- **Vitest gira in `environment: "node"`** (`vitest.config.ts`): non esistono test di componenti e **non se ne aggiungono**. Si testano solo funzioni pure in `src/**/*.test.ts`.
- Nessuna libreria nuova. Nessun `localStorage` per dati utente.
- Ogni Server Action del progetto ritorna un oggetto con almeno `{ ok: boolean; error?: string }`; alcune aggiungono campi (`prev`, `entry`, `favoriteIds`, `planId`, `undo`). L'helper non deve dipendere da quei campi in più.
- Il messaggio d'errore generico è esattamente `"Qualcosa è andato storto. Riprova."` (già usato da `TitleActionsBar`).
- **Build in una cartella a parte**: il tree è condiviso con altre sessioni, due `next build` sullo stesso `.next` si rompono a vicenda. Usare `NEXT_DIST_DIR=.next-istantanei pnpm build`.
- Worktree di lavoro: `D:\PROGETTI\Zapp-deploy`, ramo `feat/aggiornamenti-istantanei`.
- Non toccare `revalidatePath` in nessuna action: il costo del ricalcolo è fuori perimetro.

## Struttura dei file

| File | Responsabilità |
| --- | --- |
| `src/lib/ui/optimistic.ts` (nuovo) | I due agganci e i riduttori puri di lista. Nessuna dipendenza dai domini. |
| `src/lib/ui/optimistic.test.ts` (nuovo) | Vitest sui riduttori puri. |
| `src/app/(app)/library/LibraryGrid.tsx` | Base della lista dal server + rimozione ottimistica. |
| `src/components/cinema/PlanCard.tsx` | Serata e biglietto ottimistici. |
| `src/components/cinema/TicketSheet.tsx`, `TicketImport.tsx`, `ScanMode.tsx`, `PostShowCard.tsx` | Resto del flusso cinema. |
| `src/components/title/ProgressControls.tsx`, `EpisodeRow.tsx`, `src/components/home/RecommendationsSection.tsx` | Progresso serie e consigli. |
| `src/app/(app)/friends/RequestRow.tsx`, `src/app/(app)/u/[username]/FriendButton.tsx` | Amicizie. |
| `src/components/title/ReviewsClient.tsx`, `RecommendSheet.tsx` | Recensioni, commenti, consigli agli amici. |
| `src/components/profile/AvatarPicker.tsx`, `src/app/(app)/profile/ProfileEditor.tsx` | Profilo. |
| `src/components/import/ImportProvider.tsx` | Libreria che si riempie durante l'import. |
| `src/components/title/TitleActionsBar.tsx`, `src/components/cinema/FavoriteStar.tsx`, `src/components/social/ActivityLikeButton.tsx` | Migrazione dei tre già ottimistici sull'helper. |

---

### Task 1: L'helper condiviso

**Files:**
- Create: `src/lib/ui/optimistic.ts`
- Test: `src/lib/ui/optimistic.test.ts`

**Interfaces:**
- Consumes: `useToast` da `@/components/ui/Toaster` (firma: `show(message: string, options?: { onUndo?: () => void; durationMs?: number })`).
- Produces:
  - `interface MutationResult { ok: boolean; error?: string }`
  - `const DEFAULT_ERROR = "Qualcosa è andato storto. Riprova."`
  - `interface RunOptions { message?: string; undo?: () => void; onDone?: () => void }`
  - `function useOptimisticValue<T>(serverValue: T): { value: T; pending: boolean; run: (next: T, action: () => Promise<MutationResult>, options?: RunOptions) => void }`
  - `function useMirroredValue<T>(serverValue: T): { value: T; pending: boolean; run: (next: T, action: () => Promise<MutationResult>, options?: RunOptions) => void; set: (next: T) => void }`
  - `function withoutKey<T>(items: T[], keyOf: (item: T) => string, key: string): T[]`
  - `function withReplaced<T>(items: T[], keyOf: (item: T) => string, next: T): T[]`
  - `function withAppended<T>(items: T[], keyOf: (item: T) => string, item: T): T[]`
  - `function mergePages<T>(server: T[], more: T[], keyOf: (item: T) => string): T[]`

- [ ] **Step 1: Scrivere i test dei riduttori puri**

Creare `src/lib/ui/optimistic.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { mergePages, withAppended, withoutKey, withReplaced } from "./optimistic";

interface Row {
  id: string;
  name: string;
}

const key = (r: Row) => r.id;
const rows: Row[] = [
  { id: "a", name: "Alfa" },
  { id: "b", name: "Bravo" },
];

describe("withoutKey", () => {
  it("toglie la riga con quella chiave", () => {
    expect(withoutKey(rows, key, "a")).toEqual([{ id: "b", name: "Bravo" }]);
  });

  it("lascia la lista com'è se la chiave non c'è", () => {
    expect(withoutKey(rows, key, "z")).toEqual(rows);
  });
});

describe("withReplaced", () => {
  it("sostituisce al suo posto", () => {
    expect(withReplaced(rows, key, { id: "a", name: "Altro" })).toEqual([
      { id: "a", name: "Altro" },
      { id: "b", name: "Bravo" },
    ]);
  });

  it("non aggiunge niente se la chiave non c'è", () => {
    expect(withReplaced(rows, key, { id: "z", name: "Zeta" })).toEqual(rows);
  });
});

describe("withAppended", () => {
  it("aggiunge in fondo", () => {
    expect(withAppended(rows, key, { id: "c", name: "Charlie" })).toHaveLength(3);
  });

  it("non duplica una chiave già presente", () => {
    expect(withAppended(rows, key, { id: "a", name: "Alfa" })).toEqual(rows);
  });
});

describe("mergePages", () => {
  it("tiene le righe del server davanti e scarta i doppioni", () => {
    const more: Row[] = [
      { id: "b", name: "Bravo" },
      { id: "c", name: "Charlie" },
    ];
    expect(mergePages(rows, more, key)).toEqual([
      { id: "a", name: "Alfa" },
      { id: "b", name: "Bravo" },
      { id: "c", name: "Charlie" },
    ]);
  });

  it("una riga sparita dal server sparisce anche dalle pagine dopo", () => {
    const server: Row[] = [{ id: "b", name: "Bravo" }];
    const more: Row[] = [{ id: "c", name: "Charlie" }];
    expect(mergePages(server, more, key).map(key)).toEqual(["b", "c"]);
  });
});
```

- [ ] **Step 2: Far girare i test e vederli fallire**

```bash
cd /d/PROGETTI/Zapp-deploy && pnpm exec vitest run src/lib/ui/optimistic.test.ts
```

Atteso: FAIL, `Failed to resolve import "./optimistic"`.

- [ ] **Step 3: Scrivere il modulo**

Creare `src/lib/ui/optimistic.ts`:

```ts
"use client";

import { useCallback, useEffect, useOptimistic, useState, useTransition } from "react";
import { useToast } from "@/components/ui/Toaster";

/**
 * Il giro che ogni comando dell'app deve fare: applicare subito il risultato atteso,
 * chiamare la Server Action, e se la risposta non è `ok` tornare indietro con un toast.
 * Prima stava copiato a mano in quindici componenti, ognuno un po' diverso.
 */

/** Il minimo che ogni Server Action del progetto ritorna. */
export interface MutationResult {
  ok: boolean;
  error?: string;
}

/** Errore generico, uguale ovunque. */
export const DEFAULT_ERROR = "Qualcosa è andato storto. Riprova.";

export interface RunOptions {
  /** Toast di conferma dopo una risposta ok. */
  message?: string;
  /** "Annulla" nel toast di conferma. */
  undo?: () => void;
  /** Girato dopo una risposta ok: per `router.refresh()` e simili. */
  onDone?: () => void;
}

type Run<T> = (
  next: T,
  action: () => Promise<MutationResult>,
  options?: RunOptions,
) => void;

/**
 * Valore che il server possiede e il client anticipa. Alla fine della transizione
 * l'anticipo cade e torna a valere `serverValue` — che nel frattempo è arrivato
 * aggiornato, perché la risposta di una Server Action porta con sé il rendering nuovo
 * della pagina aperta. Da usare per le azioni che rivalidano **questa** rotta.
 */
export function useOptimisticValue<T>(serverValue: T): {
  value: T;
  pending: boolean;
  run: Run<T>;
} {
  const { show } = useToast();
  const [value, setValue] = useOptimistic(serverValue, (_prev: T, next: T) => next);
  const [pending, startTransition] = useTransition();

  const run = useCallback<Run<T>>(
    (next, action, options) => {
      startTransition(async () => {
        setValue(next);
        const result = await action();
        if (!result.ok) {
          show(result.error ?? DEFAULT_ERROR);
          return;
        }
        if (options?.message) show(options.message, { onUndo: options.undo });
        options?.onDone?.();
      });
    },
    [setValue, show],
  );

  return { value, pending, run };
}

/**
 * Come sopra, ma il valore **resta** dopo la transizione e si risincronizza quando il
 * server ne manda uno nuovo. Serve dove l'azione rivalida altre rotte e non rirende la
 * pagina aperta (una stella "preferito" su una scheda titolo, i bottoni amicizia su
 * `/u/[username]`): lì `useOptimistic` tornerebbe al valore vecchio appena chiusa la
 * transizione, e si vedrebbe il salto indietro.
 */
export function useMirroredValue<T>(serverValue: T): {
  value: T;
  pending: boolean;
  run: Run<T>;
  set: (next: T) => void;
} {
  const { show } = useToast();
  const [value, setValue] = useState(serverValue);
  const [pending, startTransition] = useTransition();
  useEffect(() => setValue(serverValue), [serverValue]);

  const run = useCallback<Run<T>>(
    (next, action, options) => {
      const previous = value;
      setValue(next);
      startTransition(async () => {
        const result = await action();
        if (!result.ok) {
          setValue(previous);
          show(result.error ?? DEFAULT_ERROR);
          return;
        }
        if (options?.message) show(options.message, { onUndo: options.undo });
        options?.onDone?.();
      });
    },
    [show, value],
  );

  return { value, pending, run, set: setValue };
}

/** Lista senza la riga di quella chiave. */
export function withoutKey<T>(
  items: T[],
  keyOf: (item: T) => string,
  key: string,
): T[] {
  return items.filter((item) => keyOf(item) !== key);
}

/** Lista con la riga di pari chiave sostituita (nessun inserimento se manca). */
export function withReplaced<T>(items: T[], keyOf: (item: T) => string, next: T): T[] {
  const key = keyOf(next);
  return items.map((item) => (keyOf(item) === key ? next : item));
}

/** Lista con la riga in fondo, se quella chiave non c'è già. */
export function withAppended<T>(items: T[], keyOf: (item: T) => string, item: T): T[] {
  const key = keyOf(item);
  return items.some((i) => keyOf(i) === key) ? items : [...items, item];
}

/**
 * Prima pagina dal server + pagine caricate dal client, senza doppioni e con il server
 * che comanda: una riga che il server non manda più sparisce anche dalle pagine dopo.
 */
export function mergePages<T>(server: T[], more: T[], keyOf: (item: T) => string): T[] {
  const seen = new Set(server.map(keyOf));
  return [...server, ...more.filter((item) => !seen.has(keyOf(item)))];
}
```

- [ ] **Step 4: Far girare i test e vederli passare**

```bash
cd /d/PROGETTI/Zapp-deploy && pnpm exec vitest run src/lib/ui/optimistic.test.ts
```

Atteso: 8 test passati.

- [ ] **Step 5: Controllo tipi e stile, poi commit**

```bash
cd /d/PROGETTI/Zapp-deploy && pnpm typecheck && pnpm lint && pnpm exec prettier --write "src/lib/ui/*.ts"
git add src/lib/ui/optimistic.ts src/lib/ui/optimistic.test.ts
git commit -m "feat(ui): helper per gli aggiornamenti ottimistici"
```

---

### Task 2: La griglia della libreria

**Files:**
- Modify: `src/app/(app)/library/LibraryGrid.tsx`

**Interfaces:**
- Consumes: `useOptimisticValue`, `mergePages`, `withoutKey` dal Task 1.
- Produces: niente per gli altri task.

Oggi la griglia tiene tutto in `useState(initialItems)`: React non riassegna lo stato iniziale quando il server manda una lista nuova, quindi dopo un'azione la griglia resta identica finché non si naviga altrove. Le pagine caricate dal client si separano dalla prima, che torna a essere del server.

- [ ] **Step 1: Separare le pagine del client dalla prima**

In `src/app/(app)/library/LibraryGrid.tsx`, sostituire l'import di React e lo stato.

Da:

```tsx
import { useState, useTransition, type ReactNode } from "react";
```

A:

```tsx
import { useState, useTransition, type ReactNode } from "react";
import { mergePages, useOptimisticValue, withoutKey } from "@/lib/ui/optimistic";
```

Da:

```tsx
  const { show } = useToast();
  const [, startTransition] = useTransition();
  const [selected, setSelected] = useState<LibraryItem | null>(null);
  const [items, setItems] = useState(initialItems);
  const [loadingMore, startLoadMore] = useTransition();
  const hasMore = items.length < total;
```

A:

```tsx
  const [selected, setSelected] = useState<LibraryItem | null>(null);
  // le pagine oltre la prima sono del client; la prima resta del server, così un
  // rendering nuovo entra da solo (prima `useState(initialItems)` non si aggiornava mai)
  const [morePages, setMorePages] = useState<LibraryItem[]>([]);
  const [loadingMore, startLoadMore] = useTransition();
  const itemKey = (item: LibraryItem) => `${item.mediaType}-${item.titleId}`;
  const {
    value: items,
    run,
    pending,
  } = useOptimisticValue(mergePages(initialItems, morePages, itemKey));
  const hasMore = items.length < total;
```

- [ ] **Step 2: Caricare le pagine successive nel loro stato**

Da:

```tsx
  function loadMore() {
    startLoadMore(async () => {
      const next = await loadMoreLibrary(status, mediaType, items.length);
      setItems((prev) => {
        const seen = new Set(prev.map((i) => `${i.mediaType}-${i.titleId}`));
        return [...prev, ...next.filter((i) => !seen.has(`${i.mediaType}-${i.titleId}`))];
      });
    });
  }
```

A:

```tsx
  function loadMore() {
    startLoadMore(async () => {
      const next = await loadMoreLibrary(status, mediaType, items.length);
      setMorePages((prev) => mergePages(prev, next, itemKey));
    });
  }
```

- [ ] **Step 3: Far sparire la card nell'istante del tocco**

Da:

```tsx
  function run(item: LibraryItem, action: () => Promise<ActionResult>, message: string) {
    setSelected(null);
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        show("Errore. Riprova.");
        return;
      }
      show(message, {
        onUndo: () => {
          startTransition(async () => {
            await restoreEntry(item.titleId, item.mediaType, result.prev);
          });
        },
      });
    });
  }
```

A:

```tsx
  /**
   * L'azione toglie l'entry da questo stato, quindi la card lascia la scheda corrente
   * subito; l'annulla la rimette (il server rimanda la lista di prima).
   */
  function apply(
    item: LibraryItem,
    action: () => Promise<ActionResult>,
    message: string,
  ) {
    setSelected(null);
    let prev: EntrySnapshot | null = null;
    run(
      withoutKey(items, itemKey, itemKey(item)),
      async () => {
        const result = await action();
        prev = result.prev;
        return result;
      },
      {
        message,
        undo: () => {
          void restoreEntry(item.titleId, item.mediaType, prev);
        },
      },
    );
  }
```

Aggiungere `EntrySnapshot` all'import dei tipi da `@/lib/watch/actions`:

```tsx
import {
  addWant,
  dropTitle,
  markWatched,
  removeEntry,
  restoreEntry,
  startWatching,
  type ActionResult,
  type EntrySnapshot,
} from "@/lib/watch/actions";
```

- [ ] **Step 4: Rinominare le cinque chiamate nel foglio**

Nel `<Sheet>` ci sono cinque `run(selected, …)`: "Voglio vederlo", "Sto guardando", "Visto", "Abbandona", "Rimuovi dalla libreria". Rinominarle tutte in `apply(selected, …)`, lasciando invariati argomenti e messaggi. Togliere `useToast` e la variabile `show` se non più usati (l'errore lo mostra l'helper), e togliere `pending` se non serve a nessun elemento.

- [ ] **Step 5: Verifica e commit**

```bash
cd /d/PROGETTI/Zapp-deploy && pnpm typecheck && pnpm lint
git add "src/app/(app)/library/LibraryGrid.tsx"
git commit -m "fix(library): la griglia segue il server e la card sparisce subito"
```

---

### Task 3: Il banner della serata

**Files:**
- Modify: `src/components/cinema/PlanCard.tsx`

**Interfaces:**
- Consumes: `useOptimisticValue` dal Task 1; `PlanRow` da `@/lib/cinema/queries`; `Showing` da `@/lib/cinema/types` (campi `start`, `format`, `bookingUrl`, `bookingLevel`).
- Produces: niente.

Le tre azioni rapide (rimuovi biglietto, rimuovi serata, cambia orario) oggi aspettano. Lo stato ottimistico è la coppia serata + biglietto, con `null` a dire "la serata non c'è più".

- [ ] **Step 1: Mettere serata e biglietto in un solo valore ottimistico**

Aggiungere l'import:

```tsx
import { useOptimisticValue } from "@/lib/ui/optimistic";
```

Sostituire:

```tsx
  const { show } = useToast();
  const [pending, startTransition] = useTransition();
```

con:

```tsx
  const { show } = useToast();
  // la serata e il suo biglietto insieme: `null` = serata tolta, la card sparisce
  const { value: view, pending, run } = useOptimisticValue<{
    plan: PlanRow;
    ticketUrl: string | null;
  } | null>({ plan, ticketUrl });
```

Subito dopo le altre `useState`/`useEffect` (che restano), leggere i valori dal valore ottimistico:

```tsx
  if (!view) return null;
  const shown = view.plan;
```

e sostituire nel resto del componente ogni lettura di `plan.` con `shown.` e ogni `ticketUrl` con `view.ticketUrl` — comprese `codes`, `hasTicket`, `parts`, `coords`, `fmt`, `bg` e le proprietà passate a `QrFullscreen`, `ScanMode`, `TicketImport`. `plan.id` resta la chiave da passare alle azioni.

- [ ] **Step 2: Le tre azioni rapide**

Da:

```tsx
  function drop() {
    setMenuOpen(false);
    startTransition(async () => {
      const c = await cancelPlan(plan.id);
      show(c.ok ? "Serata rimossa" : "Errore nel rimuovere la serata");
    });
  }

  function dropTicket() {
    setMenuOpen(false);
    startTransition(async () => {
      const r = await removeTicket(plan.id);
      show(r.ok ? "Biglietto rimosso" : (r.error ?? "Errore"));
    });
  }
```

A:

```tsx
  function drop() {
    setMenuOpen(false);
    run(null, () => cancelPlan(plan.id), { message: "Serata rimossa" });
  }

  function dropTicket() {
    setMenuOpen(false);
    run(
      {
        plan: { ...plan, ticket_codes: null, ticket_path: null, seats: [], hall: null },
        ticketUrl: null,
      },
      () => removeTicket(plan.id),
      { message: "Biglietto rimosso" },
    );
  }
```

E per il cambio orario, da:

```tsx
  function move(showing: Showing) {
    setTimesOpen(false);
    startTransition(async () => {
      const r = await movePlan(plan.id, showing);
      show(r.ok ? `Spostata alle ${formatTime(showing.start)}` : (r.error ?? "Errore"));
    });
  }
```

A:

```tsx
  function move(showing: Showing) {
    setTimesOpen(false);
    run(
      {
        plan: {
          ...plan,
          starts_at: showing.start,
          format: showing.format,
          booking_url: showing.bookingUrl,
        },
        ticketUrl,
      },
      () => movePlan(plan.id, showing),
      { message: `Spostata alle ${formatTime(showing.start)}` },
    );
  }
```

- [ ] **Step 3: Ripulire**

`openTimes` continua a essere una **lettura** (`getPlanAlternatives`), non una mutazione: tenerla in un `useTransition` suo, dichiarato accanto agli altri stati:

```tsx
  const [loadingTimes, startLoadingTimes] = useTransition();
```

e usarlo al posto di `startTransition` dentro `openTimes`; il suo `pending` serve a mostrare "Carico…" nel foglio degli orari. Togliere `show` se non resta nessun'altra chiamata.

- [ ] **Step 4: Verifica e commit**

```bash
cd /d/PROGETTI/Zapp-deploy && pnpm typecheck && pnpm lint
git add src/components/cinema/PlanCard.tsx
git commit -m "feat(cinema): la serata e il biglietto cambiano nell'istante del tocco"
```

---

### Task 4: Il resto del flusso cinema

**Files:**
- Modify: `src/components/cinema/TicketSheet.tsx`
- Modify: `src/components/cinema/TicketImport.tsx`
- Modify: `src/components/cinema/ScanMode.tsx`
- Modify: `src/components/cinema/PostShowCard.tsx`

**Interfaces:**
- Consumes: `useOptimisticValue`, `useMirroredValue` dal Task 1.
- Produces: niente.

- [ ] **Step 1: `TicketSheet` — "Ci vado" senza attesa**

`saved` è già uno stato locale che sopravvive alla transizione: passa a `useMirroredValue`, così l'anticipo non torna indietro (il foglio resta aperto sopra una pagina che non viene rirenderizzata subito).

Da:

```tsx
  const { show } = useToast();
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState<{ planId: string; undo?: PlanUndo } | null>(null);
```

A:

```tsx
  const { show } = useToast();
  const {
    value: saved,
    pending,
    run,
    set: setSaved,
  } = useMirroredValue<{ planId: string; undo?: PlanUndo } | null>(null);
```

Il salvataggio non conosce `planId` prima della risposta, quindi l'anticipo è un segnaposto che la risposta rimpiazza. Da:

```tsx
    startTransition(async () => {
      const r = await planShowing({ /* … invariato … */ });
      if (!r.ok || !r.planId) {
        show(r.error ?? "Errore");
        return;
      }
      const planId = r.planId;
      const undo = r.undo ?? undefined;
      setSaved({ planId, undo });
      show("Serata salvata: la trovi in home", {
        onUndo: () => {
          setSaved(null);
          void cancelPlan(planId, undo);
        },
      });
    });
```

A:

```tsx
    let planId = "";
    let undo: PlanUndo | undefined;
    run(
      // il tagliando passa subito a "Serata salvata"; l'id vero arriva con la risposta
      { planId: "" },
      async () => {
        const r = await planShowing({ /* … invariato … */ });
        if (r.ok && r.planId) {
          planId = r.planId;
          undo = r.undo ?? undefined;
          setSaved({ planId, undo });
        }
        return r;
      },
      {
        message: "Serata salvata: la trovi in home",
        undo: () => {
          setSaved(null);
          if (planId) void cancelPlan(planId, undo);
        },
      },
    );
```

Attenzione: se la risposta non è `ok`, `useMirroredValue` riporta `saved` a `null` da sé e mostra l'errore — il ripristino a mano non serve.

- [ ] **Step 2: `TicketImport` — il biglietto compare appena letto**

`attachTicket` è chiamata dopo la decodifica dei QR nel browser. Il `phase` locale già racconta l'avanzamento; l'unica attesa da togliere è fra la risposta e il `router.refresh()`. Sostituire il blocco attorno a `attachTicket` (riga ~96) con:

```tsx
      setPhase("done");
      const r = await attachTicket(planId, { codes, path, seats, hall });
      if (!r.ok) {
        setPhase("idle");
        show(r.error ?? DEFAULT_ERROR);
        return;
      }
      router.refresh();
```

Importare `DEFAULT_ERROR` da `@/lib/ui/optimistic`. L'ordine conta: `setPhase("done")` **prima** della chiamata.

- [ ] **Step 3: `ScanMode` — i posti scritti a mano**

Da:

```tsx
  function saveSeats() {
    const list = cleanSeatInput(draft);
    if (list.length === 0) return;
    startTransition(async () => {
      const r = await setSeats(planId, list, hall);
      if (!r.ok) {
        show(r.error ?? "Errore");
        return;
      }
      setSaved(list);
    });
  }
```

A:

```tsx
  function saveSeats() {
    const list = cleanSeatInput(draft);
    if (list.length === 0) return;
    run(list, () => setSeats(planId, list, hall));
  }
```

con lo stato dichiarato così:

```tsx
  const { value: saved, pending, run } = useMirroredValue<string[] | null>(null);
```

(`ScanMode` sta sopra la home in un portal: la pagina sotto non viene rirenderizzata, quindi serve la variante che regge.)

- [ ] **Step 4: `PostShowCard` — "Com'è andata?" senza attesa**

Da:

```tsx
  const { show } = useToast();
  const [pending, startTransition] = useTransition();
  const [rating, setRatingStep] = useState(false);
```

A:

```tsx
  // "ask" = la domanda, "rate" = il voto, "gone" = la card è chiusa
  const {
    value: step,
    pending,
    run,
  } = useOptimisticValue<"ask" | "rate" | "gone">("ask");
```

e le tre funzioni:

```tsx
  /** "L'ho visto": il film entra fra i visti, poi si chiede il voto. */
  function watched() {
    run("rate", () => markWatched(plan.tmdb_id, "movie"));
  }

  /** Voto (o "Salta"): chiusa la domanda, la serata si toglie. */
  function close(vote: number | null) {
    run(
      "gone",
      async () => {
        if (vote !== null) await setRating(plan.tmdb_id, "movie", vote);
        return cancelPlan(plan.id);
      },
      { message: vote !== null ? `Votato ${vote}/10` : "Buona visione la prossima!" },
    );
  }

  function skipped() {
    run("gone", () => cancelPlan(plan.id), { message: "Serata rimossa" });
  }
```

Nel corpo: `if (step === "gone") return null;` e usare `step === "rate"` dove prima c'era `rating`.

- [ ] **Step 5: Verifica e commit**

```bash
cd /d/PROGETTI/Zapp-deploy && pnpm typecheck && pnpm lint
git add src/components/cinema/TicketSheet.tsx src/components/cinema/TicketImport.tsx src/components/cinema/ScanMode.tsx src/components/cinema/PostShowCard.tsx
git commit -m "feat(cinema): biglietto, posti e \"com'è andata\" senza attesa"
```

---

### Task 5: Progresso delle serie e consigli in home

**Files:**
- Modify: `src/components/title/ProgressControls.tsx`
- Modify: `src/components/title/EpisodeRow.tsx`
- Modify: `src/components/home/RecommendationsSection.tsx`

**Interfaces:**
- Consumes: `useOptimisticValue`, `withoutKey` dal Task 1.
- Produces: niente.

- [ ] **Step 1: `ProgressControls` — il punto della serie si sposta subito**

Il componente riceve `season` ed `episode` dal server. Aggiungere in cima:

```tsx
  const {
    value: point,
    pending,
    run,
  } = useOptimisticValue({ season, episode });
```

e usare `point.season` / `point.episode` dove oggi si leggono le prop. La funzione che chiama l'azione (riga ~52) diventa:

```tsx
  function apply(nextSeason: number, nextEpisode: number) {
    let prev: EntrySnapshot | null = null;
    run(
      { season: nextSeason, episode: nextEpisode },
      async () => {
        const result = await setProgress(titleId, nextSeason, nextEpisode);
        prev = result.prev;
        return result;
      },
      {
        message: `Segnato: S${nextSeason}:E${nextEpisode}`,
        undo: () => {
          void restoreEntry(titleId, "tv", prev);
        },
      },
    );
  }
```

Le firme sono `setProgress(titleId, season, episode)` e `restoreEntry(titleId, mediaType, prev)`, entrambe in `src/lib/watch/actions.ts`: usarle come sono, senza cambiarle.

- [ ] **Step 2: `EpisodeRow` — la spunta cambia subito**

La spunta non è una prop booleana: si ricava dalle prop `watchedSeason` / `watchedEpisode` confrontate con l'episodio della riga. Il valore ottimistico è quindi la coppia, come in `ProgressControls`.

Da:

```tsx
  const { show } = useToast();
  const [pending, startTransition] = useTransition();

  const isWatched =
    watchedSeason != null &&
    watchedEpisode != null &&
    (episode.season_number < watchedSeason ||
      (episode.season_number === watchedSeason &&
        episode.episode_number <= watchedEpisode));
```

A:

```tsx
  const {
    value: point,
    pending,
    run,
  } = useOptimisticValue({ season: watchedSeason, episode: watchedEpisode });

  const isWatched =
    point.season != null &&
    point.episode != null &&
    (episode.season_number < point.season ||
      (episode.season_number === point.season &&
        episode.episode_number <= point.episode));
```

E `handleTap`:

```tsx
  function handleTap() {
    let prev: EntrySnapshot | null = null;
    run(
      { season: episode.season_number, episode: episode.episode_number },
      async () => {
        const result = await setProgress(
          titleId,
          episode.season_number,
          episode.episode_number,
        );
        prev = result.prev;
        return result;
      },
      {
        message: `Segnato: S${episode.season_number}:E${episode.episode_number}`,
        undo: () => {
          void restoreEntry(titleId, "tv", prev);
        },
      },
    );
  }
```

Importare `type EntrySnapshot` da `@/lib/watch/actions` e togliere `useToast` se non resta altro che lo usi. Il messaggio del toast deve restare quello che il file mostra oggi: leggerlo prima di sostituirlo.

- [ ] **Step 3: `RecommendationsSection` — il consiglio esce dalla fila**

Da:

```tsx
  const [, startTransition] = useTransition();
  const [visible, setVisible] = useState(items);
```

A:

```tsx
  const { value: visible, run } = useOptimisticValue(items);
```

e il bottone:

```tsx
                onClick={() =>
                  run(
                    withoutKey(visible, (r) => r.id, rec.id),
                    async () => {
                      const result = await addWant(rec.titleId, rec.mediaType);
                      await markRecommendationSeen(rec.id);
                      return result;
                    },
                    { message: "Aggiunto a Da vedere" },
                  )
                }
```

- [ ] **Step 4: Verifica e commit**

```bash
cd /d/PROGETTI/Zapp-deploy && pnpm typecheck && pnpm lint
git add src/components/title/ProgressControls.tsx src/components/title/EpisodeRow.tsx src/components/home/RecommendationsSection.tsx
git commit -m "feat(watch): progresso delle serie e consigli aggiornati subito"
```

---

### Task 6: Le amicizie

**Files:**
- Modify: `src/app/(app)/friends/RequestRow.tsx`
- Modify: `src/app/(app)/u/[username]/FriendButton.tsx`

**Interfaces:**
- Consumes: `useMirroredValue` dal Task 1.
- Produces: niente.

Le azioni di amicizia rivalidano `/friends`, `/notifications` e `/`, **mai** `/u/[username]`: su un profilo `useOptimistic` tornerebbe indietro. Qui serve `useMirroredValue` in entrambi i file.

- [ ] **Step 1: `RequestRow` — la riga passa allo stato finale al tocco**

Da:

```tsx
  const [pending, startTransition] = useTransition();
  const [done, setDone] = useState<"accepted" | "declined" | null>(null);
```

A:

```tsx
  const {
    value: done,
    pending,
    run,
  } = useMirroredValue<"accepted" | "declined" | null>(null);
```

I due `onClick`:

```tsx
            onClick={() => run("accepted", () => acceptFriendRequest(profile.id))}
```

```tsx
            onClick={() => run("declined", () => declineFriendRequest(profile.id))}
```

Togliere l'import di `useState`/`useTransition` se non resta altro che li usi.

- [ ] **Step 2: `FriendButton` — il bottone cambia stato al tocco**

Da:

```tsx
  const { show } = useToast();
  const [state, setState] = useState(initialState);
  const [pending, startTransition] = useTransition();
```

A:

```tsx
  const { value: state, pending, run } = useMirroredValue<FriendState>(initialState);
```

I quattro comandi:

```tsx
            onClick={() =>
              run("outgoing", () => sendFriendRequest(targetId), {
                message: "Richiesta inviata",
              })
            }
```

```tsx
            onClick={() =>
              run("friends", () => acceptFriendRequest(targetId), {
                message: "Ora siete amici!",
              })
            }
```

```tsx
              onClick={() => {
                setMenuOpen(false);
                run("none", () => removeFriend(targetId), {
                  message: "Amicizia rimossa",
                });
              }}
```

```tsx
            onClick={() => {
              setMenuOpen(false);
              run("blocked", () => blockUser(targetId), { message: "Utente bloccato" });
            }}
```

Togliere `useToast`/`show` se non resta nessun altro uso.

- [ ] **Step 3: Verifica e commit**

```bash
cd /d/PROGETTI/Zapp-deploy && pnpm typecheck && pnpm lint
git add "src/app/(app)/friends/RequestRow.tsx" "src/app/(app)/u/[username]/FriendButton.tsx"
git commit -m "feat(social): i bottoni di amicizia cambiano stato al tocco"
```

---

### Task 7: Recensioni, commenti, consigli agli amici

**Files:**
- Modify: `src/components/title/ReviewsClient.tsx`
- Modify: `src/components/title/RecommendSheet.tsx`

**Interfaces:**
- Consumes: `useMirroredValue`, `withAppended` dal Task 1.
- Produces: niente.

- [ ] **Step 1: `ReviewsClient` — pubblicare chiude subito il modulo**

`upsertReview` rivalida la scheda titolo, ma il componente chiama anche `router.refresh()`: l'attesa da togliere è quella fra il tocco e la chiusura del modulo. Da:

```tsx
  function submitReview() {
    startTransition(async () => {
      const result = await upsertReview(props.titleId, props.mediaType, body, spoilers);
      if (!result.ok) {
        show(result.error ?? "Errore");
        return;
      }
      if (rating !== props.myRating && rating != null) {
        await setRating(props.titleId, props.mediaType, rating);
      }
      setWriting(false);
      show("Recensione pubblicata");
      router.refresh();
    });
  }
```

A:

```tsx
  function submitReview() {
    setWriting(false); // il modulo si chiude subito: la recensione arriva col refresh
    run(
      false,
      async () => {
        const result = await upsertReview(
          props.titleId,
          props.mediaType,
          body,
          spoilers,
        );
        if (result.ok && rating !== props.myRating && rating != null) {
          await setRating(props.titleId, props.mediaType, rating);
        }
        return result;
      },
      { message: "Recensione pubblicata", onDone: () => router.refresh() },
    );
  }
```

con lo stato del modulo passato all'helper:

```tsx
  const { value: writing, pending, run, set: setWriting } = useMirroredValue(false);
```

Se la risposta non è `ok`, l'helper riporta `writing` a `true` (il valore di prima) e mostra l'errore: quello che l'utente ha scritto resta sullo schermo.

- [ ] **Step 2: `ReviewsClient` — il commento compare mentre parte**

Nel componente dei commenti, da:

```tsx
  function submit() {
    startTransition(async () => {
      const result = await addComment(reviewId, text, replyTo, false);
      if (!result.ok) {
        show(result.error ?? "Errore");
        return;
      }
      setText("");
      setReplyTo(null);
      await load();
    });
  }
```

A:

```tsx
  function submit() {
    const body = text;
    const parent = replyTo;
    setText("");
    setReplyTo(null);
    run(
      withAppended(comments ?? [], (c) => c.id, {
        id: `${PENDING_PREFIX}${Date.now()}`,
        user_id: "",
        parent_id: parent,
        body,
        has_spoilers: false,
        created_at: new Date().toISOString(),
        author: null,
      }),
      () => addComment(reviewId, body, parent, false),
      { onDone: () => void load() },
    );
  }
```

con, in cima al file:

```tsx
/** Prefisso dell'id di un commento appena scritto, non ancora tornato dal server. */
const PENDING_PREFIX = "in-corso-";
```

e nel componente dei commenti:

```tsx
  const {
    value: comments,
    run,
    set: setComments,
  } = useMirroredValue<CommentRow[] | null>(null);
```

`Comments` non riceve l'identità di chi guarda (le sue prop sono solo `reviewId` e `viewerWatched`) e non gliela si aggiunge: la riga in corso ha `author: null`. Oggi la riga 505 fa `comment.author?.display_name ?? comment.author?.username ?? "utente"`, che per la riga in corso scriverebbe "utente"; cambiarla in:

```tsx
  const name = comment.id.startsWith(PENDING_PREFIX)
    ? "Tu"
    : (comment.author?.display_name ?? comment.author?.username ?? "utente");
```

La riga in corso sparisce da sé al `load()`, sostituita da quella vera.

- [ ] **Step 3: `RecommendSheet` — il destinatario passa a "inviato"**

Il foglio tiene `selected` e `message`. Aggiungere lo stato degli invii andati a buon fine:

```tsx
  const { value: sent, pending, run } = useMirroredValue<string[]>([]);
```

e nel `onClick` del bottone di invio (riga ~76):

```tsx
              onClick={() =>
                run(
                  withAppended(sent, (id) => id, friendId),
                  () => recommendTitle(friendId, titleId, mediaType, message),
                  { message: "Consiglio inviato" },
                )
              }
```

La firma è `recommendTitle(toUserId, titleId, mediaType, message)`. Il destinatario che sta in `sent` mostra "Inviato ✓" al posto del bottone.

- [ ] **Step 4: Verifica e commit**

```bash
cd /d/PROGETTI/Zapp-deploy && pnpm typecheck && pnpm lint
git add src/components/title/ReviewsClient.tsx src/components/title/RecommendSheet.tsx
git commit -m "feat(social): recensioni, commenti e consigli senza attesa"
```

---

### Task 8: Il profilo

**Files:**
- Modify: `src/components/profile/AvatarPicker.tsx`
- Modify: `src/app/(app)/profile/ProfileEditor.tsx`

**Interfaces:**
- Consumes: `useMirroredValue` dal Task 1.
- Produces: niente.

- [ ] **Step 1: `AvatarPicker` — l'avatar cambia mentre si salva**

`currentUrl` è già uno stato locale. Passa all'helper, così l'errore torna indietro da solo. Da:

```tsx
  const [currentUrl, setCurrentUrl] = useState(initialUrl);
```

A:

```tsx
  const {
    value: currentUrl,
    pending,
    run,
    set: setCurrentUrl,
  } = useMirroredValue(initialUrl);
```

e la scelta di un avatar predefinito (riga ~193):

```tsx
    run(presetAvatarUrl(id, background), () => saveAvatarPreset(id, background), {
      message: "Avatar aggiornato",
    });
```

`presetAvatarUrl(id, bg)` è già esportata da `src/lib/avatars.ts` e compone `/avatars/<id>.png?bg=…`: il componente la importa se non lo fa già. Il caricamento di una foto (`saveAvatarUrl`) resta com'è: l'URL vero si conosce solo dopo l'upload.

- [ ] **Step 2: `ProfileEditor` — l'interruttore privacy si muove al tocco**

Da:

```tsx
  const [pending, startTransition] = useTransition();
  const [privacy, setPrivacy] = useState(isPrivate);
```

A:

```tsx
  const { value: privacy, pending, run } = useMirroredValue(isPrivate);
```

e il comando (riga ~192):

```tsx
          onClick={() => {
            const next = !privacy;
            run(next, () => setProfilePrivacy(next), {
              message: next ? "Profilo privato" : "Profilo pubblico",
            });
          }}
```

`updateProfile` (il modulo nome/username) resta com'è: è un salvataggio con validazione lato server, dove mostrare il risultato prima della risposta sarebbe una bugia.

- [ ] **Step 3: Verifica e commit**

```bash
cd /d/PROGETTI/Zapp-deploy && pnpm typecheck && pnpm lint
git add src/components/profile/AvatarPicker.tsx "src/app/(app)/profile/ProfileEditor.tsx"
git commit -m "feat(profile): avatar e privacy cambiano al tocco"
```

---

### Task 9: La libreria si riempie durante l'import

**Files:**
- Modify: `src/components/import/ImportProvider.tsx:168-213`

**Interfaces:**
- Consumes: niente dal Task 1 (qui non c'è ottimismo, c'è una sincronizzazione).
- Produces: niente.

Oggi `router.refresh()` gira una volta sola, a fine import. Deve girare a ogni blocco scritto, con due guardie: mai due refresh sovrapposti, non più di uno ogni 2 secondi.

- [ ] **Step 1: Aggiungere le guardie**

Vicino agli altri `useRef` del provider:

```tsx
  /** Ultimo `router.refresh()` durante l'import: le liste si aggiornano a blocchi. */
  const lastRefreshRef = useRef(0);
  const refreshingRef = useRef(false);
  const REFRESH_EVERY_MS = 2000;

  const refreshLists = useCallback(() => {
    const now = Date.now();
    if (refreshingRef.current || now - lastRefreshRef.current < REFRESH_EVERY_MS) return;
    refreshingRef.current = true;
    lastRefreshRef.current = now;
    startTransition(() => {
      router.refresh();
      refreshingRef.current = false;
    });
  }, [router]);
```

`startTransition` qui è quello importato da `react` (`import { startTransition } from "react"`), non un hook: il provider non deve rirenderizzare per questo.

- [ ] **Step 2: Chiamarla a ogni blocco scritto**

Dentro il ciclo dei blocchi di scrittura, dopo `setJob(...)`:

```tsx
              const done = Math.min(items.length, (i + 1) * CONFIRM_CHUNK_SIZE);
              setJob((j) => (j ? { ...j, done, written, skipped } : j));
              // la libreria e la home si riempiono mentre l'import va avanti
              refreshLists();
```

- [ ] **Step 3: Lasciare il refresh finale**

Il `router.refresh()` alla fine resta com'è: è l'unico che deve girare sempre, anche se l'ultimo blocco è arrivato entro i 2 secondi dal precedente. Aggiungere `lastRefreshRef.current = 0;` subito prima, così la guardia non lo salta.

- [ ] **Step 4: Verifica e commit**

```bash
cd /d/PROGETTI/Zapp-deploy && pnpm typecheck && pnpm lint
git add src/components/import/ImportProvider.tsx
git commit -m "feat(import): la libreria si riempie mentre l'import gira"
```

---

### Task 10: Migrare i tre già ottimistici e verificare tutto

**Files:**
- Modify: `src/components/title/TitleActionsBar.tsx`
- Modify: `src/components/cinema/FavoriteStar.tsx`
- Modify: `src/components/social/ActivityLikeButton.tsx`

**Interfaces:**
- Consumes: `useOptimisticValue`, `useMirroredValue` dal Task 1.
- Produces: niente.

Questi tre funzionano già; passano all'helper perché il comportamento (messaggio d'errore, annulla, `pending`) sia scritto in un posto solo. **Il comportamento visibile non deve cambiare.**

- [ ] **Step 1: `TitleActionsBar`**

Sostituire:

```tsx
  const [optimisticEntry, applyOptimistic] = useOptimistic(
    entry,
    (_current, next: EntrySnapshot | null) => next,
  );
```

e la funzione `run` interna con:

```tsx
  const { value: optimisticEntry, pending, run } = useOptimisticValue(entry);
```

adattando le chiamate esistenti alla firma `run(next, action, { message, undo })`. Il testo dell'errore era già `"Qualcosa è andato storto. Riprova."`: ora arriva da `DEFAULT_ERROR`.

- [ ] **Step 2: `FavoriteStar`**

La stella sta anche sulle schede titolo, dove `toggleFavoriteCinema` rivalida `/cinema` e non la pagina aperta: **`useMirroredValue`**, che è esattamente quello che il componente fa oggi a mano con `useState` + `useEffect`.

```tsx
  const { value: on, pending, run } = useMirroredValue(favorite);

  function toggle() {
    if (pending) return;
    const next = !on;
    run(next, () => toggleFavoriteCinema(cinemaId), {
      onDone: () => {
        if (refresh) router.refresh();
      },
    });
  }
```

`onChange?.(r.favoriteIds)` ha bisogno del risultato: tenerlo dentro l'azione passata a `run`:

```tsx
    run(
      next,
      async () => {
        const r = await toggleFavoriteCinema(cinemaId);
        if (r.ok) onChange?.(r.favoriteIds);
        return r;
      },
      { onDone: () => { if (refresh) router.refresh(); } },
    );
```

- [ ] **Step 3: `ActivityLikeButton`**

Il feed non viene rirenderizzato dal like: `useMirroredValue` sullo stesso oggetto di oggi.

```tsx
  const { value: state, run } = useMirroredValue({ liked, count });

  function toggle() {
    const next = !state.liked;
    run(
      { liked: next, count: Math.max(0, state.count + (next ? 1 : -1)) },
      () => toggleActivityLike(activityId, next),
    );
  }
```

- [ ] **Step 4: Verifica completa**

```bash
cd /d/PROGETTI/Zapp-deploy && pnpm test && pnpm typecheck && pnpm lint && NEXT_DIST_DIR=.next-istantanei pnpm build
```

Atteso: test verdi, nessun errore di tipo, nessun errore di lint, build completata.

- [ ] **Step 5: Prova nell'app**

```bash
cd /d/PROGETTI/Zapp-deploy && NEXT_DIST_DIR=.next-istantanei pnpm exec next start -p 3399
```

Con l'app aperta, controllare i tre flussi che l'utente ha chiesto — il criterio è uno solo: **fra il tocco e il cambiamento sullo schermo non si aspetta il server**.

1. Home, card della serata → tondo in alto a destra → "Rimuovi il biglietto": i bottoni cambiano subito. Poi "Rimuovi la serata": il banner sparisce subito.
2. Libreria aperta durante un import Netflix: la griglia cresce a blocchi senza ricaricare.
3. Scheda titolo → "Voglio vederlo"; poi Libreria → menu di una card → "Visto": la card lascia la scheda all'istante.

- [ ] **Step 6: Commit finale**

```bash
cd /d/PROGETTI/Zapp-deploy && rm -rf .next-istantanei
git add src/components/title/TitleActionsBar.tsx src/components/cinema/FavoriteStar.tsx src/components/social/ActivityLikeButton.tsx
git commit -m "refactor(ui): un solo helper per tutti gli aggiornamenti ottimistici"
```

---

## Note per chi esegue

- **Leggere il file prima di modificarlo.** Alcuni frammenti qui sopra citano numeri di riga del 2026-09-07: se non combaciano, vale il codice, non il numero.
- **`useOptimisticValue` o `useMirroredValue`?** Una sola domanda: l'azione rivalida la rotta che l'utente sta guardando? Sì → `useOptimisticValue`. No (rivalida altre rotte, o il componente vive in un portal sopra una pagina che non cambia) → `useMirroredValue`. In dubbio, `useMirroredValue`: al massimo tiene un valore vecchio per un istante in più, mentre l'altro sbaglierebbe mostrando un salto indietro.
- **Non toccare `revalidatePath`** in nessuna Server Action: è fuori perimetro e cambierebbe cosa si aggiorna, non quando.
- **Niente test di componenti:** Vitest gira in `environment: "node"`. L'unico task con test è il primo.
