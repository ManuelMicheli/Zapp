# Fase 1 — Sniffer universale ricco: piano di implementazione

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** una sorgente di import sola che digerisce qualunque export di
cronologia (Apple TV, Disney+, NOW, Prime Video e chiunque altro), riconoscendo
le colonne per nome **e per contenuto**, e che si carica anche da telefono.

**Architecture:** parser puro nuovo (`sources/export.ts`) costruito su tre
moduli puri più piccoli — profilazione delle colonne, taglio del titolo,
raggruppamento — innestato nel registry esistente come slug `export`. Il
caricamento del file non passa più dal corpo della Server Action ma da un bucket
privato Supabase Storage, perché un export vero supera i 5 MB e sul telefono non
si può chiedere all'utente di aprire uno zip.

**Tech Stack:** TypeScript strict, Vitest (solo funzioni pure), Next 15 Server
Actions, Supabase Storage + RLS, fflate (già in progetto).

**Spec:** `docs/superpowers/specs/2026-09-15-import-multipiattaforma-design.md`

## Global Constraints

- Commenti in italiano, UI in italiano. Prettier: doppi apici, virgole finali,
  `printWidth` 90.
- Alias `@/*` → `src/*`. Moduli server-only iniziano con `import "server-only"`.
  **I parser NON sono server-only**: sono puri e girano anche nei test.
- Vitest copre **solo funzioni pure**. Ogni modulo nuovo di questo piano è puro e
  ha il suo `*.test.ts` accanto. Il resto si verifica con
  `pnpm typecheck && pnpm lint && pnpm build`.
- Le migration si applicano con lo strumento MCP Supabase `apply_migration`
  (name = nome del file senza estensione), **mai** con `supabase db push`. Dopo,
  `generate_typescript_types` riscrive `src/types/database.ts`.
- Non si pubblica da un worktree: `git push` su `main` e `node scripts/rilascio.mjs`
  (vedi CLAUDE.md). Nessun task di questo piano pubblica.
- Soglia anti-anteprima: **120 secondi**, la stessa dello scrobble.
- Progresso sotto l'**85%** → `status: "watching"`, mai `"watched"`.
- Tetto decompresso per richiesta: **10 MB** (`MAX_UNZIPPED_BYTES`), invariato.
- Tetto del file caricato su Storage: **100 MB**.

---

### Task 1: Profilazione delle colonne

Riconoscere che cos'è ogni colonna di una tabella, prima per nome e poi — quando
il nome non dice niente, come negli export Apple — per contenuto.

**Files:**
- Create: `src/lib/import/sources/sniff.ts`
- Test: `src/lib/import/sources/sniff.test.ts`

**Interfaces:**
- Consumes: niente (primo task).
- Produces:
  - `type Ruolo = "titolo" | "data" | "stagione" | "episodio" | "durata" | "voto" | "tipo" | "anno" | "progresso"`
  - `function durataSec(value: unknown): number | null`
  - `function sembraData(value: unknown): boolean`
  - `function profilaColonne(righe: Record<string, string>[]): Map<string, Ruolo>`
    — chiave: nome della colonna; valore: ruolo assegnato. Le colonne non
    riconosciute non compaiono nella mappa.

- [ ] **Step 1: Write the failing test**

Create `src/lib/import/sources/sniff.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { durataSec, profilaColonne, sembraData } from "./sniff";

describe("durataSec", () => {
  it("legge hh:mm:ss e mm:ss", () => {
    expect(durataSec("01:02:03")).toBe(3723);
    expect(durataSec("42:10")).toBe(2530);
  });

  it("legge i secondi interi e i millisecondi", () => {
    expect(durataSec("2530")).toBe(2530);
    // oltre un giorno in "secondi" non e' una puntata: sono millisecondi
    expect(durataSec("2530000")).toBe(2530);
  });

  it("scarta quello che non e' una durata", () => {
    expect(durataSec("")).toBeNull();
    expect(durataSec("Stranger Things")).toBeNull();
  });
});

describe("sembraData", () => {
  it("accetta le forme che gli export usano davvero", () => {
    expect(sembraData("2026-09-15")).toBe(true);
    expect(sembraData("15/09/2026")).toBe(true);
    expect(sembraData("2026-09-15T21:04:00Z")).toBe(true);
  });

  it("rifiuta numeri e titoli", () => {
    expect(sembraData("3")).toBe(false);
    expect(sembraData("Il Signore degli Anelli")).toBe(false);
  });
});

describe("profilaColonne", () => {
  it("riconosce le colonne dai nomi italiani e inglesi", () => {
    const ruoli = profilaColonne([
      { Titolo: "Dune", Data: "2026-09-15", Voto: "8", Durata: "02:35:00" },
    ]);
    expect(ruoli.get("Titolo")).toBe("titolo");
    expect(ruoli.get("Data")).toBe("data");
    expect(ruoli.get("Voto")).toBe("voto");
    expect(ruoli.get("Durata")).toBe("durata");
  });

  it("ignora le colonne di contorno", () => {
    const ruoli = profilaColonne([
      { Title: "Dune", Device: "iPhone", "IP Address": "1.2.3.4" },
    ]);
    expect(ruoli.get("Device")).toBeUndefined();
    expect(ruoli.get("IP Address")).toBeUndefined();
  });

  it("riconosce per contenuto quando i nomi non dicono niente", () => {
    // forma osservabile negli export Apple: intestazioni opache
    const righe = [
      { c1: "Stranger Things", c2: "2026-09-10", c3: "3", c4: "2530" },
      { c1: "The Bear", c2: "2026-09-11", c3: "2", c4: "1800" },
      { c1: "Il trono di spade", c2: "2026-09-12", c3: "1", c4: "3300" },
    ];
    const ruoli = profilaColonne(righe);
    expect(ruoli.get("c1")).toBe("titolo");
    expect(ruoli.get("c2")).toBe("data");
    expect(ruoli.get("c4")).toBe("durata");
  });

  it("assegna un ruolo solo una volta: vince il punteggio piu' alto", () => {
    const ruoli = profilaColonne([
      { "Series Title": "The Bear", "Episode Title": "Ceres" },
    ]);
    const titoli = [...ruoli.values()].filter((r) => r === "titolo");
    expect(titoli).toHaveLength(1);
    expect(ruoli.get("Series Title")).toBe("titolo");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/lib/import/sources/sniff.test.ts`
Expected: FAIL — "Failed to resolve import ./sniff".

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/import/sources/sniff.ts`:

```ts
/**
 * Che cos'e' ogni colonna di un export di cronologia. Prima si guarda il nome
 * (dizionario italiano/inglese), poi — quando il nome non dice niente, come
 * negli export Apple — si guarda il contenuto: la colonna con le stringhe piu'
 * lunghe e piu' uniche e' il titolo, quella con piu' date e' la data.
 *
 * Pura, coperta da Vitest: e' il pezzo che decide se un export si capisce.
 */

export type Ruolo =
  | "titolo"
  | "data"
  | "stagione"
  | "episodio"
  | "durata"
  | "voto"
  | "tipo"
  | "anno"
  | "progresso";

/** Colonne che non ci servono mai: non devono rubare un ruolo per contenuto. */
const DA_IGNORARE =
  /(device|dispositivo|profil|ip\s*address|indirizzo|country|paese|browser|user\s*agent|subscription|abbonament|supplier|provider|url|link|id$)/i;

