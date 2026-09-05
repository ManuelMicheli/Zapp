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

Vitest copre solo le funzioni pure di `src/lib/cinema/`; il resto si verifica con `pnpm typecheck && pnpm lint && pnpm build`.

Env vars: see `.env.example`. `TMDB_API_READ_ACCESS_TOKEN` and `SUPABASE_SERVICE_ROLE_KEY` are server-only; code throws if they are missing or still start with `INSERISCI`.

## Hard rules (from the phase specs)

- No TMDB calls from the client. Everything goes through `src/lib/tmdb/client.ts` (`server-only`) or the allowlisted proxy `src/app/api/tmdb/[...path]/route.ts`.
- No external UI libraries (no shadcn). Primitives are hand-written in `src/components/ui/`.
- No `localStorage` for user data.
- Fonts are self-hosted (`public/fonts`, `next/font/local`). CSP in `next.config.ts` allows only self, Supabase host, and `image.tmdb.org`; adding a third-party origin requires editing the CSP.
- Service-role client is only for system data (TMDB cache writes, link resolver) and for system reads of that cache on public routes (`getWallPosters` falls back to `titles` when TMDB is down). Never for user data, never exposed to the client.

## Architecture

### Auth and routing

- `src/middleware.ts` → `updateSession` in `src/lib/supabase/middleware.ts`: refreshes the session cookie, redirects unauthenticated users to `/login` (public paths: `/login`, `/signup`, `/auth/*`). Do not put logic between `createServerClient` and `getUser()`.
- `src/app/(app)/layout.tsx` re-checks the user and redirects to `/onboarding` until `profiles.onboarding_completed_at` is set. The `handle_new_user` trigger assigns a placeholder `user_<hex>` username at signup; onboarding replaces it.
- Three Supabase clients in `src/lib/supabase/`: `client.ts` (browser), `server.ts` `createClient()` (cookie-bound, RLS on) and `createServiceClient()` (bypasses RLS).

### TMDB and the local cache

- `src/lib/tmdb/client.ts`: typed fetchers, in-memory throttle (15 req/s), Next `fetch` revalidate per endpoint, `language=it-IT`. `getMovie`/`getTv` use one `append_to_response` call (credits, videos, recommendations, external_ids, watch/providers) with `include_video_language=it,en,null` (also `getSeason`): without it TMDB returns Italian videos only and most titles lose their trailer. `TITLE_CACHE_EPOCH` in `src/lib/config.ts`: bump it whenever the shape of `titles.raw` changes, so title pages (`requireFull`) refetch older rows once.
- `src/lib/tmdb/cache.ts` `getOrFetchTitle(id, mediaType, {requireFull})`: reads `titles` + `title_providers` (7-day TTL via `fetched_at`, `TITLE_CACHE_TTL_MS` in `src/lib/config.ts`); on miss/stale it fetches TMDB and upserts with the service client. Falls back to stale rows if TMDB fails. `requireFull` forces a refetch when `raw` lacks `credits` (rows saved before phase 2).
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
- `src/lib/watch/queries.ts`: read side. `ENTRY_SELECT` embeds the title via the explicit FK hint `titles!watch_entries_title_id_media_type_fkey` (composite key `id, media_type`), so home/library render with zero TMDB calls.

### Social (phase 4)

