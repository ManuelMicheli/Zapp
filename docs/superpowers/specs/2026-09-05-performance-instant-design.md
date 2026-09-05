# Zapp — prestazioni "istantanee" (design, 2026-09-05)

Obiettivo: ogni tocco apre subito (nav e schede), trailer in volo appena arriva l'HTML,
scorrimento senza scatti, ricerca che risponde mentre si scrive, import Netflix in
background seguibile dalla home, nessun degrado con librerie da 1000+ titoli.

## Diagnosi misurata

| Fatto | Misura |
| --- | --- |
| Funzioni Vercel in `iad1`, Supabase in `eu-central-1` | `X-Vercel-Id: fra1::iad1::…`; ~100 ms per query, 8–12 query sequenziali per scheda |
| `titles.raw` in ogni lista | media 27 KB × 1261 entry dell'utente più grande ≈ 34 MB per il profilo |
| Ricerca | debounce 300 ms + 12 `getOrFetchTitle` (DB + TMDB + upsert) per query |
| Navigazione | `loading.tsx` solo su cinema/discover/titolo/stagione; nessun prefetch dinamico |
| Import | loop client legato alla pagina; se si naviga via si interrompe |

## Interventi

### 1. Latenza di base
- `vercel.json` → `"regions": ["fra1"]`.
- Middleware: `supabase.auth.getClaims()` (verifica JWT locale) invece di `getUser()`;
  `getUser()` resta dove si scrive.
- `src/lib/auth/viewer.ts`: `getViewer()` in React `cache()` (utente + `onboarding_completed_at`),
  usato da layout e pagine: una lettura per richiesta.
- Scheda titolo: header streamato subito; palette in `unstable_cache` 30 g per poster;
  entry/recensioni/amici dietro Suspense.

### 2. Dieta dati
- Migration `0010_titles_seasons.sql`: `titles.seasons jsonb generated always as (raw->'seasons') stored`.
- `ENTRY_SELECT` e le query di libreria/profilo selezionano colonne esplicite (`TITLE_COLUMNS`), mai `raw`.
- `availableSeasons()` accetta sia `raw` che l'array `seasons`.
- Home: `watching` limitata a 20. Profilo: statistiche via RPC `profile_stats(uid)` (SQL, niente entry in Node).
- Libreria: prime 60 entry + "Carica altri" (Server Action paginata).

### 3. Tocco istantaneo
- `loading.tsx` per home, cerca, libreria, amici, profilo, notifiche.
- `next.config.ts`: `experimental.staleTimes = { dynamic: 30, static: 300 }`.
- `TopNav`: `prefetch` pieno delle 5 voci. Card scaffali: prefetch predefinito (viewport).
- Azioni già ottimistiche (`useOptimistic` in `TitleActionsBar`): invariate.

### 4. Ricerca istantanea
- Client: fetch a ogni tasto (attesa 60 ms), abort del precedente, risultati precedenti
  restano visibili durante il caricamento, cache in memoria per query, filtro per prefisso
  come anteprima immediata.
- API: `searchMulti` + una query batch `title_providers` (flatrate) via service client; nessun
  `getOrFetchTitle`. Risposta con `Cache-Control: private, max-age=300`.

### 5. Import in background
- `ImportProvider` (client, in `(app)/layout.tsx`): tiene il loop match/confirm fuori dalla pagina.
- `ImportClient` chiama `startImport(items, totalRows)` → `router.push("/")`.
- `ImportChip` sopra la nav: "Importazione 40/312" con barra; a fine: toast + `router.refresh()`.
- Vale finché l'app è aperta; blocchi già scritti restano (import idempotente).

### 6. Scorrimento
- `content-visibility: auto` + `contain-intrinsic-size` sulle card di scaffali e griglie.
- Muro locandine: `filter: blur()` sostituito da velo/opacità (blur su elemento animato = repaint continuo).
- `backdrop-blur` della nav solo sulla pillola; il velo resta gradiente piatto.

## Verifica
`pnpm typecheck && pnpm lint && pnpm build && pnpm test`; TTFB prima/dopo su produzione;
trace scroll con Playwright (CPU 4×).
