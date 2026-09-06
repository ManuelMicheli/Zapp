# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Zapp: mobile-first PWA (Italian UI, code comments in Italian) to track movies/TV series and show where each title streams in Italy (TMDB `watch/providers`, region IT). Opens the official platform via deep link; never plays content, never scrapes Netflix/Prime/Disney.

Stack: Next.js 15 App Router (Server Components default), TypeScript strict, Tailwind CSS 4 (`@theme` tokens in `src/app/globals.css`, dark only), Framer Motion, Supabase (Postgres + Auth + RLS via `@supabase/ssr`), TMDB API v3, Serwist PWA, pnpm, Vercel. Built in 4 phases; the original specs are `zapp-fase{1..4}-*-prompt.md` at the repo root.

## Commands

```bash
pnpm dev          # next dev --turbopack (service worker disabled in dev)
pnpm build        # production build, also generates public/sw.js
pnpm typecheck    # tsc --noEmit
pnpm lint         # eslint (flat config, next/core-web-vitals + next/typescript)
pnpm format       # prettier on src/**/*.{ts,tsx,css}

# DB
supabase db push                                                        # apply supabase/migrations/*
supabase gen types typescript --project-id <REF> > src/types/database.ts # regenerate after every migration

# Manual provider link override (source='manual', never overwritten by the resolver)
pnpm tsx scripts/set-link.ts <movie|tv> <tmdb_id> <provider_id> <https url>

# Manual cinema ticket link override (source='manual', never overwritten by the resolver)
pnpm tsx scripts/set-cinema-link.ts <cinema_id> <https url>

pnpm test         # vitest, solo funzioni pure (src/**/*.test.ts)
```

Vitest copre solo le funzioni pure di `src/lib/cinema/`, di `src/lib/import/` (`netflix-{title,rows,proposals}.ts`) e di `src/lib/trailers/` (`channels.ts`, `rank.ts`, `frame-bars.ts`, `stored.ts`); il resto si verifica con `pnpm typecheck && pnpm lint && pnpm build`.

Env vars: see `.env.example`. `TMDB_API_READ_ACCESS_TOKEN` and `SUPABASE_SERVICE_ROLE_KEY` are server-only; code throws if they are missing or still start with `INSERISCI`.

## Hard rules (from the phase specs)

- No TMDB calls from the client. Everything goes through `src/lib/tmdb/client.ts` (`server-only`) or the allowlisted proxy `src/app/api/tmdb/[...path]/route.ts`.
- No external UI libraries (no shadcn). Primitives are hand-written in `src/components/ui/`.
- No `localStorage` for user data.
- Fonts are self-hosted (`public/fonts`, `next/font/local`). CSP in `next.config.ts` allows only self, Supabase host, and `image.tmdb.org`; adding a third-party origin requires editing the CSP.
- Service-role client is only for system data (TMDB cache writes, link resolver) and for system reads of that cache on public routes (`getWallPosters` falls back to `titles` when TMDB is down). Never for user data, never exposed to the client.

## Architecture

### Auth and routing

- `src/middleware.ts` → `updateSession` in `src/lib/supabase/middleware.ts`: refreshes the session cookie, redirects unauthenticated users to `/login` (public paths: `/login`, `/signup`, `/auth/*`). Do not put logic between `createServerClient` and `getClaims()`.
- **Auth reads are local.** The project signs JWTs with ES256 (asymmetric keys), so `supabase.auth.getClaims()` verifies the token against the cached JWKS without a round trip. `src/lib/auth/viewer.ts`: `getViewer()` (id + email) and `getViewerProfile()` (adds `onboarding_completed_at`), both in React `cache()` → one read per request shared by layout, pages and Suspense sections. **Every read path uses `getViewer()`; `getUser()` stays only in Server Actions and route handlers that write.**
- `src/app/(app)/layout.tsx` calls `getViewerProfile()` and redirects to `/onboarding` until `profiles.onboarding_completed_at` is set. The `handle_new_user` trigger assigns a placeholder `user_<hex>` username at signup; onboarding replaces it. The layout also mounts `ImportProvider` + `ImportChip` (see Social).
- **Latency budget.** Vercel functions run in `fra1` (`vercel.json` `regions`), next to Supabase `eu-central-1`: a DB round trip costs ~5 ms instead of the ~100 ms measured with the default `iad1` (`X-Vercel-Id: fra1::iad1::…`, 2026-09-05). Keep it that way: never add a sequential await that is not needed, prefer `Promise.all`.
- Three Supabase clients in `src/lib/supabase/`: `client.ts` (browser), `server.ts` `createClient()` (cookie-bound, RLS on) and `createServiceClient()` (bypasses RLS).

### TMDB and the local cache

