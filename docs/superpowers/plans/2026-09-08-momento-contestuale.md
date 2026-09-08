# Il momento giusto — piano di implementazione

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Aggiungere alla home una fila di consigli scelta da ora, giorno e meteo, con sei pillole di mood che la riscrivono senza ricaricare la pagina.

**Architecture:** Tre funzioni pure (`context`, `recipes`, `weather-code`) decidono *quale* lista mostrare; un modulo server (`shelf`) la riempie con una `discover` TMDB in cache condivisa e la riordina con l'affinità del motore di ranking già esistente (fase C). La UI riusa `ItemShelf`/`PosterCard`; il mood è stato di sessione in un componente client che chiede i titoli a `/api/moment`.

**Tech Stack:** Next.js 15 App Router (RSC), TypeScript strict, Tailwind 4, Supabase (`@supabase/ssr`), TMDB v3, Vitest, pnpm.

**Spec:** `docs/superpowers/specs/2026-09-08-momento-contestuale-design.md`

## Global Constraints

- **Lingua**: UI e commenti in italiano. Nomi di funzione e tipo in italiano dove il codice esistente lo fa (`pickMoment`, `MOMENTI`, `Recipe`, `perTipo`).
- **Nessuna migration, nessuna tabella, nessun tipo da rigenerare.** Il mood non si salva da nessuna parte.
- **Nessuna chiamata esterna dal browser.** Open-Meteo lo chiama solo il server: la CSP di `next.config.ts` **non si tocca**.
- **`import "server-only"`** in testa a ogni modulo che parla con rete o DB. Le funzioni pure **non** devono dichiararlo, altrimenti Vitest non le può importare (è il motivo per cui il codice WMO sta in `weather-code.ts` e non dentro `weather.ts`, esattamente come `rate-limit-window.ts` sta fuori da `rate-limit.ts`).
- **Ogni chiamata esterna ha un rate limit** dichiarato al punto di chiamata (`src/lib/rate-limit.ts`).
- **Ogni rotta HTTP** valida i suoi argomenti contro un elenco chiuso, risponde con messaggi generici e non lascia uscire coordinate.
- **Il meteo non è mai bloccante**: qualunque errore vale `meteo: null` e la fila esce lo stesso.
- Prettier: virgolette doppie, virgole finali, `printWidth` 90.
- Soglie dei candidati, identiche al motore: film `vote_count ≥ 300` e `vote_average ≥ 6`; serie `vote_count ≥ 100`, `vote_average ≥ 6.5`, `with_type=2|4`.
- **`ZappScore` è su 0-10**, non 0-100 (`title_ratings.zapp_score` vale 9.2 per il titolo più alto).
- **`PosterCard` mostra "per te N%" dentro la riga del voto**: uno `ShelfItem` senza `rating` non mostra l'affinità nemmeno se è stata calcolata.
- Nella `discover` di TMDB, fra i generi `,` significa **e** e `|` significa **o**: le ricette vogliono `|`.

---

### Task 0: Preparare il worktree

Il worktree `D:\PROGETTI\Zapp-momento` è stato creato da `origin/main` ma non ha né dipendenze né variabili d'ambiente (`.env.local` è gitignored e non viene copiato dal worktree principale).

**Files:**
- Nessuno modificato.

- [ ] **Step 1: Installare le dipendenze**

```bash
cd D:/PROGETTI/Zapp-momento
pnpm install
```

- [ ] **Step 2: Portare le variabili d'ambiente**

```bash
cp D:/PROGETTI/Zapp/.env.local D:/PROGETTI/Zapp-momento/.env.local
```

- [ ] **Step 3: Verificare che la base sia verde prima di toccarla**

```bash
pnpm test && pnpm typecheck
```
Expected: test verdi, `tsc` senza errori. Se qui è già rosso, fermarsi e dirlo: non è colpa di questo piano.

---

### Task 1: Il contesto (ora, giorno, mese nel fuso di Roma)

**Files:**
- Create: `src/lib/moment/context.ts`
- Test: `src/lib/moment/context.test.ts`

**Interfaces:**
- Consumes: niente.
- Produces: `type Meteo = "pioggia" | "neve" | "sereno" | "caldo" | "freddo"`; `interface MomentContext { ora: number; giorno: number; mese: number; meteo: Meteo | null }`; `function contextAt(now: Date, meteo?: Meteo | null): MomentContext`; `const FUSO = "Europe/Rome"`.

- [ ] **Step 1: Scrivere il test che fallisce**

Crea `src/lib/moment/context.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { contextAt } from "./context";

describe("contextAt", () => {
  it("legge l'ora di Roma, non quella del server", () => {
    // Le funzioni Vercel girano in UTC: 21:40Z del 21 giugno sono le 23:40 a Roma
    // (ora legale, +2). Con `getHours()` questo caso diceva "sera", non "notte fonda".
    const c = contextAt(new Date("2026-06-21T21:40:00Z"));
    expect(c.ora).toBe(23);
    expect(c.giorno).toBe(0); // domenica
    expect(c.mese).toBe(6);
  });

  it("segue anche il cambio di data dell'ora solare", () => {
    // 23:30Z del 6 gennaio = 00:30 del 7 a Roma (+1): cambia l'ora *e* il giorno
    const c = contextAt(new Date("2026-01-06T23:30:00Z"));
    expect(c.ora).toBe(0);
    expect(c.giorno).toBe(3); // mercoledì 7 gennaio 2026
    expect(c.mese).toBe(1);
  });

  it("porta con sé il meteo che gli viene passato", () => {
    expect(contextAt(new Date("2026-06-21T21:40:00Z"), "pioggia").meteo).toBe("pioggia");
    expect(contextAt(new Date("2026-06-21T21:40:00Z")).meteo).toBeNull();
  });
});
```

- [ ] **Step 2: Lanciarlo e vederlo fallire**

```bash
pnpm exec vitest run src/lib/moment/context.test.ts
```
Expected: FAIL, `Failed to resolve import "./context"`.

- [ ] **Step 3: Scrivere l'implementazione minima**

Crea `src/lib/moment/context.ts`:

```ts
/**
 * Che momento è, per l'utente: ora, giorno e mese nel fuso italiano, più il meteo
 * quando c'è. Puro apposta — è la funzione che decide quale fila vede l'utente, e va
 * provata a ore e date scelte, non a quelle dell'orologio di chi lancia i test.
 */

export type Meteo = "pioggia" | "neve" | "sereno" | "caldo" | "freddo";

/** Zapp è in italiano, per l'Italia: il fuso è uno solo (vedi la regola in CLAUDE.md). */
export const FUSO = "Europe/Rome";

export interface MomentContext {
  /** 0-23, nel fuso di Roma. */
  ora: number;
  /** 0 = domenica, 6 = sabato. */
  giorno: number;
  /** 1-12. */
  mese: number;
  meteo: Meteo | null;
}

const GIORNI: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

/**
 * **L'ora non è quella del server.** Le funzioni girano in `fra1` con orologio UTC:
 * alle 23:40 italiane `new Date().getHours()` risponde 21, e "Notte fonda" non sarebbe
 * uscita mai mentre "Pausa pranzo" sarebbe comparsa alle 14 vere.
 */
export function contextAt(now: Date, meteo: Meteo | null = null): MomentContext {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: FUSO,
    hour: "2-digit",
    hour12: false,
    weekday: "short",
    month: "numeric",
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return {
    // `hour12: false` può rendere "24" a mezzanotte in alcune implementazioni di ICU
    ora: Number(get("hour")) % 24,
    giorno: GIORNI[get("weekday")] ?? 0,
    mese: Number(get("month")),
    meteo,
  };
}
```

- [ ] **Step 4: Lanciare i test e vederli passare**

```bash
pnpm exec vitest run src/lib/moment/context.test.ts
```
Expected: 3 test verdi.

- [ ] **Step 5: Commit**

```bash
git add src/lib/moment/context.ts src/lib/moment/context.test.ts
git commit -m "feat(momento): che ore sono per l'utente, non per il server"
```

---

### Task 2: Le ricette (dieci momenti, due ripieghi, sei mood)

