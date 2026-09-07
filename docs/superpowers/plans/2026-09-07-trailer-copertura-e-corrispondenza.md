# Trailer: copertura piena e nessuna corrispondenza sbagliata — piano di implementazione

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ogni scheda titolo e ogni pagina stagione mostra un trailer — italiano da canale ufficiale quando esiste, inglese ufficiale ed etichettato altrimenti — e il trailer mostrato è sempre di quel titolo.

**Architecture:** una scala a tre gradini in `src/lib/trailers/` (TMDB italiano da canale ufficiale → ricerca YouTube italiana verificata → TMDB in altra lingua, etichettato). La garanzia anti-scambio vive in un modulo puro nuovo, `match.ts`, unico punto in cui si decide se un video è di un titolo. L'orchestrazione della scala viene estratta in `compute.ts` con le sue dipendenze iniettate, così è testabile con Vitest e riusabile dallo script di backfill; `official.ts` resta il guscio DB-first che legge e scrive `title_trailers`.

**Tech Stack:** Next.js 15 App Router, TypeScript strict, Supabase (service client), YouTube oEmbed + Data API v3, Vitest, pnpm.

**Spec:** `docs/superpowers/specs/2026-09-07-trailer-copertura-e-corrispondenza-design.md`

## Global Constraints

- Commenti e stringhe di interfaccia in **italiano**; codice e nomi in inglese come nel resto del progetto.
- Prettier: virgolette doppie, virgole finali, `printWidth` 90. Prima di ogni commit: `pnpm format` sui file toccati.
- Test solo su funzioni pure, in `src/**/*.test.ts`, eseguiti con `pnpm test` (Vitest, `environment: node`).
- Moduli che fanno rete o toccano il DB iniziano con `import "server-only";`. **`match.ts`, `compute.ts`, `similarity.ts` e `stored.ts` non devono importarlo**: sono coperti da Vitest.
- Alias di percorso `@/*` → `src/*`.
- Nessuna libreria nuova: niente dipendenze aggiunte in `package.json`.
- La build si verifica **sempre** in una cartella isolata: `NEXT_DIST_DIR=.next-check pnpm build`. Mai due `next build` nello stesso `.next`.
- Le migration si applicano al progetto Supabase `bbuhwzdbzxgydewmcdwd` via MCP (`mcp__claude_ai_Supabase__apply_migration`), **non** con `supabase db push`; dopo ogni migration si rigenera `src/types/database.ts`.
- Soglie, copiate dalla spec e da usare verbatim: accettazione ricerca `MATCH_MIN = 0.9`; veto sui video TMDB `CONTRADICTION_MAX = 0.45`; tentativi di ricerca per titolo `MAX_SEARCH_TRIES = 3` con attese `0`, `7 giorni`, `30 giorni`; riga piena italiana 30 giorni, riga piena inglese con tentativi residui 7 giorni, riga vuota 1 giorno.

---

### Task 1: modulo condiviso di somiglianza fra titoli

`titleSimilarity` e `normalizeTitle` vivono oggi in `src/lib/import/netflix-title.ts` (import Netflix). Servono anche ai trailer: si spostano in un modulo neutro, senza cambiarne il comportamento, e `netflix-title.ts` li ri-esporta così i suoi test e i suoi chiamanti non cambiano.

**Files:**
- Create: `src/lib/text/similarity.ts`
- Modify: `src/lib/import/netflix-title.ts` (righe 10-91: rimuovere le definizioni, aggiungere import + re-export)
- Test: nessun test nuovo; valgono `src/lib/import/netflix-title.test.ts` e gli altri test dell'import.

**Interfaces:**
- Consuma: niente.
- Produce: `normalizeTitle(s: string): string`, `titleSimilarity(a: string, b: string): number`, `MATCH_THRESHOLD: number` da `@/lib/text/similarity`.

- [ ] **Step 1: creare il modulo spostando il codice verbatim**

Crea `src/lib/text/similarity.ts` con, **copiate senza modifiche** da `src/lib/import/netflix-title.ts`, le costanti `ARTICLES`, `GENERIC_SUFFIX`, `SUBTITLE_SEPARATOR_RE`, `MATCH_THRESHOLD` e le funzioni `normalizeTitle`, `bigrams`, `dice`, `titleSimilarity` (con i loro commenti). Intestazione del file:

```ts
/**
 * Confronto fra titoli: forma canonica e somiglianza. Usato dall'import Netflix
 * (riconoscere un titolo del CSV su TMDB) e dai trailer (accertare che un video
 * YouTube sia di quel titolo). Funzioni pure, nessun `server-only`.
 */
```

I parametri di `titleSimilarity` si rinominano da `(netflix, tmdb)` a `(a, b)` — il modulo non è più solo dell'import — lasciando invariati corpo e commento esplicativo, che cita gli esempi Netflix.

- [ ] **Step 2: far ri-esportare a `netflix-title.ts`**

In `src/lib/import/netflix-title.ts` togli le definizioni spostate e metti in cima, dopo il commento di intestazione del file:

```ts
import { normalizeTitle, titleSimilarity } from "@/lib/text/similarity";

export { MATCH_THRESHOLD, normalizeTitle, titleSimilarity } from "@/lib/text/similarity";
```

Il resto del file (`resolveEpisodeNumber`, il parsing delle righe) usa già quei nomi e non cambia.

- [ ] **Step 3: verificare che nulla si sia rotto**

Run: `pnpm test`
Expected: PASS, stesso numero di test di prima.

Run: `pnpm typecheck`
Expected: nessun errore.

- [ ] **Step 4: commit**

```bash
pnpm format
git add src/lib/text/similarity.ts src/lib/import/netflix-title.ts
git commit -m "refactor(text): un solo confronto fra titoli per import e trailer"
```

---

### Task 2: `match.ts`, la garanzia anti-scambio

Il cuore del lavoro. Modulo puro che decide se un video YouTube è di un titolo. Si scrive con i test prima: le fixture sono i casi sbagliati trovati in produzione.

**Files:**
- Create: `src/lib/trailers/match.ts`
- Test: `src/lib/trailers/match.test.ts`

**Interfaces:**
- Consuma: `normalizeTitle`, `titleSimilarity` da `@/lib/text/similarity` (Task 1).
- Produce:
  - `interface TitleIdentity { title: string; originalTitle?: string | null; mediaType: "movie" | "tv"; season?: number }`
  - `workName(videoTitle: string, channelName?: string | null): string`
  - `videoMatchesTitle(videoTitle: string, id: TitleIdentity, channelName?: string | null): boolean`
  - `videoContradictsTitle(videoTitle: string, id: TitleIdentity, channelName?: string | null): boolean`
  - `MATCH_MIN: number`, `CONTRADICTION_MAX: number`

- [ ] **Step 1: scrivere il test che fallisce**

Crea `src/lib/trailers/match.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  videoContradictsTitle,
  videoMatchesTitle,
  workName,
} from "./match";

const movie = (title: string, originalTitle?: string) =>
  ({ title, originalTitle, mediaType: "movie" }) as const;
const tv = (title: string, season?: number) =>
  ({ title, mediaType: "tv", season }) as const;

describe("workName", () => {
  it("toglie etichette, canale e coda promozionale", () => {
    expect(workName("ONE PIECE | Trailer ufficiale | Netflix")).toBe("ONE PIECE");
    expect(workName("SILO — Trailer ufficiale | Apple TV+")).toBe("SILO");
    expect(
      workName("I Pinguini di Madagascar | Teaser Trailer Ufficiale Italiano | Dal 27 Novembre al cinema"),
    ).toBe("I Pinguini di Madagascar");
    expect(workName("Il Padrino 50° anniversario | Trailer | Eagle Pictures")).toBe(
      "Il Padrino",
    );
  });

  it("tiene il sottotitolo vero", () => {
    expect(workName("El Camino: Il film di Breaking Bad | Trailer ufficiale")).toBe(
      "El Camino: Il film di Breaking Bad",
    );
    expect(workName("Zathura - Un'avventura spaziale - Trailer italiano")).toBe(
      "Zathura: Un'avventura spaziale",
    );
  });

  it("non lascia nulla quando il nome è solo un'etichetta", () => {
    expect(workName("Trailer ufficiale")).toBe("");
    expect(workName("Trailer Ufficiale Italiano")).toBe("");
  });
});

describe("videoMatchesTitle — i casi sbagliati trovati in produzione", () => {
  const cases: [string, ReturnType<typeof movie> | ReturnType<typeof tv>][] = [
    ["SCAPPA - GET OUT - Trailer italiano ufficiale", tv("Prison Break")],
    ["SCAPPA - GET OUT - Trailer italiano ufficiale", tv("Il giardiniere")],
    [
      "Il Cavaliere Oscuro - Il Ritorno | Primo trailer italiano ufficiale",
      movie("Batman Begins"),
    ],
    ["I MOLTI SANTI DEL NEW JERSEY – Trailer Ufficiale Italiano", tv("I Soprano")],
    [
      "El Camino: Il film di Breaking Bad | Trailer ufficiale | Netflix Italia",
      tv("Breaking Bad"),
    ],
    [
      "Peaky Blinders: The Immortal Man | Trailer ufficiale | Netflix Italia",
      tv("Peaky Blinders"),
    ],
    [
      "Madagascar 3: Ricercati in Europa - Trailer italiano ufficiale",
      movie("Madagascar"),
    ],
    [
      "Chernobyl | 40 anni dalla catastrofe del 26 aprile 1986 | Trailer Ufficiale | Sky Italia",
      tv("Chernobyl"),
    ],
    ["Super Market | Trailer Ufficiale | Prime Video", tv("Superstore")],
  ];
  it.each(cases)("scarta %s", (video, id) => {
    expect(videoMatchesTitle(video, id)).toBe(false);
  });
});

describe("videoMatchesTitle — accettazioni", () => {
  it("accetta il trailer del titolo, anche con edizione o maiuscole diverse", () => {
    expect(
      videoMatchesTitle("Il Padrino 50° anniversario | Trailer | Eagle Pictures", movie("Il padrino")),
    ).toBe(true);
    expect(videoMatchesTitle("SILO — Trailer ufficiale | Apple TV+", tv("Silo"))).toBe(
      true,
    );
    expect(
      videoMatchesTitle("ONE PIECE | Trailer ufficiale | Netflix", tv("One Piece")),
    ).toBe(true);
  });

  it("accetta sul titolo originale quando il video non usa quello italiano", () => {
    expect(
      videoMatchesTitle(
        "Inception - Trailer ufficiale italiano",
        movie("Inception", "Inception"),
      ),
    ).toBe(true);
  });

  it("tiene il sottotitolo del titolo quando c'è da entrambe le parti", () => {
    expect(
      videoMatchesTitle(
        "Zathura - Un'avventura spaziale - Trailer italiano",
        movie("Zathura - Un'avventura spaziale"),
      ),
    ).toBe(true);
  });
});

describe("videoMatchesTitle — stagioni", () => {
  const video =
    "House Of The Dragon | Stagione 3 | Teaser Trailer Ufficiale | Sky Italia";
  it("accetta la stagione richiesta", () => {
    expect(videoMatchesTitle(video, tv("House of the Dragon", 3))).toBe(true);
  });
  it("scarta un'altra stagione", () => {
    expect(videoMatchesTitle(video, tv("House of the Dragon", 1))).toBe(false);
  });
  it("sulla scheda della serie un trailer di stagione va bene", () => {
    expect(videoMatchesTitle(video, tv("House of the Dragon"))).toBe(true);
  });
});

describe("videoContradictsTitle", () => {
  it("un nome generico non smentisce nulla", () => {
    expect(videoContradictsTitle("Trailer ufficiale", movie("Il robot selvaggio"))).toBe(
      false,
    );
  });
  it("un nome d'opera estraneo smentisce", () => {
    expect(
      videoContradictsTitle("Wicked | Trailer ufficiale", movie("Oceania")),
    ).toBe(true);
  });
  it("non smentisce una parte di saga dello stesso titolo", () => {
    expect(
      videoContradictsTitle("Dune | Trailer ufficiale", movie("Dune - Parte due")),
    ).toBe(false);
  });
});
```