- `src/lib/social/actions.ts` / `queries.ts`: friendships (request → accept, block deletes the row and hides both users), reviews with spoiler flag + comments (depth-limited by trigger), recommendations to friends, notifications, feed.
- `activities` rows are written **only by DB triggers** (`log_watch_activity`, `log_review_activity`, `log_recommendation_activity`). The Netflix import (`src/app/(app)/import/netflix/`, parser in `src/lib/import/netflix.ts`) calls the RPC `import_watch_entries`, which sets `zapp.skip_activities` for the transaction so bulk imports do not flood the feed. The import runs as **short chunked Server Actions** driven by the client (`limits.ts`: match 30 candidates, confirm 25 titles per call, with progress in the button; the last confirm chunk carries `final` and writes the `imports` row): one request held open for minutes is cut by the browser (Safari after 60 s, Chrome after 300 s) or by the Vercel function limit, and the rejected fetch used to surface as "Application error: a client-side exception" even though the server finished. Never move the per-title loop back into a single action.
- Feed is cursor-paginated and aggregated in the query layer (same-day episodes of one series → one row; `finished` + `rated` within 10 min → one row).
- RLS policies rely on `are_friends()` / `is_blocked()` (SECURITY DEFINER). Views `user_search` and `reviews_with_counts` and the helper RPCs are intentionally SECURITY DEFINER with grants only to `authenticated` (migration 0005 revokes `anon`/`PUBLIC`); Supabase advisor warnings about them are accepted (see README).
- Moderation: reviews with `report_count >= 3` are hidden by query filter.
- `src/lib/rate-limit.ts`: per-user sliding window, in-memory by default, Upstash REST if `UPSTASH_REDIS_REST_URL/TOKEN` are set. Limits are declared inline at each call site in `social/actions.ts`.

### Routes

Route groups: `(auth)` for login/signup, `(app)` for everything protected with the nav (`TopNav`, in basso su mobile e in alto da `lg`: Home, Cerca, Libreria, Amici, Profilo). Title pages: `/title/movie/[id]`, `/title/tv/[id]`, `/title/tv/[id]/season/[n]`. Public profiles at `/u/[username]`. `src/app/api/search/route.ts` enriches the top 12 TMDB search results with cached providers.

### Cinema (MovieGlu)