/** Nome della colonna -> ruolo. L'ordine conta: il primo che combacia vince. */
const PER_NOME: [RegExp, Ruolo][] = [
  [/(^|\b)(stagione|season)\b/i, "stagione"],
  [/(^|\b)(episodio|episode|ep)\b.*(numero|number|n\.?|#)|^(episodio|episode|ep)$/i, "episodio"],
  [/(durata|duration|runtime|playback|played|watched\s*(time|seconds)|minut|second|ms)/i, "durata"],
  [/(voto|rating|stars|score|valutazione)/i, "voto"],
  [/(progress|percent|percentuale|completion|position|posizione|offset)/i, "progresso"],
  [/(anno|year)/i, "anno"],
  [/(tipo|type|kind|media\s*type|content\s*type|categoria|category)/i, "tipo"],
  [/(data|date|watched|played|timestamp|ora|when|start)/i, "data"],
  [/(titolo|title|nome|name|show|serie|series|programma|content|item|movie|film)/i, "titolo"],
];

/** Solo i ruoli che vale la pena indovinare guardando i valori. */
const PER_CONTENUTO: Ruolo[] = ["titolo", "data", "durata"];

export function durataSec(value: unknown): number | null {
  const testo = String(value ?? "").trim();
  if (testo === "") return null;
  const orologio = /^(\d{1,3}):([0-5]\d)(?::([0-5]\d))?$/.exec(testo);
  if (orologio) {
    const [, a, b, c] = orologio;
    return c == null
      ? Number(a) * 60 + Number(b)
      : Number(a) * 3600 + Number(b) * 60 + Number(c);
  }
  if (!/^\d+([.,]\d+)?$/.test(testo)) return null;
  const n = Number(testo.replace(",", "."));
  if (!Number.isFinite(n) || n <= 0) return null;
  // nessuna puntata dura piu' di un giorno: oltre, sono millisecondi
  return n > 86_400 ? Math.round(n / 1000) : Math.round(n);
}

export function sembraData(value: unknown): boolean {
  const testo = String(value ?? "").trim();
  if (testo === "") return false;
  if (/^\d{4}-\d{2}-\d{2}/.test(testo)) return true;
  if (/^\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}/.test(testo)) return true;
  return false;
}

function quota(valori: string[], test: (v: string) => boolean): number {
  const pieni = valori.filter((v) => v.trim() !== "");
  if (pieni.length === 0) return 0;
  return pieni.filter(test).length / pieni.length;
}

/** Punteggio 0-1 di quanto una colonna somiglia a un ruolo, guardando i valori. */
function punteggioContenuto(ruolo: Ruolo, valori: string[]): number {
  if (ruolo === "data") return quota(valori, sembraData);
  if (ruolo === "durata") {
    return quota(valori, (v) => durataSec(v) != null && !sembraData(v));
  }
  // titolo: testo lungo e vario, mai una data e mai un numero
  const testuale = quota(
    valori,
    (v) => v.trim().length >= 4 && !sembraData(v) && !/^\d+([.,]\d+)?$/.test(v),
  );
  const pieni = valori.filter((v) => v.trim() !== "");
  const unicita = pieni.length === 0 ? 0 : new Set(pieni).size / pieni.length;
  return testuale * unicita;
}

export function profilaColonne(righe: Record<string, string>[]): Map<string, Ruolo> {
  const assegnati = new Map<string, Ruolo>();
  const presi = new Set<Ruolo>();
  if (righe.length === 0) return assegnati;

  const colonne = Object.keys(righe[0]);
  const campione = righe.slice(0, 200);
  const valoriDi = (col: string) => campione.map((r) => String(r[col] ?? ""));

  // 1. per nome
  for (const col of colonne) {
    if (DA_IGNORARE.test(col)) continue;
    const trovato = PER_NOME.find(([re]) => re.test(col));
    if (!trovato) continue;
    const [, ruolo] = trovato;
    if (presi.has(ruolo)) continue;
    assegnati.set(col, ruolo);
    presi.add(ruolo);
  }

  // 2. per contenuto, solo sui ruoli rimasti scoperti
  for (const ruolo of PER_CONTENUTO) {
    if (presi.has(ruolo)) continue;
    let miglior: { col: string; p: number } | null = null;
    for (const col of colonne) {
      if (assegnati.has(col) || DA_IGNORARE.test(col)) continue;
      const p = punteggioContenuto(ruolo, valoriDi(col));
      if (p > 0.7 && (miglior == null || p > miglior.p)) miglior = { col, p };
    }
    if (miglior) {
      assegnati.set(miglior.col, ruolo);
      presi.add(ruolo);
    }
  }
  return assegnati;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/lib/import/sources/sniff.test.ts`
Expected: PASS, 8 test.

- [ ] **Step 5: Commit**

```bash
git add src/lib/import/sources/sniff.ts src/lib/import/sources/sniff.test.ts
git commit -m "feat(import): riconosci le colonne di un export per nome e per contenuto"
```

---

### Task 2: Taglio del titolo (stagione, episodio, nome dell'episodio)

Gli export scrivono l'episodio dentro il titolo in almeno cinque forme diverse.
Questo modulo le stacca; ciò che resta è il nome della serie.

**Files:**
- Create: `src/lib/import/titolo.ts`
- Test: `src/lib/import/titolo.test.ts`

**Interfaces:**
- Consumes: `normalizeTitle` da `src/lib/import/netflix-title.ts` (già esistente).
- Produces:
  - `interface TitoloDiviso { show: string; season: number | null; episode: number | null; episodeTitle: string | null }`
  - `function splitTitolo(raw: string): TitoloDiviso`

- [ ] **Step 1: Write the failing test**

Create `src/lib/import/titolo.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { splitTitolo } from "./titolo";

describe("splitTitolo", () => {
  it("legge SxxExx", () => {
    expect(splitTitolo("The Bear S02E05")).toEqual({
      show: "The Bear",
      season: 2,
      episode: 5,
      episodeTitle: null,
    });
  });

  it("legge 1x03", () => {
    expect(splitTitolo("Dark 1x03")).toMatchObject({
      show: "Dark",
      season: 1,
      episode: 3,
    });
  });

  it("legge la forma italiana con il nome dell'episodio", () => {
    expect(splitTitolo("Stranger Things: Stagione 1: Episodio 3 - Holly, Jolly")).toEqual({
      show: "Stranger Things",
      season: 1,
      episode: 3,
      episodeTitle: "Holly, Jolly",
    });
  });

  it("legge la forma inglese", () => {
    expect(splitTitolo("The Office: Season 3, Episode 12")).toMatchObject({
      show: "The Office",
      season: 3,
      episode: 12,
    });
  });

  it("legge l'episodio senza stagione", () => {
    expect(splitTitolo("Boris - Ep. 4")).toMatchObject({
      show: "Boris",
      season: null,
      episode: 4,
    });
  });

  it("lascia stare un film", () => {
    expect(splitTitolo("Blade Runner 2049")).toEqual({
      show: "Blade Runner 2049",
      season: null,
      episode: null,
      episodeTitle: null,
    });
  });

  it("non scambia per episodio un numero del titolo", () => {
    expect(splitTitolo("Ocean's 11")).toMatchObject({ season: null, episode: null });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/lib/import/titolo.test.ts`
Expected: FAIL — "Failed to resolve import ./titolo".

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/import/titolo.ts`:

```ts
/**
 * Stacca stagione, episodio e nome dell'episodio da un titolo scritto in una
 * riga sola. Ogni export ha la sua forma: `S02E05`, `1x03`, "Stagione 1:
 * Episodio 3", "Season 3, Episode 12", "- Ep. 4". Quello che resta e' la serie.
 *
 * Pura, coperta da Vitest. Il parsing riga per riga di Netflix resta dov'e'
 * (`sources/netflix.ts`): quello lavora su pezzi separati da ":", questo su una
 * stringa sola che contiene i numeri.
 */

export interface TitoloDiviso {
  show: string;
  season: number | null;
  episode: number | null;
  episodeTitle: string | null;
}

/** Le forme osservate, in ordine di confidenza. */
const FORME: RegExp[] = [
  // "Serie: Stagione 1: Episodio 3 - Nome" / "Serie: Season 3, Episode 12: Nome"
  /^(?<show>.+?)[:\-–,]\s*(?:stagione|season)\s*(?<s>\d{1,2})[\s:,\-–]+(?:episodio|episode|ep\.?)\s*(?<e>\d{1,3})(?:\s*[-–:]\s*(?<name>.+))?$/i,
  // "Serie S02E05 - Nome"
  /^(?<show>.+?)[\s:\-–]+s(?<s>\d{1,2})[\s.]?e(?<e>\d{1,3})(?:\s*[-–:]\s*(?<name>.+))?$/i,
  // "Serie 1x03 - Nome"
  /^(?<show>.+?)[\s:\-–]+(?<s>\d{1,2})x(?<e>\d{1,3})(?:\s*[-–:]\s*(?<name>.+))?$/i,
  // "Serie - Ep. 4 - Nome" (nessuna stagione)
  /^(?<show>.+?)[\s:\-–]+(?:episodio|episode|ep\.?)\s*(?<e>\d{1,3})(?:\s*[-–:]\s*(?<name>.+))?$/i,
];

function intero(value: string | undefined): number | null {
  if (value == null) return null;
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) ? n : null;
}

export function splitTitolo(raw: string): TitoloDiviso {
  const testo = raw.trim();
  for (const forma of FORME) {
    const m = forma.exec(testo);
    if (!m?.groups) continue;
    const show = m.groups.show.trim().replace(/[:\-–,]\s*$/, "");
    if (show === "") continue;
    return {
      show,
      season: intero(m.groups.s),
      episode: intero(m.groups.e),
      episodeTitle: m.groups.name?.trim() || null,
    };
  }
  return { show: testo, season: null, episode: null, episodeTitle: null };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/lib/import/titolo.test.ts`
Expected: PASS, 7 test.

- [ ] **Step 5: Commit**

```bash
git add src/lib/import/titolo.ts src/lib/import/titolo.test.ts
git commit -m "feat(import): stacca stagione ed episodio dal titolo, in tutte le forme note"
```

---

### Task 3: Da riga a candidato

Una riga profilata diventa un `ImportCandidate`, con le regole che tengono fuori
trailer e riproduzioni parziali.

**Files:**
- Create: `src/lib/import/sources/export.ts`
- Test: `src/lib/import/sources/export.test.ts`

**Interfaces:**
- Consumes: `profilaColonne`, `durataSec` (Task 1); `splitTitolo` (Task 2);
  `normalizeTitle` e `inferDateOrder` da `netflix-title.ts` / `sources/netflix.ts`;
  `ImportCandidate` da `../candidate`.
- Produces:
  - `const DURATA_MINIMA_SEC = 120`
  - `const PROGRESSO_VISTO = 0.85`
  - `function righeACandidati(righe: Record<string, string>[]): ImportCandidate[]`

- [ ] **Step 1: Write the failing test**

Create `src/lib/import/sources/export.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { righeACandidati } from "./export";

describe("righeACandidati", () => {
  it("fa un film visto da una riga con titolo e data", () => {
    const [c] = righeACandidati([{ Title: "Dune", Date: "2026-09-15" }]);
    expect(c).toMatchObject({
      netflixTitle: "Dune",
      kind: "movie",
      lastDate: "2026-09-15",
      status: "watched",
    });
  });

  it("scarta le riproduzioni sotto i due minuti (trailer)", () => {
    const out = righeACandidati([
      { Title: "Dune", Date: "2026-09-15", Duration: "45" },
      { Title: "Arrival", Date: "2026-09-15", Duration: "7200" },
    ]);
    expect(out.map((c) => c.netflixTitle)).toEqual(["Arrival"]);
  });

  it("manda a 'watching' quello che e' rimasto a meta'", () => {
    const [c] = righeACandidati([
      { Title: "Dune", Date: "2026-09-15", Duration: "3600", Progress: "40%" },
    ]);
    expect(c.status).toBe("watching");
  });

  it("tiene 'watched' sopra l'85%", () => {
    const [c] = righeACandidati([
      { Title: "Dune", Date: "2026-09-15", Duration: "3600", Progress: "0.92" },
    ]);
    expect(c.status).toBe("watched");
  });

  it("riporta la scala del voto su dieci", () => {
    const [cinque] = righeACandidati([{ Title: "Dune", Rating: "4" }]);
    expect(cinque.rating).toBe(8);
    const [cento] = righeACandidati([{ Title: "Dune", Rating: "90" }]);
    expect(cento.rating).toBe(9);
  });

  it("riconosce la serie dal titolo e porta il nome dell'episodio", () => {
    const [c] = righeACandidati([
      { Title: "The Bear: Stagione 2: Episodio 5 - Pollo", Date: "2026-09-15" },
    ]);
    expect(c).toMatchObject({
      netflixTitle: "The Bear",
      kind: "tv",
      season: 2,
      episode: 5,
      episodeTitles: ["Pollo"],
    });
  });

  it("decide giorno/mese sull'intero file, non riga per riga", () => {
    // 13 non puo' essere un mese: tutto il file e' giorno/mese
    const out = righeACandidati([
      { Title: "A", Date: "13/09/2026" },
      { Title: "B", Date: "05/09/2026" },
    ]);
    expect(out[1].lastDate).toBe("2026-09-05");
  });

  it("senza titolo non produce niente", () => {
    expect(righeACandidati([{ Title: "", Date: "2026-09-15" }])).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/lib/import/sources/export.test.ts`
Expected: FAIL — "Failed to resolve import ./export".

- [ ] **Step 3: Write minimal implementation**

Prima leggi come `sources/netflix.ts` espone `inferDateOrder` (se non è
esportata, esportala senza cambiarne il corpo e lascia il test di Netflix verde).

Create `src/lib/import/sources/export.ts`:

```ts
/**
 * Export di cronologia di una piattaforma qualunque: Apple, Disney+, NOW, Prime
 * o chiunque altro. Le colonne si riconoscono con `sniff.ts`, l'episodio dentro
 * al titolo con `titolo.ts`. Pura, coperta da Vitest.
 *
 * Le due regole che tengono pulita la libreria: sotto i due minuti e' un
 * trailer (stessa soglia dello scrobble), e sotto l'85% di avanzamento il
 * titolo e' "in corso", non "visto".
 */

import type { ImportCandidate } from "../candidate";
import { normalizeTitle } from "../netflix-title";
import { splitTitolo } from "../titolo";
import { inferDateOrder } from "./netflix";
import { durataSec, profilaColonne, type Ruolo } from "./sniff";

/** Sotto questa durata la riga e' un'anteprima: si butta. */
export const DURATA_MINIMA_SEC = 120;

/** Sotto questa frazione di avanzamento il titolo resta "in corso". */
export const PROGRESSO_VISTO = 0.85;

/** "40%" | "0.4" | "40" -> 0.4; quello che non si capisce -> null. */
function frazione(value: string | undefined): number | null {
  if (value == null) return null;
  const testo = value.trim().replace(",", ".");
  if (testo === "") return null;
  const n = Number.parseFloat(testo.replace("%", ""));
  if (!Number.isFinite(n) || n < 0) return null;
  if (testo.includes("%")) return n / 100;
  return n <= 1 ? n : n / 100;
}

/** Riporta su 1-10 qualunque scala: 5 stelle, 10, 100. */
function votoSuDieci(value: string | undefined, massimo: number): number | null {
  if (value == null) return null;
  const n = Number.parseFloat(value.trim().replace(",", "."));
  if (!Number.isFinite(n) || n <= 0) return null;
  const fattore = massimo <= 5 ? 2 : massimo <= 10 ? 1 : 0.1;
  return Math.max(1, Math.min(10, Math.round(n * fattore)));
}

function valore(riga: Record<string, string>, ruoli: Map<string, Ruolo>, ruolo: Ruolo) {
  for (const [col, r] of ruoli) if (r === ruolo) return riga[col];
  return undefined;
}

export function righeACandidati(righe: Record<string, string>[]): ImportCandidate[] {
  if (righe.length === 0) return [];
  const ruoli = profilaColonne(righe);
  const date = righe
    .map((r) => valore(r, ruoli, "data") ?? "")
    .filter((d) => d.trim() !== "");
  const ordine = inferDateOrder(date);
  const voti = righe
    .map((r) => Number.parseFloat((valore(r, ruoli, "voto") ?? "").replace(",", ".")))
    .filter((n) => Number.isFinite(n));
  const votoMax = voti.length > 0 ? Math.max(...voti) : 10;

  const out: ImportCandidate[] = [];
  for (const riga of righe) {
    const grezzo = (valore(riga, ruoli, "titolo") ?? "").trim();
    if (grezzo === "") continue;

    const durata = durataSec(valore(riga, ruoli, "durata"));
    if (durata != null && durata < DURATA_MINIMA_SEC) continue;

    const diviso = splitTitolo(grezzo);
    const tipo = (valore(riga, ruoli, "tipo") ?? "").toLowerCase();
    const stagioneCol = Number.parseInt(valore(riga, ruoli, "stagione") ?? "", 10);
    const episodioCol = Number.parseInt(valore(riga, ruoli, "episodio") ?? "", 10);
    const season = Number.isFinite(stagioneCol) ? stagioneCol : diviso.season;
    const episode = Number.isFinite(episodioCol) ? episodioCol : diviso.episode;
    const kind: "movie" | "tv" =
      tipo !== ""
        ? /show|serie|tv|episode/.test(tipo)
          ? "tv"
          : "movie"
        : season != null || episode != null
          ? "tv"
          : "movie";

    const avanzamento = frazione(valore(riga, ruoli, "progresso"));
    const anno = (valore(riga, ruoli, "anno") ?? "").trim() || null;
    const data = ordine.toIso(valore(riga, ruoli, "data") ?? "");

    out.push({
      key: `${kind}:${normalizeTitle(diviso.show)}|${anno ?? ""}`,
      netflixTitle: diviso.show,
      kind,
      season: kind === "tv" ? (season ?? 1) : null,
      episode: kind === "tv" ? (episode ?? 1) : null,
      lastDate: data,
      rowCount: 1,
      altTitle: null,
      fallbackShow: null,
      episodeTitles: diviso.episodeTitle ? [diviso.episodeTitle] : [],
      rating: votoSuDieci(valore(riga, ruoli, "voto"), votoMax),
      status:
        avanzamento != null && avanzamento < PROGRESSO_VISTO ? "watching" : "watched",
      year: anno,
    });
  }
  return out;
}
```

**Nota per chi implementa:** `ImportCandidate.status` oggi accetta solo
`"watched" | "want"`. Allarga il tipo a `"watched" | "want" | "watching"` in
`src/lib/import/candidate.ts` e controlla ogni uso: `mergeProposals` deve
trattare `"watching"` come perdente contro `"watched"` e vincente contro
`"want"`, e `confirmImport` deve passarlo alla RPC (la colonna
`watch_entries.status` ha già quel valore nell'enum `watch_status`).
`inferDateOrder` deve esporre un `toIso(raw: string): string | null`: se oggi
restituisce solo l'ordine, aggiungi la funzione accanto senza toccare il
comportamento di Netflix, e fallo coprire dal test "decide giorno/mese".

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/lib/import/`
Expected: PASS — i test nuovi e **tutti quelli di Netflix, Letterboxd, TV Time e
generic già esistenti**, che non devono muoversi.

- [ ] **Step 5: Commit**

```bash
git add src/lib/import/
git commit -m "feat(import): trasforma in candidati le righe di un export qualunque"
```

---

### Task 4: Raggruppamento con i nomi degli episodi

Senza questo passo una serie con 60 righe diventa 60 candidati. Con questo passo
diventa un candidato solo che porta i nomi degli episodi — ed è quello che fa
scattare `resolveEpisodeNumber` su TMDB, finora attivo solo per Netflix.

**Files:**
- Modify: `src/lib/import/sources/export.ts`
- Test: `src/lib/import/sources/export.test.ts`

**Interfaces:**
- Produces: `function raggruppa(candidati: ImportCandidate[]): ImportCandidate[]`

- [ ] **Step 1: Write the failing test**

Append to `src/lib/import/sources/export.test.ts`:

```ts
import { raggruppa } from "./export";

describe("raggruppa", () => {
  it("fonde le righe della stessa serie e tiene la stagione piu' avanti", () => {
    const out = raggruppa(
      righeACandidati([
        { Title: "The Bear: Stagione 1: Episodio 8 - Braciole", Date: "2026-09-01" },
        { Title: "The Bear: Stagione 2: Episodio 3 - Forchette", Date: "2026-09-05" },
      ]),
    );
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ season: 2, episode: 3, rowCount: 2 });
    expect(out[0].lastDate).toBe("2026-09-05");
  });

  it("raccoglie i nomi degli episodi della stagione piu' avanti", () => {
    const out = raggruppa(
      righeACandidati([
        { Title: "The Bear: Stagione 2: Episodio 1 - Beef", Date: "2026-09-02" },
        { Title: "The Bear: Stagione 2: Episodio 3 - Forchette", Date: "2026-09-05" },
        { Title: "The Bear: Stagione 1: Episodio 8 - Braciole", Date: "2026-09-01" },
      ]),
    );
    expect(out[0].episodeTitles).toEqual(["Beef", "Forchette"]);
  });

  it("tiene separati due film diversi", () => {
    const out = raggruppa(
      righeACandidati([
        { Title: "Dune", Date: "2026-09-01" },
        { Title: "Arrival", Date: "2026-09-02" },
      ]),
    );
    expect(out).toHaveLength(2);
  });

  it("non tiene piu' di 60 nomi di episodio", () => {
    const righe = Array.from({ length: 80 }, (_, i) => ({
      Title: `Lost: Stagione 1: Episodio ${i + 1} - Nome ${i + 1}`,
      Date: "2026-09-01",
    }));
    expect(raggruppa(righeACandidati(righe))[0].episodeTitles).toHaveLength(60);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/lib/import/sources/export.test.ts`
Expected: FAIL — "raggruppa is not exported".

- [ ] **Step 3: Write minimal implementation**

Append to `src/lib/import/sources/export.ts`:

```ts
/** Nomi di episodio tenuti per candidato: oltre, `getSeason` non serve di piu'. */
const MAX_NOMI_EPISODIO = 60;

/**
 * Una riga per episodio diventa un candidato per serie. Tiene la stagione piu'
 * avanti, somma le righe e raccoglie i nomi degli episodi **di quella
 * stagione**: sono quelli che `resolveEpisodeNumber` cerca su TMDB per sapere a
 * che punto e' arrivato l'utente, invece di contare le righe.
 */
export function raggruppa(candidati: ImportCandidate[]): ImportCandidate[] {
  const out: ImportCandidate[] = [];
  const indice = new Map<string, number>();

  for (const c of candidati) {
    const idx = indice.get(c.key);
    if (idx == null) {
      indice.set(c.key, out.length);
      out.push({ ...c, episodeTitles: [...c.episodeTitles] });
      continue;
    }
    const tenuto = out[idx];
    tenuto.rowCount += c.rowCount;
    if (c.lastDate && (!tenuto.lastDate || c.lastDate > tenuto.lastDate)) {
      tenuto.lastDate = c.lastDate;
    }
    tenuto.rating ??= c.rating;
    if (tenuto.status === "watching" && c.status === "watched") tenuto.status = "watched";
    if (c.kind !== "tv") continue;

    const avanti =
      (c.season ?? 0) > (tenuto.season ?? 0) ||
      ((c.season ?? 0) === (tenuto.season ?? 0) && (c.episode ?? 0) > (tenuto.episode ?? 0));
    if ((c.season ?? 0) > (tenuto.season ?? 0)) {
      // stagione nuova: i nomi della precedente non servono piu'
      tenuto.episodeTitles = [];
    }
    if ((c.season ?? 0) === (tenuto.season ?? 0) || avanti) {
      for (const nome of c.episodeTitles) {
        if (tenuto.episodeTitles.length >= MAX_NOMI_EPISODIO) break;
        if (!tenuto.episodeTitles.includes(nome)) tenuto.episodeTitles.push(nome);
      }
    }
    if (avanti) {
      tenuto.season = c.season;
      tenuto.episode = c.episode;
    }
  }
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/lib/import/`
Expected: PASS, tutti.

- [ ] **Step 5: Commit**

```bash
git add src/lib/import/sources/export.ts src/lib/import/sources/export.test.ts
git commit -m "feat(import): raggruppa le righe per serie e porta i nomi degli episodi"
```

---

### Task 5: Scelta dei file e JSON annidato, con avvisi

Un export Apple è una cartella con decine di CSV di cui uno solo è la cronologia:
va scelto da solo, e va detto all'utente cosa è stato ignorato.

**Files:**
- Modify: `src/lib/import/sources/export.ts`
- Modify: `src/lib/import/sources/types.ts` (campo `avvisi`)
- Test: `src/lib/import/sources/export.test.ts`

**Interfaces:**
- Produces: `function parse(files: SourceFile[]): ParsedSource` — la firma che il
  registry si aspetta. `ParsedSource` guadagna `avvisi?: string[]`.

- [ ] **Step 1: Write the failing test**

Append to `src/lib/import/sources/export.test.ts`:

```ts
import { parse } from "./export";

const CSV_CRONOLOGIA = `Title,Date\nDune,2026-09-15\nArrival,2026-09-14\n`;
const CSV_ESTRANEO = `Invoice,Amount\nIT-001,9.99\n`;

describe("parse", () => {
  it("tiene solo i file che sembrano una cronologia e lo dice", () => {
    const out = parse([
      { name: "play-history.csv", text: CSV_CRONOLOGIA },
      { name: "billing.csv", text: CSV_ESTRANEO },
    ]);
    expect(out.candidates).toHaveLength(2);
    expect(out.avvisi?.join(" ")).toContain("billing.csv");
  });

  it("trova l'elenco dentro un JSON annidato", () => {
    const json = JSON.stringify({
      data: { viewing: [{ title: "Dune", date: "2026-09-15" }] },
    });
    const out = parse([{ name: "export.json", text: json }]);
    expect(out.candidates[0]).toMatchObject({ netflixTitle: "Dune" });
  });

  it("avvisa quando manca la colonna della data", () => {
    const out = parse([{ name: "h.csv", text: "Title\nDune\nArrival\n" }]);
    expect(out.candidates).toHaveLength(2);
    expect(out.avvisi?.join(" ")).toMatch(/data/i);
  });

  it("dice cosa cercava quando non capisce niente", () => {
    const out = parse([{ name: "b.csv", text: CSV_ESTRANEO }]);
    expect(out.candidates).toHaveLength(0);
    expect(out.error).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/lib/import/sources/export.test.ts`
Expected: FAIL — "parse is not exported".

- [ ] **Step 3: Write minimal implementation**

In `src/lib/import/sources/types.ts`, aggiungi il campo:

```ts
export interface ParsedSource {
  candidates: ImportCandidate[];
  /** Righe lette dai file, per il registro `imports.rows`. */
  rows: number;
  /** Messaggio pronto per l'utente quando non c'è niente da importare. */
  error?: string;
  /** Cosa è stato ignorato o non capito: si mostra, non ferma l'import. */
  avvisi?: string[];
}
```

Append to `src/lib/import/sources/export.ts` (usa `parseCsvRows` di
`sources/tvtime.ts` se già espone un CSV→oggetti; altrimenti esportalo di lì
senza cambiarne il corpo):

```ts
const NIENTE_DI_UTILE =
  "In questo export non ho trovato una cronologia: cercavo una tabella con " +
  "almeno una colonna di titoli e una di date o durate.";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Il primo array di oggetti con un campo che somiglia a un titolo, max 4 livelli. */
function primoElenco(value: unknown, livello = 0): Record<string, string>[] | null {
  if (livello > 4) return null;
  if (Array.isArray(value)) {
    const oggetti = value.filter(isRecord);
    if (oggetti.length === 0) return null;
    const righe = oggetti.map((o) =>
      Object.fromEntries(Object.entries(o).map(([k, v]) => [k, String(v ?? "")])),
    );
    return profilaColonne(righe).size > 0 ? righe : null;
  }
  if (!isRecord(value)) return null;
  for (const dentro of Object.values(value)) {
    const trovato = primoElenco(dentro, livello + 1);
    if (trovato) return trovato;
  }
  return null;
}

/** Una tabella e' una cronologia se ha un titolo e almeno una data o una durata. */
function sembraCronologia(righe: Record<string, string>[]): boolean {
  const ruoli = [...profilaColonne(righe).values()];
  return (
    ruoli.includes("titolo") && (ruoli.includes("data") || ruoli.includes("durata"))
  );
}

export function parse(files: SourceFile[]): ParsedSource {
  const avvisi: string[] = [];
  const scartati: string[] = [];
  let candidati: ImportCandidate[] = [];
  let rows = 0;

  for (const file of files) {
    const testo = file.text.trim();
    let righe: Record<string, string>[] | null = null;
    if (testo.startsWith("{") || testo.startsWith("[")) {
      try {
        righe = primoElenco(JSON.parse(testo));
      } catch {
        righe = null;
      }
    } else {
      righe = parseCsvRows(testo);
    }
    if (!righe || righe.length === 0 || !sembraCronologia(righe)) {
      scartati.push(file.name);
      continue;
    }
    rows += righe.length;
    candidati.push(...righeACandidati(righe));
    if (![...profilaColonne(righe).values()].includes("data")) {
      avvisi.push(`In ${file.name} non ho trovato la colonna della data: i titoli
entrano senza data di visione.`);
    }
  }

  if (scartati.length > 0) {
    avvisi.push(
      `Ignorati perche' non sembrano cronologie: ${scartati.slice(0, 5).join(", ")}` +
        (scartati.length > 5 ? ` e altri ${scartati.length - 5}` : ""),
    );
  }
  candidati = raggruppa(candidati);
  if (candidati.length === 0) {
    return { candidates: [], rows, error: NIENTE_DI_UTILE, avvisi };
  }
  return { candidates: candidati, rows, avvisi };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/lib/import/`
Expected: PASS, tutti.

- [ ] **Step 5: Commit**

```bash
git add src/lib/import/
git commit -m "feat(import): scegli da solo i file di cronologia e spiega cosa hai ignorato"
```

---

### Task 6: La sorgente nel registry, con le schede per piattaforma

**Files:**
- Modify: `src/lib/import/sources/registry.ts`
- Create: `supabase/migrations/0059_import_export.sql`
- Modify: `src/types/database.ts` (rigenerato, non scritto a mano)
- Test: `src/lib/import/sources/registry.test.ts`

**Interfaces:**
- Consumes: `parse` (Task 5).
- Produces: `SOURCE_SLUGS` include `"export"`; `SourceMeta` guadagna
  `portale?: string` (link al portale privacy, usato dalla fase 3).

- [ ] **Step 1: Write the failing test**

Append to `src/lib/import/sources/registry.test.ts`:

```ts
it("conosce la sorgente export e la mette in elenco", () => {
  expect(isSourceSlug("export")).toBe(true);
  expect(SOURCE_LIST.map((s) => s.slug)).toContain("export");
});

it("la sorgente export accetta zip, csv e json", () => {
  expect(SOURCES.export.accetta).toContain(".zip");
  expect(SOURCES.export.accetta).toContain(".csv");
  expect(SOURCES.export.accetta).toContain(".json");
});

it("parseSource instrada export al suo parser", () => {
  const out = parseSource("export", [
    { name: "h.csv", text: "Title,Date\nDune,2026-09-15\n" },
  ]);
  expect(out.candidates).toHaveLength(1);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/lib/import/sources/registry.test.ts`
Expected: FAIL — `isSourceSlug("export")` è `false`.

- [ ] **Step 3: Write minimal implementation**

In `registry.ts`: importa `* as exportSource from "./export"`, aggiungi
`"export"` a `SOURCE_SLUGS`, il caso in `parseSource`, e la voce in `META`:

```ts
  export: {
    slug: "export",
    nome: "Export della piattaforma",
    titolo: "Importa l'export di una piattaforma",
    descrizione: "Apple TV, Disney+, NOW, Prime Video: il file che ti mandano.",
    accetta: ".zip,.csv,.json,.tsv,application/zip,text/csv,application/json",
    multiplo: true,
    istruzioni: [
      "Chiedi i tuoi dati alla piattaforma (Profilo → Importa → Richiedi i tuoi dati)",
      "Quando arriva la mail, scarica l'archivio",
      "Caricalo qui com'e': penso io a trovarci dentro la cronologia",
    ],
    bottone: "Scegli l'archivio o il file",
  },
```

Create `supabase/migrations/0059_import_export.sql`:

```sql
-- Zapp — migration 0059: sorgente di import "export" (Apple, Disney+, NOW, Prime)
-- e bucket privato per i file caricati, che non passano piu' dal corpo della
-- Server Action (un export vero supera i 5 MB, e da telefono non si puo'
-- chiedere all'utente di aprire uno zip).

alter table public.imports drop constraint if exists imports_source_check;
alter table public.imports add constraint imports_source_check
  check (source in ('netflix', 'letterboxd', 'tvtime', 'file', 'export'));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'import-uploads', 'import-uploads', false, 104857600,
  array[
    'application/zip', 'application/x-zip-compressed', 'application/octet-stream',
    'text/csv', 'text/plain', 'application/json'
  ]
);

create policy "import_uploads_select_own" on storage.objects
  for select using (
    bucket_id = 'import-uploads' and (storage.foldername(name))[1] = auth.uid()::text
  );
create policy "import_uploads_insert_own" on storage.objects
  for insert with check (
    bucket_id = 'import-uploads' and (storage.foldername(name))[1] = auth.uid()::text
  );
create policy "import_uploads_delete_own" on storage.objects
  for delete using (
    bucket_id = 'import-uploads' and (storage.foldername(name))[1] = auth.uid()::text
  );
```

Applicala con lo strumento MCP `apply_migration` (name: `0059_import_export`),
poi `generate_typescript_types` per riscrivere `src/types/database.ts`.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/lib/import/ && pnpm typecheck`
Expected: PASS entrambi.

- [ ] **Step 5: Commit**

```bash
git add src/lib/import/sources/registry.ts src/lib/import/sources/registry.test.ts \
  supabase/migrations/0059_import_export.sql src/types/database.ts
git commit -m "feat(import): aggiungi la sorgente export e il bucket dei caricamenti"
```

---

### Task 7: Apertura selettiva dello zip

Un export Apple pesa centinaia di MB di allegati e poche decine di kB di tabelle.
Lo zip si apre scegliendo le voci, non tutto.

**Files:**
- Modify: `src/lib/import/archive.ts`
- Test: `src/lib/import/archive.test.ts`

**Interfaces:**
- Produces: `unzipSources(data, budget, opzioni?: { soloTabelle?: boolean })` —
  con `soloTabelle: true` estrae solo `.csv/.json/.tsv/.txt` e ignora **senza
  spendere budget** tutto il resto.

- [ ] **Step 1: Write the failing test**

Append to `src/lib/import/archive.test.ts` (segui lo stile delle prove già
presenti, che costruiscono lo zip con `zipSync` di fflate):

```ts
it("con soloTabelle ignora gli allegati senza spendere budget", () => {
  const grosso = new Uint8Array(6 * 1024 * 1024); // 6 MB di 'media'
  const zip = zipSync({
    "export/foto.jpg": grosso,
    "export/video.mp4": grosso,
    "export/play-history.csv": strToU8("Title,Date\nDune,2026-09-15\n"),
  });
  const files = unzipSources(zip, nuovoBudget(), { soloTabelle: true });
  expect(files.map((f) => f.name)).toEqual(["play-history.csv"]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/lib/import/archive.test.ts`
Expected: FAIL — senza l'opzione i 12 MB di allegati fanno scattare
`ARCHIVIO_TROPPO_GRANDE`.

- [ ] **Step 3: Write minimal implementation**

In `archive.ts`, aggiungi il parametro e usalo **dentro il `filter`, prima di
contare il budget** (è il punto in cui fflate legge l'intestazione e l'unico in
cui una voce si rifiuta senza gonfiarla):

```ts
const TABELLE = /\.(csv|json|tsv|txt)$/i;

export interface OpzioniUnzip {
  /** Estrai solo le tabelle: gli allegati non consumano nemmeno budget. */
  soloTabelle?: boolean;
}

export function unzipSources(
  data: Uint8Array,
  budget: UnzipBudget = nuovoBudget(),
  opzioni: OpzioniUnzip = {},
): SourceFile[] {
  const utili = opzioni.soloTabelle ? TABELLE : UTILI;
  // ...resto invariato, con `utili.test(file.name)` al posto di `UTILI.test(...)`
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/lib/import/archive.test.ts`
Expected: PASS, compresi i test di bomba zip già presenti.

- [ ] **Step 5: Commit**

```bash
git add src/lib/import/archive.ts src/lib/import/archive.test.ts
git commit -m "feat(import): apri dagli archivi solo le tabelle, non gli allegati"
```

---

### Task 8: Caricamento su Storage e action che legge di lì

È il task che rende l'import possibile da telefono: il file non passa più dal
corpo della Server Action.

**Files:**
- Modify: `src/app/(app)/import/actions.ts`
- Modify: `src/app/(app)/import/[source]/ImportClient.tsx`
- Modify: `src/app/(app)/import/limits.ts`

**Interfaces:**
- Consumes: bucket `import-uploads` (Task 6), `unzipSources(..., { soloTabelle: true })`
  (Task 7), `parseSource` (Task 6).
- Produces:
  - `const MAX_STORAGE_BYTES = 100 * 1024 * 1024` e `MAX_STORAGE_LABEL` in `limits.ts`
  - `async function parseImportFromStorage(paths: string[], source: string): Promise<ParseResult>`
    in `actions.ts` — `ParseResult` guadagna `avvisi?: string[]`.

- [ ] **Step 1: Write the code (niente test unitario: è I/O)**

Questo task non ha un test Vitest: tocca Storage e autenticazione, che la
regola del progetto lascia fuori dai test puri. La verifica è il collaudo dello
Step 3.

In `limits.ts`:

```ts
/**
 * Tetto del file caricato su Storage. Non e' il tetto della Server Action: qui
 * il file non passa dal corpo della richiesta, sale dal client direttamente nel
 * bucket. Un export Apple completo sta sotto i 100 MB; di quei byte, il server
 * apre solo le tabelle (`soloTabelle`), mai gli allegati.
 */
export const MAX_STORAGE_BYTES = 100 * 1024 * 1024;
export const MAX_STORAGE_LABEL = `${MAX_STORAGE_BYTES / 1024 / 1024}MB`;
```

In `actions.ts`, accanto a `parseImportFiles` (che resta per le sorgenti
vecchie), aggiungi:

```ts
/**
 * Come `parseImportFiles`, ma il file e' gia' nel bucket `import-uploads`: il
 * client lo carica da solo, la action riceve solo il percorso. Serve per gli
 * export veri (decine di MB) e perche' da telefono non si puo' chiedere di
 * aprire uno zip per estrarne un csv.
 */
export async function parseImportFromStorage(
  paths: string[],
  source: string,
): Promise<ParseResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Non autenticato", candidates: [], totalRows: 0 };
  if (!isSourceSlug(source)) {
    return { ok: false, error: "Sorgente sconosciuta", candidates: [], totalRows: 0 };
  }
  if (paths.length === 0 || paths.length > MAX_UPLOAD_FILES) {
    return { ok: false, error: "Nessun file", candidates: [], totalRows: 0 };
  }
  // il percorso lo scrive il client: qui si verifica che sia suo, come fa la RLS
  if (paths.some((p) => !p.startsWith(`${user.id}/`))) {
    return { ok: false, error: "Percorso non valido", candidates: [], totalRows: 0 };
  }
  if (!(await rateLimit(`import:parse:${user.id}`, 20, 3600, { condiviso: true }))) {
    return {
      ok: false,
      error: "Troppi import ravvicinati, riprova piu' tardi",
      candidates: [],
      totalRows: 0,
    };
  }
  if (!(await prendiPosto("import", user.id, POSTI_IMPORT, TTL_IMPORT_S))) {
    return {
      ok: false,
      error: "Ci sono gia' tre import in corso, riprova fra qualche minuto",
      candidates: [],
      totalRows: 0,
    };
  }

  const pulisci = async () => {
    await supabase.storage.from("import-uploads").remove(paths);
  };

  try {
    const budget = nuovoBudget();
    const files: SourceFile[] = [];
    for (const path of paths) {
      const { data, error } = await supabase.storage.from("import-uploads").download(path);
      if (error || !data) {
        await lasciaPosto("import", user.id);
        await pulisci();
        return {
          ok: false,
          error: "Non riesco a rileggere il file caricato",
          candidates: [],
          totalRows: 0,
        };
      }
      const nome = path.split("/").pop() ?? path;
      if (nome.toLowerCase().endsWith(".zip")) {
        files.push(
          ...unzipSources(new Uint8Array(await data.arrayBuffer()), budget, {
            soloTabelle: true,
          }),
        );
      } else {
        files.push({ name: nome, text: await data.text() });
      }
    }
    const parsed = parseSource(source, files);
    await pulisci(); // cronologia personale: non resta nel bucket
    if (parsed.candidates.length === 0) {
      await lasciaPosto("import", user.id);
      return {
        ok: false,
        error: parsed.error ?? CSV_INVALID_MESSAGE,
        candidates: [],
        totalRows: 0,
        avvisi: parsed.avvisi,
      };
    }
    return {
      ok: true,
      candidates: parsed.candidates,
      totalRows: parsed.rows,
      avvisi: parsed.avvisi,
    };
  } catch (e) {
    // il posto va restituito su OGNI uscita: senza, l'import resta bloccato
    // trenta minuti senza un errore visibile
    await lasciaPosto("import", user.id);
    await pulisci();
    const nostro = e instanceof Error && e.message === ARCHIVIO_TROPPO_GRANDE;
    return {
      ok: false,
      error: nostro ? ARCHIVIO_TROPPO_GRANDE : ARCHIVIO_ILLEGGIBILE,
      candidates: [],
      totalRows: 0,
    };
  }
}
```

In `ImportClient.tsx`, quando `source.slug === "export"`, invece della
`FormData`: carica ogni file nel bucket con il client browser di Supabase (lo
stesso schema di `src/components/cinema/TicketImport.tsx:64-70`) su percorso
`${uid}/${crypto.randomUUID()}/${file.name}`, mostra "Carico il file…" con una
percentuale, poi chiama `parseImportFromStorage(paths, "export")`. Il tetto
controllato lato client diventa `MAX_STORAGE_BYTES`. Gli `avvisi` tornati si
mostrano sopra il bottone, in `text-xs text-muted`, uno per riga.

- [ ] **Step 2: Verifica che compili**

Run: `pnpm typecheck && pnpm lint`
Expected: nessun errore.

- [ ] **Step 3: Collaudo vero, con un build isolato**

```bash
NEXT_DIST_DIR=.next-check pnpm build
NEXT_DIST_DIR=.next-check pnpm exec next start -p 3399
```

Su `http://localhost:3399/import/export` carica, in quest'ordine:
1. un CSV a mano `Title,Date` con tre righe → tre titoli riconosciuti;
2. uno zip con dentro il CSV e un finto allegato da 6 MB → stesso risultato,
   nessun errore di dimensione;
3. un file da 120 MB → errore che nomina `MAX_STORAGE_LABEL`.

Dopo ogni prova, controlla con MCP `execute_sql` che il bucket sia vuoto:
`select name from storage.objects where bucket_id = 'import-uploads';` → 0 righe.

- [ ] **Step 4: Commit**

```bash
git add src/app/(app)/import/
git commit -m "feat(import): carica gli export su Storage, cosi' l'import funziona da telefono"
```

---

### Task 9: Telefono — selettore file nella WebView e chip onesta

**Files:**
- Modify: `src/components/import/ImportProvider.tsx` (testo della chip)
- Modify: `src/app/(app)/import/[source]/ImportClient.tsx` (ripiego browser)

**Interfaces:**
- Consumes: il caricamento del Task 8.

- [ ] **Step 1: Prova sul dispositivo**

Apri l'app nativa (guscio Expo) su un Android vero, vai su `/import/export` e
premi il bottone del file.

- **Si apre il selettore** → salta lo Step 2, fai solo lo Step 3.
- **Non si apre niente** → il guscio non implementa `onShowFileChooser`: serve
  una modifica nel repo ZappMobile, **fuori da questo piano**. Nel frattempo
  applica il ripiego dello Step 2.

- [ ] **Step 2: Ripiego, solo se il selettore non si apre**

In `ImportClient.tsx`, quando `navigator.userAgent` contiene il marcatore del
guscio (lo stesso che il ponte WebView già usa — cercalo in
`src/lib/mobile/`), il bottone non apre l'input ma un link a
`https://zapp-mu.vercel.app/import/export` con `target="_blank"`, sotto la
riga: "Si apre nel browser: da qui il telefono non riesce a scegliere il file."

- [ ] **Step 3: La chip dice la verità**

In `ImportProvider.tsx`, sotto la barra di avanzamento, aggiungi una riga
visibile solo mentre l'import è in corso:

```tsx
<p className="text-xs text-muted">Tieni Zapp aperto: l&apos;import va avanti solo qui.</p>
```

Il motivo va scritto nel commento sopra: sul telefono il JavaScript si ferma
quando l'app va in secondo piano, e i blocchi già scritti restano — riaprendo,
l'import riprende da dove era.

- [ ] **Step 4: Verifica**

Run: `pnpm typecheck && pnpm lint && pnpm test`
Expected: tutti verdi.

- [ ] **Step 5: Commit**

```bash
git add src/components/import/ImportProvider.tsx "src/app/(app)/import/[source]/ImportClient.tsx"
git commit -m "feat(import): import da telefono, con la chip che dice di tenere l'app aperta"
```

---

### Task 10: Documentazione e cancello

**Files:**
- Modify: `docs/architecture/social.md` (sezione "Import multi-sorgente")
- Modify: `CLAUDE.md` (solo la riga dei test: l'elenco dei moduli coperti da Vitest)

- [ ] **Step 1: Scrivi la documentazione**

In `docs/architecture/social.md`, dentro la voce "Import multi-sorgente",
aggiungi un capoverso che dica **solo ciò che il codice non dice**:

- gli slug diventano cinque, il quinto è `export`;
- le colonne si riconoscono per nome **e per contenuto**, perché gli export
  Apple hanno intestazioni opache, e il ruolo di ogni colonna si assegna una
  volta sola (vince il punteggio più alto);
- soglia 120 s (trailer) e 85% (in corso), e perché;
- gli `episodeTitles` ora li produce anche questa sorgente: è ciò che fa
  funzionare `resolveEpisodeNumber` fuori da Netflix;
- il file **non passa dal corpo della Server Action** ma da `import-uploads`, e
  viene cancellato appena letto — con il motivo (100 MB, e il telefono che non
  sa aprire uno zip);
- dello zip si aprono solo le tabelle: gli allegati non consumano nemmeno budget.

In `CLAUDE.md`, aggiungi `sniff.ts`, `titolo.ts` ed `export.ts` all'elenco dei
moduli coperti da Vitest. **Non aggiungere altro**: il resto è dettaglio di
sottosistema e sta in `social.md`.

- [ ] **Step 2: Cancello completo**

```bash
pnpm typecheck && pnpm lint && pnpm test
NEXT_DIST_DIR=.next-check pnpm build
```

Expected: tutti verdi, build completata.

- [ ] **Step 3: Commit**

```bash
git add docs/architecture/social.md CLAUDE.md
git commit -m "docs(import): racconta la sorgente export e il caricamento su Storage"
```

- [ ] **Step 4: Rilascio (solo quando l'utente lo chiede)**

```bash
git fetch origin && git merge origin/main
pnpm typecheck && pnpm lint && pnpm test
node scripts/rilascio.mjs
```

Il rilascio confronta rotte **e pesi** con il deployment precedente: `/import/export`
deve comparire fra le rotte nuove. Una rotta **sparita** significa che si è perso
il lavoro di un'altra sessione — fermati e leggi cosa dice lo script.

---

## Self-review

**Copertura della spec (fase 1):**

| Requisito della spec | Task |
| --- | --- |
| Selezione dei file dentro l'export | 5, 7 |
| Profilazione colonne per nome e per contenuto | 1 |
| Profili noti per piattaforma | *non in questo piano* — si aggiungono quando arriva un export vero, come dice la spec |
| Titolo → stagione/episodio/nome episodio | 2 |
| Soglia 120 s e progresso < 85% → `watching` | 3 |
| Scala dei voti | 3 |
| Ordine giorno/mese sull'intero file | 3 |
| Raggruppamento + `episodeTitles` | 4 |
| `avvisi` in `ParsedSource` e in pagina | 5, 8 |
| Caricamento su Storage, 100 MB, cancellazione | 6, 8 |
| Apertura selettiva dello zip | 7 |
| Tutto dal telefono | 8, 9 |
| Schede istruzioni per piattaforma | 6 (la scheda `export`); le quattro schede `apple/disney/now/prime` arrivano con la fase 3, che è quella che manda l'utente a chiedere il file |

**Type consistency:** `ImportCandidate.status` si allarga a
`"watched" | "want" | "watching"` nel Task 3 e da lì in poi tutti i task lo usano
così; `ParsedSource.avvisi` nasce nel Task 5 e viene consumato nei Task 8 e 9;
`unzipSources` prende il terzo parametro nel Task 7 e lo usa solo il Task 8 (le
chiamate esistenti restano a due parametri e continuano a compilare).

**Rischio noto da verificare al Task 3:** `inferDateOrder` oggi vive in
`sources/netflix.ts` e potrebbe non esporre una funzione `toIso`. Se non c'è, va
aggiunta lì accanto senza cambiare il comportamento esistente, e i test di
Netflix devono restare verdi — sono la rete che dice se l'hai rotta.