- [ ] **Step 2: eseguire i test e vederli fallire**

Run: `pnpm test src/lib/trailers/match.test.ts`
Expected: FAIL — "Failed to resolve import ./match".

- [ ] **Step 3: scrivere `match.ts`**

Crea `src/lib/trailers/match.ts`:

```ts
/**
 * Un video YouTube è di questo titolo? Unico punto in cui Zapp lo decide.
 *
 * Serve perché la ricerca su YouTube restituisce, dallo stesso canale ufficiale e
 * con la stessa parola "trailer" nel nome, il trailer di un altro film: il fondale
 * di "Prison Break" era il trailer di "Scappa - Get Out", quello di "Breaking Bad"
 * il trailer di "El Camino". Il confronto è per **uguaglianza** del nome dell'opera,
 * mai per contenimento, e nel dubbio si scarta: un trailer perso costa il ripiego
 * inglese, un trailer sbagliato costa la fiducia nell'app.
 *
 * Funzioni pure (Vitest): nessuna rete, nessun `server-only`.
 */
import { normalizeTitle, titleSimilarity } from "@/lib/text/similarity";

export interface TitleIdentity {
  title: string;
  /** Titolo originale TMDB: il video può usare quello invece dell'italiano. */
  originalTitle?: string | null;
  mediaType: "movie" | "tv";
  /** > 0 sulla pagina di una stagione: il video deve nominare quella stagione. */
  season?: number;
}

/** Somiglianza minima per accettare un video trovato con la ricerca YouTube. */
export const MATCH_MIN = 0.9;
/** Sotto questa somiglianza un nome d'opera riconoscibile smentisce un video TMDB. */
export const CONTRADICTION_MAX = 0.45;
/** Sotto questa lunghezza (dopo normalizzazione) il nome non è abbastanza per giudicare. */
const SUBSTANTIAL_CHARS = 6;

/** Separatori con cui un nome YouTube divide opera, sottotitolo, etichette e canale. */
const SEPARATOR = /\s*\|\s*|\s+[-–—]\s+|:\s+/;

/** Frammenti che dentro una parte non fanno parte del nome dell'opera. */
const NOISE = [
  /\[[^\]]*\]/g,
  /\([^)]*\)/g,
  /#\d+/g,
  /\b\d+\s*°?\s*anniversari\w*/gi,
  /\bversione\s+restaurata\b/gi,
  /\bremaster\w*/gi,
  /\bdirector'?s\s+cut\b/gi,
  /\b(hd|4k|imax|uhd)\b/gi,
];

/** Una parte fatta solo di etichette del trailer: si butta via. */
const LABEL =
  /\b(trailer|teaser|clip|featurette|spot|promo|anteprima|first\s+look|sneak\s+peek|official|ufficiale|italiano|italiana|english|ita|sub\s*ita|sottotitolat\w*|doppiat\w*|esteso|extended|final|nuovo|primo|secondo|internazionale|red\s+band)\b/i;

/** Coda promozionale: data d'uscita, "al cinema", "su Netflix", "streaming". */
const PROMO =
  /\b(in\s+cinemas?|in\s+theat(er|re)s|al\s+cinema|nei\s+cinema|solo\s+al\s+cinema|only\s+in|dal\s+\d|from\s+\w+\s+\d|coming\s+soon|prossimamente|disponibile|guarda\s+ora|watch\s+now|now\s+playing|streaming|su\s+netflix|su\s+prime\s+video|su\s+disney)\b/i;

/** Nomi di piattaforma che chiudono un nome YouTube ("| Apple TV+", "| Netflix"). */
const PLATFORM =
  /^(netflix|prime\s*video|amazon(\s+prime\s+video)?|apple\s*tv\+?|sky|now|disney\+?|paramount\+?|infinity|mediaset\s*infinity|crunchyroll|mubi|rai(\s*play)?|hbo(\s*max)?|max|discovery\+?)(\s+italia)?$/i;

/** Marcatore di stagione: sempre da buttare per le serie ("Stagione 3", "Season 3"). */
const SEASON_MARKER = /^(stagione|season)\s+\d+$/i;
/** Marcatore di parte: da buttare solo per le serie ("Parte 1"); nei film è il titolo. */
const PART_MARKER = /^(parte|part|volume|vol\.?|capitolo|chapter)\s+[\divx]+$/i;

/** Numero finale del nome (cifra o numero romano): distingue un seguito dall'originale. */
const TRAILING_NUMBER = /\s(\d{1,2}|[ivx]{1,4})$/i;

function scrub(part: string): string {
  let out = part;
  for (const re of NOISE) out = out.replace(re, " ");
  return out.replace(/\s+/g, " ").trim();
}

function isDroppable(part: string, mediaType: "movie" | "tv"): boolean {
  if (part.length === 0) return true;
  if (PLATFORM.test(part)) return true;
  if (PROMO.test(part)) return true;
  if (SEASON_MARKER.test(part)) return true;
  if (mediaType === "tv" && PART_MARKER.test(part)) return true;
  // una parte fatta solo di etichette ("Trailer italiano ufficiale") non è l'opera
  return LABEL.test(part) && part.replace(LABEL, "").replace(/[^\p{L}\d]/gu, "") === "";
}

/** Le parti di un nome, ripulite e senza etichette: il nome dell'opera, a pezzi. */
function nameParts(videoTitle: string, mediaType: "movie" | "tv"): string[] {
  return videoTitle
    .split(SEPARATOR)
    .map(scrub)
    .filter((part) => !isDroppable(part, mediaType));
}

/**
 * Il nome YouTube ridotto al nome dell'opera, con i sottotitoli veri uniti da ": ".
 * Stringa vuota se il nome non contiene un'opera ("Trailer ufficiale").
 * `channelName`, se noto, toglie la firma del canale anche quando non è una
 * piattaforma nota ("| Eagle Pictures").
 */
export function workName(videoTitle: string, channelName?: string | null): string {
  const channel = channelName ? normalizeTitle(channelName) : "";
  const parts = nameParts(videoTitle, "movie").filter(
    (part) => channel.length === 0 || normalizeTitle(part) !== channel,
  );
  return parts.join(": ");
}

/** Le parti di un titolo del catalogo, con lo stesso taglio dei nomi YouTube. */
function titleParts(title: string): string[] {
  return title
    .split(SEPARATOR)
    .map(scrub)
    .filter((part) => part.length > 0);
}

function trailingNumber(part: string): string {
  const match = normalizeTitle(part).match(TRAILING_NUMBER);
  return match ? match[1].toLowerCase() : "";
}

/** Due nomi combaciano: stesso numero finale e somiglianza sopra la soglia. */
function partsMatch(video: string[], title: string[]): boolean {
  if (video.length !== title.length) return false;
  return video.every((part, i) => {
    if (trailingNumber(part) !== trailingNumber(title[i])) return false;
    return titleSimilarity(part, title[i]) >= MATCH_MIN;
  });
}

function mentionsSeason(videoTitle: string, season: number): boolean {
  return new RegExp(`\\b(stagione|season|parte|part)\\s*${season}\\b`, "i").test(
    videoTitle,
  );
}

/**
 * Il video è di quel titolo? Porta del gradino 2 (ricerca YouTube): deve essere certo.
 * Confronta parte per parte il nome dell'opera con il titolo **e** con il titolo
 * originale; un sottotitolo o un numero in più da una sola parte è un altro film.
 */
export function videoMatchesTitle(
  videoTitle: string,
  id: TitleIdentity,
  channelName?: string | null,
): boolean {
  if (id.season != null && id.season > 0 && !mentionsSeason(videoTitle, id.season)) {
    return false;
  }
  const channel = channelName ? normalizeTitle(channelName) : "";
  const video = nameParts(videoTitle, id.mediaType).filter(
    (part) => channel.length === 0 || normalizeTitle(part) !== channel,
  );
  if (video.length === 0) return false;
  const candidates = [id.title, id.originalTitle].filter(
    (t): t is string => typeof t === "string" && t.length > 0,
  );
  return candidates.some((candidate) => partsMatch(video, titleParts(candidate)));
}

/**
 * Il video è palesemente di un'ALTRA opera? Veto usato sui video presi da TMDB, che
 * TMDB associa già al titolo: si scarta solo quando il nome YouTube contiene un nome
 * d'opera sostanziale che non somiglia né al titolo né all'originale. Un nome
 * generico ("Trailer ufficiale") non veta mai.
 */
export function videoContradictsTitle(
  videoTitle: string,
  id: TitleIdentity,
  channelName?: string | null,
): boolean {
  const name = workName(videoTitle, channelName);
  if (normalizeTitle(name).length < SUBSTANTIAL_CHARS) return false;
  const candidates = [id.title, id.originalTitle].filter(
    (t): t is string => typeof t === "string" && t.length > 0,
  );
  if (candidates.length === 0) return false;
  const best = Math.max(...candidates.map((c) => titleSimilarity(name, c)));
  return best < CONTRADICTION_MAX;
}
```

- [ ] **Step 4: eseguire i test finché passano**

Run: `pnpm test src/lib/trailers/match.test.ts`
Expected: PASS su tutti i casi.

Se un caso di accettazione fallisce, la correzione va fatta **allargando la pulizia** (`NOISE`, `LABEL`, `PLATFORM`, `PROMO`), mai abbassando `MATCH_MIN`: la soglia è il contratto anti-scambio. Se un caso di scarto passa, aggiungi la regola mancante e ri-esegui.