- `src/lib/cinema/`: `movieglu.ts` (client server-only, throttle 2 req/s, `unstable_cache` 15 min per cella di ~110 m, `MOVIEGLU_MOCK=1` → `mock.ts`), `match.ts` (TMDB ↔ MovieGlu via IMDb id in `cinema_films`, 24 h), `showtimes.ts` (`getFilmShowtimes`, `getCinemaProgramme`, `getNearbyCinemas`), `links.ts` (link biglietteria: `cinema_links` manual → sito cinema → catena `chains.ts` → Google), `location.ts` / `geocode.ts` (posizione in `user_locations` — tabella privata con RLS solo proprietario, migration `0009_user_locations.sql`, mai in `profiles` che è leggibile da tutti; geocoding Nominatim con rate limit 10/min per utente), `plans.ts` (`cinema_plans`, "Ci vado" + `addWant`). Funzioni pure senza `server-only` (`geo.ts`, `dates.ts`, `formats.ts`, `chains.ts`, `films.ts`) hanno test Vitest.
- UI in `src/components/cinema/`: `NearbyShowtimes` (scheda film, `?day=`), pagina `/cinema` (`?view=films|cinemas&film=`), `TicketSheet` (Compra biglietti = deep link, mai iframe; Ci vado; Invita amici via `RecommendSheet.initialMessage`), `TonightAtCinema` in home. Posti in sala live: fuori scope (nessuna API in Italia).
- `Permissions-Policy` consente `geolocation=(self)`; CSP invariata (MovieGlu e Nominatim solo server).

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
  72px alta, `z-30`, **stessa struttura a tutte le larghezze**: wordmark a sinistra,
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
  banda 16:9 della scheda titolo a `+var(--nav-top)`, il campo di Cerca è sticky da `top-0`
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
  client): usato da `TitleHeader` e dalla pagina stagione. **Due geometrie.** Sotto `lg`
  (telefono e tablet) la testata è una **banda 16:9 a tutta larghezza dal bordo alto della
  pagina** (header senza padding, riquadro `aspect-video`; la TopNav è in basso e solo i
  comandi in vetro stanno sopra il video, nessuna riga vuota che rubi spazio), come la
  scheda titolo di Netflix su telefono: immagine e trailer **interi, mai ritagliati**,
  niente zoom né parallasse (`.ken-burns` anima solo da `lg`), **nessuna maschera: trailer
  al 100% fino al bordo**; solo un velo lieve sul bordo alto (`BAND_TOP_FADE`, 60% del
  riquadro, 0,7 → 0) per leggere nav e bottoni. Subito sotto la banda, **fuori dal video**,
  una **sfumatura nera** (`BAND_BLACK_FADE` / `BAND_BLACK_FADE_CLASS`: dal nero pieno al
  trasparente in 320px, parte da `56.25vw`) fa da respiro fra il video e la pagina colorata;
  locandina e titolo stanno sotto la banda (`mt-4`) su quel nero. Da `lg` la testata è
  il fondale alto (scheda 880/800px, stagione 680/580) con locandina e titolo appoggiati
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
  sotto il bordo basso del riquadro (`--band-end`, passato dal chiamante: `56.25vw`
  sotto `lg`, 800px scheda / 580px stagione da `lg`; sotto `lg`
  il colore comincia dopo la sfumatura nera) ed echi al 55/80/100% dell'altezza alternati
  fra tinte e lati. Il trailer resta nudo: gli strati stanno sotto la testata.
  Immagine `original`; da `lg` Ken Burns (`.ken-burns`, 36 s alternato) + parallasse allo
  scroll (contenitore alto 120% e sporgente in alto, trasla in basso di `0.2 × scrollY`,
  mai un buco); sopra, se `raw.videos` ha un trailer YouTube (`findTrailer`), il player
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
  quota safe-area+76, sopra `BAND_TOP_FADE`); da `lg` ai due angoli del fondale (+92).
  Mai cerchi sparsi. I veli
  `HEADER_FADE` sono `pointer-events-none`. **Qualità**: YouTube sceglie la qualità dalla dimensione di
  layout del player (non dal DPR; `vq=`/`setPlaybackQuality` non hanno effetto misurabile),
  quindi l'iframe è molto più grande del riquadro: sotto `lg` a 5× (`scale-[0.2]`, 1950px su
  un telefono da 390 → hd1080; al doppio sceglieva 360p), da `lg` al doppio (`lg:scale-50`).
  L'ABR parte sempre da 144p e sale dopo 0–6 s: **la dissolvenza aspetta che
  `infoDelivery.playbackQuality` sia almeno hd1080** (o il massimo di
  `availableQualityLevels` se inferiore), con tetto `MAX_QUALITY_WAIT_MS` = 12 s; un
  fotogramma sgranato non compare mai. **Avvio**: l'iframe è già nell'HTML del server
  (`allowVideo` parte `true`, tolto al mount con reduced-motion/Save-Data; niente `origin`
  nell'URL per l'idratazione) e l'handshake "listening" si manda anche al mount, non solo
  su `onLoad`: player pronto a ~1,3 s invece di 2–3. Sotto `lg` il frame è esattamente la
  banda, quindi la barra titolo e la barra "Altri video" di YouTube
  sono dentro l'area visibile finché il player non le nasconde (~3 s dal "playing"): la
  dissolvenza deve arrivare dopo (`REVEAL_DELAY_BAND_MS`). Da `lg` il frame è più alto di
  320px e le barre restano fuori. Misure con Playwright su Chrome installato
  (`channel: "chrome"`, headed): il Chromium di Playwright offre solo 360p.
  `prefers-reduced-motion`/Save-Data: niente video, niente zoom, niente parallasse.
  `HEADER_FADE` è leggero: immagine nuda per quasi due terzi del riquadro, velo scuro solo nell'ultimo quinto.
  **Il trailer è solo fondale, mai un link a YouTube**: nessun bottone "Trailer";
  `findTrailer(videos)` (`src/components/title/trailer.ts`) sceglie il video YouTube:
  Trailer, altrimenti Teaser; a parità di tipo italiano → inglese → altro, ufficiali
  prima. I video arrivano con `include_video_language=it,en,null` (vedi TMDB sopra).
- **Backdrop**: sempre TMDB `original` con `quality={95}`, mai `w780`/`w1280` come sfondo.
  `sizes` segue la geometria di `object-cover`, non la larghezza della pagina: un 16:9
  che copre un riquadro alto H va richiesto largo H × 16/9. Nella banda 16:9 mobile
  coincide con `100vw`; da `lg` il fondale alto chiede di più sugli schermi meno larghi →
  `CinematicBackdrop` usa `(max-width: 1023px) 100vw, (max-width: 1439px) 115vw, 100vw`.
  Mai chiedere meno del necessario: un file da 1200px scalato 3× è sfocato.