- `src/lib/tmdb/client.ts`: typed fetchers, Next `fetch` revalidate per endpoint, `language=it-IT`. **In front of the throttle (15 req/s) sits an in-process memo keyed by URL** (same TTL as `revalidate`, dedupes in-flight calls): without it every render (home, search, the nav prefetch of five tabs) queued 10–15 cached calls behind the limiter and search/library showed 10 s TTFB (375 `tmdbFetch` per navigation round, now 19). `getMovie`/`getTv` use one `append_to_response` call (credits, videos, recommendations, external_ids, watch/providers) with `include_video_language=it,en,null` (also `getSeason`): without it TMDB returns Italian videos only and most titles lose their trailer. `TITLE_CACHE_EPOCH` in `src/lib/config.ts`: bump it whenever the shape of `titles.raw` changes, so title pages (`requireFull`) refetch older rows once.
- `src/lib/tmdb/cache.ts` `getOrFetchTitle(id, mediaType, {requireFull})`: reads `titles` + `title_providers` in parallel (7-day TTL via `fetched_at`, `TITLE_CACHE_TTL_MS` in `src/lib/config.ts`); on miss/stale it fetches TMDB and upserts with the service client. **Never call it per search result or per list row**: it is the title-page fetch. Falls back to stale rows if TMDB fails. `requireFull` forces a refetch when `raw` lacks `credits` (rows saved before phase 2).
- `src/lib/tmdb/get-title.ts` wraps it in React `cache()` so `generateMetadata` and the page share one fetch.
- `src/lib/tmdb/mappers.ts` converts TMDB payloads to `titles`/`title_providers` insert rows and search items. `titles.raw` stores the full TMDB JSON; `src/lib/watch/episodes.ts` derives season/episode progress from `raw.seasons` (skips season 0 and unaired seasons).
- **Images bypass the Vercel optimizer.** `next.config.ts` sets `images.loader: "custom"` with
  `src/lib/image-loader.ts`: for `image.tmdb.org` URLs it rewrites the size segment to the
  smallest TMDB size (`w92…w1280`, else `original`) that covers each srcset width; other URLs
  (Supabase avatars, already resized to 512px on upload; local assets) pass through untouched.
  Reason: on the Vercel Hobby plan the optimized-image quota runs out and `/_next/image`
  answers `402 OPTIMIZED_IMAGE_REQUEST_PAYMENT_REQUIRED`, so every `<Image>` broke
  (2026-09-05). `quality` on `<Image>` is ignored by the loader.
- `src/lib/config.ts` is the single source for region/language, image URL helpers and `PROVIDERS` (TMDB provider id → name, search URL template, optional title URL template + Wikidata property).

### Provider deep links

**Every provider button must open the exact title page on the platform, never a search or a home.** `src/lib/links/resolve.ts` `resolveProviderLinks(title, providerIds)` (batch; `resolveProviderLink` is the single-provider wrapper): cascade `manual` → `justwatch` → `wikidata` (via `titles.external_ids.wikidata_id`, 3 s timeout, configured providers only) → `search` URL (configured providers only). `src/lib/links/justwatch.ts` `getJustWatchOffers(title)` (React `cache()`, one GraphQL call per title, 4 s timeout, Next fetch cache 1 d): searches `apis.justwatch.com` by `title` then `original_title`, keeps the result whose `tmdbId` matches, and maps IT web offers by `packageId` (= TMDB `provider_id`) to a cleaned `standardWebURL` (tracking params stripped, HBO Max forced to `/it/it/`, "with ASL" variants penalised, home URLs discarded). Result persisted in `title_provider_links` (`justwatch`/`wikidata` TTL 30 d, `search` retried daily, `manual` never overwritten; migration 0006 adds the `justwatch` source). Where a link is not in cache yet (home "Continua", library) use `providerHref()` from `src/lib/links/go.ts`: it returns the cached direct URL or `/go/[mediaType]/[id]/[providerId]` (`src/app/go/.../route.ts`), which resolves on the fly and 302-redirects. `ProviderButton` shows "Apri" only for direct links (`direct` prop), "Cerca" for search fallbacks.

### Watch tracking