**Files:**
- Create: `src/lib/moment/recipes.ts`
- Test: `src/lib/moment/recipes.test.ts`

**Interfaces:**
- Consumes: `MomentContext`, `Meteo` da `./context`.
- Produces: `interface Recipe { key: string; titolo: string; generi: number[]; senzaGeneri?: number[]; keyword?: number[]; runtimeMax?: number; runtimeMin?: number; soloFilm?: boolean }`; `interface Mood extends Recipe { pillola: string }`; `const MOMENTI`; `const SEMPRE: Recipe`; `const MOODS: Mood[]`; `function pickMoment(c: MomentContext): Recipe`; `function moodByKey(key: unknown): Mood | null`.

- [ ] **Step 1: Scrivere il test che fallisce**

Crea `src/lib/moment/recipes.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { Meteo, MomentContext } from "./context";
import { MOODS, moodByKey, pickMoment } from "./recipes";

function ctx(p: Partial<MomentContext>): MomentContext {
  return { ora: 21, giorno: 2, mese: 5, meteo: null, ...p };
}

describe("pickMoment", () => {
  it("la domenica di pioggia batte sia la sera di pioggia sia la sera generica", () => {
    expect(pickMoment(ctx({ giorno: 0, ora: 21, meteo: "pioggia" })).key).toBe(
      "domenica-pioggia",
    );
  });

  it("il meteo forte batte la fascia oraria", () => {
    expect(pickMoment(ctx({ giorno: 2, ora: 21, meteo: "pioggia" })).key).toBe(
      "pioggia-sera",
    );
    expect(pickMoment(ctx({ giorno: 2, ora: 21, meteo: null })).key).toBe("sera");
  });

  it("la notte fonda scavalca la mezzanotte", () => {
    expect(pickMoment(ctx({ ora: 23 })).key).toBe("notte-fonda");
    expect(pickMoment(ctx({ ora: 2 })).key).toBe("notte-fonda");
    expect(pickMoment(ctx({ ora: 5 })).key).not.toBe("notte-fonda");
  });

  it("l'aperitivo è del venerdì, non di tutti i giorni", () => {
    expect(pickMoment(ctx({ giorno: 5, ora: 18 })).key).toBe("aperitivo-venerdi");
    expect(pickMoment(ctx({ giorno: 4, ora: 18 })).key).not.toBe("aperitivo-venerdi");
  });

  it("c'è sempre un vincitore, per qualunque combinazione", () => {
    const meteo: (Meteo | null)[] = [null, "pioggia", "neve", "sereno", "caldo", "freddo"];
    for (let ora = 0; ora < 24; ora++) {
      for (let giorno = 0; giorno < 7; giorno++) {
        for (let mese = 1; mese <= 12; mese++) {
          for (const m of meteo) {
            const r = pickMoment({ ora, giorno, mese, meteo: m });
            expect(r.titolo.length).toBeGreaterThan(0);
            expect(r.generi.length).toBeGreaterThan(0);
          }
        }
      }
    }
  });
});

describe("moodByKey", () => {
  it("riconosce solo i mood dell'elenco", () => {
    expect(moodByKey("leggero")?.titolo).toBe("Qualcosa di leggero");
    expect(moodByKey("../../etc/passwd")).toBeNull();
    expect(moodByKey(null)).toBeNull();
    expect(moodByKey(42)).toBeNull();
  });

  it("ogni mood ha pillola, titolo e almeno un genere", () => {
    for (const m of MOODS) {
      expect(m.pillola.length).toBeGreaterThan(0);
      expect(m.titolo.length).toBeGreaterThan(0);
      expect(m.generi.length).toBeGreaterThan(0);
    }
    expect(new Set(MOODS.map((m) => m.key)).size).toBe(MOODS.length);
  });
});
```

- [ ] **Step 2: Lanciarlo e vederlo fallire**

```bash
pnpm exec vitest run src/lib/moment/recipes.test.ts
```
Expected: FAIL, `Failed to resolve import "./recipes"`.

- [ ] **Step 3: Scrivere l'implementazione**

Crea `src/lib/moment/recipes.ts`:

```ts
import type { Meteo, MomentContext } from "./context";

/**
 * I momenti e i mood sono **dati**, non codice: quale fila compare in home e come si
 * chiama è una scelta di prodotto, e va letta in un file solo (stessa ragione per cui
 * `src/lib/rank/rails.ts` è puro e testato).
 *
 * Gli id dei generi sono quelli TMDB **dei film**; `genreIdsFor` li traduce per le
 * serie al momento della `discover`.
 */

export interface Recipe {
  /** Chiave stabile: entra nell'URL del mood e nei test. */
  key: string;
  /** Il titolo della fila, in italiano. */
  titolo: string;
  /** Generi in **or** fra loro. */
  generi: number[];
  /** Generi esclusi: una domenica di pioggia non è un horror. */
  senzaGeneri?: number[];
  /** Keyword TMDB: un di più, mai la spina dorsale (vedi la spec, §3). */
  keyword?: number[];
  runtimeMax?: number;
  runtimeMin?: number;
  /** Vero per i momenti che non hanno senso per una serie. */
  soloFilm?: boolean;
}

export interface Mood extends Recipe {
  /** Il testo della pillola. */
  pillola: string;
}

interface Momento {
  quando: (c: MomentContext) => boolean;
  recipe: Recipe;
}

const bagnato = (m: Meteo | null) => m === "pioggia" || m === "neve";

/** Fascia oraria `[da, a)`, che sa scavalcare la mezzanotte (23 → 5). */
const fra = (ora: number, da: number, a: number) =>
  da <= a ? ora >= da && ora < a : ora >= da || ora < a;

/**
 * L'ordine è la priorità: **meteo forte > fascia oraria speciale > giorno > sera**.
 * La prima corrispondenza vince, quindi spostare una riga cambia il prodotto.
 */
export const MOMENTI: Momento[] = [
  {
    quando: (c) => c.giorno === 0 && bagnato(c.meteo),
    recipe: {
      key: "domenica-pioggia",
      titolo: "Per una domenica di pioggia",
      generi: [10751, 14, 35, 18],
      senzaGeneri: [27, 53],
    },
  },
  {
    quando: (c) => bagnato(c.meteo) && fra(c.ora, 12, 19),
    recipe: { key: "pioggia-pomeriggio", titolo: "Fuori piove", generi: [12, 14, 10751, 16] },
  },
  {
    quando: (c) => bagnato(c.meteo) && fra(c.ora, 19, 23),
    recipe: { key: "pioggia-sera", titolo: "Una sera di pioggia", generi: [18, 9648, 14] },
  },
  {
    quando: (c) => fra(c.ora, 23, 5),
    recipe: { key: "notte-fonda", titolo: "Notte fonda", generi: [27, 53, 9648] },
  },
  {
    quando: (c) => c.giorno >= 1 && c.giorno <= 5 && fra(c.ora, 12, 15),
    recipe: { key: "pausa-pranzo", titolo: "Pausa pranzo", generi: [35, 99], runtimeMax: 100 },
  },
  {
    quando: (c) => c.giorno === 5 && fra(c.ora, 17, 21),
    recipe: {
      key: "aperitivo-venerdi",
      titolo: "Aperitivo del venerdì",
      generi: [35, 10749],
      runtimeMax: 105,
    },
  },
  {
    quando: (c) => (c.giorno === 0 || c.giorno === 6) && fra(c.ora, 8, 12),
    recipe: { key: "mattina-weekend", titolo: "Mattina pigra", generi: [16, 10751, 35] },
  },
  {
    quando: (c) => c.giorno === 6 && fra(c.ora, 20, 24),
    recipe: { key: "sabato-sera", titolo: "Sabato sera", generi: [28, 12, 878, 14] },
  },
  {
    quando: (c) =>
      c.mese >= 6 &&
      c.mese <= 8 &&
      fra(c.ora, 20, 24) &&
      (c.meteo === "caldo" || c.meteo === "sereno"),
    recipe: { key: "sera-estate", titolo: "Sera d'estate", generi: [12, 28, 35] },
  },
  {
    quando: (c) => (c.mese === 12 || c.mese <= 2) && c.meteo === "freddo",
    recipe: { key: "freddo-inverno", titolo: "Freddo fuori", generi: [18, 10749, 14] },
  },
  {
    quando: (c) => fra(c.ora, 19, 23),
    recipe: { key: "sera", titolo: "Film della sera", generi: [18, 53, 80, 9648] },
  },
];

/** Il ripiego finale: la fila non sparisce mai, così non c'è una home "senza fila". */
export const SEMPRE: Recipe = {
  key: "sempre",
  titolo: "Da vedere adesso",
  generi: [18, 35, 28, 878],
};

export function pickMoment(c: MomentContext): Recipe {
  return MOMENTI.find((m) => m.quando(c))?.recipe ?? SEMPRE;
}

/**
 * I sei mood. Vincono su qualunque momento, e durano quanto la sessione: un mood è uno
 * stato d'animo di stasera, non un gusto, e non entra in `user_taste`.
 */
export const MOODS: Mood[] = [
  {
    key: "leggero",
    pillola: "Leggero",
    titolo: "Qualcosa di leggero",
    generi: [35, 10751, 16],
    senzaGeneri: [27, 53, 10752],
    runtimeMax: 110,
  },
  { key: "triste", pillola: "Triste", titolo: "Da piangerci sopra", generi: [18, 10749] },
  { key: "carico", pillola: "Carico", titolo: "Carica adrenalina", generi: [28, 53, 12] },
  {
    key: "cuore-infranto",
    pillola: "Cuore infranto",
    titolo: "Cuore infranto",
    generi: [10749, 18],
    keyword: [34265],
  },
  { key: "paura", pillola: "Paura", titolo: "Voglia di paura", generi: [27, 9648] },
  {
    key: "cervello-acceso",
    pillola: "Cervello acceso",
    titolo: "Cervello acceso",
    generi: [878, 9648, 53],
    keyword: [362567],
  },
];

/**
 * Il mood arriva da un parametro di query, cioè da chiunque: si confronta con l'elenco
 * e non si interpola da nessuna parte. Sconosciuto → `null`, che la rotta traduce in 400.
 */
export function moodByKey(key: unknown): Mood | null {
  if (typeof key !== "string") return null;
  return MOODS.find((m) => m.key === key) ?? null;
}
```

