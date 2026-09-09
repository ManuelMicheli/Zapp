# ZConnection per il browser — piano di implementazione (passo zero + fase 1)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** far sì che quello che l'utente guarda su Netflix nel browser (PC o Mac) arrivi da solo in Zapp — stato, episodio e minuto esatto — senza toccare niente.

**Architecture:** un'estensione MV3 **muta** cattura `navigator.mediaSession` + lo stato del `<video>` e spedisce eventi grezzi assoluti a `POST /api/scrobble`; il server fa parsing, corrispondenza TMDB e decide l'intento di scrittura con funzioni **pure** (Vitest), e una sola RPC `SECURITY DEFINER`, validata dall'hash del token del dispositivo, applica tutto in transazione. Nessun service client sui dati utente.

**Tech Stack:** Next.js 15 App Router, TypeScript strict, Supabase (Postgres + RLS), Vitest, estensione Chrome MV3 in JS piano (nessun bundler).

**Spec:** `docs/superpowers/specs/2026-09-09-zconnection-browser-design.md` (e, per ingest e regole di sessione ereditate, `docs/superpowers/specs/2026-09-04-zconnection-design.md`).

## Global Constraints

- **Italiano ovunque**: UI, copy, commenti del codice. Nomi di variabili e funzioni in inglese, come nel resto del progetto.
- **Nessuna chiamata TMDB dal client.** L'estensione non parla mai con TMDB: riceve `poster_path`/`backdrop_path` dalla risposta dell'ingest e carica solo l'immagine da `image.tmdb.org`.
- **Il service client (`createServiceClient`) non tocca mai dati utente.** Le scritture per conto di un dispositivo passano dalla RPC `scrobble_apply`, validata dall'hash del token.
- **`anon` non ha niente nello schema `public`.** Ogni tabella nuova: RLS accesa, policy `to authenticated`, grant revocati ad `anon` (`revoke all on … from anon`), default privileges comprese.
- **Ogni Server Action e ogni route è un endpoint HTTP**: gli argomenti si validano con `src/lib/validate.ts` (`isUuid`, `isTmdbId`, `isMediaType`, `isIntInRange`).
- **Verso il client va sempre un messaggio generico**; il dettaglio di PostgREST resta nei log.
- **Nessuna libreria UI esterna**, nessuna dipendenza npm nuova. L'estensione è JS piano: niente bundler, niente build step.
- **Permessi dell'estensione**: `storage`, `alarms`; `host_permissions` = i domini di streaming + l'origine di Zapp. **Mai `<all_urls>`, mai `tabs`, mai `webRequest`.**
- **Se il riconoscimento fallisce non si manda niente.** Mai un titolo inventato.
- **Finché l'utente non è certo, `watch_entries` non si tocca.**
- Prettier: virgolette doppie, trailing comma, `printWidth 90`. Path alias `@/*` → `src/*`.
- Migrazioni: le prossime libere sono **0025** e **0026** (l'ultima applicata è `0024_search_history.sql`). Dopo ogni migrazione: `supabase gen types typescript --project-id bbuhwzdbzxgydewmcdwd > src/types/database.ts`.
- Verifica di fine task: `pnpm test && pnpm typecheck && pnpm lint`.

## Perimetro di questo piano

Copre il **passo zero** (sonda) e la **fase 1** della spec: **solo Netflix**, un utente per dispositivo, end-to-end fino al minutaggio in home. Prime Video, Disney+, NOW, il recupero della cronologia, il voto al volo e i profili sono **fasi 2-3** e avranno il loro piano, scritto quando la sonda avrà detto cosa espongono davvero gli altri tre siti.

## Struttura dei file

**Nuovi, nell'app:**
- `src/lib/scrobble/types.ts` — i tipi condivisi fra route, regole e RPC.
- `src/lib/scrobble/parse.ts` — **puro**: da due stringhe a titolo/stagione/episodio.
- `src/lib/scrobble/sites.ts` — **puro**: dominio → sito → provider, e mappatura dei campi mediaSession.
- `src/lib/scrobble/rules.ts` — **puro**: dato lo stato precedente e un evento, che cosa scrivere.
- `src/lib/scrobble/match.ts` — server-only: da titolo parsato a `title_id` TMDB.
- `src/app/api/scrobble/route.ts` — l'ingest.
- `src/app/(app)/devices/page.tsx` + `DevicesClient.tsx` + `actions.ts` — collega/scollega/pausa.
- `supabase/migrations/0025_zconnection.sql`, `0026_scrobble_profiles_progress.sql`.

**Nuovi, fuori dall'app:**
- `tools/scrobble-probe/` — la sonda usa-e-getta (Task 1), non entra nel prodotto.
- `extension/` — l'estensione MV3.

**Modificati:**
- `src/lib/watch/queries.ts` — leggere le colonne del minutaggio.
- `src/components/home/ContinueRow.tsx` / `ContinueCard.tsx` — barra e minuti veri.
- `src/app/(app)/profile/page.tsx` — la voce "Dispositivi collegati".
- `tsconfig.json`, `eslint.config.mjs` — escludere `extension/` e `tools/`.
- `scripts/security-check.mjs` — il CORS di `/api/scrobble`.

---

### Task 1: La sonda (spike usa-e-getta)

Non è il prodotto: serve solo a sapere **cosa espone davvero Netflix**, e produce le fixture su cui si scrivono i test veri. Nessun test qui: l'output è una risposta, non del codice da tenere.

**Files:**
- Create: `tools/scrobble-probe/manifest.json`
- Create: `tools/scrobble-probe/main.js`
- Create: `tools/scrobble-probe/bridge.js`
- Create: `tools/scrobble-probe/panel.html`
- Create: `tools/scrobble-probe/panel.js`
- Create: `src/lib/scrobble/__fixtures__/netflix.json` (a fine task, con dati veri)

**Interfaces:**
- Produces: `src/lib/scrobble/__fixtures__/netflix.json`, array di
  `{at, url, title, artist, album, artwork, currentTime, duration, paused, expected: {kind, title, season, episode, episodeName}}`. Il campo `expected` lo compila l'utente a mano: è la verità che i test di Task 2 e 3 verificheranno.

- [ ] **Step 1: il manifest della sonda**

`tools/scrobble-probe/manifest.json`:

```json
{
  "manifest_version": 3,
  "name": "Sonda ZConnection (usa e getta)",
  "version": "0.0.1",
  "permissions": ["storage"],
  "host_permissions": ["https://www.netflix.com/*"],
  "action": { "default_popup": "panel.html" },
  "content_scripts": [
    {
      "matches": ["https://www.netflix.com/*"],
      "js": ["main.js"],
      "world": "MAIN",
      "run_at": "document_idle"
    },
    {
      "matches": ["https://www.netflix.com/*"],
      "js": ["bridge.js"],
      "world": "ISOLATED",
      "run_at": "document_idle"
    }
  ]
}
```

- [ ] **Step 2: lo script nel main world**

`tools/scrobble-probe/main.js` — legge `navigator.mediaSession` (che nello isolated world non è visibile) e il primo `<video>`, e manda tutto alla pagina ogni 5 secondi:

```js
// Gira nel MAIN world: qui `navigator.mediaSession.metadata` è quella vera della pagina.
(() => {
  const CANALE = "zconnection-probe";

  function istantanea() {
    const md = navigator.mediaSession && navigator.mediaSession.metadata;
    const v = document.querySelector("video");
    return {
      at: new Date().toISOString(),
      url: location.href,
      title: md ? md.title : null,
      artist: md ? md.artist : null,
      album: md ? md.album : null,
      artwork: md && md.artwork ? md.artwork.map((a) => a.src) : [],
      playbackState: navigator.mediaSession ? navigator.mediaSession.playbackState : null,
      currentTime: v ? v.currentTime : null,
      duration: v ? v.duration : null,
      paused: v ? v.paused : null,
      // il profilo, se compare da qualche parte nel DOM
      profilo: document.querySelector("[data-uia*='profile']")?.textContent?.trim() || null,
    };
  }

  setInterval(() => {
    window.postMessage({ canale: CANALE, dati: istantanea() }, location.origin);
  }, 5000);
})();
```

- [ ] **Step 3: il ponte verso l'estensione**

`tools/scrobble-probe/bridge.js`:

```js
// Gira nello ISOLATED world: sente i messaggi del main world e li accumula.
window.addEventListener("message", (e) => {
  if (e.source !== window || !e.data || e.data.canale !== "zconnection-probe") return;
  chrome.storage.local.get({ righe: [] }, ({ righe }) => {
    const ultima = righe[righe.length - 1];
    const nuova = e.data.dati;
    // salva solo quando cambia qualcosa di interessante, non ogni 5 secondi
    const uguale =
      ultima &&
      ultima.title === nuova.title &&
      ultima.artist === nuova.artist &&
      ultima.paused === nuova.paused &&
      Math.abs((ultima.currentTime || 0) - (nuova.currentTime || 0)) < 120;
    if (uguale) return;
    chrome.storage.local.set({ righe: righe.concat([nuova]).slice(-400) });
  });
});
```

- [ ] **Step 4: il pannello che mostra ed esporta**

`tools/scrobble-probe/panel.html`:

```html
<!doctype html>
<meta charset="utf-8" />
<style>
  body { width: 460px; margin: 0; padding: 12px; background: #0a0a0c; color: #fff;
         font: 13px system-ui, sans-serif; }
  button { margin-right: 8px; }
  pre { max-height: 340px; overflow: auto; background: #14141a; padding: 8px;
        border-radius: 8px; white-space: pre-wrap; }
</style>
<p><b>Sonda ZConnection</b> — <span id="conta">0</span> righe</p>
<p><button id="copia">Copia JSON</button><button id="pulisci">Pulisci</button></p>
<pre id="out"></pre>
<script src="panel.js"></script>
```

`tools/scrobble-probe/panel.js`:

```js
function mostra() {
  chrome.storage.local.get({ righe: [] }, ({ righe }) => {
    document.getElementById("conta").textContent = String(righe.length);
    document.getElementById("out").textContent = JSON.stringify(righe, null, 2);
  });
}
document.getElementById("copia").addEventListener("click", () => {
  chrome.storage.local.get({ righe: [] }, ({ righe }) => {
    navigator.clipboard.writeText(JSON.stringify(righe, null, 2));
  });
});
document.getElementById("pulisci").addEventListener("click", () => {
  chrome.storage.local.set({ righe: [] }, mostra);
});
mostra();
```

- [ ] **Step 5: eseguire la sonda (passo manuale dell'utente)**

Istruzioni da dare all'utente, testuali:

1. Chrome → `chrome://extensions` → attiva "Modalità sviluppatore" → "Carica estensione non pacchettizzata" → scegli `tools/scrobble-probe`.
2. Apri `netflix.com`, guarda **due minuti di un episodio di una serie**, metti in pausa, riprendi, poi **salta agli ultimi 30 secondi** e lascia partire l'episodio successivo in automatico.
3. Guarda **un minuto di un film**.
4. Clicca l'icona della sonda → "Copia JSON" → incolla il risultato nella chat.

- [ ] **Step 6: salvare le fixture e annotare la verità**

Salvare il JSON in `src/lib/scrobble/__fixtures__/netflix.json`. Per ogni riga aggiungere a mano il campo `expected`, cioè cosa quella riga **significa**:

```json
{
  "at": "2026-09-09T21:03:10.000Z",
  "url": "https://www.netflix.com/watch/81234567",
  "title": "Il capitolo uno: Il club Hellfire",
  "artist": "Stranger Things",
  "album": null,
  "currentTime": 1084.2,
  "duration": 4560.0,
  "paused": false,
  "expected": {
    "kind": "tv",
    "title": "Stranger Things",
    "season": 4,
    "episode": 1,
    "episodeName": "Il capitolo uno: Il club Hellfire"
  }
}
```

Tenere **almeno 8 righe**: serie con stagione ed episodio, film, episodio successivo in autoplay, pausa, e una riga senza metadati (mediaSession vuota) se capita.

- [ ] **Step 7: aggiornare la spec con quello che si è scoperto**

Riscrivere §6 e §8 della spec con la forma reale dei campi Netflix (quale campo porta la serie, dove sta "S4:E1", se il numero di stagione c'è o va dedotto dall'URL), e §11 se l'autoplay si comporta diversamente da come previsto.

- [ ] **Step 8: commit**

```bash
git add tools/scrobble-probe src/lib/scrobble/__fixtures__/netflix.json docs/superpowers/specs/2026-09-09-zconnection-browser-design.md
git commit -m "spike(scrobble): sonda mediaSession e fixture Netflix reali"
```

---

### Task 2: `parse.ts` — da due stringhe a titolo, stagione, episodio

**Files:**
- Create: `src/lib/scrobble/types.ts`
- Create: `src/lib/scrobble/parse.ts`
- Test: `src/lib/scrobble/parse.test.ts`

**Interfaces:**
- Consumes: niente.
- Produces:
  - `type Site = "netflix" | "prime" | "disney" | "now"`
  - `type ParsedMedia = { kind: "movie" | "tv" | "unknown"; title: string; season: number | null; episode: number | null; episodeName: string | null; key: string }`
  - `parseMedia(show: string | null, detail: string | null): ParsedMedia`
  - `stableKey(parts: (string | number | null)[]): string`

- [ ] **Step 1: scrivere il test che fallisce**

`src/lib/scrobble/parse.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { parseMedia, stableKey } from "./parse";

describe("parseMedia", () => {
  it("riconosce S4:E1 nel dettaglio", () => {
    const r = parseMedia("Stranger Things", "S4:E1 Il club Hellfire");
    expect(r.kind).toBe("tv");
    expect(r.title).toBe("Stranger Things");
    expect(r.season).toBe(4);
    expect(r.episode).toBe(1);
    expect(r.episodeName).toBe("Il club Hellfire");
  });

  it("riconosce le altre forme di stagione ed episodio", () => {
    expect(parseMedia("X", "S02E04")).toMatchObject({ season: 2, episode: 4 });
    expect(parseMedia("X", "S2 E4")).toMatchObject({ season: 2, episode: 4 });
    expect(parseMedia("X", "T2 E4")).toMatchObject({ season: 2, episode: 4 });
    expect(parseMedia("X", "2x04")).toMatchObject({ season: 2, episode: 4 });
    expect(parseMedia("X", "Stagione 2: Episodio 4")).toMatchObject({
      season: 2,
      episode: 4,
    });
    expect(parseMedia("X", "Season 2: Episode 4")).toMatchObject({
      season: 2,
      episode: 4,
    });
  });

  it("accetta un episodio senza stagione", () => {
    const r = parseMedia("Boris", "Episodio 7 - Il commissario");
    expect(r.kind).toBe("tv");
    expect(r.season).toBeNull();
    expect(r.episode).toBe(7);
    expect(r.episodeName).toBe("Il commissario");
  });

  it("senza dettaglio e' un film", () => {
    const r = parseMedia("Il caso Spotlight", null);
    expect(r.kind).toBe("movie");
    expect(r.title).toBe("Il caso Spotlight");
    expect(r.season).toBeNull();
    expect(r.episode).toBeNull();
  });

  it("un dettaglio senza numeri e' il nome dell'episodio", () => {
    const r = parseMedia("Black Mirror", "San Junipero");
    expect(r.kind).toBe("tv");
    expect(r.episodeName).toBe("San Junipero");
    expect(r.episode).toBeNull();
  });

  it("senza titolo e' unknown e non si manda niente", () => {
    expect(parseMedia(null, null).kind).toBe("unknown");
    expect(parseMedia("   ", null).kind).toBe("unknown");
  });

  it("toglie gli spazi e i separatori di troppo", () => {
    expect(parseMedia("  Dark  ", "S1:E2 — Bugie").episodeName).toBe("Bugie");
  });
});

describe("stableKey", () => {
  it("e' stabile e distingue", () => {
    expect(stableKey(["netflix", "Dark", 1, 2])).toBe(stableKey(["netflix", "Dark", 1, 2]));
    expect(stableKey(["netflix", "Dark", 1, 2])).not.toBe(
      stableKey(["netflix", "Dark", 1, 3]),
    );
  });
});
```

- [ ] **Step 2: verificare che fallisca**

Run: `pnpm vitest run src/lib/scrobble/parse.test.ts`
Expected: FAIL — `Failed to resolve import "./parse"`.

- [ ] **Step 3: i tipi condivisi**

`src/lib/scrobble/types.ts`:

```ts
/** I siti che l'estensione osserva. Un sito = una piattaforma TMDB. */
export type Site = "netflix" | "prime" | "disney" | "now";

/** Stato di riproduzione dichiarato dall'estensione. */
export type PlayState = "playing" | "paused" | "stopped";

/** Cosa l'estensione ha visto, senza interpretazioni. */
export type RawEvent = {
  id: string;
  at: string;
  site: Site;
  state: PlayState;
  url: string | null;
  title: string | null;
  artist: string | null;
  album: string | null;
  positionMs: number | null;
  durationMs: number | null;
};

/** Cosa quelle stringhe significano. */
export type ParsedMedia = {
  kind: "movie" | "tv" | "unknown";
  title: string;
  season: number | null;
  episode: number | null;
  episodeName: string | null;
  /** hash stabile di (sito, titolo, stagione, episodio): dedupe e memoizzazione */
  key: string;
};
```

- [ ] **Step 4: l'implementazione minima**

`src/lib/scrobble/parse.ts`:

```ts
import type { ParsedMedia } from "./types";

/**
 * Le forme in cui le piattaforme scrivono stagione ed episodio, in italiano e
 * inglese. L'ordine conta: le piu' specifiche per prime, altrimenti "2x04"
 * mangerebbe un pezzo di "S2 E4".
 */
const SEASON_EPISODE: RegExp[] = [
  /\bS(?:tagione|eason)?\s*(\d{1,2})\s*[:·.\-–—]?\s*(?:E(?:pisodio|pisode)?)\s*(\d{1,3})\b/i,
  /\bT\s*(\d{1,2})\s*[:·.\-–—]?\s*E\s*(\d{1,3})\b/i,
  /\b(\d{1,2})x(\d{1,3})\b/i,
];

/** Solo l'episodio, senza stagione: "Episodio 7", "Episode 7", "Ep. 7". */
const EPISODE_ONLY = /\bEp(?:isodio|isode)?\.?\s*(\d{1,3})\b/i;

/** Separatori fra il codice dell'episodio e il suo nome. */
const LEADING_SEPARATORS = /^[\s:·.\-–—]+/;

/** djb2 in esadecimale: stabile, sincrono, senza dipendenze. */
export function stableKey(parts: (string | number | null)[]): string {
  const s = parts.map((p) => (p === null ? "" : String(p))).join(" ");
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h.toString(16).padStart(8, "0");
}

function clean(value: string | null): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

/**
 * `show` e' il nome dell'opera (serie o film), `detail` cio' che la piattaforma
 * mette accanto: codice dell'episodio, nome dell'episodio, o niente.
 * Non inventa mai: senza `show` il risultato e' `unknown` e l'evento va scartato.
 */
export function parseMedia(show: string | null, detail: string | null): ParsedMedia {
  const title = clean(show);
  const rest = clean(detail);

  if (!title) {
    return {
      kind: "unknown",
      title: "",
      season: null,
      episode: null,
      episodeName: null,
      key: stableKey(["unknown"]),
    };
  }

  let season: number | null = null;
  let episode: number | null = null;
  let name = rest;

  for (const re of SEASON_EPISODE) {
    const m = rest.match(re);
    if (!m) continue;
    season = Number(m[1]);
    episode = Number(m[2]);
    name = rest.slice(m.index! + m[0].length).replace(LEADING_SEPARATORS, "");
    break;
  }

  if (episode === null) {
    const m = rest.match(EPISODE_ONLY);
    if (m) {
      episode = Number(m[1]);
      name = rest.slice(m.index! + m[0].length).replace(LEADING_SEPARATORS, "");
    }
  }

  const episodeName = clean(name) || null;
  const kind = rest ? "tv" : "movie";

  return {
    kind,
    title,
    season,
    episode,
    episodeName,
    key: stableKey([title, season, episode, episodeName]),
  };
}
```

- [ ] **Step 5: verificare che passi**

Run: `pnpm vitest run src/lib/scrobble/parse.test.ts`
Expected: PASS, 8 test.

- [ ] **Step 6: commit**

```bash
git add src/lib/scrobble/types.ts src/lib/scrobble/parse.ts src/lib/scrobble/parse.test.ts
git commit -m "feat(scrobble): parser puro di stagione ed episodio"
```

---

### Task 3: `sites.ts` — dominio, provider e mappatura dei campi reali

Qui entrano le fixture di Task 1: è il modulo che sa **quale campo di `mediaSession` porta la serie e quale l'episodio**, e cambia da sito a sito.

**Files:**
- Create: `src/lib/scrobble/sites.ts`
- Test: `src/lib/scrobble/sites.test.ts`
- Read: `src/lib/scrobble/__fixtures__/netflix.json`

**Interfaces:**
- Consumes: `parseMedia`, `ParsedMedia`, `Site`, `RawEvent` (Task 2).
- Produces:
  - `siteFromUrl(url: string): Site | null`
  - `PROVIDER_ID_BY_SITE: Record<Site, number>`
  - `parseEvent(event: RawEvent): ParsedMedia`

- [ ] **Step 1: scrivere il test che fallisce**

`src/lib/scrobble/sites.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import fixtures from "./__fixtures__/netflix.json";
import { PROVIDER_ID_BY_SITE, parseEvent, siteFromUrl } from "./sites";
import type { RawEvent } from "./types";

describe("siteFromUrl", () => {
  it("riconosce i quattro domini", () => {
    expect(siteFromUrl("https://www.netflix.com/watch/8123")).toBe("netflix");
    expect(siteFromUrl("https://www.primevideo.com/detail/x")).toBe("prime");
    expect(siteFromUrl("https://www.disneyplus.com/it-it/video/x")).toBe("disney");
    expect(siteFromUrl("https://www.nowtv.it/guarda/x")).toBe("now");
  });

  it("non riconosce nient'altro", () => {
    expect(siteFromUrl("https://www.youtube.com/watch?v=x")).toBeNull();
    expect(siteFromUrl("non-un-url")).toBeNull();
  });
});

describe("PROVIDER_ID_BY_SITE", () => {
  it("usa gli id TMDB di config.ts", () => {
    expect(PROVIDER_ID_BY_SITE).toEqual({ netflix: 8, prime: 119, disney: 337, now: 39 });
  });
});

describe("parseEvent sulle fixture vere", () => {
  it("ricava da ogni riga della sonda quello che ci si aspetta", () => {
    for (const row of fixtures as Array<Record<string, unknown>>) {
      const atteso = row.expected as Record<string, unknown>;
      const event = {
        id: "x",
        at: row.at,
        site: "netflix",
        state: row.paused ? "paused" : "playing",
        url: row.url,
        title: row.title,
        artist: row.artist,
        album: row.album,
        positionMs: row.currentTime === null ? null : Math.round(Number(row.currentTime) * 1000),
        durationMs: row.duration === null ? null : Math.round(Number(row.duration) * 1000),
      } as RawEvent;
      const parsed = parseEvent(event);
      expect({ url: row.url, ...parsed }).toMatchObject({ url: row.url, ...atteso });
    }
  });
});
```

- [ ] **Step 2: verificare che fallisca**

Run: `pnpm vitest run src/lib/scrobble/sites.test.ts`
Expected: FAIL — `Failed to resolve import "./sites"`.

- [ ] **Step 3: l'implementazione**

`src/lib/scrobble/sites.ts`. **La mappatura dei campi qui sotto è quella standard di `MediaSession` per il video** (`artist` = l'opera, `title` = l'episodio): se le fixture di Task 1 dicono il contrario per Netflix, si inverte `show`/`detail` dentro `FIELDS.netflix` — è esattamente il punto in cui quel dato vive, e il test sulle fixture è il giudice.

```ts
import { parseMedia } from "./parse";
import type { ParsedMedia, RawEvent, Site } from "./types";

/** Dominio (senza www) -> sito. */
const HOSTS: Record<string, Site> = {
  "netflix.com": "netflix",
  "primevideo.com": "prime",
  "amazon.it": "prime",
  "disneyplus.com": "disney",
  "nowtv.it": "now",
};

/** id TMDB dei provider, gli stessi di PROVIDERS in src/lib/config.ts. */
export const PROVIDER_ID_BY_SITE: Record<Site, number> = {
  netflix: 8,
  prime: 119,
  disney: 337,
  now: 39,
};

export function siteFromUrl(url: string): Site | null {
  let host: string;
  try {
    host = new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
  return HOSTS[host] ?? null;
}

/**
 * Quale campo di mediaSession porta l'opera e quale il dettaglio, per sito.
 * Confermato sulle fixture della sonda: se un sito cambia, si cambia qui e i
 * test sulle fixture lo dicono subito.
 */
const FIELDS: Record<Site, (e: RawEvent) => { show: string | null; detail: string | null }> =
  {
    netflix: (e) => (e.artist ? { show: e.artist, detail: e.title } : { show: e.title, detail: null }),
    prime: (e) => (e.artist ? { show: e.artist, detail: e.title } : { show: e.title, detail: null }),
    disney: (e) => (e.artist ? { show: e.artist, detail: e.title } : { show: e.title, detail: null }),
    now: (e) => (e.artist ? { show: e.artist, detail: e.title } : { show: e.title, detail: null }),
  };

/** Da un evento grezzo a cosa significa. Non chiama la rete: e' puro. */
export function parseEvent(event: RawEvent): ParsedMedia {
  const { show, detail } = FIELDS[event.site](event);
  return parseMedia(show, detail);
}
```

- [ ] **Step 4: verificare che passi**

Run: `pnpm vitest run src/lib/scrobble/sites.test.ts`
Expected: PASS. Se il test sulle fixture fallisce, **la mappatura in `FIELDS.netflix` va invertita**, non il test: le fixture sono la realtà.

- [ ] **Step 5: commit**

```bash
git add src/lib/scrobble/sites.ts src/lib/scrobble/sites.test.ts
git commit -m "feat(scrobble): mappatura dei campi mediaSession per sito"
```

---

### Task 4: `rules.ts` — che cosa scrivere, dato un evento

Il cuore delle regole, **puro**: nessun DB, nessuna rete. Decide l'intento; ad applicarlo sarà la RPC (Task 6).

**Files:**
- Create: `src/lib/scrobble/rules.ts`
- Test: `src/lib/scrobble/rules.test.ts`

**Interfaces:**
- Consumes: `PlayState` (Task 2).
- Produces:
  - `COMPLETE_RATIO = 0.9`, `CLOSE_RATIO = 0.85`, `SESSION_STALE_MS`
  - `type SessionState = { positionMs: number; durationMs: number | null; lastAt: string }`
  - `type Intent = { session: { state: PlayState; positionMs: number; durationMs: number | null }; completed: boolean; progress: { positionMs: number; durationMs: number | null } | null; ignore: "stale" | "no-duration" | null }`
  - `decide(input: { previous: SessionState | null; state: PlayState; at: string; positionMs: number | null; durationMs: number | null; closing: boolean }): Intent`

- [ ] **Step 1: scrivere il test che fallisce**

`src/lib/scrobble/rules.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { COMPLETE_RATIO, decide } from "./rules";

const base = {
  previous: null,
  state: "playing" as const,
  at: "2026-09-09T21:00:00.000Z",
  positionMs: 60_000,
  durationMs: 2_400_000,
  closing: false,
};

describe("decide", () => {
  it("a inizio riproduzione aggiorna la sessione e non completa", () => {
    const r = decide(base);
    expect(r.completed).toBe(false);
    expect(r.session.positionMs).toBe(60_000);
    expect(r.progress).toEqual({ positionMs: 60_000, durationMs: 2_400_000 });
  });

  it("completa oltre il 90 per cento", () => {
    const r = decide({ ...base, positionMs: Math.round(2_400_000 * COMPLETE_RATIO) });
    expect(r.completed).toBe(true);
    expect(r.progress).toBeNull();
  });

  it("alla chiusura completa gia' dall'85 per cento", () => {
    const r = decide({ ...base, positionMs: 2_050_000, state: "stopped", closing: true });
    expect(r.completed).toBe(true);
  });

  it("alla chiusura sotto l'85 per cento salva solo il punto", () => {
    const r = decide({ ...base, positionMs: 1_000_000, state: "stopped", closing: true });
    expect(r.completed).toBe(false);
    expect(r.progress).toEqual({ positionMs: 1_000_000, durationMs: 2_400_000 });
  });

  it("senza durata non completa mai, ma il minuto lo salva", () => {
    const r = decide({ ...base, durationMs: null, positionMs: 9_000_000, closing: true });
    expect(r.completed).toBe(false);
    expect(r.progress).toEqual({ positionMs: 9_000_000, durationMs: null });
  });

  it("scarta un evento piu' vecchio dell'ultimo visto", () => {
    const r = decide({
      ...base,
      previous: { positionMs: 500_000, durationMs: 2_400_000, lastAt: "2026-09-09T21:05:00.000Z" },
      at: "2026-09-09T21:01:00.000Z",
    });
    expect(r.ignore).toBe("stale");
  });

  it("accetta il riavvolgimento se l'evento e' piu' recente", () => {
    const r = decide({
      ...base,
      previous: { positionMs: 500_000, durationMs: 2_400_000, lastAt: "2026-09-09T21:01:00.000Z" },
      at: "2026-09-09T21:02:00.000Z",
      positionMs: 120_000,
    });
    expect(r.ignore).toBeNull();
    expect(r.session.positionMs).toBe(120_000);
  });

  it("una posizione senza numero non scrive niente", () => {
    const r = decide({ ...base, positionMs: null });
    expect(r.ignore).toBe("no-duration");
  });
});
```

- [ ] **Step 2: verificare che fallisca**

Run: `pnpm vitest run src/lib/scrobble/rules.test.ts`
Expected: FAIL — `Failed to resolve import "./rules"`.

- [ ] **Step 3: l'implementazione**

`src/lib/scrobble/rules.ts`:

```ts
import type { PlayState } from "./types";

/** Oltre questa frazione della durata, l'episodio e' visto. */
export const COMPLETE_RATIO = 0.9;
/** Alla chiusura della sessione basta un po' meno: i titoli di coda contano. */
export const CLOSE_RATIO = 0.85;
/** Una sessione senza heartbeat per piu' di 4 ore e' orfana: si chiude. */
export const SESSION_STALE_MS = 4 * 60 * 60 * 1000;

export type SessionState = {
  positionMs: number;
  durationMs: number | null;
  lastAt: string;
};

export type Intent = {
  session: { state: PlayState; positionMs: number; durationMs: number | null };
  /** true = l'episodio o il film e' finito: si segna visto e si azzera il punto. */
  completed: boolean;
  /** dove riprendere; null quando e' completato (non c'e' piu' un "riprendi") */
  progress: { positionMs: number; durationMs: number | null } | null;
  /** valorizzato quando non si scrive niente, e perche' */
  ignore: "stale" | "no-duration" | null;
};

/**
 * Dato lo stato precedente della sessione e un evento, decide cosa scrivere.
 * Puro: le scritture le fa la RPC `scrobble_apply`.
 *
 * Regole, dalla spec §11 e §11-bis:
 * - un evento piu' vecchio dell'ultimo visto si scarta (heartbeat fuori ordine);
 *   un riavvolgimento con un `at` piu' recente e' invece legittimo;
 * - completo oltre COMPLETE_RATIO, oppure alla chiusura oltre CLOSE_RATIO;
 * - durata sconosciuta: mai completamento automatico, ma il minuto si salva;
 * - a completamento il punto di ripresa si azzera.
 */
export function decide(input: {
  previous: SessionState | null;
  state: PlayState;
  at: string;
  positionMs: number | null;
  durationMs: number | null;
  closing: boolean;
}): Intent {
  const { previous, state, at, positionMs, durationMs, closing } = input;

  const vuoto: Intent = {
    session: { state, positionMs: previous?.positionMs ?? 0, durationMs: durationMs ?? null },
    completed: false,
    progress: null,
    ignore: "no-duration",
  };

  if (positionMs === null || !Number.isFinite(positionMs) || positionMs < 0) return vuoto;

  if (previous && Date.parse(at) < Date.parse(previous.lastAt)) {
    return { ...vuoto, ignore: "stale" };
  }

  const ratio = durationMs && durationMs > 0 ? positionMs / durationMs : null;
  const soglia = closing ? CLOSE_RATIO : COMPLETE_RATIO;
  const completed = ratio !== null && ratio >= soglia;

  return {
    session: { state, positionMs, durationMs },
    completed,
    progress: completed ? null : { positionMs, durationMs },
    ignore: null,
  };
}
```

- [ ] **Step 4: verificare che passi**

Run: `pnpm vitest run src/lib/scrobble/rules.test.ts`
Expected: PASS, 8 test.

- [ ] **Step 5: commit**

```bash
git add src/lib/scrobble/rules.ts src/lib/scrobble/rules.test.ts
git commit -m "feat(scrobble): regole pure di completamento e minutaggio"
```

---

### Task 5: le migrazioni

**Files:**
- Create: `supabase/migrations/0025_zconnection.sql`
- Create: `supabase/migrations/0026_scrobble_profiles_progress.sql`
- Modify: `src/types/database.ts` (rigenerato)

**Interfaces:**
- Produces: tabelle `devices`, `device_members`, `watch_sessions`, `pending_scrobbles`, `device_profiles`; colonne `watch_entries.position_*`.

- [ ] **Step 1: la migrazione del nucleo**

`supabase/migrations/0025_zconnection.sql`:

```sql
-- ZConnection: dispositivi che riferiscono cosa l'utente sta guardando.
-- Nessuna policy per `anon`: la chiave anon sta nel bundle del browser.

create type public.device_platform as enum ('fire_tv', 'android_tv', 'android', 'browser_ext');

create table public.devices (
  id uuid primary key default gen_random_uuid(),
  install_id uuid not null unique,
  token_hash text not null unique,          -- sha256 esadecimale, mai il token
  name text not null,
  platform public.device_platform not null,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz,
  revoked_at timestamptz
);

create table public.device_members (
  device_id uuid not null references public.devices (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  paused_until timestamptz,
  created_at timestamptz not null default now(),
  primary key (device_id, user_id)
);

create table public.watch_sessions (
  id uuid primary key default gen_random_uuid(),
  device_id uuid not null references public.devices (id) on delete cascade,
  user_id uuid references public.profiles (id) on delete cascade,
  provider_id int not null,
  title_id bigint not null,
  media_type public.media_type not null,
  season_number int,
  episode_number int,
  state text not null check (state in ('playing', 'paused', 'stopped')),
  position_ms bigint not null default 0,
  duration_ms bigint,
  completed boolean not null default false,
  started_at timestamptz not null default now(),
  last_heartbeat_at timestamptz not null default now(),
  ended_at timestamptz,
  foreign key (title_id, media_type) references public.titles (id, media_type)
);

create index watch_sessions_user_live_idx
  on public.watch_sessions (user_id, last_heartbeat_at desc)
  where ended_at is null;

create table public.pending_scrobbles (
  id uuid primary key default gen_random_uuid(),
  device_id uuid not null references public.devices (id) on delete cascade,
  user_id uuid references public.profiles (id) on delete cascade,
  reason text not null check (reason in ('ambiguous_title', 'unknown_title', 'ambiguous_user')),
  provider_id int not null,
  raw jsonb not null,
  candidates jsonb not null default '[]',
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create unique index pending_scrobbles_open_key_idx
  on public.pending_scrobbles (device_id, provider_id, (raw ->> 'key'))
  where resolved_at is null;

alter table public.devices enable row level security;
alter table public.device_members enable row level security;
alter table public.watch_sessions enable row level security;
alter table public.pending_scrobbles enable row level security;

create policy devices_select_members on public.devices for select to authenticated
  using (exists (select 1 from public.device_members m
                 where m.device_id = devices.id and m.user_id = auth.uid()));

create policy device_members_own on public.device_members for select to authenticated
  using (user_id = auth.uid());
create policy device_members_update_own on public.device_members for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy device_members_delete_own on public.device_members for delete to authenticated
  using (user_id = auth.uid());

create policy watch_sessions_select_own on public.watch_sessions for select to authenticated
  using (user_id = auth.uid());

create policy pending_select_own on public.pending_scrobbles for select to authenticated
  using (user_id = auth.uid()
         or (user_id is null
             and exists (select 1 from public.device_members m
                         where m.device_id = pending_scrobbles.device_id
                           and m.user_id = auth.uid())));

revoke all on public.devices from anon;
revoke all on public.device_members from anon;
revoke all on public.watch_sessions from anon;
revoke all on public.pending_scrobbles from anon;

grant select on public.devices to authenticated;
grant select, update, delete on public.device_members to authenticated;
grant select on public.watch_sessions to authenticated;
grant select on public.pending_scrobbles to authenticated;
```

- [ ] **Step 2: la migrazione dei profili e del minutaggio**

`supabase/migrations/0026_scrobble_profiles_progress.sql`:

```sql
-- Mappatura profilo della piattaforma -> utente Zapp, e punto di ripresa.

create table public.device_profiles (
  device_id uuid not null references public.devices (id) on delete cascade,
  site text not null check (site in ('netflix', 'prime', 'disney', 'now')),
  profile_name text not null,
  user_id uuid references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (device_id, site, profile_name)
);

alter table public.device_profiles enable row level security;

create policy device_profiles_members on public.device_profiles for all to authenticated
  using (exists (select 1 from public.device_members m
                 where m.device_id = device_profiles.device_id and m.user_id = auth.uid()))
  with check (exists (select 1 from public.device_members m
                      where m.device_id = device_profiles.device_id and m.user_id = auth.uid()));

revoke all on public.device_profiles from anon;
grant select, insert, update, delete on public.device_profiles to authenticated;

-- Il punto di ripresa: dove sei adesso, distinto dall'ultimo episodio finito.
alter table public.watch_entries
  add column position_ms bigint,
  add column position_duration_ms bigint,
  add column position_season int,
  add column position_episode int,
  add column position_at timestamptz;

comment on column public.watch_entries.position_episode is
  'Episodio a cui si riferisce position_ms: puo'' essere piu'' avanti di episode_number, che e'' l''ultimo finito.';
```

- [ ] **Step 3: applicare e rigenerare i tipi**

Applicare via MCP Supabase (`apply_migration`), una migrazione alla volta, poi:

```bash
supabase gen types typescript --project-id bbuhwzdbzxgydewmcdwd > src/types/database.ts
```

- [ ] **Step 4: verificare che il DB sia pulito**

Eseguire `get_advisors` (security) sul progetto Supabase. Atteso: **nessun avviso nuovo** rispetto a quelli già accettati e documentati nel README (`user_search`, `reviews_with_counts`). Se compare "RLS enabled no policy" su una tabella nuova, è un errore: ogni tabella qui ha le sue policy.

- [ ] **Step 5: verificare che l'app compili coi tipi nuovi**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 6: commit**

```bash
git add supabase/migrations/0025_zconnection.sql supabase/migrations/0026_scrobble_profiles_progress.sql src/types/database.ts
git commit -m "feat(scrobble): tabelle dei dispositivi, sessioni e minutaggio"
```

---

### Task 6: la RPC `scrobble_apply`

L'unica cosa che scrive per conto di un dispositivo. `SECURITY DEFINER`, validata dall'hash del token: il service client non tocca dati utente.

**Files:**
- Create: `supabase/migrations/0027_scrobble_apply.sql`
- Modify: `src/types/database.ts` (rigenerato)

**Interfaces:**
- Produces: `scrobble_apply(p_token_hash text, p_intent jsonb) returns jsonb`.
  `p_intent` = `{title_id, media_type, provider_id, season, episode, state, position_ms, duration_ms, completed, progress: {position_ms, duration_ms} | null, at}`.
  Ritorna `{ok, user_id, session_id, entry_written}`.

- [ ] **Step 1: scrivere la migrazione**

`supabase/migrations/0027_scrobble_apply.sql`:

```sql
-- Applica in transazione l'intento calcolato dal server (src/lib/scrobble/rules.ts).
-- L'autorizzazione sta qui: dal token si ricava il dispositivo, dal dispositivo
-- l'unico membro attivo. Se i membri attivi non sono esattamente uno, non si
-- scrive niente in libreria (regola: finche' l'utente non e' certo).

create or replace function public.scrobble_apply(p_token_hash text, p_intent jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_device       public.devices%rowtype;
  v_user_id      uuid;
  v_membri       int;
  v_session_id   uuid;
  v_title_id     bigint  := (p_intent ->> 'title_id')::bigint;
  v_media_type   public.media_type := (p_intent ->> 'media_type')::public.media_type;
  v_provider     int     := (p_intent ->> 'provider_id')::int;
  v_season       int     := nullif(p_intent ->> 'season', '')::int;
  v_episode      int     := nullif(p_intent ->> 'episode', '')::int;
  v_state        text    := p_intent ->> 'state';
  v_position     bigint  := (p_intent ->> 'position_ms')::bigint;
  v_duration     bigint  := nullif(p_intent ->> 'duration_ms', '')::bigint;
  v_completed    boolean := coalesce((p_intent ->> 'completed')::boolean, false);
  v_at           timestamptz := coalesce((p_intent ->> 'at')::timestamptz, now());
  v_progress     jsonb   := p_intent -> 'progress';
  v_entry        public.watch_entries%rowtype;
  v_written      boolean := false;
begin
  select * into v_device from public.devices
   where token_hash = p_token_hash and revoked_at is null;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'unknown_device');
  end if;

  update public.devices set last_seen_at = now() where id = v_device.id;

  select count(*), min(user_id) into v_membri, v_user_id
    from public.device_members
   where device_id = v_device.id
     and (paused_until is null or paused_until < now());

  -- chiude le sessioni orfane di questo dispositivo
  update public.watch_sessions
     set ended_at = now(), state = 'stopped'
   where device_id = v_device.id
     and ended_at is null
     and last_heartbeat_at < now() - interval '4 hours';

  -- una sessione per (dispositivo, titolo, stagione, episodio)
  select id into v_session_id from public.watch_sessions
   where device_id = v_device.id
     and title_id = v_title_id and media_type = v_media_type
     and season_number is not distinct from v_season
     and episode_number is not distinct from v_episode
     and ended_at is null
   order by last_heartbeat_at desc
   limit 1;

  if v_session_id is null then
    -- un titolo diverso chiude quello di prima
    update public.watch_sessions set ended_at = now(), state = 'stopped'
     where device_id = v_device.id and ended_at is null;

    insert into public.watch_sessions
      (device_id, user_id, provider_id, title_id, media_type, season_number,
       episode_number, state, position_ms, duration_ms, completed, last_heartbeat_at)
    values
      (v_device.id, case when v_membri = 1 then v_user_id else null end, v_provider,
       v_title_id, v_media_type, v_season, v_episode, v_state, v_position, v_duration,
       v_completed, v_at)
    returning id into v_session_id;
  else
    update public.watch_sessions
       set state = v_state,
           position_ms = v_position,
           duration_ms = coalesce(v_duration, duration_ms),
           completed = watch_sessions.completed or v_completed,
           last_heartbeat_at = v_at,
           ended_at = case when v_state = 'stopped' then now() else null end
     where id = v_session_id;
  end if;

  -- Finche' l'utente non e' certo, la libreria non si tocca.
  if v_membri <> 1 then
    return jsonb_build_object('ok', true, 'user_id', null, 'session_id', v_session_id,
                              'entry_written', false);
  end if;

  select * into v_entry from public.watch_entries
   where user_id = v_user_id and title_id = v_title_id and media_type = v_media_type;

  if not found then
    insert into public.watch_entries
      (user_id, title_id, media_type, status, started_at, last_watched_at)
    values (v_user_id, v_title_id, v_media_type, 'watching', now(), v_at)
    returning * into v_entry;
    v_written := true;
  elsif v_entry.status in ('want', 'dropped') then
    update public.watch_entries
       set status = 'watching',
           started_at = coalesce(started_at, now()),
           last_watched_at = greatest(last_watched_at, v_at)
     where id = v_entry.id
    returning * into v_entry;
    v_written := true;
  end if;

  if v_completed then
    update public.watch_entries
       set season_number = case
             when v_media_type = 'tv' then greatest(coalesce(season_number, 0), coalesce(v_season, 0))
             else season_number end,
           episode_number = case
             when v_media_type = 'tv' and coalesce(v_season, 0) >= coalesce(season_number, 0)
               then greatest(coalesce(episode_number, 0), coalesce(v_episode, 0))
             else episode_number end,
           status = case when v_media_type = 'movie' then 'watched' else status end,
           finished_at = case when v_media_type = 'movie' then now() else finished_at end,
           last_watched_at = greatest(last_watched_at, v_at),
           position_ms = null, position_duration_ms = null,
           position_season = null, position_episode = null, position_at = v_at
     where id = v_entry.id;
    v_written := true;
  elsif v_progress is not null and jsonb_typeof(v_progress) = 'object' then
    update public.watch_entries
       set position_ms = (v_progress ->> 'position_ms')::bigint,
           position_duration_ms = nullif(v_progress ->> 'duration_ms', '')::bigint,
           position_season = v_season,
           position_episode = v_episode,
           position_at = v_at,
           last_watched_at = greatest(last_watched_at, v_at)
     where id = v_entry.id
       and (position_at is null or position_at <= v_at);   -- mai indietro nel tempo
    v_written := true;
  end if;

  return jsonb_build_object('ok', true, 'user_id', v_user_id, 'session_id', v_session_id,
                            'entry_written', v_written);
end;
$$;

-- La chiama solo il nostro server, col service role. Mai esposta come endpoint.
revoke all on function public.scrobble_apply(text, jsonb) from anon, authenticated, public;
```

- [ ] **Step 2: applicare e rigenerare i tipi**

Applicare via MCP (`apply_migration`), poi `supabase gen types … > src/types/database.ts`.

- [ ] **Step 3: provare la RPC a mano**

Con `execute_sql` sul progetto: inserire un dispositivo finto con un `token_hash` noto, un `device_members` verso il proprio utente, e chiamare:

```sql
select public.scrobble_apply(
  'hash-di-prova',
  jsonb_build_object(
    'title_id', 66732, 'media_type', 'tv', 'provider_id', 8,
    'season', 4, 'episode', 1, 'state', 'playing',
    'position_ms', 1084000, 'duration_ms', 4560000,
    'completed', false,
    'progress', jsonb_build_object('position_ms', 1084000, 'duration_ms', 4560000),
    'at', now()
  )
);
```

Atteso: `{"ok": true, "entry_written": true, …}`, una riga in `watch_sessions`, e `watch_entries.position_ms = 1084000` con `position_episode = 1`. Ripetendo con `completed = true`: `position_ms` torna nullo e `episode_number` diventa 1. **Cancellare le righe di prova alla fine.**

- [ ] **Step 4: commit**

```bash
git add supabase/migrations/0027_scrobble_apply.sql src/types/database.ts
git commit -m "feat(scrobble): RPC che applica sessione, stato e minutaggio"
```

---

### Task 7: `match.ts` — dal titolo parsato al titolo TMDB

**Files:**
- Create: `src/lib/scrobble/match.ts`
- Test: `src/lib/scrobble/match.test.ts`

**Interfaces:**
- Consumes: `ParsedMedia` (Task 2), `titleSimilarity` e `normalizeTitle` da `src/lib/import/netflix-title.ts`.
- Produces:
  - `scoreCandidate(parsed, candidate): number` — **puro**, testato.
  - `matchTitle(parsed: ParsedMedia, providerId: number): Promise<{ titleId: number; mediaType: "movie" | "tv" } | null>` — server-only.

- [ ] **Step 1: scrivere il test che fallisce (solo la parte pura)**

`src/lib/scrobble/match.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { scoreCandidate } from "./match";
import { parseMedia } from "./parse";

const dark = parseMedia("Dark", "S1:E2 Bugie");

describe("scoreCandidate", () => {
  it("premia il titolo identico", () => {
    const s = scoreCandidate(dark, { name: "Dark", year: 2017, hasProvider: false, popularity: 40 });
    expect(s).toBeGreaterThan(0.9);
  });

  it("premia chi e' offerto dalla piattaforma su cui stiamo guardando", () => {
    const con = scoreCandidate(dark, { name: "Dark", year: 2017, hasProvider: true, popularity: 10 });
    const senza = scoreCandidate(dark, { name: "Dark", year: 2017, hasProvider: false, popularity: 10 });
    expect(con).toBeGreaterThan(senza);
  });

  it("punisce un titolo diverso", () => {
    const s = scoreCandidate(dark, { name: "Darkness", year: 2017, hasProvider: true, popularity: 90 });
    expect(s).toBeLessThan(0.9);
  });

  it("la popolarita' non ribalta la somiglianza", () => {
    const giusto = scoreCandidate(dark, { name: "Dark", year: 2017, hasProvider: false, popularity: 1 });
    const sbagliato = scoreCandidate(dark, { name: "The Dark Knight", year: 2008, hasProvider: true, popularity: 99 });
    expect(giusto).toBeGreaterThan(sbagliato);
  });
});
```

- [ ] **Step 2: verificare che fallisca**

Run: `pnpm vitest run src/lib/scrobble/match.test.ts`
Expected: FAIL — `Failed to resolve import "./match"`.

- [ ] **Step 3: l'implementazione**

`src/lib/scrobble/match.ts`:

```ts
import "server-only";
import { searchMovies, searchTv } from "@/lib/tmdb/client";
import { normalizeTitle, titleSimilarity } from "@/lib/import/netflix-title";
import { createServiceClient } from "@/lib/supabase/server";
import type { ParsedMedia } from "./types";

/** Sopra questa soglia il candidato si accetta senza chiedere niente all'utente. */
export const MATCH_THRESHOLD = 0.85;

export type Candidate = {
  name: string;
  year: number | null;
  /** il titolo e' offerto dalla piattaforma su cui stiamo guardando */
  hasProvider: boolean;
  popularity: number;
};

/**
 * Somiglianza del nome (il grosso), piu' due spinte piccole: essere offerto
 * dalla piattaforma giusta e la popolarita'. Le spinte non devono mai ribaltare
 * la somiglianza: sommate valgono al massimo 0,1.
 */
export function scoreCandidate(parsed: ParsedMedia, c: Candidate): number {
  const base = titleSimilarity(normalizeTitle(parsed.title), normalizeTitle(c.name));
  const provider = c.hasProvider ? 0.06 : 0;
  const pop = Math.min(Math.max(c.popularity, 0), 100) / 100 * 0.04;
  return Math.min(base + provider + pop, 1);
}

/**
 * Prima la cache `titles` (nessuna chiamata di rete: e' il caso normale, i titoli
 * che si guardano sono quasi sempre gia' stati aperti in Zapp), poi TMDB.
 * Lettura di sistema sulla cache: service client, come `getWallPosters`.
 */
export async function matchTitle(
  parsed: ParsedMedia,
  providerId: number,
): Promise<{ titleId: number; mediaType: "movie" | "tv" } | null> {
  if (parsed.kind === "unknown" || !parsed.title) return null;
  const mediaType = parsed.kind === "tv" ? "tv" : "movie";

  const service = createServiceClient();
  const { data: cached } = await service
    .from("titles")
    .select("id, title, original_title, popularity")
    .eq("media_type", mediaType)
    .ilike("title", parsed.title)
    .limit(5);

  for (const row of cached ?? []) {
    const s = scoreCandidate(parsed, {
      name: row.title,
      year: null,
      hasProvider: true,
      popularity: row.popularity ?? 0,
    });
    if (s >= MATCH_THRESHOLD) return { titleId: row.id, mediaType };
  }

  const results =
    mediaType === "tv" ? await searchTv(parsed.title) : await searchMovies(parsed.title);

  let best: { id: number; score: number } | null = null;
  for (const r of results.slice(0, 8)) {
    const name = mediaType === "tv" ? (r.name ?? "") : (r.title ?? "");
    const s = scoreCandidate(parsed, {
      name,
      year: null,
      hasProvider: false,
      popularity: r.popularity ?? 0,
    });
    if (!best || s > best.score) best = { id: r.id, score: s };
  }

  if (best && best.score >= MATCH_THRESHOLD) {
    return { titleId: best.id, mediaType };
  }
  return null;
}
```

Nota per chi implementa: se `searchTv`/`searchMovies` in `src/lib/tmdb/client.ts` hanno una firma o un tipo di ritorno diversi da quello usato qui, **adeguare questa funzione al client esistente**, non il contrario: il client è la fonte di verità e ha già throttle e memo.

- [ ] **Step 4: verificare che passi**

Run: `pnpm vitest run src/lib/scrobble/match.test.ts`
Expected: PASS, 4 test.

- [ ] **Step 5: commit**

```bash
git add src/lib/scrobble/match.ts src/lib/scrobble/match.test.ts
git commit -m "feat(scrobble): corrispondenza TMDB con preferenza per la piattaforma"
```

---

### Task 8: l'ingest `POST /api/scrobble`

**Files:**
- Create: `src/app/api/scrobble/route.ts`
- Modify: `scripts/security-check.mjs`

**Interfaces:**
- Consumes: `parseEvent`, `PROVIDER_ID_BY_SITE` (Task 3), `decide` (Task 4), `matchTitle` (Task 7), `scrobble_apply` (Task 6), `rateLimit` da `src/lib/rate-limit.ts` (firma: `rateLimit(key, limit, windowSeconds): Promise<boolean>`), `getOrFetchTitle` da `src/lib/tmdb/cache.ts`.
- Produces: `POST /api/scrobble` e `OPTIONS /api/scrobble`.

- [ ] **Step 1: scrivere la route**

`src/app/api/scrobble/route.ts`:

```ts
import { createHash } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getOrFetchTitle } from "@/lib/tmdb/cache";
import { rateLimit } from "@/lib/rate-limit";
import { decide } from "@/lib/scrobble/rules";
import { PROVIDER_ID_BY_SITE, parseEvent } from "@/lib/scrobble/sites";
import type { RawEvent, Site } from "@/lib/scrobble/types";

/** L'unica origine che puo' chiamare questo endpoint da fuori. */
const EXTENSION_ORIGIN = process.env.ZCONNECTION_EXTENSION_ORIGIN ?? "";
const MAX_EVENTS = 50;
const MAX_BODY = 64 * 1024;
const SITES: Site[] = ["netflix", "prime", "disney", "now"];

function cors(res: NextResponse): NextResponse {
  if (EXTENSION_ORIGIN) {
    res.headers.set("Access-Control-Allow-Origin", EXTENSION_ORIGIN);
    res.headers.set("Access-Control-Allow-Headers", "content-type, authorization");
    res.headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.headers.set("Vary", "Origin");
  }
  return res;
}

export function OPTIONS() {
  return cors(new NextResponse(null, { status: 204 }));
}

function isRawEvent(v: unknown): v is RawEvent {
  if (!v || typeof v !== "object") return false;
  const e = v as Record<string, unknown>;
  return (
    typeof e.at === "string" &&
    typeof e.site === "string" &&
    SITES.includes(e.site as Site) &&
    ["playing", "paused", "stopped"].includes(String(e.state))
  );
}

export async function POST(request: NextRequest) {
  const auth = request.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token || token.length < 20) {
    return cors(NextResponse.json({ error: "Non autorizzato" }, { status: 401 }));
  }
  const tokenHash = createHash("sha256").update(token).digest("hex");

  if (!(await rateLimit(`scrobble:${tokenHash}`, 240, 60))) {
    return cors(NextResponse.json({ error: "Troppe richieste" }, { status: 429 }));
  }

  const body = await request.text();
  if (body.length > MAX_BODY) {
    return cors(NextResponse.json({ error: "Richiesta troppo grande" }, { status: 413 }));
  }

  let payload: { events?: unknown };
  try {
    payload = JSON.parse(body);
  } catch {
    return cors(NextResponse.json({ error: "Richiesta non valida" }, { status: 400 }));
  }

  const events = Array.isArray(payload.events) ? payload.events.slice(0, MAX_EVENTS) : [];
  const service = createServiceClient();

  // Serve l'id del dispositivo per leggere LA SUA sessione: senza, si leggerebbe
  // la sessione di chiunque altro stia guardando lo stesso titolo.
  const { data: device } = await service
    .from("devices")
    .select("id")
    .eq("token_hash", tokenHash)
    .is("revoked_at", null)
    .maybeSingle();

  if (!device) {
    return cors(NextResponse.json({ error: "Non autorizzato" }, { status: 401 }));
  }
  let applied = 0;
  let ignored = 0;
  let card: Record<string, unknown> | null = null;

  for (const raw of events) {
    if (!isRawEvent(raw)) {
      ignored++;
      continue;
    }
    const parsed = parseEvent(raw);
    if (parsed.kind === "unknown") {
      ignored++;
      continue;
    }

    const providerId = PROVIDER_ID_BY_SITE[raw.site];
    const { matchTitle } = await import("@/lib/scrobble/match");
    const match = await matchTitle(parsed, providerId);
    if (!match) {
      ignored++;
      continue;
    }

    // la FK di watch_sessions esige la riga in `titles`
    await getOrFetchTitle(match.titleId, match.mediaType);

    const { data: prev } = await service
      .from("watch_sessions")
      .select("position_ms, duration_ms, last_heartbeat_at")
      .eq("device_id", device.id)
      .eq("title_id", match.titleId)
      .eq("media_type", match.mediaType)
      .is("ended_at", null)
      .order("last_heartbeat_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const intent = decide({
      previous: prev
        ? {
            positionMs: Number(prev.position_ms ?? 0),
            durationMs: prev.duration_ms === null ? null : Number(prev.duration_ms),
            lastAt: prev.last_heartbeat_at,
          }
        : null,
      state: raw.state,
      at: raw.at,
      positionMs: raw.positionMs,
      durationMs: raw.durationMs,
      closing: raw.state === "stopped",
    });

    if (intent.ignore) {
      ignored++;
      continue;
    }

    const { data, error } = await service.rpc("scrobble_apply", {
      p_token_hash: tokenHash,
      p_intent: {
        title_id: match.titleId,
        media_type: match.mediaType,
        provider_id: providerId,
        season: parsed.season,
        episode: parsed.episode,
        state: intent.session.state,
        position_ms: intent.session.positionMs,
        duration_ms: intent.session.durationMs,
        completed: intent.completed,
        progress: intent.progress
          ? { position_ms: intent.progress.positionMs, duration_ms: intent.progress.durationMs }
          : null,
        at: raw.at,
      },
    });

    if (error) {
      console.error("[scrobble] rpc", error.message);
      ignored++;
      continue;
    }
    if ((data as { ok?: boolean } | null)?.ok === false) {
      return cors(NextResponse.json({ error: "Non autorizzato" }, { status: 401 }));
    }

    applied++;

    // per la card dell'estensione: titolo e copertina, mai una chiamata TMDB dal client
    const { data: t } = await service
      .from("titles")
      .select("title, poster_path, backdrop_path")
      .eq("id", match.titleId)
      .eq("media_type", match.mediaType)
      .maybeSingle();

    card = {
      title: t?.title ?? parsed.title,
      posterPath: t?.poster_path ?? null,
      backdropPath: t?.backdrop_path ?? null,
      season: parsed.season,
      episode: parsed.episode,
      episodeName: parsed.episodeName,
      completed: intent.completed,
    };
  }

  return cors(NextResponse.json({ ok: true, applied, ignored, card }));
}
```

- [ ] **Step 2: provare la route senza estensione**

Con l'app avviata (`NEXT_DIST_DIR=.next-check pnpm build && NEXT_DIST_DIR=.next-check pnpm exec next start -p 3399`), e un dispositivo di prova inserito a mano come in Task 6 Step 3:

```bash
curl -s -X POST http://localhost:3399/api/scrobble \
  -H "authorization: Bearer <il token in chiaro di prova>" \
  -H "content-type: application/json" \
  -d '{"events":[{"id":"1","at":"2026-09-09T21:00:00.000Z","site":"netflix","state":"playing","url":"https://www.netflix.com/watch/1","title":"Il club Hellfire","artist":"Stranger Things","album":null,"positionMs":1084000,"durationMs":4560000}]}'
```

Atteso: `{"ok":true,"applied":1,"ignored":0,"card":{…}}` e la riga di progresso su `watch_entries`.
Con un token sbagliato: `401`. Con 300 richieste in un minuto: `429`.

- [ ] **Step 3: aggiungere il controllo del CORS alla verifica di sicurezza**

In `scripts/security-check.mjs`, accanto agli altri controlli, aggiungere un caso che chiama `OPTIONS /api/scrobble` con `Origin: https://esempio.invalid` e verifica che la risposta **non** contenga `Access-Control-Allow-Origin: *` né quell'origine; e che `POST` senza `authorization` risponda `401`.

- [ ] **Step 4: eseguire la verifica**

Run: `node scripts/security-check.mjs` (contro l'istanza avviata)
Expected: PASS su tutti i controlli, compreso quello nuovo.

- [ ] **Step 5: commit**

```bash
git add src/app/api/scrobble/route.ts scripts/security-check.mjs
git commit -m "feat(scrobble): ingest degli eventi con CORS chiuso all'estensione"
```

---

### Task 9: abbinamento e pagina `/devices`

**Collegare non è "abbinare": è autorizzare.** Estensione e Zapp stanno sulla stessa
macchina e in una delle due sei già autenticato, quindi niente codici da digitare. Tre passi
di cui uno solo è un click: installi → **l'estensione apre da sola una scheda su una pagina
di Zapp** → premi "Collega questo browser". La pagina sta su Zapp e non nell'estensione
perché lì la sessione c'è già: nessuna credenziale attraversa niente, e l'estensione riceve
solo un token suo, revocabile.

Due cose non negoziabili, perché sono la differenza fra "funziona" e "sembra funzionare":
- **Riconoscere se l'estensione c'è**: `chrome.runtime.sendMessage` verso un'estensione non
  installata fallisce con `chrome.runtime.lastError`. Lo stesso bottone diventa allora
  "Installa l'estensione" col link allo store. Nessun vicolo cieco, da qualunque parte si
  arrivi.
- **Chiudere il cerchio**: la conferma non dice "Collegato" e basta — dice "Apri Netflix e
  fai partire qualcosa", e **resta in ascolto** finché il primo titolo non arriva. Il
  fallimento peggiore è il successo silenzioso.

**Files:**
- Create: `src/app/(app)/devices/page.tsx`
- Create: `src/app/(app)/devices/DevicesClient.tsx`
- Create: `src/app/(app)/devices/ConnectButton.tsx`
- Create: `src/app/(app)/devices/connect/page.tsx`
- Create: `src/app/(app)/devices/actions.ts`
- Create: `src/app/(app)/devices/loading.tsx`
- Modify: `src/app/(app)/profile/ProfileEditor.tsx` (la voce "Dispositivi collegati")

**Interfaces:**
- Consumes: `getViewer` da `@/lib/auth/viewer`, `createClient`/`createServiceClient` da `@/lib/supabase/server`, `rateLimit`.
- Produces:
  - `connectBrowser(): Promise<{ ok: true; token: string; deviceId: string } | { ok: false; error: string }>`
  - `disconnectDevice(deviceId: string): Promise<{ ok: boolean }>`
  - `pauseDevice(deviceId: string, hours: number): Promise<{ ok: boolean }>`
  - `firstEventSeen(deviceId: string): Promise<{ seen: boolean; title: string | null }>`
  - `<ConnectButton />` (client), riusato da `/devices` e da `/devices/connect`

- [ ] **Step 1: le Server Action**

`src/app/(app)/devices/actions.ts`:

```ts
"use server";

import { createHash, randomBytes, randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { rateLimit } from "@/lib/rate-limit";
import { isUuid } from "@/lib/validate";

/**
 * Crea il dispositivo "questo browser" e restituisce il token **una volta sola**:
 * il server ne conserva solo l'hash. La pagina lo passa all'estensione via
 * `chrome.runtime.sendMessage`, poi lo dimentica.
 */
export async function connectBrowser() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  const user = auth.user;
  if (!user) return { ok: false as const, error: "Non autenticato" };

  if (!(await rateLimit(`devices:connect:${user.id}`, 10, 60))) {
    return { ok: false as const, error: "Troppi tentativi, riprova fra poco" };
  }

  const token = `zc_${randomBytes(32).toString("base64url")}`;
  const service = createServiceClient();

  const { data: device, error } = await service
    .from("devices")
    .insert({
      install_id: randomUUID(),
      token_hash: createHash("sha256").update(token).digest("hex"),
      name: "Questo browser",
      platform: "browser_ext",
    })
    .select("id")
    .single();

  if (error || !device) {
    console.error("[devices] insert", error?.message);
    return { ok: false as const, error: "Non è stato possibile collegare il browser" };
  }

  const { error: memberError } = await service
    .from("device_members")
    .insert({ device_id: device.id, user_id: user.id });

  if (memberError) {
    console.error("[devices] member", memberError.message);
    return { ok: false as const, error: "Non è stato possibile collegare il browser" };
  }

  revalidatePath("/devices");
  return { ok: true as const, token, deviceId: device.id };
}

/**
 * "Sta funzionando?" — vero appena il dispositivo ha mandato il suo primo evento
 * riconosciuto. La pagina di collegamento la interroga finche' non arriva, cosi'
 * l'utente vede la conferma invece di restare nel dubbio.
 */
export async function firstEventSeen(deviceId: string) {
  if (!isUuid(deviceId)) return { seen: false, title: null };
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { seen: false, title: null };

  // la RLS su watch_sessions lascia vedere solo le proprie: il controllo di
  // proprieta' e' comunque anche qui, non solo nelle policy
  const { data } = await supabase
    .from("watch_sessions")
    .select("title_id, media_type, titles(title)")
    .eq("device_id", deviceId)
    .eq("user_id", auth.user.id)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const titolo = (data as { titles?: { title?: string } } | null)?.titles?.title ?? null;
  return { seen: Boolean(data), title: titolo };
}

export async function disconnectDevice(deviceId: string) {
  if (!isUuid(deviceId)) return { ok: false };
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { ok: false };

  // il controllo di proprieta' si fa anche nel codice, non solo nella RLS
  const { error } = await supabase
    .from("device_members")
    .delete()
    .eq("device_id", deviceId)
    .eq("user_id", auth.user.id);
  if (error) {
    console.error("[devices] disconnect", error.message);
    return { ok: false };
  }

  const service = createServiceClient();
  const { count } = await service
    .from("device_members")
    .select("device_id", { count: "exact", head: true })
    .eq("device_id", deviceId);
  if ((count ?? 0) === 0) {
    await service.from("devices").update({ revoked_at: new Date().toISOString() }).eq("id", deviceId);
  }

  revalidatePath("/devices");
  return { ok: true };
}

export async function pauseDevice(deviceId: string, hours: number) {
  if (!isUuid(deviceId) || !Number.isInteger(hours) || hours < 0 || hours > 168) {
    return { ok: false };
  }
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { ok: false };

  const until = hours === 0 ? null : new Date(Date.now() + hours * 3600_000).toISOString();
  const { error } = await supabase
    .from("device_members")
    .update({ paused_until: until })
    .eq("device_id", deviceId)
    .eq("user_id", auth.user.id);
  if (error) {
    console.error("[devices] pause", error.message);
    return { ok: false };
  }
  revalidatePath("/devices");
  return { ok: true };
}
```

- [ ] **Step 2: la pagina**

`src/app/(app)/devices/page.tsx` — Server Component: legge i dispositivi dell'utente e passa tutto al client.

```tsx
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { getViewer } from "@/lib/auth/viewer";
import { PageShell } from "@/components/layout/PageShell";
import { TopBar } from "@/components/layout/TopBar";
import { DevicesClient } from "./DevicesClient";

export const metadata: Metadata = { title: "Dispositivi" };

export default async function DevicesPage() {
  const viewer = await getViewer();
  const supabase = await createClient();

  const { data } = await supabase
    .from("device_members")
    .select("device_id, paused_until, devices(id, name, platform, last_seen_at)")
    .eq("user_id", viewer!.id);

  const devices = (data ?? []).map((row) => ({
    id: row.device_id,
    name: row.devices?.name ?? "Dispositivo",
    platform: row.devices?.platform ?? "browser_ext",
    lastSeenAt: row.devices?.last_seen_at ?? null,
    pausedUntil: row.paused_until,
  }));

  return (
    <PageShell>
      <TopBar title="Dispositivi" back parent={{ href: "/profile", label: "Profilo" }} />
      <DevicesClient devices={devices} />
    </PageShell>
  );
}
```

Nota per chi implementa: se le prop di `TopBar` (`back`, `parent`) hanno una forma diversa, **usare quella vera** — `TopBar` è già in uso in tutta l'app.

- [ ] **Step 3: il client con la stretta di mano verso l'estensione**

`src/app/(app)/devices/DevicesClient.tsx`:

```tsx
"use client";

import { useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ConnectButton } from "./ConnectButton";
import { disconnectDevice, pauseDevice } from "./actions";

type Device = {
  id: string;
  name: string;
  platform: string;
  lastSeenAt: string | null;
  pausedUntil: string | null;
};

export function DevicesClient({ devices }: { devices: Device[] }) {
  const [pending, start] = useTransition();

  return (
    <div className="flex flex-col gap-4 px-5 pb-16 lg:px-10">
      <ConnectButton />

      {devices.map((d) => (
        <Card key={d.id} className="flex items-center gap-4 p-4">
          <span className="flex flex-col gap-1">
            <span className="text-[15px] font-semibold">{d.name}</span>
            <span className="text-[13px] text-muted">
              {d.pausedUntil ? "In pausa" : "In ascolto"}
            </span>
          </span>
          <span className="ml-auto flex gap-2">
            <Button
              variant="secondary"
              className="h-10 px-4 text-[13px]"
              onClick={() => start(async () => void (await pauseDevice(d.id, d.pausedUntil ? 0 : 1)))}
            >
              {d.pausedUntil ? "Riprendi" : "Pausa 1 ora"}
            </Button>
            <Button
              variant="danger"
              className="h-10 px-4 text-[13px]"
              onClick={() => start(async () => void (await disconnectDevice(d.id)))}
            >
              Scollega
            </Button>
          </span>
        </Card>
      ))}
    </div>
  );
}
```

- [ ] **Step 3b: `ConnectButton`, il bottone che sa in che stato sei**

`src/app/(app)/devices/ConnectButton.tsx`:

```tsx
"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { connectBrowser, firstEventSeen } from "./actions";

/** L'id dell'estensione pubblicata; in sviluppo, quello dell'estensione caricata a mano. */
const EXTENSION_ID = process.env.NEXT_PUBLIC_ZCONNECTION_EXTENSION_ID ?? "";
const STORE_URL = process.env.NEXT_PUBLIC_ZCONNECTION_STORE_URL ?? "";
/** Ogni quanto si richiede "e' arrivato qualcosa?", e per quanto si insiste. */
const POLL_MS = 3000;
const POLL_MAX_MS = 3 * 60 * 1000;

type Stato =
  | { fase: "idle" }
  | { fase: "assente" }
  | { fase: "errore"; testo: string }
  | { fase: "attesa"; deviceId: string }
  | { fase: "confermato"; titolo: string | null };

type ChromeRuntime = {
  runtime?: {
    sendMessage?: (id: string, msg: unknown, cb: () => void) => void;
    lastError?: { message?: string };
  };
};

export function ConnectButton() {
  const [stato, setStato] = useState<Stato>({ fase: "idle" });
  const [pending, start] = useTransition();
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  // il polling si ferma da solo: alla conferma, allo scadere, o smontando
  useEffect(() => {
    if (stato.fase !== "attesa") return;
    const deviceId = stato.deviceId;
    const scadenza = Date.now() + POLL_MAX_MS;
    timer.current = setInterval(async () => {
      if (Date.now() > scadenza) {
        if (timer.current) clearInterval(timer.current);
        return;
      }
      const res = await firstEventSeen(deviceId);
      if (res.seen) {
        if (timer.current) clearInterval(timer.current);
        setStato({ fase: "confermato", titolo: res.title });
      }
    }, POLL_MS);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [stato]);

  function collega() {
    start(async () => {
      const chrome = (window as unknown as ChromeRuntime).chrome;
      if (!EXTENSION_ID || !chrome?.runtime?.sendMessage) {
        setStato({ fase: "assente" });
        return;
      }
      const res = await connectBrowser();
      if (!res.ok) {
        setStato({ fase: "errore", testo: res.error });
        return;
      }
      chrome.runtime.sendMessage(
        EXTENSION_ID,
        { type: "zapp-token", token: res.token },
        () => {
          // l'estensione non c'e' (o e' disattivata): lastError e' l'unico modo di saperlo
          if (chrome.runtime?.lastError) {
            setStato({ fase: "assente" });
            return;
          }
          setStato({ fase: "attesa", deviceId: res.deviceId });
        },
      );
    });
  }

  if (stato.fase === "assente") {
    return (
      <div className="flex flex-col gap-2">
        <Button onClick={() => STORE_URL && window.open(STORE_URL, "_blank")}>
          Installa l&rsquo;estensione
        </Button>
        <p className="text-[13px] text-muted">
          Non l&rsquo;ho trovata in questo browser. Installala, poi torna qui.
        </p>
      </div>
    );
  }

  if (stato.fase === "attesa") {
    return (
      <div className="flex flex-col gap-2 rounded-[20px] border border-border bg-surface p-4">
        <p className="text-[15px] font-semibold">Browser collegato.</p>
        <p className="text-[13px] text-muted">
          Apri Netflix e fai partire qualcosa: te lo confermo qui.
        </p>
      </div>
    );
  }

  if (stato.fase === "confermato") {
    return (
      <div className="flex flex-col gap-2 rounded-[20px] border border-accent/22 bg-surface p-4">
        <p className="text-[15px] font-semibold">Funziona.</p>
        <p className="text-[13px] text-muted">
          {stato.titolo
            ? `Ho appena riconosciuto ${stato.titolo}.`
            : "Ho appena riconosciuto quello che stai guardando."}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <Button onClick={collega} disabled={pending}>
        Collega questo browser
      </Button>
      {stato.fase === "errore" && <p className="text-[13px] text-danger">{stato.testo}</p>}
    </div>
  );
}
```

- [ ] **Step 3c: la pagina di benvenuto `/devices/connect`**

È la scheda che l'estensione apre da sola dopo l'installazione (Task 10). Una sola cosa da
fare in pagina, niente elenco dispositivi.

`src/app/(app)/devices/connect/page.tsx`:

```tsx
import type { Metadata } from "next";
import { PageShell } from "@/components/layout/PageShell";
import { TopBar } from "@/components/layout/TopBar";
import { ConnectButton } from "../ConnectButton";

export const metadata: Metadata = { title: "Collega questo browser" };

export default function ConnectPage() {
  return (
    <PageShell>
      <TopBar
        title="Collega questo browser"
        back
        parent={{ href: "/devices", label: "Dispositivi" }}
      />
      <div className="flex flex-col gap-5 px-5 pb-16 lg:px-10">
        <p className="max-w-[560px] text-[15px] leading-relaxed text-muted">
          Da qui in avanti quello che guardi su Netflix in questo browser arriva da solo
          nella tua libreria. Zapp legge il titolo, l&rsquo;episodio e a che punto sei:
          mai le tue password, mai le altre schede.
        </p>
        <ConnectButton />
      </div>
    </PageShell>
  );
}
```

- [ ] **Step 4: `loading.tsx` con la stessa geometria**

`src/app/(app)/devices/loading.tsx` — stessa geometria della pagina vera (regola del progetto):

```tsx
import { PageShell } from "@/components/layout/PageShell";
import { TopBar } from "@/components/layout/TopBar";
import { Skeleton } from "@/components/ui/Skeleton";

export default function Loading() {
  return (
    <PageShell>
      <TopBar title="Dispositivi" back parent={{ href: "/profile", label: "Profilo" }} />
      <div className="flex flex-col gap-4 px-5 pb-16 lg:px-10">
        <Skeleton className="h-[54px] rounded-full" />
        <Skeleton className="h-[86px] rounded-[20px]" />
        <Skeleton className="h-[86px] rounded-[20px]" />
      </div>
    </PageShell>
  );
}
```

- [ ] **Step 5: la voce nel profilo**

In `src/app/(app)/profile/ProfileEditor.tsx`, accanto alla riga degli amici, un link "Dispositivi collegati" verso `/devices`, nello stesso stile a pillola in vetro.

- [ ] **Step 6: verificare**

Run: `pnpm typecheck && pnpm lint`
Expected: PASS. A mano: `/devices` si apre, "Collega questo browser" senza estensione dice "Installa prima l'estensione", e la riga compare in elenco.

- [ ] **Step 7: commit**

```bash
git add "src/app/(app)/devices" "src/app/(app)/profile/ProfileEditor.tsx"
git commit -m "feat(devices): collega questo browser, pausa e scollega"
```

---

### Task 10: l'estensione MV3

**Files:**
- Create: `extension/manifest.json`
- Create: `extension/capture.js` (main world)
- Create: `extension/bridge.js` (isolated world)
- Create: `extension/background.js` (service worker)
- Create: `extension/toast.css`
- Create: `extension/popup.html`, `extension/popup.js`
- Modify: `tsconfig.json` (`"exclude"` += `extension`, `tools`)
- Modify: `eslint.config.mjs` (ignores += `extension/**`, `tools/**`)

**Interfaces:**
- Consumes: `POST /api/scrobble` (Task 8), il messaggio `{type: "zapp-token", token}` da `/devices` (Task 9).
- Produces: l'estensione caricabile da `chrome://extensions`.

- [ ] **Step 1: il manifest**

`extension/manifest.json`:

```json
{
  "manifest_version": 3,
  "name": "Zapp",
  "version": "1.0.0",
  "description": "Quello che guardi arriva da solo nella tua libreria Zapp.",
  "permissions": ["storage", "alarms"],
  "host_permissions": ["https://www.netflix.com/*"],
  "externally_connectable": { "matches": ["https://zapp.vercel.app/*", "http://localhost:3000/*"] },
  "background": { "service_worker": "background.js", "type": "module" },
  "action": { "default_popup": "popup.html", "default_title": "Zapp" },
  "content_scripts": [
    {
      "matches": ["https://www.netflix.com/*"],
      "js": ["capture.js"],
      "world": "MAIN",
      "run_at": "document_idle"
    },
    {
      "matches": ["https://www.netflix.com/*"],
      "js": ["bridge.js"],
      "css": ["toast.css"],
      "world": "ISOLATED",
      "run_at": "document_idle"
    }
  ]
}
```

Sostituire `zapp.vercel.app` con il dominio reale di `NEXT_PUBLIC_APP_URL`.

- [ ] **Step 2: la cattura nel main world**

`extension/capture.js`:

```js
// MAIN world: qui `navigator.mediaSession.metadata` e' quella della pagina.
// Non interpreta niente: manda le stringhe cosi' come sono (spec §5).
(() => {
  const CANALE = "zapp-capture";
  const HEARTBEAT_MS = 30000;

  let ultimo = null;

  function stato() {
    const md = navigator.mediaSession && navigator.mediaSession.metadata;
    const v = document.querySelector("video");
    if (!md && !v) return null;
    return {
      at: new Date().toISOString(),
      url: location.href,
      title: md ? md.title || null : null,
      artist: md ? md.artist || null : null,
      album: md ? md.album || null : null,
      state: !v || v.paused ? "paused" : "playing",
      positionMs: v && Number.isFinite(v.currentTime) ? Math.round(v.currentTime * 1000) : null,
      durationMs: v && Number.isFinite(v.duration) ? Math.round(v.duration * 1000) : null,
    };
  }

  function manda(dati, motivo) {
    window.postMessage({ canale: CANALE, motivo, dati }, location.origin);
  }

  function cambiato(a, b) {
    if (!a || !b) return true;
    return a.title !== b.title || a.artist !== b.artist || a.state !== b.state;
  }

  setInterval(() => {
    const s = stato();
    if (!s) return;
    if (cambiato(ultimo, s)) manda(s, "cambio");
    else if (s.state === "playing") manda(s, "heartbeat");
    ultimo = s;
  }, HEARTBEAT_MS);

  // l'ultimo respiro: la scheda si chiude o passa in background
  window.addEventListener("pagehide", () => {
    const s = stato();
    if (s) manda({ ...s, state: "stopped" }, "chiusura");
  });
})();
```

- [ ] **Step 3: il ponte e il toast**

`extension/bridge.js`:

```js
// ISOLATED world: sente il main world, parla col service worker, disegna il toast.
// Il service worker risponde nella callback: cosi' il toast si disegna qui e non
// serve il permesso `tabs` per raggiungere la scheda dall'esterno.
window.addEventListener("message", (e) => {
  // `e.origin` va controllato sempre: siamo dentro la pagina di un terzo, dove
  // gira anche codice che non e' nostro e potrebbe fingersi il main world.
  if (e.source !== window || e.origin !== location.origin) return;
  if (!e.data || e.data.canale !== "zapp-capture") return;
  chrome.runtime.sendMessage(
    { type: "evento", site: "netflix", dati: e.data.dati },
    (risposta) => {
      if (chrome.runtime.lastError) return;
      if (risposta && risposta.card) mostraToast(risposta.card);
    },
  );
});

function mostraToast(card) {
  document.querySelector(".zapp-toast")?.remove();
  const el = document.createElement("div");
  el.className = "zapp-toast";

  if (card.posterPath) {
    const img = document.createElement("img");
    img.src = `https://image.tmdb.org/t/p/w92${card.posterPath}`;
    img.alt = "";
    el.appendChild(img);
  }

  // testo sempre con textContent: niente HTML costruito con stringhe dentro
  // la pagina di un terzo, nemmeno con dati nostri.
  const box = document.createElement("div");
  const titolo = document.createElement("b");
  titolo.textContent = card.completed ? "Segnato su Zapp" : "Sto seguendo";
  const sotto = document.createElement("span");
  sotto.textContent =
    card.season && card.episode ? `${card.title} · S${card.season}:E${card.episode}` : card.title;
  box.append(titolo, sotto);
  el.appendChild(box);

  document.body.appendChild(el);
  setTimeout(() => el.remove(), 6000);
}
```

`extension/toast.css`:

```css
.zapp-toast {
  position: fixed;
  right: 28px;
  bottom: 118px;
  z-index: 2147483647;
  display: flex;
  gap: 14px;
  align-items: center;
  width: 344px;
  padding: 14px;
  border-radius: 20px;
  color: #fff;
  font: 13px/1.35 Inter, system-ui, sans-serif;
  background: rgba(28, 28, 30, 0.72);
  border: 1px solid rgba(197, 186, 244, 0.28);
  backdrop-filter: blur(24px);
  box-shadow: 0 20px 50px rgba(0, 0, 0, 0.6), inset 0 1px 0 rgba(255, 255, 255, 0.08);
}
.zapp-toast img { width: 40px; height: 60px; border-radius: 8px; object-fit: cover; }
.zapp-toast div { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.zapp-toast b { font-size: 14px; font-weight: 600; }
.zapp-toast span { color: #8e8e93; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
```

- [ ] **Step 4: il service worker con la coda**

`extension/background.js`:

```js
const APP = "https://zapp.vercel.app"; // stesso host del manifest
const API = `${APP}/api/scrobble`;
const MAX_CODA = 200;

// Appena installata apre da sola la pagina di collegamento — che sta su Zapp, non
// qui: li' la sessione dell'utente c'e' gia'. `chrome.tabs.create` non richiede il
// permesso `tabs` (serve solo per leggere le schede, che non facciamo mai).
chrome.runtime.onInstalled.addListener((dettagli) => {
  if (dettagli.reason !== "install") return;
  chrome.tabs.create({ url: `${APP}/devices/connect` });
});

chrome.runtime.onMessageExternal.addListener((msg, _sender, sendResponse) => {
  if (msg && msg.type === "zapp-token" && typeof msg.token === "string") {
    chrome.storage.local.set({ token: msg.token }, () => sendResponse({ ok: true }));
    return true;
  }
  return false;
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!msg || msg.type !== "evento") return false;
  accoda({ id: crypto.randomUUID(), site: msg.site, ...msg.dati })
    .then((card) => sendResponse({ card }))
    .catch(() => sendResponse({ card: null }));
  return true; // risposta asincrona: il bridge disegna il toast nella callback
});

async function accoda(evento) {
  const { coda = [] } = await chrome.storage.local.get({ coda: [] });
  coda.push(evento);
  await chrome.storage.local.set({ coda: coda.slice(-MAX_CODA) });
  return svuota();
}

/** Ritorna la card dell'ultimo evento applicato, o null. */
async function svuota() {
  const { token, coda = [] } = await chrome.storage.local.get({ token: null, coda: [] });
  if (!token || coda.length === 0) return null;
  try {
    const res = await fetch(API, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({ events: coda.slice(0, 50) }),
    });
    if (res.status === 401) {
      await chrome.storage.local.set({ token: null, coda: [] });
      return null;
    }
    if (!res.ok) return null; // riprova al prossimo evento o al prossimo allarme
    const dati = await res.json();
    await chrome.storage.local.set({ coda: coda.slice(50), ultima: dati.card ?? null });
    return dati.card ?? null;
  } catch {
    // niente rete: la coda resta e riparte dopo
    return null;
  }
}

chrome.alarms.create("svuota", { periodInMinutes: 1 });
chrome.alarms.onAlarm.addListener(() => svuota());
```

Nessun uso di `chrome.tabs`: il toast lo disegna il bridge nella callback, quindi il permesso `tabs` non serve mai (vincolo globale).

- [ ] **Step 5: il popup**

Geometria e stile dal mockup `docs/design/mockups/zconnection/Main.dc.html`.

`extension/popup.html`:

```html
<!doctype html>
<meta charset="utf-8" />
<style>
  body { width: 400px; margin: 0; padding: 16px; background: #0a0a0c; color: #fff;
         font: 13px/1.4 Inter, system-ui, sans-serif; }
  .stato { display: inline-flex; align-items: center; gap: 7px; height: 28px; padding: 0 12px;
           border-radius: 999px; font-size: 12px; font-weight: 600; color: #d3cbf8;
           background: rgba(197,186,244,.1); border: 1px solid rgba(197,186,244,.24); }
  .punto { width: 6px; height: 6px; border-radius: 50%; background: #c5baf4; }
  .card { margin-top: 14px; border-radius: 20px; overflow: hidden; background: #0e0e12;
          border: 1px solid rgba(197,186,244,.22); }
  .card img { display: block; width: 100%; height: 150px; object-fit: cover; }
  .corpo { padding: 12px 16px 16px; display: flex; flex-direction: column; gap: 6px; }
  .titolo { font-size: 19px; font-weight: 600; }
  .meta { color: #8e8e93; }
  .vuoto { margin-top: 14px; color: #8e8e93; }
</style>
<span class="stato"><span class="punto"></span><span id="stato">…</span></span>
<div id="contenuto"></div>
<script src="popup.js"></script>
```

`extension/popup.js`:

```js
chrome.storage.local.get({ token: null, ultima: null }, ({ token, ultima }) => {
  document.getElementById("stato").textContent = token ? "Stai guardando" : "Non collegato";
  const box = document.getElementById("contenuto");

  if (!token) {
    box.className = "vuoto";
    box.textContent = "Apri Zapp, Profilo, Dispositivi e premi Collega questo browser.";
    return;
  }
  if (!ultima) {
    box.className = "vuoto";
    box.textContent = "Niente in riproduzione. Fai partire qualcosa e torna qui.";
    return;
  }

  const sotto =
    ultima.season && ultima.episode
      ? `S${ultima.season}:E${ultima.episode}${ultima.episodeName ? ` · ${ultima.episodeName}` : ""}`
      : "Film";
  const img = ultima.backdropPath
    ? `<img src="https://image.tmdb.org/t/p/w500${ultima.backdropPath}" alt="">`
    : "";
  box.className = "card";
  box.innerHTML = `${img}<div class="corpo">
    <span class="titolo"></span><span class="meta"></span></div>`;
  // testo via textContent: mai HTML che arriva da fuori
  box.querySelector(".titolo").textContent = ultima.title;
  box.querySelector(".meta").textContent = sotto;
});
```

- [ ] **Step 6: escludere `extension/` e `tools/` dal build**

In `tsconfig.json` aggiungere `"extension"` e `"tools"` a `exclude`; in `eslint.config.mjs` aggiungerli a `ignores`.

- [ ] **Step 7: provare a mano su Chrome vero**

**Playwright non serve qui: il suo Chromium non riproduce contenuti DRM.** A mano:

1. `chrome://extensions` → "Carica estensione non pacchettizzata" → `extension/`.
2. Copiare l'ID dell'estensione in `NEXT_PUBLIC_ZCONNECTION_EXTENSION_ID` e in `ZCONNECTION_EXTENSION_ORIGIN` (`chrome-extension://<ID>`), riavviare l'app.
3. Zapp → Profilo → Dispositivi → "Collega questo browser" → atteso "Browser collegato".
4. Netflix, un episodio: entro 30 secondi il toast "Sto seguendo"; in Zapp la home mostra la serie in "Continua a guardare" col minuto.
5. Saltare al 95%: il toast diventa "Segnato su Zapp", l'episodio risulta visto, il punto di ripresa si azzera.
6. Mettere in pausa e chiudere la scheda: `watch_entries.position_ms` resta all'ultimo minuto.
7. Da Zapp "Scollega": l'estensione, al primo evento successivo, riceve `401` e dimentica il token.

- [ ] **Step 8: verificare e commit**

Run: `pnpm typecheck && pnpm lint && pnpm test`
Expected: PASS.

```bash
git add extension tsconfig.json eslint.config.mjs
git commit -m "feat(extension): cattura Netflix, coda offline e toast"
```

---

### Task 11: il minutaggio in pagina

**Files:**
- Modify: `src/lib/watch/queries.ts` (aggiungere le colonne del minutaggio a `TITLE_LIST_COLUMNS`/`ENTRY_SELECT`)
- Modify: `src/lib/watch/continue.ts`
- Modify: `src/components/home/ContinueCard.tsx`
- Test: `src/lib/watch/progress.test.ts`
- Create: `src/lib/watch/progress.ts`

**Interfaces:**
- Consumes: le colonne `watch_entries.position_*` (Task 5).
- Produces: `resumeLabel(positionMs, durationMs): string`, `resumeRatio(positionMs, durationMs): number | null`.

- [ ] **Step 1: scrivere il test che fallisce**

`src/lib/watch/progress.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { resumeLabel, resumeRatio } from "./progress";

describe("resumeLabel", () => {
  it("dice i minuti su quanti", () => {
    expect(resumeLabel(1_084_000, 4_560_000)).toBe("18 min di 76");
  });

  it("senza durata dice solo dove sei", () => {
    expect(resumeLabel(1_084_000, null)).toBe("18 min");
  });

  it("sotto il minuto non dice zero", () => {
    expect(resumeLabel(20_000, 4_560_000)).toBe("appena iniziato");
  });
});

describe("resumeRatio", () => {
  it("e' la frazione, limitata a 1", () => {
    expect(resumeRatio(1_140_000, 4_560_000)).toBeCloseTo(0.25);
    expect(resumeRatio(9_000_000, 4_560_000)).toBe(1);
  });

  it("senza durata non c'e' barra", () => {
    expect(resumeRatio(1_000, null)).toBeNull();
  });
});
```

- [ ] **Step 2: verificare che fallisca**

Run: `pnpm vitest run src/lib/watch/progress.test.ts`
Expected: FAIL — `Failed to resolve import "./progress"`.

- [ ] **Step 3: l'implementazione**

`src/lib/watch/progress.ts`:

```ts
/** Minuti interi, mai arrotondati per eccesso: "18 min" a 18:59. */
function minuti(ms: number): number {
  return Math.floor(ms / 60_000);
}

/** "18 min di 76", oppure "18 min" senza durata nota. */
export function resumeLabel(positionMs: number, durationMs: number | null): string {
  const m = minuti(positionMs);
  if (m < 1) return "appena iniziato";
  return durationMs ? `${m} min di ${minuti(durationMs)}` : `${m} min`;
}

/** Frazione per la barra; null quando non c'e' una durata su cui calcolarla. */
export function resumeRatio(positionMs: number, durationMs: number | null): number | null {
  if (!durationMs || durationMs <= 0) return null;
  return Math.min(positionMs / durationMs, 1);
}
```

- [ ] **Step 4: verificare che passi**

Run: `pnpm vitest run src/lib/watch/progress.test.ts`
Expected: PASS, 5 test.

- [ ] **Step 5: portare il minutaggio in `ContinueCard`**

In `src/lib/watch/queries.ts`, aggiungere `position_ms, position_duration_ms, position_season, position_episode, position_at` alle colonne selezionate per le liste (**non** `titles.raw`, mai). In `src/lib/watch/continue.ts` passare quei valori all'item. In `ContinueCard`:

- se `position_ms` c'è **e** `position_episode` combacia con l'episodio mostrato, la barra usa `resumeRatio` e la riga sotto il titolo usa `resumeLabel`;
- altrimenti resta esattamente quello che mostra oggi (chi non usa ZConnection non deve accorgersi di niente).

- [ ] **Step 6: verificare**

Run: `pnpm test && pnpm typecheck && pnpm lint`
Expected: PASS. A mano: con una riga di progresso scritta dalla RPC, la home mostra la barra al punto giusto e "18 min di 76".

- [ ] **Step 7: commit**

```bash
git add src/lib/watch/progress.ts src/lib/watch/progress.test.ts src/lib/watch/queries.ts src/lib/watch/continue.ts src/components/home/ContinueCard.tsx
git commit -m "feat(home): riprendi dal minuto esatto in Continua a guardare"
```

---

### Task 12: documentazione e chiusura

**Files:**
- Modify: `CLAUDE.md` (una sezione "ZConnection" nell'architettura)
- Modify: `.env.example`

- [ ] **Step 1: le variabili d'ambiente**

In `.env.example` aggiungere, con un commento:

```
# ZConnection: id e origine dell'estensione browser (CORS di /api/scrobble)
NEXT_PUBLIC_ZCONNECTION_EXTENSION_ID=
ZCONNECTION_EXTENSION_ORIGIN=
# Link allo store, mostrato quando l'estensione non e' installata in questo browser
NEXT_PUBLIC_ZCONNECTION_STORE_URL=
```

- [ ] **Step 2: la sezione in CLAUDE.md**

Sotto "Architecture", una sezione **ZConnection** che dica, in breve e nello stile delle altre: l'estensione è muta e il parsing sta sul server; le tre funzioni pure con i test (`parse`, `rules`, `match`); che le scritture per conto di un dispositivo passano **solo** da `scrobble_apply` e mai dal service client; che `position_*` è il punto di ripresa ed è diverso da `season_number`/`episode_number`; che finché i membri attivi non sono esattamente uno la libreria non si tocca; e che il collaudo dei siti veri è manuale perché **Playwright non riproduce DRM**.

- [ ] **Step 3: verifica finale completa**

Run: `pnpm test && pnpm typecheck && pnpm lint && pnpm build`
Expected: PASS.
Run: `node scripts/security-check.mjs` contro l'istanza avviata.
Expected: PASS.

- [ ] **Step 4: commit**

```bash
git add CLAUDE.md .env.example
git commit -m "docs(zconnection): come funziona l'estensione e cosa non si tocca"
```

---

## Cosa resta fuori da questo piano

Fase 2 (Prime Video, Disney+, NOW con i loro adapter), fase 3 (recupero della cronologia
Netflix, voto al volo, profili e "Non sono io"), fase 4 (Chrome Web Store e conversione
Safari). Ognuna avrà il suo piano, scritto quando la sonda avrà detto cosa espongono davvero
gli altri tre siti — scriverli adesso significherebbe inventarsi i formati.