- `src/lib/watch/actions.ts` (`"use server"`): all mutations of `watch_entries`. Every action returns `{ok, prev, entry}` snapshots so the toast can undo via `restoreEntry`. Actions call `revalidatePath` on `/`, `/library`, `/profile` and the title page.
- **Ordine cronologico.** `watch_entries.last_watched_at` (migration 0014, not null, default `now()`, indice `user_id, status, last_watched_at desc`) è l'ultima visione effettiva: l'import Netflix vi scrive la data del CSV (`lastDate`, l'RPC tiene la più recente con `greatest` su conflitto), le azioni Inizia/Finito/progresso scrivono `now()`; Voglio vederlo, voto, privato e Abbandona non la toccano. Home "In corso"/"Visti di recente" e libreria Sto guardando/Visti ordinano per questa colonna (`orderColumn()` in `queries.ts`; Da vedere per `created_at`, Abbandonati per `updated_at`). `updated_at` non serve a ordinare: l'import scrive a blocchi con lo stesso `now()` per RPC, quindi mostrava l'ordine dei chunk. Lo snapshot per l'undo la porta come campo opzionale.
- `src/lib/watch/queries.ts`: read side. `ENTRY_SELECT` embeds the title via the explicit FK hint `titles!watch_entries_title_id_media_type_fkey` (composite key `id, media_type`), so home/library render with zero TMDB calls. **Lists never select `titles.raw`** (~27 KB per row: with 1261 entries the profile serialised ~34 MB): `TITLE_LIST_COLUMNS` lists explicit columns and series progress reads `titles.seasons`, a stored generated column (`raw->'seasons'`, migration 0010); `availableSeasons()` accepts either `raw` or that array. Home `watching` is capped at 20; the library is paginated (`getLibraryPage`, 60 per page, `loadMoreLibrary` Server Action + "Carica altri"); profile statistics come from the SQL RPC `profile_stats(uid)` (films/series/episodes/minutes/top genres, ~400 bytes) plus two slim queries (wall posters, top rated).
- **Instant navigation.** Every `(app)` route has a `loading.tsx` with the real page geometry; `next.config.ts` sets `experimental.staleTimes` (dynamic 30 s, static 5 min) so visited pages reopen from the router cache; the five `TopNav` links use full `prefetch`. Title pages stream: `TitleBody` renders `TitleHeader` (image + trailer iframe) in the first chunk and puts the poster palette (`getPosterPalette`, `unstable_cache` 30 d per poster), the viewer entry, links, reviews and friends behind Suspense.

### Social (phase 4)

- `src/lib/social/actions.ts` / `queries.ts`: friendships (request → accept, block deletes the row and hides both users), reviews with spoiler flag + comments (depth-limited by trigger), recommendations to friends, notifications, feed.
- `activities` rows are written **only by DB triggers** (`log_watch_activity`, `log_review_activity`, `log_recommendation_activity`). The Netflix import (`src/app/(app)/import/netflix/`, parser in `src/lib/import/netflix.ts`) calls the RPC `import_watch_entries`, which sets `zapp.skip_activities` for the transaction so bulk imports do not flood the feed. The import runs as **short chunked Server Actions** driven by the client (`limits.ts`: match 30 candidates, confirm 25 titles per call; the last confirm chunk carries `final` and writes the `imports` row): one request held open for minutes is cut by the browser (Safari after 60 s, Chrome after 300 s) or by the Vercel function limit, and the rejected fetch used to surface as "Application error: a client-side exception" even though the server finished. Never move the per-title loop back into a single action. **The confirm loop runs in the background**: `src/components/import/ImportProvider.tsx` (client, mounted in the `(app)` layout) owns it, `ImportClient` calls `startImport(items, totalRows)` and `router.push("/")`; `ImportChip` above the nav shows "Importazione n/N" with a bar, then the outcome with a link to the library, and the provider toasts + `router.refresh()` at the end. It lives as long as the app is open (no server queue on Hobby); written chunks stay, re-running the import is safe.
- **Netflix title matching** (`src/lib/import/`): `netflix-title.ts` (pure, Vitest) parses one CSV row: a season keyword in a middle part (Stagione/Season/Parte/Part/Volume/Libro/Book/Serie/Series + number, roman or ordinal word; Miniserie/Limited Series) splits `show: season: episode`; no keyword but ≥3 parts → show = first part, season = second (number from its trailing digit, "Stranger Things 4"), `altShow` = first two parts (tried on TMDB before `show`: "Chef's Table: Francia" is its own series); 2 parts → single with a `prefix` for the TV fallback. `netflix-rows.ts` (pure) parses dates with `inferDateOrder`: the whole file decides day/month order from its unambiguous rows (first number > 12 → D/M, second > 12 → M/D), default M/D (the Netflix export is US-style even for Italian accounts: with D/M a 2026 file had 24 dates in the future and ~1500 rows with day and month swapped, 2026-09-06). `netflix-rows.ts` groups rows: seasons keyed by label, unnumbered ones ("Stagione finale") numbered after the known ones by first watch date, episode = max("Episodio N", distinct episode titles), rewatches not double-counted, candidates sorted newest first. `netflix.ts` (`server-only`) matches: TV via `searchTv`, films via `searchMovies` (dedicated endpoints in the TMDB client), query variants full → no parentheses → main part → subtitle (≥2 words), comparison always against the full name with `titleSimilarity`: 1 exact after `normalizeTitle` (accents, parentheses, apostrophes, generic "- Il film" suffix, leading article), 0.9 when the TMDB name is the Netflix name plus a real subtitle, 0.88 when the Netflix subtitle (≥2 words) is the whole TMDB name (Netflix prepends the saga: "Pirati dei Caraibi - La maledizione della prima luna"), else Dice on bigrams; accept ≥ `MATCH_THRESHOLD` 0.85, ties → TMDB order. A 2-part single that is not a film is retried as an episode of the prefix series with an **exact** name only ("Star Wars: …" must not become "The Clone Wars"). `netflix-proposals.ts` `mergeProposals` (pure, run by the client after the last chunk) folds proposals with the same TMDB id (film written two ways; fallback episodes sum up; fallback + real series keeps the series progress). Proposals carry `exact`: non-literal matches show "su Netflix: …" in the review list so the user can check them.
- Feed is cursor-paginated and aggregated in the query layer (same-day episodes of one series → one row; `finished` + `rated` within 10 min → one row).
- RLS policies rely on `are_friends()` / `is_blocked()` (SECURITY DEFINER). Views `user_search` and `reviews_with_counts` and the helper RPCs are intentionally SECURITY DEFINER with grants only to `authenticated` (migration 0005 revokes `anon`/`PUBLIC`); Supabase advisor warnings about them are accepted (see README).
- Moderation: reviews with `report_count >= 3` are hidden by query filter.
- `src/lib/rate-limit.ts`: per-user sliding window, in-memory by default, Upstash REST if `UPSTASH_REDIS_REST_URL/TOKEN` are set. Limits are declared inline at each call site in `social/actions.ts`.

### Routes

Route groups: `(auth)` for login/signup, `(app)` for everything protected with the nav (`TopNav`, in basso su mobile e in alto da `lg`: Home, Cerca, Libreria, Amici, Profilo). Title pages: `/title/movie/[id]`, `/title/tv/[id]`, `/title/tv/[id]/season/[n]`. Public profiles at `/u/[username]`. `src/app/api/search/route.ts` returns up to 20 TMDB `search/multi` results with flatrate providers from **one batch query on `title_providers`** (no per-result title fetch); `SearchClient` fires a request 60 ms after each keystroke, aborts the previous one, caches results per query and shows the filtered results of a cached prefix while waiting, never emptying the grid.

### Cinema

- Sorgenti dietro `src/lib/cinema/source.ts` (`getCinemaSource()`, `isCinemaEnabled()`):
  `CINEMA_SOURCE` = `mymovies` (default, gratis, HTML pubblico), `mock` (anche via
  `MOVIEGLU_MOCK=1`), `movieglu` (chiave, codice legacy tenuto per eventuale ripristino),
  `off` (sezione assente). `src/lib/cinema/showtimes.ts` è la facciata comune
  (`getFilmShowtimes`, `getCinemaProgramme`, `getNearbyCinemas`): con MyMovies il
  parametro `date` è ignorato, **solo il programma di oggi**.
- `src/lib/cinema/mymovies/`: `parse.ts` (puro, test Vitest su fixture ridotte in
  `__fixtures__/`: `parseProvinceIndex`, `parseNowShowing`, `parseCinemaPage`,
  `parseFilmProvincePage`, `parseMappa`, `slugify`, `formatFromLabel`); `client.ts`
  (`server-only`, `fetchText` con User-Agent `Zapp/1.0 (+NEXT_PUBLIC_APP_URL)`, timeout
  8 s, **throttle 4 richieste/s, mai dal client**, `unstable_cache` per pagina: indice
  provincia 6 h, programma cinema/film-in-provincia 30 min, mappa 30 giorni); `venues.ts`
  (`getProvinceVenues`/`venuesFor`: indice provincia + coordinate da `cinema_venues`
  (30 giorni) o `mappa.asp`, upsert col service client; `resolveProvinceSlug` per
  `location.ts`); `match.ts` (`getMyMoviesFilmId`: titolo TMDB/originale contro
  `parseNowShowing`, salvato in `cinema_films.mymovies_film_id`, 24 h; `filmSummaryForMyMovies`);
  `showtimes.ts` (`nearbyCinemas`, `filmShowtimes`, `cinemaProgramme`, con distanza
  haversine e raggio `CINEMA_RADIUS_KM = 25`). `match.ts` (radice) espone l'adapter
  `getSourceFilmId(title, geo)` unico per la UI e `recentlyReleased(title)`.
- `location.ts` / `geocode.ts`: posizione in `user_locations` (tabella privata, RLS solo
  proprietario, migration `0009_user_locations.sql`, mai in `profiles` che è leggibile
  da tutti); geocoding Nominatim (rate limit 10/min per utente) calcola anche
  `user_locations.province_slug` dalla `county` (o `city`) di Nominatim via
  `resolveProvinceSlug`, verificato con un GET dell'indice provincia MyMovies. Provincia
  non riconosciuta → `province_slug` resta `null` e la UI mostra "Zona non coperta".
  `plans.ts` (`cinema_plans`, "Ci vado" + `addWant`). `links.ts` (link biglietteria:
  `cinema_links` manual → sito cinema → catena `chains.ts` → Google; la tabella è
  indicizzata per id cinema della sorgente attiva: cambiando `CINEMA_SOURCE` va svuotata). Funzioni pure
  senza `server-only` (`geo.ts`, `dates.ts`, `formats.ts`, `chains.ts`, `films.ts`) hanno
  test Vitest.
- DB (migration `0012_cinema_free.sql`, già applicata al progetto Supabase — non
  rilanciare `supabase db push` su quel progetto): `cinema_venues` (`mymovies_id` pk,
  nome/indirizzo/coordinate/`province_slug`, sistema, nessuna policy RLS);
  `cinema_films.mymovies_film_id`; `user_locations.province_slug`.
- UI in `src/components/cinema/`: `NearbyShowtimes` (scheda film, "Oggi al cinema vicino
  a te", solo oggi — niente più `DayBar`/`?day=`), pagina `/cinema` (`?view=films|cinemas&film=`,
  sub-label "Programmazione di oggi"), `TicketSheet` (Compra biglietti = deep link, mai
  iframe; Ci vado; Invita amici via `RecommendSheet.initialMessage`), `TonightAtCinema`
  in home. Posti in sala live: fuori scope (nessuna API in Italia).
- `Permissions-Policy` consente `geolocation=(self)`; CSP invariata (MyMovies, MovieGlu e
  Nominatim solo server, mai dal client).

### PWA

`src/app/sw.ts` (Serwist) precaches the build and cache-firsts `image.tmdb.org`; compiled to `public/sw.js` by `pnpm build` (gitignored). `src/app/manifest.ts` generates the manifest.

## Conventions

- Path alias `@/*` → `src/*`. Server-only modules start with `import "server-only"`.
- Files under `src/lib/**/actions.ts` are Server Actions (`"use server"`); `queries.ts` are server-only reads. Client components sit next to their page (e.g. `LibraryGrid.tsx`, `ImportClient.tsx`).
- After adding a migration, regenerate `src/types/database.ts`; the `Tables<>`/`Enums<>` helpers from that file are used everywhere for row types.
- Prettier: double quotes, trailing commas, printWidth 90.
- TMDB attribution ("This product uses the TMDB API but is not endorsed or certified by TMDB.") must remain visible in the profile footer.

### UI vocabulary (redesign "Cinema", 2026-09)

Mockups (source of truth for spacing/copy): `docs/design/mockups/*.dc.html`; spec:
`docs/superpowers/specs/2026-09-04-redesign-cinema-design.md`.

- **Tokens, non valori grezzi.** Raw hex solo per i colori di brand (Netflix `#E50914`)
  e per `GENRE_COLORS`. Surfaces `bg-bg` (#000), `bg-surface`, `bg-surface-2`,
  `bg-sheet`; text `text-text`, `text-muted`, `text-muted-2`; accent `accent`,
  `accent-strong` (hover/pressed), `accent-soft` (link), `accent-pale` (icone/numeri su
  fondo accent); errori `text-danger`. Definiti in `@theme` in `src/app/globals.css`.
- **Utilities** `.glass` / `.glass-strong` (blur + bordo bianco tenue) per pillole e
  bottoni sopra immagini. Card: `rounded-[20px] border border-border bg-surface`;
  campi form: `rounded-[14px] bg-surface-2`; pagine scrollabili chiudono con `pb-16`.
- **Icone**: SVG inline, `strokeWidth={1.8}`, `currentColor`. Nessuna libreria di icone.
- **Scorrimento**: `PosterCard` ha `.cv-auto` (`content-visibility: auto` + misura
  intrinseca, `globals.css`) così griglie e scaffali lunghi non pagano layout e paint
  fuori schermo. Mai `filter: blur()` sul contenitore di elementi animati (il muro lo
  applica per colonna, layer già composito con `will-change: transform`).
- **Marchio**: sorgenti in `docs/design/brand/` (`zapp-icon-tile.jpeg` = tile scuro con Z
  bianca, `zapp-z.jpeg` = solo glifo). Da lì: icone PWA `public/icons/*.png` e
  `src/app/apple-icon.png` (tile; le maskable hanno il tile al 70% su nero), favicon
  `src/app/icon.svg` (solo la Z, sfondo trasparente, nessun tile: Z sfumata scura su tema
  chiaro e bianca su scuro via `prefers-color-scheme` nell'SVG) e la Z pieno `currentColor` al centro della
  `TopNav` (voce Libreria, `tabs.tsx`). Path della Z tracciato dal JPEG (soglia + contorno
  - Douglas-Peucker); cambiando le icone alza `?v=` in `manifest.ts`.
- `PosterWall` (`src/components/marketing/PosterWall.tsx`): muro di locandine in
  prospettiva. Props `posters`, `height`, `width` (540 mobile), `columns` (4 mobile),
  `blur`, `opacity`, `speed`, `className`. I dati vengono da `src/lib/tmdb/wall.ts`:
  `getWallPosters()` (login/signup/onboarding/home) legge in parallelo trending settimana
  (2 pagine, la prima è la stessa `fetch` di Scopri → cache Next 1h condivisa), film al
  cinema IT, in arrivo IT e serie in onda, li alterna a rotazione e deduplica (max 60;
  una fonte caduta non svuota il muro; fallback: cache `titles` via service-role).
  `getProfileWallPosters(entries)` (profilo) è personale: in alternanza "in visione" e
  preferiti (voto ≥ 4), poi titoli visti nei 3 generi più visti, poi il resto, riempito
  con `getWallPosters()`. La colonna `c` usa le locandine `c*4…c*4+3`, quindi colonne
  adiacenti non hanno mai titoli in comune.
  Regola del loop: ogni colonna è una sequenza periodica delle sue 4 locandine e trasla
  di `--wall-shift` = esattamente un set (4 × 180px) — mai un buco, per
  qualunque `height`; `--wall-shift` è in px (un set), così la colonna può avere un
  numero qualsiasi di tile (`items`) e resta corta. `items`, e il `translateY` del wrapper, li calcola `wallGeometry()`
  dalla prospettiva reale (`rotateX 24°`, `rotateZ -8°`, `perspective 1000`): le colonne
  coprono il fondo del riquadro ma **restano davanti al piano camera** (y < 1000/sin 24°):
  geometria dietro la camera fa sparire tile in Chrome/Safari. Tutte le `<img>` del muro
  sono eager (mai `loading="lazy"`: una tile vuota in movimento si nota subito).
  `prefers-reduced-motion` ferma l'animazione (`.wall-col { animation: none }`).
- **Navigazione**: una sola barra, `TopNav` (`src/components/layout/TopNav.tsx`),
  72px alta, `z-30`, **stessa struttura a tutte le larghezze**: colonna sinistra vuota
  (nessun wordmark "Zapp." nell'app: il logo è la Z al centro della pillola),
  pillola centrale con le 5 voci (icone su mobile, solo testo da `lg`, indicatore attivo
  che scorre via `motion.span layoutId`), a destra lo slot `right` (campanella notifiche
  passata dal layout server: nessuna campanella nelle pagine). **Sotto `lg` è fissa in
  basso** (`bottom-0` + `env(safe-area-inset-bottom)`, velo `from-black/95` sfumato verso
  l'alto sempre visibile), **da `lg` è fissa in alto** (trasparente sopra hero/backdrop;
  dopo 16px di scroll compare il velo e la pillola diventa vetro scuro). Nessuna sidebar,
  nessuna seconda barra: `PageShell` non ha `lg:pl-*`, i `sizes` dei backdrop sono `100vw`,
  le barre fisse usano `lg:left-0`. Lo spazio occupato dalla nav è nelle variabili
  `--nav-top` / `--nav-bottom` (`globals.css`: 0/72px sotto `lg`, 72px/0 da `lg`), mai
  numeri fissi: le testate iniziano a
  `pt-[calc(env(safe-area-inset-top,0px)+var(--nav-top)+32px)]` (`TopBar` è statica con
  lo stesso padding), i bottoni assoluti in testata (`BackButton`, `ShareButton`, controlli
  profilo) stanno a `top-[calc(env(safe-area-inset-top,0px)+var(--nav-top)+20px)]`, la
  banda della scheda titolo sotto `lg` a `+16px` (`BAND_CLASS`, vedi Fondale) e i suoi
  comandi 12px più giù (`+28px`), il campo di Cerca è sticky da `top-0`
  con `pt-[calc(env(safe-area-inset-top,0px)+var(--nav-top)+12px)]`. In basso
  `PageShell` riserva `pb-[calc(env(safe-area-inset-bottom,0px)+var(--nav-bottom))]`;
  le pagine chiudono con `pb-16`; solo la scheda titolo/stagione tiene `pb-36` su mobile
  per la barra azioni fissa (`TitleActionsBar`, che non è una nav) che, come il bottone
  di import e il `Toaster`, si alza di `var(--nav-bottom)` per stare sopra la nav.
- `BottomSheetStatic` (`src/components/layout/BottomSheetStatic.tsx`): foglio ancorato in
  basso nel flusso (auth/onboarding). Su mobile è **vetro**: `bg-[rgba(8,8,10,0.74)]` +
  `backdrop-blur-2xl`, filo di luce sul bordo alto, bagliore viola nell'angolo; il muro
  di `AuthShell` (mobile `height={960}`, velo che non arriva mai al nero pieno) continua
  a scorrere dietro. Campi auth/onboarding: `AUTH_FIELD_CLASS` / `AUTH_FIELD_WRAP_CLASS`
  in `src/components/auth/field.ts` (bordo `white/[0.09]`, fondo `white/[0.055]`,
  highlight interno), mai `bg-surface-2` piatto. Da `lg` diventa card centrata (`desktop="card"`,
  non più usata) o blocco piatto (`desktop="plain"`: il pannello è la colonna destra
  del layout 75/25, `3fr / minmax(380px,1fr)`, titolo desktop via
  `AuthHeadline desktop={{title, subtitle}}`). Login, signup **e onboarding** usano lo
  stesso guscio `AuthShell` (`src/components/auth/AuthShell.tsx`: muro + gradienti +
  wordmark a sinistra, pannello a destra); l'onboarding ha il proprio header desktop
  (avatar + titolo) sopra il foglio. `Sheet` resta il pannello modale (`max-w-[480px]`)
  anche su desktop.
- `GlassIconButton`: bottone icona tondo in vetro, usato sopra muri e backdrop.
- **Desktop**: mai una colonna da 480px al centro. Il cap da 480px cade già da `md`
  (`md:max-w-none md:border-x-0` in `PageShell`); le pagine usano tutta la larghezza
  (`lg:px-10`), `PageShell` non ha alcun cap: anche a 2560px+ il contenuto riempie tutto.
  Muri di locandine: home e profilo `columns={20} width="calc(100% + 140px)"` (fluidi,
  `width` accetta anche stringhe CSS), auth desktop `columns={20}
width="calc(100% + 140px)" height={1600}` (muro fluido sui 3/4 dello schermo, via
  `AuthShell`, anche per l'onboarding); il muro mobile resta ai default (4 × 540).
- **Tablet (`md`, 768–1023)**: scheda titolo, profilo e amici sono già a due colonne
  (`md:grid-cols-[340px_1fr]` / `[1fr_300px]`, `md:px-8`); i figli usano `px-5 md:px-0`.
  Da `lg` le colonne si allargano (420/400/380) e il padding passa a `lg:px-10`.
- **Pagina stagione** (`/title/tv/[id]/season/[n]`): banner con backdrop della serie
  (`original`, stessi `HEADER_FADE`/`HEADER_MASK_CLASS`/`AmbientBackdrop` e stessa
  geometria banda/fondale di `TitleHeader`; palette della locandina della serie, così
  serie e stagioni condividono i colori), poster stagione e progresso; il
  fondale riproduce il trailer della stagione (via `getSeason` `append_to_response=videos`),
  altrimenti quello della serie dal `raw.videos` del titolo. Episodi in colonna unica
  a tutte le larghezze, trama sempre visibile (accanto al fotogramma da `md`, sotto su mobile).
- **Fondale scheda titolo** (`CinematicBackdrop`, `src/components/title/CinematicBackdrop.tsx`,
  client): usato da `TitleHeader` e dalla pagina stagione.
  **Il trailer si vede intero, mai ritagliato né ingrandito, a tutte le larghezze.** Ogni
  candidato (`Trailer` = `{key, frame}`, `src/lib/trailers/frame-bars.ts`) porta il
  riquadro della sua **immagine reale**: il frame 16:9 di YouTube meno le bande nere
  (letterbox 2,39:1 di quasi tutti i film, pillarbox), misurate lato server da
  `getTrailerFrame` (`frame.ts`: fotogrammi `mq1/mq2/mq3.jpg` di `i.ytimg.com` — mai
  `mqdefault`, spesso una copertina caricata a mano senza bande —, `sharp` in scala di
  grigi, `detectBars` riga/colonna nera = media ≤ 12 e ≤ 2% di pixel > 40, `frameFromBars`
  = simmetrica per asse e mediana fra i tre fotogrammi, sotto 1,5% è rumore, sotto 30% di
  immagine residua frame intero; `unstable_cache` 30 g per chiave, errori → frame intero).
  Il player è posizionato in **"contain" di quel riquadro** (`playerBox`, JS con
  `ResizeObserver` sullo strato del player; nell'HTML del server le stesse percentuali):
  l'immagine riempie il riquadro, le bande nere di YouTube restano fuori dal bordo, e il
  video viene solo **ridotto** dal layout grande del player, mai ingrandito.
  **La banda ha la forma del trailer** (`bandGeometry(aspect, desktopHeight)` in
  `TitleHeader.tsx`: variabili `--band-aspect`/`--fondale-h` sul riquadro via `BAND_CLASS`
  = `aspect-(--band-aspect) lg:h-(--fondale-h)`, e `--band-end-sm/-lg` su
  `AmbientBackdrop` via `BAND_END_CLASS`; i trailer si aspettano in `TitleBody`, prima
  di `main`, perché servono a entrambi): rapporto = `frameAspect(frame)` del primo
  candidato, così di norma il video la riempie esatta e nessun pixel è nero; **nessun
  tetto d'altezza da `lg`** (un tetto lascerebbe colonne nere ai lati: un 16:9 su
  1920px è alto 1080px, un 2,39:1 803px) e il riquadro è in flusso nella testata
  (`header` `lg:pb-20` / stagione `lg:pb-[100px]`, titolo e locandina `lg:absolute
  lg:bottom-4` che sporgono sotto). Senza trailer resta il disegno base: banda 16:10
  sotto `lg`, fondale fisso 800px (stagione 580px) da `lg`.
  Sotto `lg` (telefono e tablet) la banda è **a tutta larghezza**, preceduta da un
  **respiro nero di safe-area + 16px** (padding del wrapper `BAND_WRAP_CLASS`, mai
  margine) così il trailer non è incollato al bordo alto né sotto la status bar in
  standalone; la TopNav è in basso e solo i comandi in vetro stanno sopra il video, come
  la scheda titolo di Netflix su telefono; niente zoom né parallasse (`.ken-burns` anima
  solo da `lg`), **nessuna maschera: trailer al 100% fino al bordo**; solo un velo lieve
  sul bordo alto (`BAND_TOP_FADE`, metà riquadro, 0,55 → 0) per leggere i bottoni.
  L'immagine di fondo (backdrop 16:9) copre il riquadro (`object-cover`): è solo l'attesa
  prima del trailer e il ripiego senza trailer. Subito sotto la banda, **fuori dal video**,
  una **sfumatura nera** (`BAND_BLACK_FADE` / `BAND_BLACK_FADE_CLASS`: dal nero pieno al
  trasparente in 320px, `top-full` in un wrapper `relative lg:contents` attorno alla banda:
  ancorata al bordo basso reale, non a `56.25vw`, perché la banda è larga 390 − 2px di
  bordo `PageShell` e un varco di 1px lasciava trasparire l'ambient come riga chiara) fa da
  respiro fra il video e la pagina colorata;
  locandina e titolo stanno sotto la banda (`mt-4`) su quel nero. Da `lg` la testata è
  il fondale alto (vedi sopra) con locandina e titolo appoggiati
  in basso sopra `HEADER_FADE` (che non arriva mai al nero pieno: finisce a 0,55) e la
  **dissolvenza nella pagina** `HEADER_MASK_CLASS` (solo `lg:`, `mask-image` da opaco al
  66% a trasparente in fondo).
  **Sfondo "ambient"** (`AmbientBackdrop`, `src/components/title/AmbientBackdrop.tsx`,
  server): ogni scheda titolo e stagione ha dietro tutta la pagina (`main` è
  `relative isolate`, i div sono `-z-10`) le sfumature dei due colori
  dominanti della locandina, calcolati da `getPosterPalette(poster_path)`
  (`src/lib/colors/palette.ts`, `server-only`: locandina `w92` via `fetch` con cache
  Next 30 d, `sharp` a 40px di larghezza, celle HSL pesate per saturazione, pixel
  neri/bianchi/grigi ignorati, tinte riportate in una fascia L 0,3–0,5 / S 0,35–0,8;
  qualunque errore → viola tenue di ripiego, mai errore in pagina). Due strati, base
  nera, solo radiali: uno **fisso** (segue lo scroll: due grandi bagliori ai bordi del
  viewport + velo tenue, deriva lenta `.ambient-drift` 48 s, ferma con reduced-motion)
  così la pagina non è mai nera e anonima nemmeno in fondo; uno **assoluto** alto quanto
  il `main`: accenno sopra il trailer (dietro nav e riga comandi), bagliori a 340px
  sotto il bordo basso del riquadro (`--band-end`, passato dal chiamante: `BAND_END_CLASS`
  = respiro + 62,5vw sotto `lg`, 800px scheda / 580px stagione da `lg`; sotto `lg`
  il colore comincia dopo la sfumatura nera) ed echi al 55/80/100% dell'altezza alternati
  fra tinte e lati. Il trailer resta nudo: gli strati stanno sotto la testata.
  Immagine `original`; da `lg` Ken Burns (`.ken-burns`, 36 s alternato) + parallasse allo
  scroll (contenitore alto 120% e sporgente in alto, trasla in basso di `0.2 × scrollY`,
  mai un buco); sopra, se c'è un trailer ufficiale italiano (`getOfficialTrailers`, vedi sotto), il player
  `youtube-nocookie` in loop che sfuma solo quando YouTube conferma la riproduzione
  (`REVEAL_DELAY_MS` = 2,5 s dopo il "playing" + 1 s di dissolvenza: nasconde il flash dei
  controlli YouTube, che ricompaiono a ogni comando; `preconnect` a YouTube durante
  l'idratazione). Al "playing" si spengono anche i sottotitoli automatici
  (`setOption captions` + `unloadModule`): alcuni trailer li accendono da soli e la
  didascalia finiva dietro il titolo. **Audio**: l'autoplay parte muto (regola dei browser);
  se l'utente è arrivato con un tap (`navigator.userActivation.hasBeenActive`) o ha già
  scelto l'audio in questa sessione (`soundPreference`, variabile di modulo), il player
  viene smutato a frame ancora nascosto, con retry perché subito dopo il "playing" YouTube
  ignora i comandi; un `unMute` rifiutato (iOS: il player va in pausa) torna muto e
  riparte. **Comandi in testata**: Indietro a sinistra; a destra una sola pillola in
  vetro `HeaderControls` (`src/components/title/HeaderControls.tsx`) con l'altoparlante
  (compare animato solo a trailer visibile) e Condividi (`useShare` in `ShareButton.tsx`;
  la pagina stagione non passa `shareTitle` e ha la sola pillola audio). La pillola è
  montata da `CinematicBackdrop` (che possiede lo stato audio) via portal nello slot
  `[data-header-controls]` della testata. Sotto `lg` i comandi stanno in vetro sul bordo
  alto del video, sotto la TopNav (`HEADER_BACK_CLASS` / `HEADER_CONTROLS_SLOT_CLASS`,
  quota safe-area+28 = 12px dentro la banda, sopra `BAND_TOP_FADE`); da `lg` ai due
  angoli del fondale (safe-area + `--nav-top` + 20).
  Mai cerchi sparsi. I veli
  `HEADER_FADE` sono `pointer-events-none`. **Qualità**: YouTube sceglie la qualità dalla dimensione di
  layout del player (non dal DPR; `vq=`/`setPlaybackQuality` non hanno effetto misurabile),
  quindi l'iframe ha un layout molto più grande di quanto si vede e viene ridotto con
  `transform` (`SCALE_BAND`/`SCALE_WIDE`, letterali nelle classi `[--yt-k:6]
  lg:[--yt-k:2]` dello strato del player): sotto `lg` a 6× (telefono da 390 → ~2340×1316
  → hd1080/hd1440; al doppio sceglieva 360p), da `lg` al doppio (1920 → 3840×2160 →
  hd2160). Lo strato del player è grande esattamente quanto il riquadro e **senza
  parallasse** (solo l'immagine, nel suo layer alto il 120%, scorre).
  L'ABR parte sempre da 144p e sale dopo 0–6 s: **la dissolvenza aspetta che
  `infoDelivery.playbackQuality` sia almeno hd1080** (o il massimo di
  `availableQualityLevels` se inferiore), con tetto `MAX_QUALITY_WAIT_MS` = 12 s; un
  fotogramma sgranato non compare mai. **Avvio**: l'iframe è già nell'HTML del server
  (`allowVideo` parte `true`, tolto al mount con reduced-motion/Save-Data; niente `origin`
  nell'URL per l'idratazione) e l'handshake "listening" si manda anche al mount, non solo
  su `onLoad`: player pronto a ~1,3 s invece di 2–3. Il frame è mostrato intero (sporge
  solo delle bande nere), quindi la barra titolo e la barra "Altri video" di YouTube sono
  nell'area visibile finché il player non le nasconde (~3–4 s dal "playing"): la
  dissolvenza arriva dopo (`REVEAL_DELAY_MS` = 4,5 s, a tutte le larghezze). Misure con
  Playwright su Chrome installato
  (`channel: "chrome"`, headed): il Chromium di Playwright offre solo 360p.
  `prefers-reduced-motion`/Save-Data: niente video, niente zoom, niente parallasse.
  `HEADER_FADE` è leggero: immagine nuda per quasi due terzi del riquadro, velo scuro solo nell'ultimo quinto.
  **Il trailer è solo fondale, mai un link a YouTube**: nessun bottone "Trailer".
  **Solo trailer italiani da canali YouTube ufficiali dei distributori** (`src/lib/trailers/`):
  `getOfficialTrailers({videos, titleId, mediaType, season, name, releaseDate})`
  (`official.ts`, server-only, React `cache()`; `getOfficialTrailerKeys` = solo le chiavi)
  è l'unica sorgente dei trailer (`Trailer {key, frame}`, riquadro senza bande nere da
  `frame.ts`) per `TitleBody`/`TitleHeader` e per la pagina stagione (stagione N, poi
  serie). **DB-first**: ogni visita fa una sola lettura di `title_trailers` (migration 0011
  + 0013: `trailers` jsonb `[{key, frame}]`, `source` tmdb|youtube|none, `keys` legacy
  da togliere; pk `title_id, media_type, season_number`; service client); oEmbed,
  miniature e ricerca girano solo a riga assente o scaduta (piena 30 d, vuota 1 d), così
  il primo chunk non aspetta mai le chiamate esterne e la banda (a forma del riquadro)
  non cambia altezza dopo il render; ricerca fallita con riga vecchia → si tiene la
  vecchia; `name` vuoto → niente ricerca né riga (la FK su `titles` esige la riga).
  `parseTrailers` (`stored.ts`, pure, Vitest) valida il JSON: forma diversa → ricalcolo.
  Passo A:
  i video TMDB (`rankTmdbCandidates` in `rank.ts`: YouTube, `iso_639_1` "it" o null,
  Trailer → Teaser, ufficiali prima) passano per l'oEmbed di YouTube (`oembed.ts`,
  nessuna chiave, timeout 3 s, cache Next 30 d): resta solo chi è caricato da un canale in
  `OFFICIAL_CHANNELS` (`channels.ts`: id UC…, handle di `author_url`, nome, flag
  `italian`; Warner/Sony/Universal "International Italy"/Disney IT + Marvel Italia +
  20th Century IT + Star Wars Italia/Prime Video IT/Netflix + Netflix Italia/MUBI/Apple
  TV/Sky/Eagle/01/Lucky Red/Medusa/Paramount IT/Vision/I Wonder/BIM/Notorious/Plaion +
  Midnight Factory) ed è italiano per quel canale (`isItalianForChannel`: dai canali
  globali Netflix/MUBI/Apple TV solo con lingua "it" esplicita). Un video privato/rimosso
  (oEmbed 4xx) cade da solo. Passo B, solo con `YOUTUBE_API_KEY` (opzionale, Data API v3
  gratis, 10.000 unità/giorno, `search.list` = 100): una ricerca "<nome> trailer
  italiano" (`youtube.ts`), filtrata da `rankSearchResults` (canale ufficiale, "trailer
  ufficiale" > trailer > teaser, niente clip/featurette/spot/interviste, canali globali
  solo con "ita"/"italiano"/"sub ita" nel titolo, film: niente video di oltre 2 anni
  prima dell'uscita, stagione: solo titoli che la nominano). Nessun risultato → solo
  backdrop: **mai un trailer inglese o di terzi**. Per
  aggiungere un canale: handle da `author_url` dell'oEmbed di un suo video, id da
  `"externalId"` nell'HTML di `youtube.com/@handle`. I video TMDB arrivano con
  `include_video_language=it,en,null` (vedi TMDB sopra).
- **Backdrop**: sempre TMDB `original` con `quality={95}`, mai `w780`/`w1280` come sfondo.
  `sizes` segue la geometria di `object-cover`, non la larghezza della pagina: un 16:9
  che copre un riquadro alto H va richiesto largo H × 16/9. `CinematicBackdrop` lo
  calcola dal rapporto della banda (`imageSizes`: con trailer `100vw × max(1,
  16/9 ÷ aspect)`, da `lg` × 1,2 per il layer con parallasse; senza trailer la banda
  16:10 chiede ~112vw e il fondale fisso `(max-width: 1439px) 115vw, 100vw`).
  Mai chiedere meno del necessario: un file da 1200px scalato 3× è sfocato.