- [ ] **Step 4: Lanciare i test e vederli passare**

```bash
pnpm exec vitest run src/lib/moment/recipes.test.ts
```
Expected: 7 test verdi.

- [ ] **Step 5: Commit**

```bash
git add src/lib/moment/recipes.ts src/lib/moment/recipes.test.ts
git commit -m "feat(momento): dieci momenti e sei mood, scritti in un file solo"
```

---

### Task 3: Il codice meteo (parte pura)

**Files:**
- Create: `src/lib/moment/weather-code.ts`
- Test: `src/lib/moment/weather-code.test.ts`

**Interfaces:**
- Consumes: `Meteo` da `./context`.
- Produces: `function meteoFromWmo(code: number, temperatura: number | null): Meteo | null`; `function cella(v: number): number`.

- [ ] **Step 1: Scrivere il test che fallisce**

Crea `src/lib/moment/weather-code.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { cella, meteoFromWmo } from "./weather-code";

describe("meteoFromWmo", () => {
  it("riconosce pioggia, neve e sereno dai codici WMO", () => {
    expect(meteoFromWmo(61, 15)).toBe("pioggia"); // pioggia debole
    expect(meteoFromWmo(80, 15)).toBe("pioggia"); // rovesci
    expect(meteoFromWmo(95, 15)).toBe("pioggia"); // temporale
    expect(meteoFromWmo(73, -1)).toBe("neve");
    expect(meteoFromWmo(0, 15)).toBe("sereno");
    expect(meteoFromWmo(45, 15)).toBe("sereno"); // nebbia
  });

  it("la pioggia batte il termometro", () => {
    // 3 °C con la pioggia è una giornata di pioggia, non una giornata fredda
    expect(meteoFromWmo(61, 3)).toBe("pioggia");
    expect(meteoFromWmo(71, 30)).toBe("neve");
  });

  it("la temperatura corregge solo il sereno", () => {
    expect(meteoFromWmo(1, 31)).toBe("caldo");
    expect(meteoFromWmo(1, 2)).toBe("freddo");
    expect(meteoFromWmo(1, null)).toBe("sereno");
  });

  it("un codice che non conosce non inventa un meteo", () => {
    expect(meteoFromWmo(120, 15)).toBeNull();
    expect(meteoFromWmo(Number.NaN, 15)).toBeNull();
  });
});

describe("cella", () => {
  it("arrotonda a 0,1 gradi, cioè a ~11 km", () => {
    expect(cella(45.4642)).toBe(45.5);
    expect(cella(9.19)).toBe(9.2);
    // due punti della stessa città cadono nella stessa cella: una chiamata sola
    expect(cella(45.47)).toBe(cella(45.462));
  });
});
```

- [ ] **Step 2: Lanciarlo e vederlo fallire**

```bash
pnpm exec vitest run src/lib/moment/weather-code.test.ts
```
Expected: FAIL, `Failed to resolve import "./weather-code"`.

- [ ] **Step 3: Scrivere l'implementazione**

Crea `src/lib/moment/weather-code.ts`:

```ts
import type { Meteo } from "./context";

/**
 * La parte pura del meteo. Sta fuori da `weather.ts` perché quello dichiara
 * `server-only` e Vitest non potrebbe importarlo: stessa divisione fra
 * `rate-limit.ts` e `rate-limit-window.ts`.
 */

/** Sopra questa temperatura una serata è "caldo", sotto l'altra è "freddo". */
const CALDO = 28;
const FREDDO = 4;

/**
 * Codice WMO di Open-Meteo → una delle categorie che le ricette conoscono.
 * La temperatura corregge **solo** il sereno: sotto la pioggia il termometro non conta.
 */
export function meteoFromWmo(code: number, temperatura: number | null): Meteo | null {
  if (!Number.isFinite(code)) return null;
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return "neve";
  if (
    (code >= 51 && code <= 67) ||
    (code >= 80 && code <= 82) ||
    (code >= 95 && code <= 99)
  ) {
    return "pioggia";
  }
  const sereno = (code >= 0 && code <= 3) || code === 45 || code === 48;
  if (!sereno) return null;
  if (temperatura !== null && temperatura >= CALDO) return "caldo";
  if (temperatura !== null && temperatura <= FREDDO) return "freddo";
  return "sereno";
}

/**
 * Coordinata arrotondata a 0,1° (~11 km): è la chiave della cache del meteo. Senza,
 * il costo verso Open-Meteo crescerebbe col numero di utenti invece che col numero di
 * città.
 */
export function cella(v: number): number {
  return Math.round(v * 10) / 10;
}
```

- [ ] **Step 4: Lanciare i test e vederli passare**

```bash
pnpm exec vitest run src/lib/moment/weather-code.test.ts
```
Expected: 5 test verdi.

- [ ] **Step 5: Commit**

```bash
git add src/lib/moment/weather-code.ts src/lib/moment/weather-code.test.ts
git commit -m "feat(momento): codici WMO e celle da 11 km, con i loro test"
```

---

### Task 4: Il meteo vero (Open-Meteo, solo dal server)

**Files:**
- Create: `src/lib/moment/weather.ts`

**Interfaces:**
- Consumes: `cella`, `meteoFromWmo` da `./weather-code`; `Meteo` da `./context`; `getViewer` da `@/lib/auth/viewer`; `getViewerLocation` da `@/lib/cinema/queries` (`{ lat, lng, label, provinceSlug }`); `rateLimit(key, limit, windowSeconds)` da `@/lib/rate-limit`.
- Produces: `async function getMeteo(): Promise<{ meteo: Meteo | null; citta: string | null }>`.

- [ ] **Step 1: Scrivere l'implementazione**

Crea `src/lib/moment/weather.ts`:

```ts
import "server-only";

import { unstable_cache } from "next/cache";
import { getViewer } from "@/lib/auth/viewer";
import { getViewerLocation } from "@/lib/cinema/queries";
import { rateLimit } from "@/lib/rate-limit";
import type { Meteo } from "./context";
import { cella, meteoFromWmo } from "./weather-code";

/**
 * Il meteo di dove sta l'utente, chiesto a Open-Meteo (gratis, senza chiave) **solo
 * dal server**: nessuna chiamata dal browser, quindi la CSP resta com'è e le
 * coordinate non escono mai verso il client.
 *
 * Le coordinate arrivano da `user_locations`, la tabella privata che l'utente ha già
 * riempito per il cinema. Chi non ha dato la posizione non vede niente di diverso: la
 * fila esce lo stesso, scelta da ora e giorno.
 */

const TIMEOUT_MS = 3_000;
/** Mezz'ora: il tempo cambia, ma non fra due aperture dell'app. */
const TTL_S = 1_800;
const LIMITE = 20;
const FINESTRA_S = 60;

async function fetchMeteo(lat: number, lng: number): Promise<Meteo | null> {
  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.searchParams.set("latitude", String(lat));
  url.searchParams.set("longitude", String(lng));
  url.searchParams.set("current", "temperature_2m,weather_code");
  url.searchParams.set("timezone", "Europe/Rome");

  const res = await fetch(url, {
    signal: AbortSignal.timeout(TIMEOUT_MS),
    cache: "no-store",
  });
  if (!res.ok) return null;
  const data = (await res.json()) as {
    current?: { temperature_2m?: number; weather_code?: number };
  };
  const code = data.current?.weather_code;
  if (typeof code !== "number") return null;
  const t =
    typeof data.current?.temperature_2m === "number" ? data.current.temperature_2m : null;
  return meteoFromWmo(code, t);
}

export async function getMeteo(): Promise<{ meteo: Meteo | null; citta: string | null }> {
  const [user, loc] = await Promise.all([getViewer(), getViewerLocation()]);
  if (!loc) return { meteo: null, citta: null };
  // La cache per cella fa quasi tutto il lavoro; il limite è la rete di sicurezza.
  if (user && !(await rateLimit(`meteo:${user.id}`, LIMITE, FINESTRA_S))) {
    return { meteo: null, citta: loc.label };
  }

  const lat = cella(loc.lat);
  const lng = cella(loc.lng);
  // `unstable_cache` non memorizza una promessa che si rompe: il `catch` sta fuori,
  // così un errore di rete vale `null` e non porta giù la home.
  const meteo = await unstable_cache(() => fetchMeteo(lat, lng), ["meteo", String(lat), String(lng)], {
    revalidate: TTL_S,
  })().catch(() => null);

  return { meteo, citta: loc.label };
}
```

- [ ] **Step 2: Verificare che compili**

```bash
pnpm typecheck
```
Expected: nessun errore.

- [ ] **Step 3: Provare la chiamata vera, una volta**

```bash
curl -s "https://api.open-meteo.com/v1/forecast?latitude=45.5&longitude=9.2&current=temperature_2m,weather_code&timezone=Europe%2FRome"
```
Expected: un JSON con `current.weather_code` e `current.temperature_2m`. Se la forma è diversa da quella letta in `fetchMeteo`, correggere il parsing **prima** di andare avanti.

- [ ] **Step 4: Commit**

```bash
git add src/lib/moment/weather.ts
git commit -m "feat(momento): il meteo di dove sei, chiesto solo dal server"
```

---

### Task 5: La `discover` per ricetta

**Files:**
- Modify: `src/lib/tmdb/client.ts` (aggiunta in fondo, accanto a `discoverByKeyword`)
- Modify: `src/lib/rank/candidates.ts` (esportare `daTmdb`, riga 55)

**Interfaces:**
- Consumes: `tmdbFetch`, `TmdbPaginated`, `TmdbMultiResult` già nel file.
- Produces: `interface DiscoverRecipe { generi: number[]; senzaGeneri?: number[]; keyword?: number[]; runtimeMax?: number; runtimeMin?: number }`; `async function discoverForRecipe(type: "movie" | "tv", recipe: DiscoverRecipe, options?: { conKeyword?: boolean }): Promise<TmdbPaginated<TmdbMultiResult>>`; `function candidatiDaTmdb(results: TmdbMultiResult[] | undefined, type: MediaType): RankCandidate[]` (era `daTmdb`, privata).

- [ ] **Step 1: Esportare la conversione dei candidati**

In `src/lib/rank/candidates.ts` rinomina la funzione privata `daTmdb` (riga 55) in `candidatiDaTmdb` e **esportala**, aggiornando le due chiamate nel file:

```ts
/**
 * Un risultato TMDB come lo vuole il motore. Esportata perché la fila del momento
 * (`src/lib/moment/shelf.ts`) pesca da `discover` esattamente come questo modulo: due
 * copie della stessa conversione si sarebbero disallineate al primo campo nuovo.
 */
export function candidatiDaTmdb(
  results: TmdbMultiResult[] | undefined,
  type: MediaType,
): RankCandidate[] {
```

Poi:

```bash
grep -n "daTmdb" src/lib/rank/candidates.ts
```
Expected: solo `candidatiDaTmdb`, nessun `daTmdb` rimasto.

- [ ] **Step 2: Aggiungere `discoverForRecipe`**

In fondo a `src/lib/tmdb/client.ts`:

```ts
/** I filtri di una ricetta del momento, con i generi già tradotti per il tipo. */
export interface DiscoverRecipe {
  generi: number[];
  senzaGeneri?: number[];
  keyword?: number[];
  runtimeMax?: number;
  runtimeMin?: number;
}

/**
 * Le stesse soglie del motore di ranking: un consiglio è un titolo che qualcuno ha già
 * visto e apprezzato, non una novità qualsiasi.
 */
const RECIPE_SOGLIE = {
  movie: { voti: 300, voto: 6 },
  tv: { voti: 100, voto: 6.5 },
} as const;

/**
 * I candidati di un momento ("Per una domenica di pioggia") o di un mood.
 * `revalidate: 3600` e nessun parametro personale: la cache di Next è **condivisa fra
 * tutti gli utenti**, quindi un momento attivo costa una chiamata l'ora per tipo, non
 * una per visita.
 */
export async function discoverForRecipe(
  type: "movie" | "tv",
  recipe: DiscoverRecipe,
  options: { conKeyword?: boolean } = {},
): Promise<TmdbPaginated<TmdbMultiResult>> {
  const soglie = RECIPE_SOGLIE[type];
  const params: Record<string, string> = {
    // `|` = o, `,` = e: una ricetta vuole l'unione dei suoi generi, non l'intersezione
    with_genres: recipe.generi.join("|"),
    sort_by: "popularity.desc",
    "vote_count.gte": String(soglie.voti),
    "vote_average.gte": String(soglie.voto),
  };
  if (recipe.senzaGeneri?.length) {
    params.without_genres = recipe.senzaGeneri.join(",");
  }
  if (options.conKeyword && recipe.keyword?.length) {
    params.with_keywords = recipe.keyword.join("|");
  }
  if (recipe.runtimeMax) params["with_runtime.lte"] = String(recipe.runtimeMax);
  if (recipe.runtimeMin) params["with_runtime.gte"] = String(recipe.runtimeMin);
  // niente talk show né wrestling fra i consigli: solo serie sceneggiate e miniserie
  if (type === "tv") params.with_type = "2|4";

  const data = await tmdbFetch<TmdbPaginated<Omit<TmdbMultiResult, "media_type">>>(
    `discover/${type}`,
    { params, revalidate: 3600 },
  );
  return {
    ...data,
    results: data.results.map((r) => ({ ...r, media_type: type }) as TmdbMultiResult),
  };
}
```

- [ ] **Step 3: Verificare che compili e che i test restino verdi**

```bash
pnpm typecheck && pnpm test
```
Expected: nessun errore, tutti i test verdi (`rank.test.ts` compreso).

- [ ] **Step 4: Commit**

```bash
git add src/lib/tmdb/client.ts src/lib/rank/candidates.ts
git commit -m "feat(momento): una discover per ricetta, con le soglie del motore"
```

---

### Task 6: Riempire e ordinare la fila