- [ ] **Step 5: commit**

```bash
pnpm format
git add src/lib/trailers/match.ts src/lib/trailers/match.test.ts
git commit -m "feat(trailers): un video vale solo se e' di quel titolo"
```

---

### Task 3: la lingua dentro il trailer

`Trailer` guadagna `lang`. Il cambio di forma fa sì che `parseTrailers` consideri non valide tutte le righe salvate con la forma vecchia: si ricalcolano da sole.

**Files:**
- Modify: `src/lib/trailers/frame-bars.ts` (interfaccia `Trailer`)
- Modify: `src/lib/trailers/frame.ts` (`withFrames`)
- Modify: `src/lib/trailers/stored.ts` (`parseTrailers`)
- Test: `src/lib/trailers/stored.test.ts` (esistente, da estendere)

**Interfaces:**
- Consuma: niente.
- Produce: `interface Trailer { key: string; frame: TrailerFrame; lang: "it" | "en" }`; `withFrames(keys: string[], lang: "it" | "en"): Promise<Trailer[]>`.

- [ ] **Step 1: scrivere i test che falliscono**

In `src/lib/trailers/stored.test.ts` aggiungi:

```ts
it("scarta una riga senza lingua: forma vecchia, da ricalcolare", () => {
  expect(parseTrailers([{ key: "abc", frame: { x: 0, y: 0, w: 1, h: 1 } }])).toBeNull();
});

it("scarta una lingua sconosciuta", () => {
  expect(
    parseTrailers([{ key: "abc", frame: { x: 0, y: 0, w: 1, h: 1 }, lang: "fr" }]),
  ).toBeNull();
});

it("legge una riga con la lingua", () => {
  expect(
    parseTrailers([{ key: "abc", frame: { x: 0, y: 0, w: 1, h: 1 }, lang: "en" }]),
  ).toEqual([{ key: "abc", frame: { x: 0, y: 0, w: 1, h: 1 }, lang: "en" }]);
});
```

Adegua i test già presenti nel file che costruiscono trailer senza `lang`: aggiungi `lang: "it"` all'oggetto atteso e all'input.

- [ ] **Step 2: eseguire i test e vederli fallire**

Run: `pnpm test src/lib/trailers/stored.test.ts`
Expected: FAIL — la riga senza `lang` viene ancora accettata.

- [ ] **Step 3: cambiare tipo, `withFrames` e `parseTrailers`**

In `src/lib/trailers/frame-bars.ts`, sostituisci l'interfaccia `Trailer`:

```ts
/**
 * Un trailer candidato per il fondale: chiave YouTube, riquadro dell'immagine reale e
 * lingua. `lang` è `"it"` quando TMDB o YouTube dichiarano l'italiano, o quando il
 * canale è di un distributore italiano; `"en"` è il ripiego, dichiarato in pagina.
 */
export interface Trailer {
  key: string;
  frame: TrailerFrame;
  lang: TrailerLang;
}

/** Lingua dichiarata di un trailer: `"en"` vale "non italiano". */
export type TrailerLang = "it" | "en";
```

In `src/lib/trailers/frame.ts` esporta anche il tipo nuovo e cambia `withFrames`:

```ts
export type { Trailer, TrailerFrame, TrailerLang } from "./frame-bars";

/** Chiavi → trailer con riquadro e lingua, nello stesso ordine. */
export async function withFrames(keys: string[], lang: TrailerLang): Promise<Trailer[]> {
  const frames = await Promise.all(keys.map(getTrailerFrame));
  return keys.map((key, i) => ({ key, frame: frames[i], lang }));
}
```