**Files:**
- Create: `src/lib/moment/shelf.ts`
- Modify: `src/lib/taste/surfaces.ts` (aggiungere `"home-momento"` a `SURFACES`)

**Interfaces:**
- Consumes: `Recipe` da `./recipes`; `candidatiDaTmdb` da `@/lib/rank/candidates`; `discoverForRecipe` da `@/lib/tmdb/client`; `rankContext(userId, db)` da `@/lib/rank/engine`; `affinity(v, c)` da `@/lib/rank/affinity`; `diversify(items, size)` da `@/lib/rank/diversity`; `toTasteVector(row)` da `@/lib/rank/vector`; `getTasteProfile(userId)` da `@/lib/taste/queries`; `genreIdsFor(type, ids)` da `@/lib/home/hero-rank`; `mixShelf(movie, tv)` da `@/lib/home/shelves`; `ShelfItem` da `@/lib/home/shelves-rank`.
- Produces: `const MOMENT_SIZE = 12`; `interface MomentShelfData { movie: ShelfItem[]; tv: ShelfItem[]; all: ShelfItem[] }`; `async function getMomentShelf(recipe: Recipe): Promise<MomentShelfData>`.

- [ ] **Step 1: Dichiarare la superficie nuova**

In `src/lib/taste/surfaces.ts`, dentro `SURFACES`, subito dopo `"home-continua"`:

```ts
  "home-momento",
```

Serve perché `parseSignal` scarta le superfici che non sono nell'elenco: senza questa riga i segnali della fila nuova non arriverebbero mai alla fase A.

- [ ] **Step 2: Scrivere `shelf.ts`**

Crea `src/lib/moment/shelf.ts`:

```ts
import "server-only";

import { genreIdsFor } from "@/lib/home/hero-rank";
import { mixShelf } from "@/lib/home/shelves";
import type { ShelfItem } from "@/lib/home/shelves-rank";
import { getViewer } from "@/lib/auth/viewer";
import { affinity } from "@/lib/rank/affinity";
import { candidatiDaTmdb } from "@/lib/rank/candidates";
import { diversify } from "@/lib/rank/diversity";
import { rankContext } from "@/lib/rank/engine";
import type { MediaType, RankCandidate, RankContext, RankedItem } from "@/lib/rank/types";
import { toTasteVector, type TasteVector } from "@/lib/rank/vector";
import { createClient } from "@/lib/supabase/server";
import { getTasteProfile } from "@/lib/taste/queries";
import { discoverForRecipe } from "@/lib/tmdb/client";
import type { Recipe } from "./recipes";

/**
 * I titoli della fila del momento.
 *
 * Il **tema** lo sceglie il contesto (che ore sono, che giorno è, se piove); l'**ordine
 * dentro il tema** lo sceglie il gusto, con la stessa `affinity` della fase C. Nessuna
 * fonte nuova: `discoverForRecipe` ha `revalidate: 3600` e nessun parametro personale,
 * quindi la sua cache è condivisa fra tutti gli utenti.
 */

/** Dodici: su desktop cinque copertine finiscono a metà schermo. */
export const MOMENT_SIZE = 12;

export interface MomentShelfData {
  movie: ShelfItem[];
  tv: ShelfItem[];
  all: ShelfItem[];
}

const VUOTA: MomentShelfData = { movie: [], tv: [], all: [] };

function chiave(c: { id: number; mediaType: MediaType }): string {
  return `${c.mediaType}-${c.id}`;
}

function toShelfItem(i: RankedItem): ShelfItem {
  return {
    id: i.id,
    mediaType: i.mediaType,
    title: i.title,
    posterPath: i.posterPath,
    year: i.year,
    // `rating` non è decorativo: `PosterCard` disegna "per te N%" dentro la riga del
    // voto, quindi senza voto l'affinità non compare affatto.
    rating: i.zappScore ?? i.voteAverage,
    affinity: i.percentuale,
    reason: i.motivo,
  };
}

async function perTipo(
  recipe: Recipe,
  type: MediaType,
  ctx: RankContext,
  vettore: TasteVector,
): Promise<ShelfItem[]> {
  // Gli id delle ricette sono quelli dei film: per le serie vanno tradotti.
  const filtri = {
    generi: genreIdsFor(type, recipe.generi),
    senzaGeneri: recipe.senzaGeneri ? genreIdsFor(type, recipe.senzaGeneri) : undefined,
    keyword: recipe.keyword,
    runtimeMax: recipe.runtimeMax,
    runtimeMin: recipe.runtimeMin,
  };

  const [conKeyword, base] = await Promise.all([
    recipe.keyword?.length
      ? discoverForRecipe(type, filtri, { conKeyword: true }).catch(() => null)
      : Promise.resolve(null),
    discoverForRecipe(type, filtri).catch(() => null),
  ]);

  const daKeyword = new Set<string>();
  const candidati: RankCandidate[] = [];
  const visti = new Set<string>();
  for (const [i, page] of [conKeyword, base].entries()) {
    for (const c of candidatiDaTmdb(page?.results, type)) {
      const k = chiave(c);
      if (visti.has(k) || ctx.inLibreria.has(k)) continue;
      visti.add(k);
      if (i === 0) daKeyword.add(k);
      candidati.push(c);
    }
  }
  if (candidati.length === 0) return [];

  const valutati: RankedItem[] = candidati
    .map((c) => {
      const a = affinity(vettore, c);
      return {
        ...c,
        punteggio: a.punteggio,
        percentuale: a.percentuale,
        contributi: a.contributi,
        // Il motivo qui sarebbe rumore: il titolo della fila dice già perché è lì.
        motivo: null as string | null,
      };
    })
    .sort((a, b) => b.punteggio - a.punteggio);

  // I titoli trovati per keyword sono più a tema: restano davanti, e fra loro
  // conservano l'ordine dell'affinità.
  const inTesta = valutati.filter((c) => daKeyword.has(chiave(c)));
  const resto = valutati.filter((c) => !daKeyword.has(chiave(c)));
  return diversify([...inTesta, ...resto], MOMENT_SIZE).map(toShelfItem);
}

/**
 * Le tre varianti insieme (film, serie, tutto): la fila segue la pillola Film / Serie
 * TV come gli altri scaffali, e il cambio non deve tornare al server.
 *
 * Niente `cache()` di React: viene chiamata una volta per render della home e una volta
 * per richiesta all'API, e la chiave sarebbe l'identità di un oggetto.
 */
export async function getMomentShelf(recipe: Recipe): Promise<MomentShelfData> {
  const user = await getViewer();
  if (!user) return VUOTA;
  const db = await createClient();
  const [ctx, profilo] = await Promise.all([
    rankContext(user.id, db),
    getTasteProfile(user.id).catch(() => null),
  ]);
  const vettore = toTasteVector(profilo);

  const [movie, tv] = await Promise.all([
    perTipo(recipe, "movie", ctx, vettore).catch(() => []),
    recipe.soloFilm
      ? Promise.resolve<ShelfItem[]>([])
      : perTipo(recipe, "tv", ctx, vettore).catch(() => []),
  ]);
  return { movie, tv, all: mixShelf(movie, tv) };
}
```

- [ ] **Step 3: Verificare che compili**

```bash
pnpm typecheck && pnpm test
```
Expected: nessun errore, test verdi. Se `TasteVector` non è esportato da `@/lib/rank/vector`, esportalo (`export interface TasteVector`) invece di ricrearne una copia.

- [ ] **Step 4: Commit**

```bash
git add src/lib/moment/shelf.ts src/lib/taste/surfaces.ts
git commit -m "feat(momento): il tema lo sceglie l'ora, l'ordine lo sceglie il gusto"
```

---

### Task 7: Lo scaffale sa mostrare un sopratitolo e una riga sotto

**Files:**
- Modify: `src/components/discover/HorizontalShelf.tsx`
- Modify: `src/components/home/ItemShelf.tsx`

**Interfaces:**
- Produces: `HorizontalShelf({ title, seeAllHref, eyebrow, aside, children })`; `ItemShelf({ title, items, seeAllHref, surface, eyebrow, aside })` — `eyebrow?: string`, `aside?: ReactNode`.

- [ ] **Step 1: Aggiungere i due slot a `HorizontalShelf`**

Sostituisci il corpo di `src/components/discover/HorizontalShelf.tsx` con:

```tsx
import Link from "next/link";
import type { ReactNode } from "react";

export function HorizontalShelf({
  title,
  seeAllHref,
  eyebrow,
  aside,
  children,
}: {
  title: string;
  seeAllHref?: string;
  /** Riga piccola sopra il titolo: la usa la fila del momento per il contesto. */
  eyebrow?: string;
  /** Riga sotto il titolo: le pillole del mood. */
  aside?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section>
      <div className="mb-3 px-5 lg:px-10">
        {eyebrow && (
          <p className="mb-1 text-[13px] font-medium text-accent-soft">{eyebrow}</p>
        )}
        <div className="flex items-baseline justify-between">
          <h2 className="text-xl font-bold tracking-[-0.03em]">{title}</h2>
          {seeAllHref && (
            <Link href={seeAllHref} className="text-[13px] font-medium text-accent-soft">
              Vedi tutti
            </Link>
          )}
        </div>
        {aside}
      </div>
      <div className="scrollbar-none flex gap-3 overflow-x-auto px-5 pb-1 md:gap-4 lg:gap-5 lg:px-10">
        {children}
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Passarli attraverso `ItemShelf`**

In `src/components/home/ItemShelf.tsx`, aggiungi ai props e giralli a `HorizontalShelf`:

```tsx
export function ItemShelf({
  title,
  items,
  seeAllHref,
  surface,
  eyebrow,
  aside,
}: {
  title: string;
  items: ShelfItem[];
  seeAllHref?: string;
  /** Superficie dichiarata alla raccolta dei segnali (fase A). */
  surface: Surface;
  eyebrow?: string;
  aside?: ReactNode;
}) {
  if (items.length === 0) return null;
  return (
    <HorizontalShelf title={title} seeAllHref={seeAllHref} eyebrow={eyebrow} aside={aside}>
```

e aggiungi in testa al file `import type { ReactNode } from "react";`.

- [ ] **Step 3: Verificare che niente si sia rotto**

```bash
pnpm typecheck && pnpm lint
```
Expected: nessun errore. I due prop sono opzionali, quindi tutti gli scaffali esistenti restano identici.

- [ ] **Step 4: Commit**

```bash
git add src/components/discover/HorizontalShelf.tsx src/components/home/ItemShelf.tsx
git commit -m "feat(home): uno scaffale può avere un sopratitolo e una riga di comandi"
```

---

### Task 8: La rotta `/api/moment`

**Files:**
- Create: `src/app/api/moment/route.ts`

**Interfaces:**
- Consumes: `moodByKey` da `@/lib/moment/recipes`; `getMomentShelf` da `@/lib/moment/shelf`; `getViewer` da `@/lib/auth/viewer`; `rateLimit` da `@/lib/rate-limit`.
- Produces: risposta JSON `{ titolo: string; data: MomentShelfData }`; il client la legge come `MomentResponse`.

- [ ] **Step 1: Scrivere la rotta**

Crea `src/app/api/moment/route.ts`:

```ts
import { NextResponse } from "next/server";
import { getViewer } from "@/lib/auth/viewer";
import { moodByKey } from "@/lib/moment/recipes";
import { getMomentShelf, type MomentShelfData } from "@/lib/moment/shelf";
import { rateLimit } from "@/lib/rate-limit";

/**
 * I titoli di un mood, chiesti **su tocco** e non a ogni visita: rendere le sei
 * varianti lato server come fa `HomeType` sarebbe sei `discover` per tipo a ogni
 * apertura della home, per una riga che quasi nessuno tocca.
 *
 * Come ogni rotta, gli argomenti li scrive chiunque abbia una sessione: `mood` si
 * confronta con l'elenco chiuso delle ricette e non finisce mai dentro una query.
 */

export interface MomentResponse {
  titolo: string;
  data: MomentShelfData;
}

export async function GET(request: Request) {
  const user = await getViewer();
  if (!user) {
    return NextResponse.json({ error: "Accesso richiesto" }, { status: 401 });
  }
  if (!(await rateLimit(`moment:${user.id}`, 30, 60))) {
    return NextResponse.json({ error: "Troppe richieste" }, { status: 429 });
  }

  const mood = moodByKey(new URL(request.url).searchParams.get("mood"));
  if (!mood) {
    return NextResponse.json({ error: "Richiesta non valida" }, { status: 400 });
  }

  try {
    const data = await getMomentShelf(mood);
    return NextResponse.json({ titolo: mood.titolo, data } satisfies MomentResponse);
  } catch (error) {
    // Il dettaglio resta nei log: verso il client va sempre un messaggio generico.
    console.error("[moment] errore nel calcolo della fila", error);
    return NextResponse.json({ error: "Riprova fra poco" }, { status: 500 });
  }
}
```

- [ ] **Step 2: Verificare che compili**

```bash
pnpm typecheck && pnpm lint
```
Expected: nessun errore.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/moment/route.ts
git commit -m "feat(momento): i titoli di un mood, chiesti su tocco"
```

---

### Task 9: Le pillole del mood (client)

**Files:**
- Create: `src/components/home/MoodPills.tsx`

**Interfaces:**
- Consumes: `MomentShelfData` da `@/lib/moment/shelf`; `MomentResponse` da `@/app/api/moment/route`; `HomeTypeGate` da `./HomeType`; `ItemShelf` da `./ItemShelf`.
- Produces: `function MoodPills({ titolo, eyebrow, data, moods }: { titolo: string; eyebrow: string | null; data: MomentShelfData; moods: { key: string; pillola: string }[] })`.

- [ ] **Step 1: Scrivere il componente**

Crea `src/components/home/MoodPills.tsx`:

```tsx
"use client";

import { useCallback, useRef, useState } from "react";
import type { MomentResponse } from "@/app/api/moment/route";
import type { MomentShelfData } from "@/lib/moment/shelf";
import { HomeTypeGate } from "./HomeType";
import { ItemShelf } from "./ItemShelf";

/**
 * La fila del momento, con le sei pillole del mood sopra.
 *
 * Il mood **non si salva da nessuna parte**: vive quanto la sessione, e alla chiusura
 * dell'app torna il contesto automatico. Un mood di stamattina che ricompare stasera
 * sarebbe peggio di nessun mood.
 *
 * Le risposte restano in una `Map` per sessione: tornare su un mood già visto non
 * costa una seconda chiamata.
 */

const PILL_BASE =
  "h-8 shrink-0 rounded-full px-3.5 text-[13px] font-medium transition-colors disabled:opacity-50";

export function MoodPills({
  titolo,
  eyebrow,
  data,
  moods,
}: {
  titolo: string;
  eyebrow: string | null;
  data: MomentShelfData;
  moods: { key: string; pillola: string }[];
}) {
  const [attivo, setAttivo] = useState<string | null>(null);
  const [corrente, setCorrente] = useState<{ titolo: string; data: MomentShelfData }>({
    titolo,
    data,
  });
  const [caricando, setCaricando] = useState<string | null>(null);
  const cache = useRef(new Map<string, MomentResponse>());

  const scegli = useCallback(
    async (key: string) => {
      // secondo tocco sulla stessa pillola: si torna al momento automatico
      if (key === attivo) {
        setAttivo(null);
        setCorrente({ titolo, data });
        return;
      }
      const gia = cache.current.get(key);
      if (gia) {
        setAttivo(key);
        setCorrente(gia);
        return;
      }
      setCaricando(key);
      try {
        const res = await fetch(`/api/moment?mood=${encodeURIComponent(key)}`);
        if (!res.ok) return;
        const payload = (await res.json()) as MomentResponse;
        cache.current.set(key, payload);
        setAttivo(key);
        setCorrente(payload);
      } catch {
        // una rete che salta non deve svuotare la fila: resta quella di prima
      } finally {
        setCaricando(null);
      }
    },
    [attivo, data, titolo],
  );

  const pillole = (
    <div
      className="scrollbar-none -mx-5 mt-2 flex gap-2 overflow-x-auto px-5 lg:mx-0 lg:px-0"
      role="group"
      aria-label="Come ti senti?"
    >
      {moods.map((m) => {
        const acceso = m.key === attivo;
        return (
          <button
            key={m.key}
            type="button"
            aria-pressed={acceso}
            disabled={caricando !== null}
            onClick={() => scegli(m.key)}
            className={`${PILL_BASE} ${
              acceso ? "bg-accent text-black" : "glass text-white/80 hover:bg-white/[0.16]"
            }`}
          >
            {caricando === m.key ? "…" : m.pillola}
          </button>
        );
      })}
    </div>
  );

  return (
    <>
      <HomeTypeGate type="all">
        <ItemShelf
          title={corrente.titolo}
          items={corrente.data.all}
          surface="home-momento"
          eyebrow={attivo ? undefined : (eyebrow ?? undefined)}
          aside={pillole}
        />
      </HomeTypeGate>
      <HomeTypeGate type="movie">
        <ItemShelf
          title={corrente.titolo}
          items={corrente.data.movie}
          surface="home-momento"
          eyebrow={attivo ? undefined : (eyebrow ?? undefined)}
          aside={pillole}
        />
      </HomeTypeGate>
      <HomeTypeGate type="tv">
        <ItemShelf
          title={corrente.titolo}
          items={corrente.data.tv}
          surface="home-momento"
          eyebrow={attivo ? undefined : (eyebrow ?? undefined)}
          aside={pillole}
        />
      </HomeTypeGate>
    </>
  );
}
```

- [ ] **Step 2: Verificare che compili**

```bash
pnpm typecheck && pnpm lint
```
Expected: nessun errore.

- [ ] **Step 3: Commit**

```bash
git add src/components/home/MoodPills.tsx
git commit -m "feat(momento): sei pillole che riscrivono la fila senza ricaricare"
```

---

### Task 10: La sezione in home

**Files:**
- Create: `src/components/home/MomentShelf.tsx`
- Modify: `src/app/(app)/page.tsx`

**Interfaces:**
- Consumes: `getMeteo` da `@/lib/moment/weather`; `contextAt` da `@/lib/moment/context`; `pickMoment`, `MOODS` da `@/lib/moment/recipes`; `getMomentShelf` da `@/lib/moment/shelf`; `MoodPills` da `./MoodPills`.
- Produces: `async function MomentShelf()` — componente server senza props.

- [ ] **Step 1: Scrivere il componente server**

Crea `src/components/home/MomentShelf.tsx`:

```tsx
import { contextAt, type Meteo } from "@/lib/moment/context";
import { MOODS, pickMoment } from "@/lib/moment/recipes";
import { getMomentShelf } from "@/lib/moment/shelf";
import { getMeteo } from "@/lib/moment/weather";
import { MoodPills } from "./MoodPills";

/**
 * La prima fila di consigli della home: quella che sa che ore sono, che giorno è e se
 * piove. Sta dentro il suo `Suspense` (vedi `page.tsx`), così il meteo non trattiene
 * una riga di HTML del resto della pagina.
 */

const ETICHETTA: Record<Meteo, string> = {
  pioggia: "piove",
  neve: "nevica",
  sereno: "sereno",
  caldo: "caldo",
  freddo: "freddo",
};

export async function MomentShelf() {
  const { meteo, citta } = await getMeteo();
  const recipe = pickMoment(contextAt(new Date(), meteo));
  const data = await getMomentShelf(recipe);
  if (data.movie.length === 0 && data.tv.length === 0) return null;

  // La città è l'etichetta che l'utente ha già scelto per il cinema: mai le coordinate.
  const eyebrow = citta && meteo ? `Adesso a ${citta} · ${ETICHETTA[meteo]}` : null;

  return (
    <MoodPills
      titolo={recipe.titolo}
      eyebrow={eyebrow}
      data={data}
      moods={MOODS.map((m) => ({ key: m.key, pillola: m.pillola }))}
    />
  );
}
```

- [ ] **Step 2: Montarlo in home**

In `src/app/(app)/page.tsx`, aggiungi l'import accanto agli altri di `@/components/home/`:

```tsx
import { MomentShelf } from "@/components/home/MomentShelf";
```

e, **come primo figlio** del `div` con `className={`${empty ? "mt-2" : "mt-8"} space-y-8`}` — cioè subito dopo "Continua a guardare" e prima di `TonightAtCinema`:

```tsx
            {/* La prima fila di consigli: quella che sa che ore sono e se piove.
              Sopra di lei ci vanno solo le cose già iniziate, che valgono sempre
              più di un consiglio. */}
            <Suspense fallback={<DiscoverSkeleton shelves={1} />}>
              <MomentShelf />
            </Suspense>
```

- [ ] **Step 3: Verificare che compili e che il build passi**

```bash
pnpm typecheck && pnpm lint && NEXT_DIST_DIR=.next-check pnpm build
```
Expected: build completo senza errori.

**Attenzione**: quel build riscrive `tsconfig.json` (Next ci aggiunge `.next-check/types`). Prima di committare:

```bash
git checkout -- tsconfig.json
```

- [ ] **Step 4: Commit**

```bash
git add src/components/home/MomentShelf.tsx "src/app/(app)/page.tsx"
git commit -m "feat(home): la prima fila di consigli sa che ore sono e se piove"
```

---

### Task 11: Lo script per guardare tutte le ricette

**Files:**
- Create: `scripts/moment-dump.ts`

**Interfaces:**
- Consumes: `contextAt`, `pickMoment`, `MOMENTI`, `SEMPRE`, `MOODS`, `discoverForRecipe`, `genreIdsFor`.
- Produces: uno script da riga di comando, nessun export usato altrove.

- [ ] **Step 1: Scrivere lo script**

Crea `scripts/moment-dump.ts`:

```ts
/**
 * Guarda tutte le ricette senza aspettare che piova.
 *
 *   pnpm tsx --conditions=react-server --env-file=.env.local scripts/moment-dump.ts
 *   pnpm tsx --conditions=react-server --env-file=.env.local scripts/moment-dump.ts domenica-pioggia
 *
 * Senza argomenti stampa quale momento vince in una dozzina di scenari; con la chiave
 * di una ricetta stampa i primi titoli che TMDB le dà (senza personalizzazione: qui
 * non c'è una sessione, e l'affinità è quella di un profilo vuoto).
 */

import { contextAt, type Meteo } from "../src/lib/moment/context";
import { MOMENTI, MOODS, SEMPRE, pickMoment, type Recipe } from "../src/lib/moment/recipes";
import { genreIdsFor } from "../src/lib/home/hero-rank";
import { discoverForRecipe } from "../src/lib/tmdb/client";

interface Scenario {
  nome: string;
  quando: string;
  meteo: Meteo | null;
}

const SCENARI: Scenario[] = [
  { nome: "domenica di pioggia, sera", quando: "2026-06-21T19:00:00Z", meteo: "pioggia" },
  { nome: "martedì sera", quando: "2026-06-23T19:00:00Z", meteo: "sereno" },
  { nome: "martedì notte", quando: "2026-06-23T22:00:00Z", meteo: "sereno" },
  { nome: "venerdì aperitivo", quando: "2026-06-26T16:30:00Z", meteo: "sereno" },
  { nome: "mercoledì pausa pranzo", quando: "2026-06-24T11:00:00Z", meteo: "sereno" },
  { nome: "sabato sera", quando: "2026-06-27T19:30:00Z", meteo: "sereno" },
  { nome: "sabato mattina", quando: "2026-06-27T07:30:00Z", meteo: "sereno" },
  { nome: "pomeriggio di pioggia", quando: "2026-04-15T13:00:00Z", meteo: "pioggia" },
  { nome: "sera d'estate", quando: "2026-07-14T19:00:00Z", meteo: "caldo" },
  { nome: "gennaio gelido", quando: "2026-01-14T16:00:00Z", meteo: "freddo" },
  { nome: "senza posizione, pomeriggio", quando: "2026-03-10T14:00:00Z", meteo: null },
];

function ricettaDi(key: string): Recipe | null {
  if (key === SEMPRE.key) return SEMPRE;
  return (
    MOMENTI.find((m) => m.recipe.key === key)?.recipe ??
    MOODS.find((m) => m.key === key) ??
    null
  );
}

async function main() {
  const key = process.argv[2];
  if (!key) {
    for (const s of SCENARI) {
      const c = contextAt(new Date(s.quando), s.meteo);
      const r = pickMoment(c);
      const ctx = `${String(c.ora).padStart(2, "0")}:00 g${c.giorno} m${c.mese} ${c.meteo ?? "-"}`;
      console.log(`${s.nome.padEnd(30)} ${ctx.padEnd(24)} → ${r.key}  "${r.titolo}"`);
    }
    console.log(
      `\nRicette disponibili: ${[...MOMENTI.map((m) => m.recipe.key), SEMPRE.key, ...MOODS.map((m) => m.key)].join(", ")}`,
    );
    return;
  }

  const recipe = ricettaDi(key);
  if (!recipe) {
    console.error(`Ricetta "${key}" sconosciuta.`);
    process.exit(1);
  }
  console.log(`${recipe.key} — "${recipe.titolo}"\n`);
  for (const type of ["movie", "tv"] as const) {
    const page = await discoverForRecipe(type, {
      generi: genreIdsFor(type, recipe.generi),
      senzaGeneri: recipe.senzaGeneri ? genreIdsFor(type, recipe.senzaGeneri) : undefined,
      keyword: recipe.keyword,
      runtimeMax: recipe.runtimeMax,
      runtimeMin: recipe.runtimeMin,
    }).catch(() => null);
    console.log(`— ${type} (${page?.total_results ?? 0} in totale)`);
    for (const r of (page?.results ?? []).slice(0, 12)) {
      console.log(`   ${r.title ?? r.name}  ${r.vote_average ?? "-"}`);
    }
    console.log();
  }
}

void main();
```

- [ ] **Step 2: Lanciarlo senza argomenti**

```bash
pnpm tsx --conditions=react-server --env-file=.env.local scripts/moment-dump.ts
```
Expected: undici righe, ognuna con la chiave del momento vincente. Controllare a occhio che "domenica di pioggia, sera" dia `domenica-pioggia`, "martedì notte" dia `notte-fonda`, "venerdì aperitivo" dia `aperitivo-venerdi`.

- [ ] **Step 3: Guardare i titoli di almeno tre ricette**

```bash
pnpm tsx --conditions=react-server --env-file=.env.local scripts/moment-dump.ts domenica-pioggia
pnpm tsx --conditions=react-server --env-file=.env.local scripts/moment-dump.ts aperitivo-venerdi
pnpm tsx --conditions=react-server --env-file=.env.local scripts/moment-dump.ts cervello-acceso
```
Expected: almeno 12 titoli per `movie` in ognuna. **Se una ricetta ne dà meno di 12, allargarla** (un genere in più, o togliere `runtimeMax`) e rilanciare: una fila di quattro copertine sembra un errore, non una selezione.

- [ ] **Step 4: Commit**

```bash
git add scripts/moment-dump.ts
git commit -m "test(momento): tutte le ricette si guardano senza aspettare che piova"
```

---

### Task 12: Collaudo nel browser e documentazione

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Costruire e avviare in cartella isolata**

```bash
NEXT_DIST_DIR=.next-check pnpm build
NEXT_DIST_DIR=.next-check pnpm exec next start -p 3421
```
(Se la 3421 è occupata da un'altra sessione, sceglierne un'altra.)

- [ ] **Step 2: Guardare la home con un utente vero**

Accedere con `zapptest@zapp.dev` / `ZappTest2026!` e verificare, in quest'ordine:

1. La fila compare **subito sotto "Continua a guardare"**, con 12 copertine.
2. Il titolo è coerente con l'ora vera (di sera "Film della sera", dopo le 23 "Notte fonda").
3. Su una copertina si legge "per te N%" (l'affinità): se manca, `rating` non è arrivato in `ShelfItem`.
4. Le sei pillole compaiono sotto il titolo; toccandone una la fila cambia **senza che la pagina si ricarichi** e il titolo diventa quello del mood.
5. Toccando la stessa pillola una seconda volta si torna al momento automatico.
6. La pillola Film / Serie TV in testa alla home cambia la fila senza una seconda chiamata di rete (guardare il pannello Network).

- [ ] **Step 3: Verificare che senza meteo non cambi niente**

Con un utente **senza posizione salvata** (o staccando la rete verso Open-Meteo), ricaricare la home: la fila deve esserci lo stesso, senza il sopratitolo, con un titolo scelto da ora e giorno. Nessun errore in console.

- [ ] **Step 4: Scrivere la sezione in `CLAUDE.md`**

Aggiungi, dopo la sezione della home in "UI vocabulary", una sezione nuova:

```markdown
- **Il momento giusto** (2026-09-08): la prima fila di consigli della home nasce da
  **ora, giorno e meteo**, non dal solo gusto. `src/lib/moment/`: `context.ts`
  (`contextAt(now, meteo)`, puro — l'ora si legge con `Intl.DateTimeFormat` su
  `Europe/Rome`, perché le funzioni girano in `fra1` a orologio UTC e alle 23:40
  italiane `getHours()` dice 21); `recipes.ts` (puro: dieci momenti in ordine di
  priorità — **meteo forte > fascia oraria > giorno > sera** —, due ripieghi e sei
  mood, tutti nella stessa forma `Recipe`); `weather-code.ts` (puro: codici WMO →
  `pioggia|neve|sereno|caldo|freddo`, e la temperatura corregge **solo** il sereno);
  `weather.ts` (`server-only`: Open-Meteo, senza chiave, **coordinate arrotondate a
  0,1°** prima della chiave di `unstable_cache` 30 min, così mille utenti della stessa
  città sono una chiamata sola; timeout 3 s, qualunque errore vale `null` e la fila
  esce lo stesso); `shelf.ts` (una `discoverForRecipe` per tipo, `revalidate` 1 h e
  nessun parametro personale → **cache condivisa fra tutti gli utenti**, poi
  `affinity` + `diversify` della fase C). UI: `MomentShelf` (server) →
  `MoodPills` (client), che rende le tre varianti con `HomeTypeGate` e chiede i titoli
  di un mood a `/api/moment` **solo al tocco**, tenendoli in una `Map` per sessione.
  **Il mood non si salva da nessuna parte**: dura la sessione, e non entra in
  `user_taste` (è uno stato d'animo, non un gusto). Nessuna migration, nessuna
  chiamata dal browser verso l'esterno, CSP invariata.
  **Le keyword TMDB non reggono una fila**: misurato il 2026-09-08 con le soglie del
  motore, `cozy` dà 0 titoli e `feel-good` 12, mentre `commedia|famiglia` ne dà 3488.
  Le ricette poggiano su generi, durata e soglie; le keyword sono un secondo
  `discover` opzionale i cui risultati vanno in testa alla fila.
  Collaudo: `pnpm tsx --conditions=react-server --env-file=.env.local
  scripts/moment-dump.ts [chiave-ricetta]`.
```

- [ ] **Step 5: Verifica finale**

```bash
git checkout -- tsconfig.json
pnpm test && pnpm typecheck && pnpm lint && pnpm build
```
Expected: tutto verde. Riportare l'output vero, non "dovrebbe passare".

- [ ] **Step 6: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: la fila che sa che ore sono, e perché le keyword non bastano"
```

---

## Note per chi esegue

- **Mai due `next build` nella stessa cartella `.next`**: due sessioni in parallelo si rompono a vicenda (TypeError anonimo, oppure `ENOENT pages-manifest.json`). Per questo le verifiche usano `NEXT_DIST_DIR=.next-check`.
- **`NEXT_DIST_DIR=.next-check pnpm build` riscrive `tsconfig.json`**: `git checkout -- tsconfig.json` prima di ogni commit.
- Il worktree è `D:\PROGETTI\Zapp-momento`, branch `feat/momento`. **Non toccare `D:\PROGETTI\Zapp`**: è un altro albero, su un altro branch, usato da un'altra sessione.
- Prettier riscrive con CRLF su Windows: se `git diff` mostra un file intero cambiato, è quello — non annullare il lavoro, controllare con `git diff --stat`.