(aggiungi `TrailerLang` all'import da `./frame-bars` in cima al file.)

In `src/lib/trailers/stored.ts`, dentro il ciclo di `parseTrailers`, dopo il controllo dei numeri del riquadro:

```ts
    const { key, frame, lang } = item as {
      key?: unknown;
      frame?: unknown;
      lang?: unknown;
    };
    if (typeof key !== "string" || !frame || typeof frame !== "object") return null;
    if (lang !== "it" && lang !== "en") return null;
```

e la riga di push diventa `out.push({ key, frame: { x, y, w, h }, lang });`. Aggiorna il commento del file: la forma vecchia (senza `lang`) va ricalcolata.

- [ ] **Step 4: eseguire i test**

Run: `pnpm test src/lib/trailers/stored.test.ts`
Expected: PASS.

Run: `pnpm typecheck`
Expected: errori **attesi** in `official.ts` (chiamata a `withFrames` con un argomento) e in `CinematicBackdrop.tsx`: li chiudono i Task 8 e 10. Annota gli errori e prosegui.

- [ ] **Step 5: commit**

```bash
pnpm format
git add src/lib/trailers/frame-bars.ts src/lib/trailers/frame.ts src/lib/trailers/stored.ts src/lib/trailers/stored.test.ts
git commit -m "feat(trailers): ogni trailer porta la sua lingua"
```

---

### Task 4: allowlist dei canali allargata

L'allowlist di 47 canali scarta trailer ufficiali italiani veri (Apple Italia, DreamWorks Animation Italy) e non contiene nessuno dei canali di studio che ospitano i trailer inglesi del catalogo. Si allarga con i canali del censimento versionato.

**Files:**
- Modify: `src/lib/trailers/channels.ts` (array `OFFICIAL_CHANNELS`)
- Read: `docs/design/data/youtube-channel-census.txt` (numero di video nel catalogo, quota cumulata, id, nome, esempio)
- Test: `src/lib/trailers/channels.test.ts` (esistente, da estendere)

**Interfaces:**
- Consuma: niente.
- Produce: nessuna firma nuova; `OFFICIAL_CHANNELS` più lungo.

- [ ] **Step 1: scegliere i canali dal censimento**

Apri `docs/design/data/youtube-channel-census.txt` e prendi le **prime 120 righe** (coprono circa i tre quarti dei video del catalogo). Per ognuna decidi:

- **Entra** se è il canale di uno studio, di un distributore o di una piattaforma: "Netflix", "Warner Bros.", "Sony Pictures Entertainment", "Lionsgate Movies", "Marvel Entertainment", "Universal Pictures", "Paramount Pictures", "Disney", "Pixar", "20th Century Studios", "Apple Italia", "DreamWorks Animation Italy", le filiali nazionali (`Universal Pictures UK`, `Sony Pictures Canada`, `Warner Bros. UK & Ireland`, `ColumbiaPicturesPH`, …), A24, Focus Features, Searchlight, Neon.
- **Resta fuori** se è un aggregatore di trailer, una testata, un'agenzia stampa (`Pressview`), un canale personale o un canale il cui nome non identifica un distributore. Nel dubbio, **fuori**: un canale mancante costa un trailer, un canale sbagliato costa un trailer falso.

Per ogni canale che entra, `italian: true` **solo** se pubblica esclusivamente materiale italiano (filiali italiane); tutti i canali globali e le filiali di altri paesi vanno `italian: false`, così la lingua non si presume mai.

- [ ] **Step 2: ricavare l'handle e verificare il canale**

L'id (`UC…`) è già nel censimento. L'handle serve al confronto via oEmbed: prendilo da `author_url` dell'oEmbed di un video di quel canale.

```bash
curl -s "https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=<CHIAVE_DI_ESEMPIO>&format=json"
```

`<CHIAVE_DI_ESEMPIO>` non è nel censimento: usa una qualsiasi chiave del catalogo di quel canale, oppure interroga la Data API con la chiave in `.env.local`:

```bash
curl -s "https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics&id=<CHANNEL_ID>&key=$YOUTUBE_API_KEY"
```

Da lì prendi `snippet.customUrl` (l'handle, senza `@`) e controlla `statistics.videoCount`: un canale con pochissimi video è uno squatter e **non entra** (regola già scritta in `CLAUDE.md`, imparata su `@dynit` e `@fandangoofficial`).

- [ ] **Step 3: aggiungere i canali**

Aggiungi le voci in `OFFICIAL_CHANNELS` in `src/lib/trailers/channels.ts`, nella forma già usata dal file, mettendo i canali italiani nel blocco esistente e quelli globali dopo il commento `// canali globali: trailer in molte lingue, serve la conferma dell'italiano`:

```ts
  {
    id: "UCWOA1ZGywLbqmigxE4Qlvuw",
    handle: "Netflix",
    name: "Netflix",
    italian: false,
  },
```

Aggiorna il commento in cima al file: l'allowlist non serve più solo ai trailer italiani, ma anche a scegliere i trailer inglesi di ripiego; resta scritta a mano, nessun canale entra da solo.

- [ ] **Step 4: estendere i test**

In `src/lib/trailers/channels.test.ts` aggiungi:

```ts
it("non ha id né handle doppioni", () => {
  const ids = OFFICIAL_CHANNELS.map((c) => c.id);
  const handles = OFFICIAL_CHANNELS.map((c) => c.handle.toLowerCase());
  expect(new Set(ids).size).toBe(ids.length);
  expect(new Set(handles).size).toBe(handles.length);
});

it("ogni id ha la forma di un channelId YouTube", () => {
  for (const c of OFFICIAL_CHANNELS) expect(c.id).toMatch(/^UC[\w-]{22}$/);
});

it("riconosce i canali aggiunti", () => {
  expect(getOfficialChannel("UCWOA1ZGywLbqmigxE4Qlvuw")?.italian).toBe(false);
  expect(
    matchOfficialChannel({
      authorUrl: "https://www.youtube.com/@AppleItalia",
      authorName: "Apple Italia",
    })?.italian,
  ).toBe(true);
});
```

Aggiungi `getOfficialChannel` e `matchOfficialChannel` agli import del file di test se non ci sono.

- [ ] **Step 5: eseguire i test**

Run: `pnpm test src/lib/trailers/channels.test.ts`
Expected: PASS.

- [ ] **Step 6: commit**

```bash
pnpm format
git add src/lib/trailers/channels.ts src/lib/trailers/channels.test.ts
git commit -m "feat(trailers): allowlist allargata sui canali reali del catalogo"
```

---

### Task 5: migration per il governo della quota

Due colonne per non spendere più di tre ricerche YouTube per titolo.

**Files:**
- Create: `supabase/migrations/0020_title_trailers_search.sql`
- Modify: `src/types/database.ts` (rigenerato, non scritto a mano)

**Interfaces:**
- Consuma: niente.
- Produce: `title_trailers.search_at timestamptz | null`, `title_trailers.search_tries smallint` nei tipi generati.

- [ ] **Step 1: scrivere la migration**

Crea `supabase/migrations/0020_title_trailers_search.sql`:

```sql
-- Governo della quota di ricerca YouTube (search.list costa 100 unità su 10.000
-- al giorno: 100 ricerche al giorno per un catalogo di migliaia di titoli).
-- `search_at` è l'ultimo tentativo di ricerca del trailer italiano, `search_tries`
-- quanti ne sono stati fatti: al terzo si smette, così un titolo che in italiano
-- non esiste non consuma quota per sempre.
alter table public.title_trailers
  add column if not exists search_at timestamptz,
  add column if not exists search_tries smallint not null default 0;

comment on column public.title_trailers.search_at is
  'Ultimo tentativo di ricerca YouTube del trailer italiano.';
comment on column public.title_trailers.search_tries is
  'Tentativi di ricerca già spesi (max 3).';
```

- [ ] **Step 2: applicare la migration**

Applicala al progetto `bbuhwzdbzxgydewmcdwd` con `mcp__claude_ai_Supabase__apply_migration`, nome `0020_title_trailers_search`, passando il corpo SQL sopra. **Non** usare `supabase db push`.

- [ ] **Step 3: rigenerare i tipi**

Usa `mcp__claude_ai_Supabase__generate_typescript_types` sul progetto e sovrascrivi `src/types/database.ts` con il risultato.

- [ ] **Step 4: verificare**

Run: `pnpm typecheck`
Expected: gli stessi errori attesi del Task 3, nessuno nuovo dai tipi.

- [ ] **Step 5: commit**

```bash
pnpm format
git add supabase/migrations/0020_title_trailers_search.sql src/types/database.ts
git commit -m "feat(db): tentativi di ricerca trailer su title_trailers"
```

---

### Task 6: candidati TMDB per lingua e ricerca verificata

`rank.ts` cambia in due punti: i candidati TMDB non sono più solo italiani (serve il ripiego inglese) e i risultati della ricerca passano da `videoMatchesTitle`.

**Files:**
- Modify: `src/lib/trailers/rank.ts`
- Test: `src/lib/trailers/rank.test.ts` (esistente, da estendere)

**Interfaces:**
- Consuma: `videoMatchesTitle`, `TitleIdentity` da `./match` (Task 2).
- Produce:
  - `rankTmdbCandidates(videos: TmdbVideos | undefined): TmdbVideo[]` — ora include anche le altre lingue, ordinate dopo le italiane.
  - `RankSearchOptions` guadagna `identity: TitleIdentity`.
  - `rankSearchResults(items: SearchResult[], options: RankSearchOptions): SearchResult[]` — scarta chi non passa `videoMatchesTitle`.
  - `isItalianForChannel` invariata.

- [ ] **Step 1: scrivere i test che falliscono**

In `src/lib/trailers/rank.test.ts` aggiungi:

```ts
describe("rankTmdbCandidates con il ripiego inglese", () => {
  it("mette gli italiani prima, poi gli inglesi, poi i senza lingua", () => {
    const videos = {
      results: [
        { key: "en", site: "YouTube", type: "Trailer", official: true, iso_639_1: "en" },
        { key: "no", site: "YouTube", type: "Trailer", official: true, iso_639_1: null },
        { key: "it", site: "YouTube", type: "Trailer", official: true, iso_639_1: "it" },
      ],
    } as unknown as TmdbVideos;
    expect(rankTmdbCandidates(videos).map((v) => v.key)).toEqual(["it", "en", "no"]);
  });

  it("continua a scartare quel che non è YouTube", () => {
    const videos = {
      results: [
        { key: "v", site: "Vimeo", type: "Trailer", official: true, iso_639_1: "it" },
      ],
    } as unknown as TmdbVideos;
    expect(rankTmdbCandidates(videos)).toEqual([]);
  });
});

describe("rankSearchResults verifica il titolo", () => {
  const base = {
    channelId: "UCi_T2R1AzOCun4-PI4Or2ng", // Netflix Italia, italian: true
    publishedAt: "2024-01-01T00:00:00Z",
  };
  const identity = { title: "Breaking Bad", mediaType: "tv" } as const;

  it("scarta il trailer di un'altra opera dallo stesso canale", () => {
    const items = [
      {
        ...base,
        id: "x",
        title: "El Camino: Il film di Breaking Bad | Trailer ufficiale | Netflix Italia",
      },
    ];
    expect(rankSearchResults(items, { identity })).toEqual([]);
  });

  it("tiene il trailer del titolo", () => {
    const items = [
      { ...base, id: "y", title: "Breaking Bad | Trailer ufficiale | Netflix Italia" },
    ];
    expect(rankSearchResults(items, { identity }).map((r) => r.id)).toEqual(["y"]);
  });
});
```

Adegua le chiamate a `rankSearchResults` già presenti nel file aggiungendo `identity` alle opzioni (il titolo che quei test usano come nome del video).

- [ ] **Step 2: eseguire i test e vederli fallire**

Run: `pnpm test src/lib/trailers/rank.test.ts`
Expected: FAIL — l'inglese non compare fra i candidati e "El Camino" passa la ricerca.

- [ ] **Step 3: cambiare `rank.ts`**

Sostituisci `rankTmdbCandidates` e il suo commento:

```ts
/** Ordine di preferenza per lingua: italiano, poi inglese, poi lingua non dichiarata. */
function langRank(video: TmdbVideo): number {
  if (video.iso_639_1 === "it") return 0;
  if (video.iso_639_1 === "en") return 1;
  return 2;
}

/**
 * Candidati TMDB da verificare con oEmbed: solo YouTube, in ordine Trailer → Teaser e,
 * dentro ogni tipo, italiani → inglesi → senza lingua, ufficiali prima. Le lingue
 * diverse dall'italiano servono al ripiego etichettato "Trailer in inglese": è chi
 * chiama (`compute.ts`) a usarle solo dopo aver esaurito l'italiano.
 */
export function rankTmdbCandidates(videos: TmdbVideos | undefined): TmdbVideo[] {
  const list = (videos?.results ?? []).filter(isYouTube);
  const ranked: TmdbVideo[] = [];
  for (const type of TYPE_ORDER) {
    ranked.push(
      ...list
        .filter((v) => v.type === type)
        .sort((a, b) => langRank(a) - langRank(b) || byOfficial(a, b)),
    );
  }
  return ranked;
}
```

In `RankSearchOptions` aggiungi il campo e togli `season` (ora sta dentro l'identità):

```ts
export interface RankSearchOptions {
  /** Film: data d'uscita TMDB (`YYYY-MM-DD`); scarta video di oltre due anni prima. */
  releaseDate?: string | null;
  /** Chi deve essere il video: la verifica dura di `match.ts`. */
  identity: TitleIdentity;
}
```

Dentro `rankSearchResults`, al posto del controllo `options.season`, metti la verifica dura, usando il nome del canale ufficiale già trovato:

```ts
      if (!videoMatchesTitle(item.title, options.identity, channel.name)) return null;
```

e togli la funzione `mentionsSeason` da `rank.ts`: ora vive in `match.ts`. Aggiorna il commento di `rankSearchResults` citando la verifica del titolo come primo filtro sostanziale.

- [ ] **Step 4: eseguire i test**

Run: `pnpm test src/lib/trailers/rank.test.ts`
Expected: PASS.

`pnpm typecheck` a questo punto segnala `official.ts` (passa ancora `season` a
`rankSearchResults` e non passa `identity`): è atteso, lo chiude il Task 8.

- [ ] **Step 5: commit**

```bash
pnpm format
git add src/lib/trailers/rank.ts src/lib/trailers/rank.test.ts
git commit -m "feat(trailers): candidati TMDB per lingua, ricerca verificata sul titolo"
```

---

### Task 7: `compute.ts`, la scala con le dipendenze iniettate

L'orchestrazione della scala esce da `official.ts` e diventa un modulo puro rispetto alla rete: riceve le funzioni che parlano con YouTube. Così si può testare tutta la scala con Vitest — che è la prova che il trailer sbagliato non passa — e riusarla dallo script di backfill.

**Files:**
- Create: `src/lib/trailers/compute.ts`
- Test: `src/lib/trailers/compute.test.ts`

**Interfaces:**
- Consuma: `rankTmdbCandidates`, `rankSearchResults`, `isItalianForChannel` da `./rank`; `getOfficialChannel`, `matchOfficialChannel` da `./channels`; `videoContradictsTitle`, `TitleIdentity` da `./match`; tipi `SearchResult` da `./rank`, `VideoDetails` da `./youtube`, `VideoAuthor` da `./oembed`.
- Produce:

```ts
export interface TrailerDeps {
  getVideoAuthor(key: string): Promise<VideoAuthor | null>;
  getVideoDetails(ids: string[]): Promise<Map<string, VideoDetails>>;
  searchYouTube(query: string): Promise<SearchResult[] | null>;
}
export interface ComputeRequest {
  videos: TmdbVideos | undefined;
  identity: TitleIdentity;
  releaseDate?: string | null;
  /** Nome per la ricerca; vuoto = niente ricerca. */
  name: string;
  /** Stato della riga in cache, per il governo della quota. */
  searchAt: string | null;
  searchTries: number;
}
export interface ComputeResult {
  keys: string[];
  lang: TrailerLang;
  source: "tmdb" | "youtube" | "none";
  /** Vero se è stata spesa una ricerca: il chiamante aggiorna search_at/search_tries. */
  searched: boolean;
}
export const MAX_SEARCH_TRIES = 3;
export function shouldSearch(input: { searchAt: string | null; searchTries: number; now: number }): boolean;
export function computeTrailers(req: ComputeRequest, deps: TrailerDeps): Promise<ComputeResult | null>;
```

- [ ] **Step 1: far portare a oEmbed anche il nome del video**

`compute.ts` ha bisogno del nome YouTube del video per il veto di `match.ts`, e oggi
`getVideoAuthor` non lo porta. In `src/lib/trailers/oembed.ts`: l'interfaccia `OEmbed`
guadagna `title?: string`, `VideoAuthor` guadagna `title: string | undefined`, e il
ritorno diventa:

```ts
    return { authorUrl: data.author_url, authorName: data.author_name, title: data.title };
```

Aggiorna il commento della funzione: oEmbed dà autore, **nome del video** e vitalità;
il nome serve al veto di `match.ts`.

Run: `pnpm typecheck`
Expected: gli stessi errori attesi di prima, nessuno nuovo.

- [ ] **Step 2: scrivere i test che falliscono**

Crea `src/lib/trailers/compute.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { TmdbVideos } from "@/lib/tmdb/types";
import { computeTrailers, shouldSearch, type TrailerDeps } from "./compute";

const DAY = 24 * 60 * 60 * 1000;
const NETFLIX_IT = "UCi_T2R1AzOCun4-PI4Or2ng"; // italian: true
const NETFLIX = "UCWOA1ZGywLbqmigxE4Qlvuw"; // italian: false

const noDeps: TrailerDeps = {
  getVideoAuthor: async () => null,
  getVideoDetails: async () => new Map(),
  searchYouTube: async () => null,
};

function deps(over: Partial<TrailerDeps>): TrailerDeps {
  return { ...noDeps, ...over };
}

function tmdbVideos(list: Partial<Record<string, unknown>>[]): TmdbVideos {
  return { results: list } as unknown as TmdbVideos;
}

const identity = { title: "Silo", mediaType: "tv" } as const;
const fresh = { name: "Silo", searchAt: null, searchTries: 0 };

describe("shouldSearch", () => {
  const now = Date.parse("2026-09-07T12:00:00Z");
  it("il primo tentativo si fa subito", () => {
    expect(shouldSearch({ searchAt: null, searchTries: 0, now })).toBe(true);
  });
  it("il secondo aspetta 7 giorni", () => {
    const recent = new Date(now - 3 * DAY).toISOString();
    const old = new Date(now - 8 * DAY).toISOString();
    expect(shouldSearch({ searchAt: recent, searchTries: 1, now })).toBe(false);
    expect(shouldSearch({ searchAt: old, searchTries: 1, now })).toBe(true);
  });
  it("il terzo aspetta 30 giorni", () => {
    const old = new Date(now - 31 * DAY).toISOString();
    expect(shouldSearch({ searchAt: new Date(now - 10 * DAY).toISOString(), searchTries: 2, now })).toBe(false);
    expect(shouldSearch({ searchAt: old, searchTries: 2, now })).toBe(true);
  });
  it("non c'è un quarto tentativo", () => {
    const old = new Date(now - 400 * DAY).toISOString();
    expect(shouldSearch({ searchAt: old, searchTries: 3, now })).toBe(false);
  });
});

describe("computeTrailers — la scala", () => {
  it("gradino 1: il trailer italiano di TMDB da canale ufficiale vince", async () => {
    const videos = tmdbVideos([
      { key: "IT", site: "YouTube", type: "Trailer", official: true, iso_639_1: "it" },
      { key: "EN", site: "YouTube", type: "Trailer", official: true, iso_639_1: "en" },
    ]);
    const result = await computeTrailers(
      { ...fresh, videos, identity },
      deps({
        getVideoAuthor: async () => ({
          authorUrl: "https://www.youtube.com/@netflixitalia",
          authorName: "Netflix Italia",
        }),
        getVideoDetails: async (ids) =>
          new Map(
            ids.map((id) => [
              id,
              { channelId: NETFLIX_IT, audioLanguage: null, embeddable: true },
            ]),
          ),
        searchYouTube: async () => {
          throw new Error("non deve cercare");
        },
      }),
    );
    expect(result).toMatchObject({ keys: ["IT"], lang: "it", source: "tmdb", searched: false });
  });

  it("gradino 2: senza italiano su TMDB, la ricerca italiana batte l'inglese", async () => {
    const videos = tmdbVideos([
      { key: "EN", site: "YouTube", type: "Trailer", official: true, iso_639_1: "en" },
    ]);
    const result = await computeTrailers(
      { ...fresh, videos, identity },
      deps({
        getVideoAuthor: async () => ({
          authorUrl: "https://www.youtube.com/@Netflix",
          authorName: "Netflix",
        }),
        getVideoDetails: async (ids) =>
          new Map(
            ids.map((id) => [
              id,
              { channelId: NETFLIX, audioLanguage: "en", embeddable: true },
            ]),
          ),
        searchYouTube: async () => [
          {
            id: "TROVATO",
            title: "Silo | Trailer ufficiale | Netflix Italia",
            channelId: NETFLIX_IT,
            publishedAt: "2024-01-01T00:00:00Z",
          },
        ],
      }),
    );
    expect(result).toMatchObject({
      keys: ["TROVATO"],
      lang: "it",
      source: "youtube",
      searched: true,
    });
  });

  it("gradino 3: ricerca a vuoto, resta l'inglese etichettato", async () => {
    const videos = tmdbVideos([
      { key: "EN", site: "YouTube", type: "Trailer", official: true, iso_639_1: "en" },
    ]);
    const result = await computeTrailers(
      { ...fresh, videos, identity },
      deps({
        getVideoAuthor: async () => ({
          authorUrl: "https://www.youtube.com/@Netflix",
          authorName: "Netflix",
        }),
        getVideoDetails: async (ids) =>
          new Map(
            ids.map((id) => [
              id,
              { channelId: NETFLIX, audioLanguage: "en", embeddable: true },
            ]),
          ),
        searchYouTube: async () => [],
      }),
    );
    expect(result).toMatchObject({ keys: ["EN"], lang: "en", source: "tmdb", searched: true });
  });

  it("la ricerca non parte se i tentativi sono finiti", async () => {
    const result = await computeTrailers(
      { ...fresh, searchTries: 3, searchAt: "2020-01-01T00:00:00Z", videos: tmdbVideos([]), identity },
      deps({
        searchYouTube: async () => {
          throw new Error("non deve cercare");
        },
      }),
    );
    expect(result).toMatchObject({ keys: [], source: "none", searched: false });
  });

  it("scarta un video TMDB palesemente di un'altra opera", async () => {
    const videos = tmdbVideos([
      { key: "X", site: "YouTube", type: "Trailer", official: true, iso_639_1: "it" },
    ]);
    const result = await computeTrailers(
      { ...fresh, videos, identity: { title: "Oceania", mediaType: "movie" } },
      deps({
        getVideoAuthor: async () => ({
          authorUrl: "https://www.youtube.com/@netflixitalia",
          authorName: "Netflix Italia",
        }),
        getVideoDetails: async () =>
          new Map([
            ["X", { channelId: NETFLIX_IT, audioLanguage: null, embeddable: true }],
          ]),
        searchYouTube: async () => [],
      }),
    );
    expect(result?.keys).not.toContain("X");
  });

  it("ricerca fallita per quota: null, il chiamante tiene la riga vecchia", async () => {
    const result = await computeTrailers(
      { ...fresh, videos: tmdbVideos([]), identity },
      deps({ searchYouTube: async () => null }),
    );
    expect(result).toBeNull();
  });
});
```

Nota: il test "scarta un video TMDB palesemente di un'altra opera" ha bisogno del nome YouTube del video per il veto. `computeTrailers` lo prende da `getVideoAuthor`, che oggi non lo porta: nel Task 8 `getVideoAuthor` restituirà anche `title`. Per questo test la dipendenza è finta, quindi aggiungi `title: "Wicked | Trailer ufficiale"` all'oggetto restituito da `getVideoAuthor` in quel caso.

- [ ] **Step 3: eseguire i test e vederli fallire**

Run: `pnpm test src/lib/trailers/compute.test.ts`
Expected: FAIL — "Failed to resolve import ./compute".

- [ ] **Step 4: scrivere `compute.ts`**

Crea `src/lib/trailers/compute.ts`:

```ts
/**
 * La scala dei trailer, con le chiamate a YouTube iniettate: nessun `server-only`,
 * così l'intera scala è coperta da Vitest ed è riusabile dallo script di backfill.
 *
 * 1. video TMDB in italiano da canale ufficiale;
 * 2. ricerca YouTube "<nome> trailer italiano", canale ufficiale e verifica dura del
 *    titolo (`match.ts`);
 * 3. video TMDB in altra lingua da canale ufficiale, etichettato in pagina;
 * 4. niente: resta il fondale.
 *
 * Il gradino 3 non costa nulla (i video TMDB sono già stati letti al gradino 1),
 * quindi il gradino 2 può permettersi di andare prima: un trailer italiano da canale
 * ufficiale batte sempre un trailer inglese. La ricerca costa però 100 unità di quota
 * su 10.000 al giorno, e `shouldSearch` la raziona: tre tentativi per titolo.
 */
import type { TmdbVideo, TmdbVideos } from "@/lib/tmdb/types";
import { getOfficialChannel, matchOfficialChannel, type OfficialChannel } from "./channels";
import type { TrailerLang } from "./frame-bars";
import { videoContradictsTitle, type TitleIdentity } from "./match";
import type { VideoAuthor } from "./oembed";
import { isItalianForChannel, rankSearchResults, rankTmdbCandidates, type SearchResult } from "./rank";
import type { VideoDetails } from "./youtube";

/** Tentativi di ricerca YouTube concessi a un titolo, in tutta la sua vita. */
export const MAX_SEARCH_TRIES = 3;
/** Attesa prima del secondo e del terzo tentativo. */
const RETRY_AFTER_MS = [0, 7 * 24 * 60 * 60 * 1000, 30 * 24 * 60 * 60 * 1000];

export interface TrailerDeps {
  getVideoAuthor(key: string): Promise<VideoAuthor | null>;
  getVideoDetails(ids: string[]): Promise<Map<string, VideoDetails>>;
  searchYouTube(query: string): Promise<SearchResult[] | null>;
}

export interface ComputeRequest {
  videos: TmdbVideos | undefined;
  identity: TitleIdentity;
  releaseDate?: string | null;
  /** Nome per la ricerca YouTube; vuoto = niente ricerca. */
  name: string;
  /** Ultimo tentativo di ricerca salvato in `title_trailers`. */
  searchAt: string | null;
  /** Tentativi di ricerca già spesi. */
  searchTries: number;
}

export interface ComputeResult {
  keys: string[];
  lang: TrailerLang;
  source: "tmdb" | "youtube" | "none";
  /** Vero se è stata spesa una ricerca: chi salva aggiorna `search_at`/`search_tries`. */
  searched: boolean;
}

/** Si può spendere una ricerca per questo titolo adesso? */
export function shouldSearch(input: {
  searchAt: string | null;
  searchTries: number;
  now: number;
}): boolean {
  if (input.searchTries >= MAX_SEARCH_TRIES) return false;
  const wait = RETRY_AFTER_MS[input.searchTries] ?? 0;
  if (wait === 0) return true;
  if (!input.searchAt) return true;
  const last = Date.parse(input.searchAt);
  if (Number.isNaN(last)) return true;
  return input.now - last >= wait;
}

interface Classified {
  it: string[];
  other: string[];
}

/**
 * Video TMDB divisi per lingua, tenendo solo quelli da canale ufficiale, embeddabili e
 * che non smentiscono il titolo. oEmbed dà autore e vitalità; `videos.list` (con la
 * chiave YouTube) aggiunge id canale esatto, lingua audio ed embeddabilità.
 */
async function classifyTmdbVideos(
  req: ComputeRequest,
  deps: TrailerDeps,
): Promise<Classified> {
  const candidates = rankTmdbCandidates(req.videos);
  const out: Classified = { it: [], other: [] };
  if (candidates.length === 0) return out;
  const [authors, details] = await Promise.all([
    Promise.all(candidates.map((v) => deps.getVideoAuthor(v.key))),
    deps.getVideoDetails(candidates.map((v) => v.key)),
  ]);
  candidates.forEach((video: TmdbVideo, i: number) => {
    const author = authors[i];
    if (!author) return;
    const detail = details.get(video.key);
    if (detail && !detail.embeddable) return;
    const channel: OfficialChannel | null =
      (detail && getOfficialChannel(detail.channelId)) ?? matchOfficialChannel(author);
    if (!channel) return;
    // TMDB associa il video al titolo, ma se il nome YouTube nomina un'altra opera
    // il video non compare: la richiesta è che un trailer sbagliato non passi mai.
    if (author.title && videoContradictsTitle(author.title, req.identity, channel.name)) {
      return;
    }
    if (isItalianForChannel(video, channel, detail?.audioLanguage)) out.it.push(video.key);
    else out.other.push(video.key);
  });
  return out;
}

/**
 * Chiavi dei trailer, lingua e provenienza. Null solo quando la ricerca era necessaria
 * ed è fallita (quota, rete): il chiamante decide se tenere la riga vecchia.
 */
export async function computeTrailers(
  req: ComputeRequest,
  deps: TrailerDeps,
): Promise<ComputeResult | null> {
  const fromTmdb = await classifyTmdbVideos(req, deps);
  if (fromTmdb.it.length > 0) {
    return { keys: fromTmdb.it, lang: "it", source: "tmdb", searched: false };
  }

  let searched = false;
  if (
    req.name &&
    shouldSearch({ searchAt: req.searchAt, searchTries: req.searchTries, now: Date.now() })
  ) {
    const season = req.identity.season ?? 0;
    const query =
      season > 0
        ? `${req.name} stagione ${season} trailer italiano`
        : `${req.name} trailer italiano`;
    const results = await deps.searchYouTube(query);
    if (results === null) {
      // niente chiave, errore o quota finita: senza un ripiego inglese non si scrive nulla
      if (fromTmdb.other.length === 0) return null;
    } else {
      searched = true;
      const globalIds = results
        .filter((r) => getOfficialChannel(r.channelId)?.italian === false)
        .map((r) => r.id);
      const details = await deps.getVideoDetails(globalIds);
      const enriched = results.map((r) => {
        const d = details.get(r.id);
        return d ? { ...r, audioLanguage: d.audioLanguage } : r;
      });
      const keys = rankSearchResults(enriched, {
        releaseDate: req.identity.mediaType === "movie" ? req.releaseDate : null,
        identity: req.identity,
      })
        .filter((r) => details.get(r.id)?.embeddable !== false)
        .map((r) => r.id);
      if (keys.length > 0) return { keys, lang: "it", source: "youtube", searched };
    }
  }

  if (fromTmdb.other.length > 0) {
    return { keys: fromTmdb.other, lang: "en", source: "tmdb", searched };
  }
  return { keys: [], lang: "it", source: "none", searched };
}
```

- [ ] **Step 5: eseguire i test**

Run: `pnpm test src/lib/trailers/compute.test.ts`
Expected: PASS.

- [ ] **Step 6: commit**

```bash
pnpm format
git add src/lib/trailers/compute.ts src/lib/trailers/compute.test.ts src/lib/trailers/oembed.ts
git commit -m "feat(trailers): la scala italiano-ricerca-inglese, testata per intero"
```

---

### Task 8: `official.ts` diventa solo il guscio DB, `youtube.ts` conosce la quota

**Files:**
- Modify: `src/lib/trailers/official.ts` (sostituzione quasi integrale del corpo)
- Modify: `src/lib/trailers/youtube.ts` (spegnimento per la giornata al 403)

**Interfaces:**
- Consuma: `computeTrailers`, `MAX_SEARCH_TRIES` da `./compute` (Task 7); `withFrames` da `./frame` (Task 3).
- Produce:
  - `OfficialTrailerRequest` guadagna `originalTitle?: string | null`.
  - `getOfficialTrailers(req): Promise<Trailer[]>` e `getOfficialTrailerKeys(req): Promise<string[]>` restano.

- [ ] **Step 1: spegnere la ricerca per la giornata quando la quota finisce**

In `src/lib/trailers/youtube.ts`, sopra `searchYouTube`:

```ts
/**
 * Quando la Data API risponde 403 la quota del giorno è finita: la ricerca si spegne
 * fino al ripristino (mezzanotte del Pacifico, dove YouTube azzera i contatori), così
 * le richieste successive non pagano il tempo di una chiamata destinata a fallire.
 */
let quotaExhaustedUntil = 0;

/** Prossima mezzanotte del fuso in cui YouTube ripristina la quota. */
function nextQuotaReset(): number {
  const now = new Date();
  const pacific = new Date(
    now.toLocaleString("en-US", { timeZone: "America/Los_Angeles" }),
  );
  const midnight = new Date(pacific);
  midnight.setHours(24, 0, 0, 0);
  return now.getTime() + (midnight.getTime() - pacific.getTime());
}
```

Dentro `searchYouTube`, subito dopo `if (!hasYouTubeApiKey()) return null;`:

```ts
  if (Date.now() < quotaExhaustedUntil) return null;
```

e nel ramo `!res.ok`:

```ts
    if (!res.ok) {
      if (res.status === 403) {
        quotaExhaustedUntil = nextQuotaReset();
        console.warn("[trailers] quota YouTube esaurita: niente ricerche fino al reset");
      }
      console.warn("[trailers] ricerca YouTube fallita:", res.status, query);
      return null;
    }
```

- [ ] **Step 2: riscrivere `official.ts`**

Sostituisci il corpo di `src/lib/trailers/official.ts` mantenendo il commento di intestazione aggiornato alla scala nuova:

```ts
import "server-only";
import { cache } from "react";
import { createServiceClient } from "@/lib/supabase/server";
import type { TmdbVideos } from "@/lib/tmdb/types";
import type { Enums, Json } from "@/types/database";
import { computeTrailers, MAX_SEARCH_TRIES } from "./compute";
import { withFrames, type Trailer, type TrailerLang } from "./frame";
import { getVideoAuthor } from "./oembed";
import { parseTrailers } from "./stored";
import { getVideoDetails, searchYouTube } from "./youtube";

/** Riga piena in italiano: vale un mese. */
const FOUND_TTL_MS = 30 * 24 * 60 * 60 * 1000;
/** Riga piena col ripiego inglese, con tentativi di ricerca ancora disponibili. */
const FALLBACK_TTL_MS = 7 * 24 * 60 * 60 * 1000;
/** Riga vuota: si ritenta il giorno dopo (il trailer di un film in uscita arriva poi). */
const EMPTY_RETRY_MS = 24 * 60 * 60 * 1000;
/**
 * Righe scritte prima della revisione dei trailer (2026-09-07: verifica del titolo,
 * allowlist allargata, ripiego inglese): scadute subito, si ricalcolano alla prima
 * visita. Alzarla ogni volta che cambia la scala o si allarga l'allowlist.
 */
const EMPTY_BEFORE_MS = Date.parse("2026-09-07T00:00:00Z");

type TrailerSource = "tmdb" | "youtube" | "none";

export interface OfficialTrailerRequest {
  /** `raw.videos` del titolo (o `videos` della stagione). */
  videos: TmdbVideos | undefined;
  titleId: number;
  mediaType: Enums<"media_type">;
  /** 0 = scheda titolo, N = pagina della stagione N. */
  season?: number;
  /**
   * Nome del titolo per la ricerca YouTube e per la verifica; vuoto = niente ricerca
   * e niente cache DB (senza riga in `titles` la FK di `title_trailers` fallirebbe).
   */
  name: string;
  /** Titolo originale TMDB: il video YouTube può usare quello. */
  originalTitle?: string | null;
  /** Film: data d'uscita, per scartare trailer di omonimi più vecchi. */
  releaseDate?: string | null;
}
```

Il corpo di `getOfficialTrailers` diventa:

```ts
export const getOfficialTrailers = cache(
  async (req: OfficialTrailerRequest): Promise<Trailer[]> => {
    const persist = Boolean(req.name);
    const season = req.season ?? 0;
    const db = persist ? createServiceClient() : null;

    const row = db
      ? (
          await db
            .from("title_trailers")
            .select("trailers, checked_at, search_at, search_tries")
            .eq("title_id", req.titleId)
            .eq("media_type", req.mediaType)
            .eq("season_number", season)
            .maybeSingle()
        ).data
      : null;
    const cached = row ? parseTrailers(row.trailers) : null;
    if (row && cached && isFresh(row.checked_at, cached, row.search_tries)) return cached;

    const computed = await computeTrailers(
      {
        videos: req.videos,
        identity: {
          title: req.name,
          originalTitle: req.originalTitle,
          mediaType: req.mediaType,
          season,
        },
        releaseDate: req.releaseDate,
        name: req.name,
        searchAt: row?.search_at ?? null,
        searchTries: row?.search_tries ?? 0,
      },
      { getVideoAuthor, getVideoDetails, searchYouTube },
    );
    // ricerca fallita (quota, rete): la riga vecchia, se c'è, vale più di niente
    if (computed === null) return cached ?? [];

    const trailers = await withFrames(computed.keys, computed.lang);
    if (db) {
      const tries = (row?.search_tries ?? 0) + (computed.searched ? 1 : 0);
      const { error } = await db.from("title_trailers").upsert(
        {
          title_id: req.titleId,
          media_type: req.mediaType,
          season_number: season,
          keys: computed.keys,
          trailers: trailers as unknown as Json,
          source: computed.source as TrailerSource,
          checked_at: new Date().toISOString(),
          search_at: computed.searched
            ? new Date().toISOString()
            : (row?.search_at ?? null),
          search_tries: tries,
        },
        { onConflict: "title_id,media_type,season_number" },
      );
      if (error) console.error("[trailers] errore upsert title_trailers:", error);
    }
    return trailers;
  },
);
```

e `isFresh` diventa:

```ts
/**
 * Quanto vale una riga: un mese se ha un trailer italiano o se i tentativi di ricerca
 * sono finiti, una settimana se mostra il ripiego inglese e una ricerca è ancora
 * possibile (così l'italiano arriva appena c'è quota), un giorno se è vuota.
 */
function isFresh(checkedAt: string, trailers: Trailer[], searchTries: number): boolean {
  const checked = new Date(checkedAt).getTime();
  if (checked < EMPTY_BEFORE_MS) return false;
  const age = Date.now() - checked;
  if (trailers.length === 0) return age < EMPTY_RETRY_MS;
  const lang: TrailerLang = trailers[0].lang;
  if (lang === "en" && searchTries < MAX_SEARCH_TRIES) return age < FALLBACK_TTL_MS;
  return age < FOUND_TTL_MS;
}
```

Togli da `official.ts` gli import ormai inutilizzati (`getOfficialChannel`, `matchOfficialChannel`, `isItalianForChannel`, `rankSearchResults`, `rankTmdbCandidates`) e le funzioni `computeTrailers` e `officialFromTmdb`, che ora vivono in `compute.ts`. `getOfficialTrailerKeys` resta com'è.

Nota su `EMPTY_BEFORE_MS`: ora vale per **tutte** le righe, non solo per quelle vuote — è il modo per invalidare in blocco il cache vecchio senza toccare il DB. La `keys` legacy non serve più: `parseTrailers` da sola invalida le righe di forma vecchia.

- [ ] **Step 3: verificare**

Run: `pnpm typecheck`
Expected: restano solo gli errori nei componenti (`CinematicBackdrop`, chiamanti senza `originalTitle`), chiusi dai Task 9 e 10.

Run: `pnpm test`
Expected: PASS.

- [ ] **Step 4: commit**

```bash
pnpm format
git add src/lib/trailers/official.ts src/lib/trailers/youtube.ts
git commit -m "feat(trailers): official.ts e' solo cache, la scala sta in compute.ts"
```

---

### Task 9: i chiamanti passano titolo originale e stagione

Senza `originalTitle` la verifica ha un solo nome da confrontare e scarta trailer buoni.

**Files:**
- Modify: `src/components/title/TitleBody.tsx:193-200`
- Modify: `src/app/(app)/title/tv/[id]/season/[n]/page.tsx:107-120`
- Modify: `src/app/api/preview/[mediaType]/[id]/route.ts:55-61`

**Interfaces:**
- Consuma: `OfficialTrailerRequest` con `originalTitle` (Task 8).
- Produce: niente.

- [ ] **Step 1: `TitleBody`**

Aggiungi `originalTitle: title.original_title,` alla chiamata a `getOfficialTrailers`, dopo `name: title.title,`.

- [ ] **Step 2: pagina stagione**

Nelle **due** chiamate a `getOfficialTrailers` aggiungi `originalTitle: cached?.title.original_title ?? null,` dopo `name: seriesName,`.

- [ ] **Step 3: rotta dell'anteprima**

Aggiungi `originalTitle: title.original_title,` alla chiamata, dopo `name: title.title,`.

- [ ] **Step 4: verificare**

Run: `pnpm typecheck`
Expected: resta solo l'errore in `CinematicBackdrop` (Task 10).

- [ ] **Step 5: commit**

```bash
pnpm format
git add src/components/title/TitleBody.tsx "src/app/(app)/title/tv/[id]/season/[n]/page.tsx" "src/app/api/preview/[mediaType]/[id]/route.ts"
git commit -m "feat(trailers): la verifica conosce anche il titolo originale"
```

---

### Task 10: l'etichetta "Trailer in inglese"

Quando il trailer mostrato non è italiano la scheda lo dichiara, dentro la pillola dei comandi già presente sopra il fondale. Compare solo a trailer visibile: prima non c'è niente da etichettare.

**Files:**
- Modify: `src/components/title/HeaderControls.tsx` (prop `language`)
- Modify: `src/components/title/CinematicBackdrop.tsx:580-586` (portal)

**Interfaces:**
- Consuma: `Trailer.lang` (Task 3).
- Produce: `HeaderControls` accetta `language?: TrailerLang`.

- [ ] **Step 1: `HeaderControls`**

Aggiungi l'import del tipo e la prop:

```ts
import type { TrailerLang } from "@/lib/trailers/frame-bars";
```

```ts
export function HeaderControls({
  shareTitle,
  sound,
  language,
}: {
  /** Titolo da condividere; assente nella pagina stagione. */
  shareTitle?: string;
  sound: SoundControl | null;
  /** Lingua del trailer in riproduzione: `"en"` viene dichiarata in pagina. */
  language?: TrailerLang;
}) {
```

Cambia la riga di uscita anticipata in `if (!shareTitle && !sound) return null;` (invariata) e, **prima** del blocco `<AnimatePresence>`, inserisci:

```tsx
      {sound && language === "en" && (
        <motion.div
          key="lang"
          layout
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.25 }}
          className="flex items-center"
        >
          <span className="whitespace-nowrap px-3 text-xs text-muted">
            Trailer in inglese
          </span>
          <span aria-hidden className="h-5 w-px bg-white/15" />
        </motion.div>
      )}
```

Aggiorna il commento del componente: la pillola porta, da sinistra, l'avviso della lingua, l'audio e Condividi.

- [ ] **Step 2: `CinematicBackdrop`**

Nel `createPortal`, passa la lingua del trailer in riproduzione:

```tsx
          <HeaderControls
            shareTitle={shareTitle}
            sound={revealed ? { on: sound, toggle: toggleSound } : null}
            language={trailer?.lang}
          />,
```

- [ ] **Step 3: verificare**

Run: `pnpm typecheck && pnpm lint`
Expected: nessun errore.

- [ ] **Step 4: commit**

```bash
pnpm format
git add src/components/title/HeaderControls.tsx src/components/title/CinematicBackdrop.tsx
git commit -m "feat(trailers): la scheda dichiara quando il trailer e' in inglese"
```

---

### Task 11: script di audit e di backfill

Due strumenti: uno dimostra che il problema è chiuso, l'altro riempie la cache senza far aspettare il primo visitatore.

**Files:**
- Create: `scripts/audit-trailers.ts`
- Create: `scripts/backfill-trailers.ts`

**Interfaces:**
- Consuma: `videoMatchesTitle`, `workName` da `@/lib/trailers/match`; `computeTrailers` da `@/lib/trailers/compute`; `matchOfficialChannel` da `@/lib/trailers/channels`.
- Produce: due comandi `pnpm tsx`.

- [ ] **Step 1: scrivere l'audit**

Crea `scripts/audit-trailers.ts`:

```ts
/**
 * Controllo indipendente dei trailer salvati: per ogni riga di `title_trailers`
 * chiede a YouTube (oEmbed, nessuna chiave) il nome vero del video e lo confronta
 * col titolo. Stampa solo i sospetti; a fine corsa il conteggio.
 *
 * Uso: pnpm tsx scripts/audit-trailers.ts
 */
import { createClient } from "@supabase/supabase-js";
import { loadEnvFile } from "node:process";
import { videoContradictsTitle, videoMatchesTitle } from "../src/lib/trailers/match";

loadEnvFile(new URL("../.env.local", import.meta.url).pathname.replace(/^\//, ""));

interface Row {
  title_id: number;
  media_type: "movie" | "tv";
  season_number: number;
  source: "tmdb" | "youtube" | "none";
  trailers: { key: string; lang: string }[] | null;
}

async function videoTitle(key: string): Promise<string | null> {
  const url = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${key}&format=json`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const data = (await res.json()) as { title?: string; author_name?: string };
  return data.title ? `${data.title} @@ ${data.author_name ?? ""}` : null;
}

async function main() {
  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
  const { data: rows, error } = await db
    .from("title_trailers")
    .select("title_id, media_type, season_number, source, trailers");
  if (error) throw error;

  let checked = 0;
  let suspect = 0;
  for (const row of (rows ?? []) as Row[]) {
    const first = row.trailers?.[0];
    if (!first) continue;
    const { data: title } = await db
      .from("titles")
      .select("title, original_title")
      .eq("id", row.title_id)
      .eq("media_type", row.media_type)
      .maybeSingle();
    if (!title) continue;
    const info = await videoTitle(first.key);
    if (!info) {
      console.log(`MORTO   ${title.title} → ${first.key}`);
      suspect += 1;
      continue;
    }
    const [name, channel] = info.split(" @@ ");
    checked += 1;
    const identity = {
      title: title.title,
      originalTitle: title.original_title,
      mediaType: row.media_type,
      season: row.season_number,
    } as const;
    // Un video preso da TMDB è associato al titolo dal database TMDB e spesso ha un
    // nome generico ("Trailer ufficiale"): lì basta che non smentisca il titolo.
    // Un video trovato con la ricerca deve invece corrispondere, punto.
    const ok =
      row.source === "youtube"
        ? videoMatchesTitle(name, identity, channel)
        : !videoContradictsTitle(name, identity, channel);
    if (!ok) {
      suspect += 1;
      console.log(`SOSPETTO ${title.title} (s${row.season_number}) → "${name}" [${channel}]`);
    }
  }
  console.log(`\ncontrollati ${checked}, sospetti ${suspect}`);
}

void main();
```

- [ ] **Step 2: eseguire l'audit sullo stato attuale**

Run: `pnpm tsx scripts/audit-trailers.ts`
Expected: molti `SOSPETTO` — è lo stato prima del fix. Salva il conteggio: serve come termine di paragone.

- [ ] **Step 3: scrivere il backfill**

Crea `scripts/backfill-trailers.ts`:

```ts
/**
 * Riempie `title_trailers` senza far aspettare il primo visitatore. Usa la stessa
 * scala dell'app (`computeTrailers`) con le dipendenze reali, e rispetta la quota:
 * si ferma dopo `--searches N` ricerche YouTube (default 80, sotto il tetto di 100
 * al giorno). Riprendibile: salta le righe ancora fresche.
 *
 * Uso: pnpm tsx scripts/backfill-trailers.ts [--searches 80] [--limit 500]
 */
import { createClient } from "@supabase/supabase-js";
import { loadEnvFile } from "node:process";
import { computeTrailers, type TrailerDeps } from "../src/lib/trailers/compute";
import { getVideoAuthorRaw, getVideoDetailsRaw, searchYouTubeRaw } from "./trailer-deps";

loadEnvFile(new URL("../.env.local", import.meta.url).pathname.replace(/^\//, ""));
```

Le dipendenze reali di `official.ts` non si possono importare (`server-only`, cache di Next), quindi crea accanto `scripts/trailer-deps.ts` con le tre funzioni scritte con `fetch` semplice — stessi endpoint, stessi campi, senza `unstable_cache`:

```ts
/**
 * Le chiamate a YouTube per gli script da riga di comando: stessi endpoint dei moduli
 * dell'app, senza la cache di Next (che vive solo dentro il server Next).
 */
import type { VideoAuthor } from "../src/lib/trailers/oembed";
import type { SearchResult } from "../src/lib/trailers/rank";
import type { VideoDetails } from "../src/lib/trailers/youtube";

export async function getVideoAuthorRaw(key: string): Promise<VideoAuthor | null> {
  const url = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${key}&format=json`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const data = (await res.json()) as {
    author_url?: string;
    author_name?: string;
    title?: string;
  };
  return { authorUrl: data.author_url, authorName: data.author_name, title: data.title };
}

export async function getVideoDetailsRaw(ids: string[]): Promise<Map<string, VideoDetails>> {
  const out = new Map<string, VideoDetails>();
  if (ids.length === 0 || !process.env.YOUTUBE_API_KEY) return out;
  const url = new URL("https://www.googleapis.com/youtube/v3/videos");
  url.searchParams.set("part", "snippet,status");
  url.searchParams.set("id", ids.slice(0, 50).join(","));
  url.searchParams.set("key", process.env.YOUTUBE_API_KEY);
  const res = await fetch(url);
  if (!res.ok) return out;
  const data = (await res.json()) as {
    items?: {
      id?: string;
      snippet?: { channelId?: string; defaultAudioLanguage?: string };
      status?: { embeddable?: boolean };
    }[];
  };
  for (const item of data.items ?? []) {
    if (!item.id || !item.snippet?.channelId) continue;
    out.set(item.id, {
      channelId: item.snippet.channelId,
      audioLanguage: item.snippet.defaultAudioLanguage ?? null,
      embeddable: item.status?.embeddable !== false,
    });
  }
  return out;
}

export async function searchYouTubeRaw(query: string): Promise<SearchResult[] | null> {
  if (!process.env.YOUTUBE_API_KEY) return null;
  const url = new URL("https://www.googleapis.com/youtube/v3/search");
  url.searchParams.set("part", "snippet");
  url.searchParams.set("type", "video");
  url.searchParams.set("q", query);
  url.searchParams.set("maxResults", "25");
  url.searchParams.set("regionCode", "IT");
  url.searchParams.set("relevanceLanguage", "it");
  url.searchParams.set("videoEmbeddable", "true");
  url.searchParams.set("key", process.env.YOUTUBE_API_KEY);
  const res = await fetch(url);
  if (!res.ok) return null;
  const data = (await res.json()) as {
    items?: {
      id?: { videoId?: string };
      snippet?: { title?: string; channelId?: string; publishedAt?: string };
    }[];
  };
  const results: SearchResult[] = [];
  for (const item of data.items ?? []) {
    const id = item.id?.videoId;
    const s = item.snippet;
    if (!id || !s?.title || !s.channelId) continue;
    results.push({ id, title: s.title, channelId: s.channelId, publishedAt: s.publishedAt ?? "" });
  }
  return results;
}
```

Il corpo di `backfill-trailers.ts`:

```ts
function argOf(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const budget = Number(argOf("--searches") ?? 80);
const limit = Number(argOf("--limit") ?? 500);

async function main() {
  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
  // prima i titoli che qualcuno ha in libreria: sono quelli che si aprono davvero
  const { data: entries } = await db
    .from("watch_entries")
    .select("title_id, media_type")
    .order("last_watched_at", { ascending: false })
    .limit(limit);
  const wanted = new Map<string, { id: number; mediaType: "movie" | "tv" }>();
  for (const e of entries ?? []) {
    wanted.set(`${e.media_type}:${e.title_id}`, {
      id: e.title_id,
      mediaType: e.media_type as "movie" | "tv",
    });
  }

  const deps: TrailerDeps = {
    getVideoAuthor: getVideoAuthorRaw,
    getVideoDetails: getVideoDetailsRaw,
    searchYouTube: searchYouTubeRaw,
  };

  let searches = 0;
  let written = 0;
  for (const { id, mediaType } of wanted.values()) {
    if (searches >= budget) {
      console.log(`quota giornaliera esaurita: restano ${wanted.size - written} titoli`);
      break;
    }
    const { data: title } = await db
      .from("titles")
      .select("title, original_title, release_date, raw")
      .eq("id", id)
      .eq("media_type", mediaType)
      .maybeSingle();
    if (!title) continue;
    const { data: row } = await db
      .from("title_trailers")
      .select("checked_at, search_at, search_tries")
      .eq("title_id", id)
      .eq("media_type", mediaType)
      .eq("season_number", 0)
      .maybeSingle();

    const result = await computeTrailers(
      {
        videos: (title.raw as { videos?: never })?.videos,
        identity: {
          title: title.title,
          originalTitle: title.original_title,
          mediaType,
          season: 0,
        },
        releaseDate: title.release_date,
        name: title.title,
        searchAt: row?.search_at ?? null,
        searchTries: row?.search_tries ?? 0,
      },
      deps,
    );
    if (!result) continue;
    if (result.searched) searches += 1;
    await db.from("title_trailers").upsert(
      {
        title_id: id,
        media_type: mediaType,
        season_number: 0,
        keys: result.keys,
        // il riquadro lo calcola l'app alla prima visita: qui basta la chiave
        trailers: result.keys.map((key) => ({
          key,
          frame: { x: 0, y: 0, w: 1, h: 1 },
          lang: result.lang,
        })),
        source: result.source,
        checked_at: new Date().toISOString(),
        search_at: result.searched ? new Date().toISOString() : (row?.search_at ?? null),
        search_tries: (row?.search_tries ?? 0) + (result.searched ? 1 : 0),
      },
      { onConflict: "title_id,media_type,season_number" },
    );
    written += 1;
    console.log(`${title.title} → ${result.source}/${result.lang} (${result.keys.length})`);
  }
  console.log(`\nscritti ${written} titoli, ricerche spese ${searches}`);
}

void main();
```

**Attenzione al riquadro:** lo script scrive il frame intero perché `sharp` e la cache dei fotogrammi vivono dentro Next. Il frame intero è il valore di ripiego già previsto da `frame.ts` e la banda resta corretta; se si vuole il riquadro esatto basta aprire la scheda una volta dopo la scadenza. Scrivilo nel commento in cima allo script.

- [ ] **Step 4: verificare che gli script compilino**

Run: `pnpm typecheck`
Expected: nessun errore. Se `tsconfig.json` non include `scripts/`, verifica come sono trattati gli script già presenti (`scripts/set-link.ts`) e comportati allo stesso modo.

Run: `pnpm lint`
Expected: nessun errore.

- [ ] **Step 5: commit**

```bash
pnpm format
git add scripts/audit-trailers.ts scripts/backfill-trailers.ts scripts/trailer-deps.ts
git commit -m "feat(trailers): script di audit e di backfill della cache"
```

---

### Task 12: bonifica della cache e verifica finale

**Files:**
- Modify: `CLAUDE.md` (sezione trailer)
- Nessun file di codice.

**Interfaces:**
- Consuma: tutto il lavoro precedente.
- Produce: la documentazione aggiornata.

- [ ] **Step 1: svuotare `title_trailers`**

Le 34 righe `source = 'youtube'` sono avvelenate (nove errori su dieci campionati) e le 67 vuote sono il frutto dell'allowlist stretta. Con `mcp__claude_ai_Supabase__execute_sql` sul progetto `bbuhwzdbzxgydewmcdwd`:

```sql
delete from public.title_trailers;
```

`EMPTY_BEFORE_MS` (Task 8) invaliderebbe comunque tutto, ma svuotare azzera anche `search_tries`, che altrimenti conterebbe tentativi fatti dal codice vecchio.

- [ ] **Step 2: riempire la cache dei titoli in libreria**

Run: `pnpm tsx scripts/backfill-trailers.ts --searches 80`
Expected: righe scritte con `tmdb/it`, `youtube/it`, `tmdb/en`; alla fine il conteggio delle ricerche spese.

- [ ] **Step 3: eseguire l'audit**

Run: `pnpm tsx scripts/audit-trailers.ts`
Expected: `sospetti 0`. Se resta qualche sospetto, guardalo: se è un falso allarme di `match.ts` si allarga la pulizia dei nomi (Task 2, Step 4); se è un trailer davvero sbagliato, la regola mancante va aggiunta a `match.ts` con il suo test prima della correzione.

- [ ] **Step 4: verifica completa**

Run: `pnpm typecheck && pnpm lint && pnpm test`
Expected: tutto verde.

Run: `NEXT_DIST_DIR=.next-check pnpm build`
Expected: build completata.

- [ ] **Step 5: guardare l'app**

Run: `NEXT_DIST_DIR=.next-check pnpm exec next start -p 3399`

Apri una scheda con trailer italiano e una con solo trailer inglese (dopo il backfill, `select title_id, media_type from title_trailers where trailers->0->>'lang' = 'en' limit 5` ne dà qualcuna) e controlla: il trailer parte, la pillola in alto a destra mostra "Trailer in inglese" solo nel secondo caso, e il trailer è del titolo giusto. Poi apri una pagina stagione e verifica che il trailer sia della stagione o della serie, mai di un'altra.

- [ ] **Step 6: aggiornare `CLAUDE.md`**

Nella sezione dei trailer (dentro "Fondale scheda titolo"), sostituisci il paragrafo che comincia con "**Solo trailer italiani da canali YouTube ufficiali dei distributori**" descrivendo la scala nuova: TMDB italiano da canale ufficiale → ricerca YouTube italiana **con verifica dura del titolo** (`match.ts`) → TMDB in altra lingua, dichiarato in pagina con "Trailer in inglese" → niente. Cita `compute.ts` (la scala, con dipendenze iniettate e test Vitest), `match.ts` (`workName`, `videoMatchesTitle`, `videoContradictsTitle`, regole anti-sequel e anti-sottotitolo), il governo della quota (tre tentativi per titolo, `search_at`/`search_tries` della migration 0020, spegnimento per la giornata al 403) e le scadenze (30 giorni in italiano, 7 col ripiego inglese, 1 se vuota). Ricorda che la regola "mai un trailer di terzi" resta: cambia solo la lingua di ripiego, non la fonte.

Aggiungi anche a `## Commands` la riga degli script nuovi:

```bash
pnpm tsx scripts/backfill-trailers.ts --searches 80  # riempie title_trailers rispettando la quota YouTube
pnpm tsx scripts/audit-trailers.ts                   # controlla che ogni trailer salvato sia del suo titolo
```

- [ ] **Step 7: commit**

```bash
pnpm format
git add CLAUDE.md
git commit -m "docs: la scala dei trailer e la verifica del titolo in CLAUDE.md"
```

---

## Note per chi esegue

- **L'ordine conta.** Task 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 → 10 → 11 → 12. Fra il Task 3 e il Task 8 `pnpm typecheck` segnala errori attesi nei chiamanti: sono previsti, non vanno "aggirati" cambiando i tipi.
- **La soglia non si abbassa.** Se un trailer buono viene scartato, si allarga la pulizia dei nomi in `match.ts`; `MATCH_MIN` resta 0,9. Un trailer perso costa il ripiego inglese; un trailer sbagliato costa la fiducia nell'app — è la richiesta esplicita dell'utente.
- **Nessun canale entra senza verifica.** Handle e id si controllano con `channels.list`; nel dubbio il canale resta fuori.
- **La build gira solo in `.next-check`.** L'albero è condiviso con altre sessioni: due `next build` nello stesso `.next` si rompono a vicenda.
