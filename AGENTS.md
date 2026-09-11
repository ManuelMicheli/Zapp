# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

## Sorgente canonica e deploy

Prima di riordini o deploy consultare `docs/project/WORKSPACE.md` e confrontare
il manifest completo della sorgente canonica. Non resettare su `origin/main` e
non distribuire da worktree storici o incompleti: preservare prima le modifiche
concorrenti e verificarne la provenienza.

## Regia e risparmio token (preferenza utente)

- GPT-6 Astra dirige: definisce soluzione, istruzioni operative, vincoli e criteri di accettazione; rivede il diff e le verifiche prima della consegna.
- Delegare l'implementazione a GPT-5.4; usare GPT-5.4 mini per compiti piccoli, circoscritti e con esito verificabile. Astra gestisce ambiguita', decisioni architetturali e correzioni critiche.
- Ogni incarico indica obiettivo, file di competenza, riferimenti necessari e verifiche. Passare solo il contesto pertinente; richiedere un resoconto breve con file modificati, esiti e problemi aperti. Gli agenti non devono annullare modifiche altrui.
- Evitare analisi e implementazioni duplicate: Astra scrive il piano, l'esecutore il codice. Parallelizzare solo compiti indipendenti quando utile; niente deleghe senza un compito concreto.
- Usare esclusivamente modelli realmente selezionabili. Se i modelli richiesti non sono disponibili, dichiararlo: questa preferenza non abilita modelli e non autorizza sostituzioni silenziose.
- Mantenere tutte le regole di sicurezza e le verifiche del progetto. Nessuna promessa di perfezione o di risparmio senza misurazione; distinguere token consumati, costo e quota del piano.

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

# Catalogo nazionale delle sale (riempie cinema_venues; lento di proposito, 0,7 s a richiesta)
pnpm tsx --env-file=.env.local scripts/warm-cinema-venues.ts [slug provincia…]

pnpm test         # vitest, solo funzioni pure (src/**/*.test.ts)
```

Vitest copre solo le funzioni pure di `src/lib/cinema/`, di `src/lib/import/` (`netflix-{title,rows,proposals}.ts`) di `src/lib/trailers/` (`channels.ts`, `rank.ts`, `frame-bars.ts`, `stored.ts`) di `src/lib/tmdb/backdrops.ts` e di `src/lib/colors/dominant.ts`; il resto si verifica con `pnpm typecheck && pnpm lint && pnpm build`.

Env vars: see `.env.example`. `TMDB_API_READ_ACCESS_TOKEN` and `SUPABASE_SERVICE_ROLE_KEY` are server-only; code throws if they are missing or still start with `INSERISCI`.

## Hard rules (from the phase specs)

- No TMDB calls from the client. Everything goes through `src/lib/tmdb/client.ts` (`server-only`) or the allowlisted proxy `src/app/api/tmdb/[...path]/route.ts`.
- No external UI libraries (no shadcn). Primitives are hand-written in `src/components/ui/`.
- No `localStorage` for user data.
- Fonts are self-hosted (`public/fonts`, `next/font/local`). CSP in `next.config.ts` allows only self, Supabase host, and `image.tmdb.org`; adding a third-party origin requires editing the CSP.
- Service-role client is only for system data (TMDB cache writes, link resolver) and for system reads of that cache on public routes (`getWallPosters` falls back to `titles` when TMDB is down). Never for user data, never exposed to the client.

## Sicurezza (audit 2026-09-07)

Regole non negoziabili, nate da un audit che ha trovato due falle critiche
(migrations `0020_security_hardening.sql`, `0021_review_moderation_rls.sql`).

- **Il ruolo `anon` non ha niente nello schema `public`.** La chiave anon sta nel
  bundle del browser: finche' le policy erano `to public`, chiunque poteva
  scaricare da PostgREST tutti i profili non privati, tutte le recensioni e tutti
  i commenti senza avere un account. Ora ogni grant per `anon` e' revocato
  (tabelle, viste, sequenze, funzioni, piu' le default privileges) e ogni policy
  e' scritta `to authenticated`. **L'app non legge mai dal DB da sloggata**:
  login e signup usano solo le API auth, il muro di locandine passa dal service
  client. Chi aggiunge una lettura su una pagina pubblica deve usare il service
  client, non riaprire `anon`.
- **Ogni policy di UPDATE ha un `with check` che ripete la condizione di
  proprieta'**, e dove il `with check` non basta perche' servirebbe la riga
  vecchia, c'e' un trigger. `friendships_update_addressee` controllava solo lo
  `status`: chi riceveva una richiesta poteva riscrivere `requester_id` e
  `addressee_id` con due id qualsiasi e metterla ad `accepted`, cioe' diventare
  "amico" di chiunque e leggergli libreria, attivita' e profilo privato. Oggi
  `friendships_parties_immutable` blocca il cambio delle parti e la policy vale
  solo su righe `pending` (prima chi veniva bloccato poteva sbloccarsi da solo
  aggiornando la riga `blocked` di cui era destinatario).
- **Grant per colonna dove l'utente deve toccarne solo alcune**: `profiles`
  (nome, avatar, privacy, fine onboarding), `recommendations` (solo `seen_at`),
  `reviews` (mai `report_count`). Attenzione: l'upsert di PostgREST genera un
  `ON CONFLICT DO UPDATE` su **tutte** le colonne del payload, quindi il grant di
  UPDATE deve coprirle tutte, non solo quelle che "cambiano".
- **Le regole di visibilita' stanno nella RLS, non nel filtro della query.** La
  moderazione delle recensioni era solo un `.lt("report_count", 3)` nel client:
  bastava interrogare la tabella senza quel filtro. Ora `report_count` e' una
  colonna tenuta dal trigger `sync_review_report_count` ed entra nella policy;
  `reviews_with_counts` e' tornata `security_invoker`. `user_search` resta
  SECURITY DEFINER apposta (serve a trovare per username anche un profilo
  privato, per invitarlo): l'avviso dell'advisor su quella vista e' accettato.
- **`are_friends`/`is_blocked` rispondono solo su se stessi.** Sono RPC esposte a
  chi ha fatto accesso (servono dentro le policy): senza vincolo, mappando
  username -> id con `user_search` si ricostruiva il grafo delle amicizie altrui.
  Dentro la sessione di un utente una delle due parti dev'essere lui; nei trigger
  e nei job (`auth.uid()` nullo) il comportamento non cambia.
- **Le funzioni di trigger vanno revocate** da `anon`, `authenticated` e `public`,
  altrimenti Supabase le espone come `/rest/v1/rpc/<nome>` e sono SECURITY DEFINER.
- **Ogni Server Action e' un endpoint HTTP.** Gli argomenti li scrive chiunque
  abbia una sessione, non il nostro componente: si validano con
  `src/lib/validate.ts` (`isUuid`, `isTmdbId`, `isMediaType`, `isIntInRange`,
  `escapeLike`, `isSafeExternalUrl`, `safeNextPath`; puro, test in
  `validate.test.ts`). Anche lo snapshot dell'undo di `watch/actions.ts` fa il
  giro dal client, quindi torna come dato non fidato e si riscrive campo per campo.
- **Mai costruire un filtro PostgREST concatenando stringhe.** Dentro `.or()` il
  valore fa parte della grammatica dei filtri: `removeFriend`/`blockUser`
  interpolavano l'id dell'altro utente e un id con virgole o parentesi riscriveva
  la condizione. Si usano `.eq()` separati (`deleteFriendshipBothWays`). In
  `.ilike()` si passa da `escapeLike`: `%`, `_` e `*` sono jolly e trasformavano
  la ricerca per prefisso in una ricerca "contiene".
- **Il controllo di proprieta' si fa anche nel codice, non solo nella RLS.**
  `cancelPlan` non aveva ne' sessione ne' `.eq("user_id", …)`: cancellava serata e
  biglietto contando unicamente sulle policy.
- **Verso il client va sempre un messaggio generico.** `error.message` di
  PostgREST racconta colonne, vincoli e policy; il dettaglio resta nei log.
- **Ogni azione che costa (TMDB, Nominatim, scritture sociali) ha un rate limit**
  dichiarato al punto di chiamata (`src/lib/rate-limit.ts`). Il limitatore in
  memoria si ripulisce da solo e, se Upstash e' giu', si scende su di lui invece
  di lasciar passare tutto.
- **URL esterni**: solo https verso un dominio pubblico (`isSafeExternalUrl`),
  controllati sia quando si salvano (`booking_url`) sia prima del redirect
  (`/go/...`, dove il link `justwatch` arriva da terzi). Non si fissa il dominio
  della piattaforma: l'offerta Prime Video sta legittimamente su `amazon.it`.
  Il `next` di `/auth/callback` passa da `safeNextPath` e la base del redirect e'
  `NEXT_PUBLIC_APP_URL`, non l'`origin` ricavato dall'header `Host`.
- **Header** in `next.config.ts`: CSP (con `object-src 'none'`, `worker-src`,
  `frame-ancestors 'none'`, `upgrade-insecure-requests`), HSTS 2 anni,
  COOP/CORP `same-origin`, `X-Frame-Options: DENY`, nosniff, Permissions-Policy a
  lista chiusa. **`autoplay`, `fullscreen` ed `encrypted-media` nominano
  esplicitamente `https://www.youtube-nocookie.com`**: senza, la policy toglie
  quelle funzioni proprio al player del trailer.
  `script-src` tiene `'unsafe-inline'` **di proposito**: il nonce per richiesta
  obbligherebbe ogni pagina a rendersi dinamicamente e farebbe cadere il
  rendering statico su cui poggiano prefetch e aperture istantanee. Il rischio
  che coprirebbe e' basso: nessun `dangerouslySetInnerHTML`, nessun HTML scritto
  dagli utenti, nessun `eval`.
- **Verifica**: `node scripts/security-check.mjs` contro un'istanza avviata
  (header, rotte protette, open redirect, rendering e violazioni CSP con
  Playwright). Da rilanciare a ogni modifica di CSP, header o middleware.
  Lato DB: `get_advisors` di Supabase dopo ogni migration.
- **Cosa resta noto e accettato**: il cookie di sessione non e' `httpOnly` (lo
  legge `createBrowserClient` di `@supabase/ssr`, e' la sua architettura), quindi
  la difesa dall'XSS e' la CSP piu' l'assenza di sink HTML; `cinema_films`,
  `cinema_links`, `cinema_venues` e `job_runs` hanno RLS senza policy, cioe'
  chiusi a tutti tranne al service client, ed e' voluto.

## Architecture

### Auth and routing

- `src/middleware.ts` → `updateSession` in `src/lib/supabase/middleware.ts`: refreshes the session cookie, redirects unauthenticated users to `/login` (public paths: `/login`, `/signup`, `/auth/*`). Do not put logic between `createServerClient` and `getClaims()`.
- **Auth reads are local.** The project signs JWTs with ES256 (asymmetric keys), so `supabase.auth.getClaims()` verifies the token against the cached JWKS without a round trip. `src/lib/auth/viewer.ts`: `getViewer()` (id + email) and `getViewerProfile()` (adds `onboarding_completed_at`), both in React `cache()` → one read per request shared by layout, pages and Suspense sections. **Every read path uses `getViewer()`; `getUser()` stays only in Server Actions and route handlers that write.**
- `src/app/(app)/layout.tsx` calls `getViewerProfile()` and redirects to `/onboarding` until `profiles.onboarding_completed_at` is set. The `handle_new_user` trigger assigns a placeholder `user_<hex>` username at signup; onboarding replaces it. The layout also mounts `ImportProvider` + `ImportChip` (see Social).
- **Latency budget.** Vercel functions run in `fra1` (`vercel.json` `regions`), next to Supabase `eu-central-1`: a DB round trip costs ~5 ms instead of the ~100 ms measured with the default `iad1` (`X-Vercel-Id: fra1::iad1::…`, 2026-09-05). Keep it that way: never add a sequential await that is not needed, prefer `Promise.all`.
- Three Supabase clients in `src/lib/supabase/`: `client.ts` (browser), `server.ts` `createClient()` (cookie-bound, RLS on) and `createServiceClient()` (bypasses RLS).
- **Il marchio nell'autenticazione sta fuori dal codice** (2026-09-09): il nome e
  l'icona nella schermata "Scegli un account" di Google si impostano nella Google
  Cloud Console (Branding), non in Supabase; sotto al nome Google scrive comunque il
  dominio del callback (`<ref>.supabase.co`), che sparisce solo con un Custom Domain
  Supabase. Le sei email di autenticazione le genera `scripts/auth-emails.mjs` (file
  in `docs/auth/email-templates/`, caricabili con `--push` e un Personal Access
  Token). **Sul piano free i modelli non si possono cambiare finche' le email
  partono dal servizio incluso di Supabase** (`400 ... not available for free tier
  projects using the default email provider`, 2026-09-09): prima l'SMTP proprio,
  che porta con se' anche il mittente "Zapp" e i limiti di invio. Istruzioni in
  `docs/auth/README.md`. La testata e' il **muro di locandine come GIF**
  (`scripts/email-wall.mjs` rende in Chrome la geometria di `PosterWall` fotogramma
  per fotogramma e impacchetta con ffmpeg: nelle email non esistono ne' animazioni
  CSS ne' JavaScript), e sotto non c'e' nessuna card: testo e bottone stanno sul
  fondo, come nel foglio di login. **Le immagini stanno in `public/email/`**, la sola
  cartella con `Cross-Origin-Resource-Policy: cross-origin` in `next.config.ts`: col
  `same-origin` di tutto il resto un client di posta che rende in WebKit le scarta, e
  la regola generale la esclude con un lookahead perche' due regole sovrapposte
  manderebbero due CORP diverse.

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

- **Il link deve aprire l'app, non il sito** (2026-09-09, segnalazione utente su
  Disney+): quasi tutte le piattaforme reindirizzano da sole il browser sulla
  propria app, Disney+ no — `disneyplus.com/browse/entity-…` resta nel browser.
  Ogni link verso una piattaforma passa da `AppLink` (`src/components/ui/AppLink.tsx`,
  client) invece che da un `<a target="_blank">` a mano: `ProviderButton`,
  `ContinueCard`, i due link "Continua su" di `TitleActionsBar` e `PlatformLauncher`.
  Le regole stanno in `src/lib/links/native-app.ts` (puro, Vitest): `NATIVE_APPS`
  elenca **solo** le piattaforme che vanno forzate (oggi Disney+, pacchetto
  `com.disney.disneyplus`), per tutte le altre `AppLink` è il link di prima.
  Su **Android** si va a `intent://<host><path>#Intent;scheme=https;package=…;S.browser_fallback_url=<url>;end`:
  Chrome consegna all'app senza passare dalla verifica degli App Links e chi non
  ce l'ha finisce sul sito (il ripiego va **codificato**: un `;` o un `&` crudo
  romperebbe la grammatica dell'intent). Su **iOS** l'universal link esiste già
  (l'AASA di Disney+ dichiara `/browse/*`), ma dentro la PWA in standalone
  `target="_blank"` apre una scheda del browser in-app, che all'app nativa non
  cede mai: si naviga **top-level** sullo stesso URL. Un href relativo (`/go/…`,
  che risolve al volo) resta un link normale: la destinazione non si conosce
  ancora. Per aggiungere una piattaforma a `NATIVE_APPS` va prima verificato che
  il suo link https resti davvero nel browser.

- **Film / Serie TV vale per tutta la home** (2026-09-07): lo stato sta in
  `HomeTypeProvider` (`src/components/home/HomeType.tsx`, client, avvolge il `main`);
  `HomeTypeSwitch` è la testata (h1 "Home" + pillola), **fuori dal Suspense**
  dell'hero. Ogni sezione rende *entrambe* le varianti già divise dal server e
  `HomeTypeGate type="movie|tv"` mostra solo quella della scheda attiva: nessun
  ritorno al server, nessuna rifetch al cambio. Coinvolti: carosello, "Continua a
  guardare" (`ContinueRow` divide gli item per `mediaType`), "Da vedere"/"Visti di
  recente" (`LibraryShelf` in `page.tsx`), consigli degli amici
  (`RecommendationsSection` filtra con `useHomeType`), scaffali Scopri
  (`<DiscoverSections byType />`: ogni scaffale è diviso per `media_type` e le
  pillole "Per genere" passano ai generi serie via `HomeTypeSwap`) e le due sezioni
  cinema, che essendo solo film spariscono sotto "Serie TV". Fuori dalla home
  (Scopri, Cerca) non c'è provider: gate trasparente, `HomeTypeSwap` sceglie i film,
  tutto come prima.
- **Carosello in testa alla home** (2026-09-07): `HomeHero` (server, Suspense) → `HeroCarousel`
  (client): card locandina 2:3 grandi (200px, 240px
  da `lg`) con chip del motivo, `scroll-snap` nativo, autoplay 4 s (`AUTOPLAY_MS`), pausa su
  tocco/drag/rotella/mouse sopra e ripresa dopo 8 s (`RESUME_AFTER_MS`), fermo con
  reduced-motion. Dati `src/lib/home/hero.ts` (`getHomeHero`, React `cache()`): per tipo, a
  rotazione novità su streaming → "Per te" (`discoverByGenre` sui 2 generi più visti, dedotti
  da una query su `watch_entries` + `titles.genres`, id film↔serie tradotti da `genreIdsFor`)
  → trending → popolari; dedupe ed esclusione dei titoli già in libreria; max 10. Ranking puro
  in `hero-rank.ts` (Vitest). Le chiamate TMDB sono le stesse di Scopri (cache Next 1h).
  `TopBar` non è più usata in home; `EmptyHero` sta sotto il carosello senza quota nav.

### Watch tracking

- `src/lib/watch/actions.ts` (`"use server"`): all mutations of `watch_entries`. Every action returns `{ok, prev, entry}` snapshots so the toast can undo via `restoreEntry`. Actions call `revalidatePath` on `/`, `/library`, `/profile` and the title page.
- **Ordine cronologico.** `watch_entries.last_watched_at` (migration 0014, not null, default `now()`, indice `user_id, status, last_watched_at desc`) è l'ultima visione effettiva: l'import Netflix vi scrive la data del CSV (`lastDate`, l'RPC tiene la più recente con `greatest` su conflitto), le azioni Inizia/Finito/progresso scrivono `now()`; Voglio vederlo, voto, privato e Abbandona non la toccano. Home "In corso"/"Visti di recente" e libreria Sto guardando/Visti ordinano per questa colonna (`orderColumn()` in `queries.ts`; Da vedere per `created_at`, Abbandonati per `updated_at`). `updated_at` non serve a ordinare: l'import scrive a blocchi con lo stesso `now()` per RPC, quindi mostrava l'ordine dei chunk. Lo snapshot per l'undo la porta come campo opzionale.
- `src/lib/watch/queries.ts`: read side. `ENTRY_SELECT` embeds the title via the explicit FK hint `titles!watch_entries_title_id_media_type_fkey` (composite key `id, media_type`), so home/library render with zero TMDB calls. **Lists never select `titles.raw`** (~27 KB per row: with 1261 entries the profile serialised ~34 MB): `TITLE_LIST_COLUMNS` lists explicit columns and series progress reads `titles.seasons`, a stored generated column (`raw->'seasons'`, migration 0010); `availableSeasons()` accepts either `raw` or that array. Home `watching` is capped at 20; the library is paginated (`getLibraryPage`, 60 per page, `loadMoreLibrary` Server Action + "Carica altri"); profile statistics come from the SQL RPC `profile_stats(uid)` (films/series/episodes/minutes/top genres, ~400 bytes) plus two slim queries (wall posters, top rated).
- **Instant navigation.** Every `(app)` route has a `loading.tsx` with the real page geometry; `next.config.ts` sets `experimental.staleTimes` (dynamic 30 s, static 5 min) so visited pages reopen from the router cache; the five `TopNav` links use full `prefetch`. Title pages stream: `TitleBody` renders `TitleHeader` (image + trailer iframe) in the first chunk and puts the poster palette (`getPosterPalette`, `unstable_cache` 30 d per poster), the viewer entry, links, reviews and friends behind Suspense.

### Social (phase 4)

- `src/lib/social/actions.ts` / `queries.ts`: friendships (request → accept, block deletes the row and hides both users), reviews with spoiler flag + comments (depth-limited by trigger), recommendations to friends, notifications, feed.
- `activities` rows are written **only by DB triggers** (`log_watch_activity`, `log_review_activity`, `log_recommendation_activity`). The Netflix import (`src/app/(app)/import/netflix/`, parser in `src/lib/import/netflix.ts`) calls the RPC `import_watch_entries`, which sets `zapp.skip_activities` for the transaction so bulk imports do not flood the feed. The import runs as **short chunked Server Actions** driven by the client (`limits.ts`: match 30 candidates, confirm 25 titles per call; the last confirm chunk carries `final` and writes the `imports` row): one request held open for minutes is cut by the browser (Safari after 60 s, Chrome after 300 s) or by the Vercel function limit, and the rejected fetch used to surface as "Application error: a client-side exception" even though the server finished. Never move the per-title loop back into a single action. **Recognition _and_ writing run in the background, with no review screen** (2026-09-07): `ImportClient` only parses the CSV (one short action), then calls `startImport(candidates, totalRows)` and `router.push("/")`; `src/components/import/ImportProvider.tsx` (client, mounted in the `(app)` layout) owns both loops — match chunks `MATCH_CONCURRENCY` (3) at a time (parallel Server Actions land on different lambdas, each with its own 15 req/s TMDB throttle; `matchCandidates` no longer pauses between its batches of 10), then `mergeProposals`, then the confirm chunks **start by themselves** on the matched proposals. `ImportChip` above the nav shows "Riconoscimento n/N" then "Importazione n/N" with a bar, then the outcome ("n titoli importati, m già presenti, k non riconosciuti") with a link to the library, and the provider toasts + `router.refresh()` at the end. It lives as long as the app is open (no server queue on Hobby); written chunks stay, re-running the import is safe.
- **Netflix title matching** (`src/lib/import/`): `netflix-title.ts` (pure, Vitest) parses one CSV row: a season keyword in a middle part (Stagione/Season/Parte/Part/Volume/Libro/Book/Serie/Series + number, roman or ordinal word; Miniserie/Limited Series) splits `show: season: episode`; no keyword but ≥3 parts → show = first part, season = second (number from its trailing digit, "Stranger Things 4"), `altShow` = first two parts (tried on TMDB before `show`: "Chef's Table: Francia" is its own series); 2 parts → single with a `prefix` for the TV fallback. `netflix-rows.ts` (pure) parses dates with `inferDateOrder`: the whole file decides day/month order from its unambiguous rows (first number > 12 → D/M, second > 12 → M/D), default M/D (the Netflix export is US-style even for Italian accounts: with D/M a 2026 file had 24 dates in the future and ~1500 rows with day and month swapped, 2026-09-06). `netflix-rows.ts` groups rows: seasons keyed by label, unnumbered ones ("Stagione finale") numbered after the known ones by first watch date, episode = max("Episodio N", distinct episode titles), rewatches not double-counted, candidates sorted newest first. `netflix.ts` (`server-only`) matches: TV via `searchTv`, films via `searchMovies` (dedicated endpoints in the TMDB client), query variants full → no parentheses → main part → subtitle (≥2 words), comparison always against the full name with `titleSimilarity`: 1 exact after `normalizeTitle` (accents, parentheses, apostrophes, generic "- Il film" suffix, leading article), 0.9 when the TMDB name is the Netflix name plus a real subtitle, 0.88 when the Netflix subtitle (≥2 words) is the whole TMDB name (Netflix prepends the saga: "Pirati dei Caraibi - La maledizione della prima luna"), else Dice on bigrams; accept ≥ `MATCH_THRESHOLD` 0.85, ties → TMDB order. A 2-part single that is not a film is retried as an episode of the prefix series with an **exact** name only ("Star Wars: …" must not become "The Clone Wars"). `netflix-proposals.ts` `mergeProposals` (pure, run by `ImportProvider` once every match chunk is back) folds proposals with the same TMDB id (film written two ways; fallback episodes sum up; fallback + real series keeps the series progress). Unmatched proposals are just counted in the chip: there is no manual-search step any more. A `matchOne` that throws is retried once before being given up: a network hiccup used to cost the title for good.
- **Il numero di episodio viene dai nomi, non dal conteggio** (2026-09-07): ogni
  candidato serie porta `episodeTitles` (i nomi degli episodi della stagione più
  avanzata, max 60) e `matchOne` fa **una `getSeason`** sul risultato TMDB;
  `resolveEpisodeNumber` (`netflix-title.ts`, puro, Vitest) cerca quei nomi
  nell'elenco della stagione (uguaglianza dopo `normalizeTitle`, poi
  `titleSimilarity ≥ 0,95`) e prende il più avanti. Contare le righe funziona
  solo al primo import completo: su un export parziale ("ho visto le ultime tre
  puntate") dava "episodio 3" e l'import scartava la serie come passo indietro.
  Nessun nome riconosciuto → resta la stima per conteggio. Una riga
  `Serie: Episodio` (due parti) di una serie **già raggruppata dallo stesso CSV**
  non viene più cercata fra i film: `groupRows` la fonde nella serie e ne mette
  il nome fra gli `episodeTitles`. Un "A: B" che non è un film prova come serie
  prima il titolo intero e poi la sola parte A, sempre a nome identico.
- **L'import aggiorna le entry esistenti** (2026-09-07): `confirmNetflixImport`
  scrive dove `hasNewProgress` — film non ancora `watched`, serie il cui
  progresso nel CSV è più avanti di quello in libreria — e la RPC
  `import_watch_entries` (migration `0018_import_progress.sql`, applicata via
  MCP) ha lo stesso unico guard sul progresso, con `rating = coalesce(esistente,
nuovo)`. Prima entrambi i livelli saltavano qualunque riga con un voto o in
  stato `watched`: una serie finita non riceveva mai le stagioni nuove e
  reimportare scriveva **0 titoli** (righe `imports` del 2026-09-06: 6425 righe →
  `matched` 0). Unica entry intoccabile: una serie messa `watched` a mano, senza
  numero di stagione, non confrontabile.
- **Feed e notifiche a banner** (2026-09-06, su mockup dell'utente): ogni attività è un
  `ActivityBanner` (`src/components/social/ActivityBanner.tsx`) — backdrop 16:9 del titolo
  (ripiego: locandina), velo nero in basso e, sopra, l'amico con la sua foto profilo e
  cosa ha fatto; in basso a destra, **fuori dal `Link`**, lo slot `action`. La pagina
  Amici non ha più il titolo "Attività degli amici". Le notifiche che citano un titolo
  usano lo stesso banner (icona del tipo nello slot `action`); richieste e amicizie
  accettate restano righe compatte. **Like sulle attività**: `activity_likes` (migration
  `0016_activity_likes.sql`, applicata via MCP; RLS via `can_see_activity()`, stessa
  regola di `activities`), conteggio + `likedByMe` in `getFeed` con una sola query,
  `toggleActivityLike` (`social/actions.ts`, ottimistico in `ActivityLikeButton`) e
  trigger `notify_activity_like` → notifica di tipo `like` (il `check` su
  `notifications.kind` è stato riscritto per includerla).
  **Su desktop un banner sotto l'altro, come sul telefono** (2026-09-07, richiesta
  utente): niente più griglia a 2-3 colonne — feed e notifiche sono una colonna sola a
  tutte le larghezze. Cambiano le proporzioni: `aspect-[16/9]` su telefono e tablet,
  **`lg:aspect-[21/9]`** da `lg`, dove un 16:9 largo 860px sarebbe alto mezzo schermo.
  Perché il banner non diventi enorme, il gruppo è centrato e limitato
  (`lg:mx-auto`: `/friends` a 1360px = feed 860 + colonna laterale 380,
  `/notifications` a 940px); i `loading.tsx` hanno la stessa geometria. Il banner cresce
  tutto insieme (avatar `size-10 lg:size-12 xl:size-14` via `Avatar sizeClass`, testo
  13 → 16 → 18px, spazi e cuore da `lg`): mai tipografia da telefono dentro una card da
  860px. La colonna laterale di `/friends` è `lg:sticky` e la fila di amici diventa un
  elenco verticale da `lg` (`FriendsStrip`). In `/notifications` **c'è una sola forma di
  card**: le notifiche senza titolo (richieste, amicizie accettate) usano lo stesso
  banner con una sfumatura accent e l'icona del tipo in filigrana al posto
  dell'immagine, così l'elenco non è mai misto.
- **Profilo di un amico = il proprio profilo** (2026-09-07): `/u/[username]` usa gli
  stessi pezzi di `/profile` — `ProfileWallHeader` (muro di locandine personale +
  velo) con `AvatarHalo`, `ProfileStatsSection` (card ore/film/serie/episodi +
  "Generi più visti") e `TopRatedShelf` ("I voti più alti di X"), più gli scaffali
  Sto guardando / Visti di recente. `parseStats` sta in `src/lib/profile/stats.ts`.
  `profile_stats(uid)` è **security invoker**: chiamata sull'id dell'amico conta solo
  le entry che le policy lasciano vedere (`watch_entries_select_friends`: amici, non
  private), quindi per un estraneo statistiche e liste sono vuote e la pagina mostra
  "Nessuna attività visibile". `getFriendsWatching` porta anche `avatar_url`: il
  "Guardato da" sulla scheda titolo mostra le vere foto degli amici.
- Feed is cursor-paginated and aggregated in the query layer (same-day episodes of one series → one row; `finished` + `rated` within 10 min → one row).
- RLS policies rely on `are_friends()` / `is_blocked()` (SECURITY DEFINER). Views `user_search` and `reviews_with_counts` and the helper RPCs are intentionally SECURITY DEFINER with grants only to `authenticated` (migration 0005 revokes `anon`/`PUBLIC`); Supabase advisor warnings about them are accepted (see README).
- Moderation: reviews with `report_count >= 3` are hidden by query filter.
- **Avatar** (`src/lib/avatars.ts`, puro, Vitest): 18 icone predefinite, silhouette
  **bianca su trasparente** (`public/avatars/<id>.png`, generate da
  `scripts/generate-avatars.mjs` dalle sorgenti in `docs/design/brand/avatars`). Lo sfondo
  lo dipinge chi rende l'avatar (`Avatar`, `AvatarPicker`) con `avatarBackgroundCss`:
  colore pieno o sfumatura fra due colori scelti dall'utente, nero di default. Salvato in
  `profiles.avatar_url` come `/avatars/<id>.png?bg=<hex>[&bg2=<hex>]` (nessuna colonna in
  più: ogni query che legge `avatar_url` porta anche lo sfondo; URL senza query = nero);
  `parsePresetAvatar(url)` lo decodifica, `saveAvatarPreset(id, bg)` valida gli hex.
  Le foto caricate restano `object-cover` senza sfondo.
- `src/lib/rate-limit.ts`: per-user sliding window, in-memory by default, Upstash REST if `UPSTASH_REDIS_REST_URL/TOKEN` are set. Limits are declared inline at each call site in `social/actions.ts`.

### La domanda del giorno

Ogni giorno una domanda su film e serie (`daily_questions`, elenco scritto a mano,
una riga per data, `media_scope` movie|tv|any). Si risponde con **un titolo** e un
motivo **facoltativo** (140 caratteri); il giorno dopo, prima della domanda nuova,
si apre il **podio** dei tre titoli più scelti. Spec:
`docs/superpowers/specs/2026-09-08-domanda-del-giorno-design.md`.

- **Il giorno è Europe/Rome**, mai UTC: `romeDateString()`/`previousDay()` di
  `src/lib/cinema/dates.ts` lato codice, `(now() at time zone 'Europe/Rome')::date`
  in SQL. Una risposta per utente, correggibile fino a mezzanotte; dopo, la giornata
  è chiusa (policy e trigger, non solo interfaccia).
- Moduli: `src/lib/daily/` (`rank.ts` puro con Vitest — podio, pareggio a chi ha
  scelto per primo, motivo in evidenza, `cleanReason`; `queries.ts` server-only;
  `actions.ts` Server Actions) e `src/components/daily/`. In pagina è **un solo
  componente client** montato nello slot `right` di `TopNav` dal layout `(app)`,
  dietro `Suspense` come la campanella: rende l'icona accanto alla campanella e,
  alla prima apertura del giorno, l'overlay a tutto schermo (podio di ieri →
  domanda di oggi, due schermate a snap come `ScanMode`, chiusura che rimpicciolisce
  verso l'icona).
- **"Visto oggi" sta in `daily_question_views`, non in `localStorage`** (regola del
  progetto): per questo il popup non ricompare su un altro dispositivo.
- **Il podio di oggi non si legge**: `daily_question_podium(day)` ha `day < oggi`
  dentro la funzione, altrimenti si risponderebbe guardando i risultati. Per lo
  stesso motivo l'elenco delle risposte di oggi è **in ordine di tempo**, mai per
  voti. I conteggi di un giorno chiuso non cambiano più: stanno in `unstable_cache`
  con la data come chiave (nessun cron), letti col service client perché dentro
  `unstable_cache` non si possono leggere i cookie — ritorna solo numeri, mentre
  motivi e nomi si leggono con la sessione dell'utente.
- **Una funzione richiamata da una policy dev'essere eseguibile da chi scrive.**
  `is_today_question` era revocata da `authenticated` per non esporla come
  `/rest/v1/rpc/...` e ogni risposta falliva con `permission denied for function`
  (42501): la migration `0023` l'ha eliminata e ha messo la condizione dentro le tre
  policy. Stessa forma, nessun endpoint in più.
- Un **profilo privato** non è leggibile dagli estranei (`profiles_select_visible`),
  quindi la sua risposta compare come "Un utente": il composer lo dice prima
  dell'invio. Il motivo segnalato 3 volte sparisce dalla vista (colonna
  `report_count` dal trigger su `reports`, che ora accetta anche
  `target_type = 'daily_answer'`) ma **il suo voto resta nel conteggio**: altrimenti
  tre account d'accordo farebbero cadere un titolo dal podio.
- Domande: `pnpm tsx --env-file=.env.local scripts/seed-daily-questions.ts`
  (80 domande, una al giorno da domani, idempotente su `ask_on`). Finite le
  domande: niente popup e niente icona, nessun errore.
- Verifica: `node scripts/daily-question-check.mjs` prova dal lato client, con una
  sessione vera, tutto ciò che non deve riuscire (riscrivere ieri, rispondere a una
  domanda vecchia o al posto di un altro, sfogliare le domande future, leggere il
  podio di oggi, toccare `report_count`); crea utenti finti e li cancella.
  **La cache del podio vive anche in memoria nel processo**: per riprovare uno
  scenario con dati nuovi su un giorno passato bisogna riavviare il server, non solo
  svuotare `.next*/cache/fetch-cache`.

### Le chicche (citazioni fra film e serie)

Dentro **"Voti e recensioni"**, in fondo all'elenco, una recensione firmata da un
personaggio che — in un'altra opera — parla proprio di quel film: avatar
dell'interprete, voto, corpo, la stessa forma di `ReviewCard`. **Nessuna etichetta
e nessuna icona la marcano** (scelta utente 2026-09-08: "deve essere una recensione
normale"); sotto c'è solo il titolo dell'opera con stagione ed episodio
("The Big Bang Theory · S7E4"), che è il link alla sua pagina — alla stagione se la
conosciamo, perché le schede per singolo episodio non esistono. Titolo senza
chicche → il componente non rende niente e l'elenco è quello di sempre.

- `TitleTrivia` rende una `<article>` nuda: il contenitore è `ReviewsClient`, che la
  riceve come prop `trivia` (nodo server passato a un client component) e la mette
  in coda alle recensioni vere. Con zero recensioni vere e una chicca, il messaggio
  "Nessuna recensione" non compare. Stava in fondo alla pagina fino al 2026-09-08,
  poi l'utente l'ha voluta qui.
- Dati statici a mano in `src/lib/easter-eggs/data.ts` (nessuna tabella, nessuna
  migration). Quattro regole per entrare:
  1. **La battuta è vera**: `quote` è verificata su una fonte (script, IMDb, wiki
     della serie) e tradotta in italiano. Niente aneddoti "si dice che".
  2. **Il resto è in voce del personaggio**: `review` lo scriviamo noi attorno alla
     battuta e **deve contenerla parola per parola** (test). In pagina il corpo è
     **tutto dello stesso bianco** (`text-white/90`, richiesta utente 2026-09-08):
     una recensione normale non ha frasi evidenziate, e il grassetto sulla battuta
     vera la faceva leggere come una citazione riportata.
  3. **Il voto torna col testo**: `rating` è quello che darebbe quel personaggio
     (Fantozzi 1 alla Corazzata, Cartman 10 alla Passione), ma deve reggere la
     rilettura — chi scrive "resta un film godibile" non può dare 4, e Randal, che
     in Clerks difende Il ritorno dello Jedi, fa un'obiezione morale dentro un voto
     alto, non una stroncatura. Nessun test può controllarlo: si rilegge a mano.
  4. **Devono essere note in Italia entrambe le opere**, quella citata e quella che
     cita: una chicca sotto un titolo che nessuno apre non la vede nessuno, e una
     firmata da una serie mai arrivata qui non fa ridere. Per questo sono state
     scartate Spaced, Seinfeld, Flash Gordon e MacGyver, che pure avevano la
     battuta giusta e verificata.
- `find.ts` è puro e testato: `chiccaFor`, `splitAroundQuote` (isola la battuta
  dentro la recensione), `sourceLabel` / `sourceHref` (etichetta e link della
  fonte). I test controllano anche l'elenco: un solo record per titolo, nessun
  titolo che cita se stesso, ogni recensione contiene la sua battuta, voto 1–10.
  La fonte porta `season`/`episode`/`episodeTitle` **strutturati**, non una stringa
  già formattata: serve a costruire il link alla stagione.
- La faccia dell'avatar è l'interprete: `speaker.personId` → `getPerson(id)`
  (`person/{id}`, cache 30 g), **una sola chiamata TMDB e solo quando la chicca
  esiste**. Personaggi animati (Willie, Cartman) hanno `personId: null` e scendono
  sull'iniziale.

### Routes

Route groups: `(auth)` for login/signup, `(app)` for everything protected with the nav (`TopNav`, in basso su mobile e in alto da `lg`: Cerca, Libreria, Home, Cinema, Profilo). Title pages: `/title/movie/[id]`, `/title/tv/[id]`, `/title/tv/[id]/season/[n]`. Public profiles at `/u/[username]`. `src/app/api/search/route.ts` returns up to 20 TMDB `search/multi` results with flatrate providers from **one batch query on `title_providers`** (no per-result title fetch); `SearchClient` fires a request 60 ms after each keystroke, aborts the previous one, caches results per query and shows the filtered results of a cached prefix while waiting, never emptying the grid.

- **Ricerche recenti** (2026-09-08, richiesta utente): toccando la barra a campo vuoto
  compaiono **sotto di essa** i titoli gia' aperti dalla ricerca (elenco compatto:
  locandina 36x54, titolo, "anno · Film/Serie"), e spariscono appena il campo perde il
  fuoco — non uno scaffale fisso, non una sezione. Sotto resta Scopri come prima.
  Tabella `search_history` (migration `0024`, applicata via MCP; pk
  `user_id, title_id, media_type`, RLS solo proprietario, `anon` revocato, trigger
  `prune_search_history` che tiene le 20 piu' recenti): **niente localStorage**, regola
  del progetto. La riga porta **titolo, locandina e anno gia' dentro** invece della sola
  chiave: la riga di `titles` viene scritta dopo, aprendo la scheda, mentre il pannello
  deve comparire subito — cosi' la lettura (`src/lib/search/queries.ts`
  `getRecentSearches`, 12 voci, prop del server a `SearchClient`) e' una query sola,
  senza join ne' chiamate TMDB. Scrive `rememberSearchedTitle`
  (`src/lib/search/actions.ts`) sul `pointerdown` del risultato — subito dopo si naviga
  via — con upsert: un titolo cercato due volte risale in cima invece di duplicarsi;
  stessa azione toccando una voce dello storico. `clearSearchHistory` per "Cancella".
  Il pannello non si smonta all'istante al `blur` (`BLUR_HIDE_MS` = 150 ms): su un tocco
  il `blur` arriva prima del `click` e la riga sparirebbe sotto il dito.

### Cinema

- Sorgenti dietro `src/lib/cinema/source.ts` (`getCinemaSource()`, `isCinemaEnabled()`):
  `CINEMA_SOURCE` = `mymovies` (default, gratis, HTML pubblico), `mock` (anche via
  `MOVIEGLU_MOCK=1`), `movieglu` (chiave, codice legacy tenuto per eventuale ripristino),
  `off` (sezione assente). `src/lib/cinema/showtimes.ts` è la facciata comune
  (`getFilmShowtimes`, `getCinemaProgramme`, `getNearbyCinemas`): con MyMovies il
  parametro `date` è ignorato, **solo il programma di oggi**.
- `src/lib/cinema/mymovies/`: `parse.ts` (puro, test Vitest su fixture ridotte in
  `__fixtures__/`: `parseProvinceIndex`, `parseNowShowing`, `parseCinemaPage`,
  `parseFilmProvincePage`, `parseMappa`, `slugify`, `formatFromLabel`,
  `parseProvinceList`, `provinceExists`, `provinceTokens`, `matchProvinceSlug`); `client.ts`
  (`server-only`, `fetchText` con User-Agent `Zapp/1.0 (+NEXT_PUBLIC_APP_URL)`, timeout
  8 s, **throttle 4 richieste/s, mai dal client**, `unstable_cache` per pagina: indice
  provincia e pagina città 6 h, programma cinema/film-in-provincia 30 min, mappa e
  scheda film 30 giorni; **dopo un 403/429 si smette di chiedere per 60 s**: MyMovies
  blocca l'IP che insiste e insistere allunga il blocco); `venues.ts`
  (`getProvinceVenues`/`venuesFor`: indice provincia + coordinate da `cinema_venues`
  (30 giorni) o `mappa.asp`, upsert col service client; `resolveProvinceSlug` per
  `location.ts`); `match.ts` (`getMyMoviesFilmId`: titolo TMDB/originale contro
  `parseNowShowing`, salvato in `cinema_films.mymovies_film_id`, 24 h; `filmSummaryForMyMovies`);
  `showtimes.ts` (`nearbyCinemas`, `filmShowtimes`, `cinemaProgramme`, con distanza
  haversine e raggio `CINEMA_RADIUS_KM = 25`). `match.ts` (radice) espone l'adapter
  `getSourceFilmId(title, geo)` unico per la UI e `recentlyReleased(title)`.
- **Un cinema si trova in tre modi, non uno** (audit copertura 2026-09-08):
  1. **La pagina del capoluogo**, `/cinema/<prov>/<capoluogo>/` (`parseCityIndex`, forma
     diversa dall'indice: il nome sta nel `title="Programmazione del cinema X di Y"`).
     L'indice `/cinema/<prov>/provincia/` elenca **solo i comuni diversi dal
     capoluogo**: senza questa pagina Milano perdeva 27 sale in città (Anteo, UCI
     Bicocca, CityLife, Notorious Merlata…) e ne mostrava 15 in periferia; in Italia
     erano 314 sale su 656 invisibili, quasi tutte quelle "famose".
  2. **Lo slug giusto**: per dieci province l'URL vuole il nome del **comune**
     capoluogo, non della provincia (`capitalSlug`: monzabrianza→monza,
     forlicesena→forli, pesaroeurbino→pesaro, verbanocusioossola→verbania,
     massacarrara→massa, barlettaandriatrani→barletta, e le quattro sarde abolite).
     `/cinema/monzabrianza/provincia/` è **sempre vuota**, anche con `?f=`: tutta Monza
     e Brianza non vedeva un solo cinema né un solo orario.
  3. **Il catalogo in `cinema_venues`**, che copre le province vicine: il raggio di
     25 km scavalca quasi ovunque un confine (da Monza il multiplex più vicino è a
     Milano, da Prato quelli di Firenze) mentre gli elenchi MyMovies sono per
     provincia. `nearbyKnownVenues` (riquadro lat/lng, `boundingBox` in `geo.ts`) le
     unisce a quelle della propria provincia, `nearbyProvinceSlugs` dice a
     `filmShowtimes` quali altre province interrogare (al massimo 2 in più).
     La tabella si riempie con l'uso e con
     `pnpm tsx --env-file=.env.local scripts/warm-cinema-venues.ts [slug…]`
     (una richiesta ogni 700 ms, si ferma da sola al 403).
  Perciò **`province_slug` non è più obbligatorio**: senza (Nominatim e MyMovies
  chiamano diversamente qualche zona, per esempio il Sud Sardegna, che per MyMovies è
  ancora Carbonia Iglesias e Medio Campidano) home, `/cinema` e scheda titolo usano le
  sale note nel raggio invece di mostrare "Zona non coperta".
- **L'id `?f=` del film non sta più nell'indice di provincia** (cambio MyMovies visto
  il 2026-09-08: zero link `?f=` su tutte le province): `getMyMoviesFilmId` lo cerca
  nella pagina del capoluogo (`parseNowShowing`, che ora legge sia i link col `title`
  sia quelli col solo testo) e, se lì non c'è, prende titolo e slug dalle locandine
  dell'indice (`parseFilmPageLinks`) e legge `idfilm` dalla scheda del film
  (`parseFilmId`, cache 30 giorni). Senza questo, "Oggi al cinema vicino a te" sulla
  scheda titolo non compariva più per nessun film nuovo.
- **Il posto lo sceglie l'utente da un elenco, non lo indovina una ricerca**
  (2026-09-08): `src/data/comuni-it.json` ha tutti i **7.904 comuni** italiani
  (`[nome, sigla, lat, lng, popolazione]`, ISTAT + coordinate ufficiali; i 48 comuni
  nati da fusioni recenti geocodificati una volta con Nominatim).
  `src/lib/cinema/comuni.ts` (puro, Vitest) espone `searchComuni` (prefisso prima,
  poi "contiene", i più popolosi in testa; accenti e apostrofi ignorati),
  `findComune`, `nearestComune`, `comuneLabel` ("Ossona, MI") e
  `PROVINCE_SLUG_BY_SIGLA` (sigla → slug MyMovies, generata dall'elenco ufficiale;
  solo `SU` è `null`, il Sud Sardegna per MyMovies non esiste ancora).
  `ComuneSearch` (client) chiede `/api/comuni?q=` a ogni tasto (80 ms di debounce,
  elenco in memoria, nessuna chiamata esterna) e mostra "Ossona · MI"; scegliendo
  parte `setLocationByComune(nome, sigla)`, che **rilegge la riga dal file** e salva
  coordinate, etichetta e provincia esatte. La vecchia `setLocationByQuery` (testo
  libero → Nominatim → primo risultato) non esiste più: prendeva il primo omonimo e
  su una provincia scritta a mano cadeva in aperta campagna. Anche il GPS ora ricava
  la provincia dal comune più vicino (`nearestComune`) invece che dai nomi di
  Nominatim, che resta solo per l'etichetta ("Isola, Milano") ed è facoltativo.
- `location.ts` / `geocode.ts`: posizione in `user_locations` (tabella privata, RLS solo
  proprietario, migration `0009_user_locations.sql`, mai in `profiles` che è leggibile
  da tutti); geocoding Nominatim (rate limit 10/min per utente) calcola anche
  `user_locations.province_slug` dalla `county` (o `city`) di Nominatim via
  `resolveProvince` (`venues.ts`). **La provincia si riconosce dall'elenco ufficiale
  MyMovies, non dagli orari** (2026-09-08): `mymovies.provinceList()` legge una volta al
  mese l'hub `/cinema/` e `parseProvinceList` ne ricava le 110 voci slug+nome, che
  `matchProvinceSlug` confronta coi nomi Nominatim dopo `provinceTokens` (toglie
  "e/di/della/nell/città metropolitana" da **entrambi** i lati: "Monza e Brianza" →
  `monzabrianza`, "Reggio nell'Emilia" → `reggioemilia`); un token solo decide se la
  provincia è unica ("Bolzano/Bozen"), mai se è ambiguo ("Reggio"). Ripiego senza
  elenco: GET dell'indice provincia, dove una provincia vera si riconosce dall'`<h1>`
  (`provinceExists`), **non** dai cinema in pagina — l'indice elenca solo le sale con
  spettacoli oggi e **di notte è vuoto anche per Milano** (verificato il 2026-09-08 alle
  02:00 su milano, bologna, napoli, firenze, bergamo). Era proprio quel controllo a far
  salvare `province_slug = null` a chi dava la posizione di notte, e la sezione cinema
  restava "Zona non coperta" per sempre: il `null` non si ripara da solo. Per lo stesso
  motivo `save()` non azzera la provincia già salvata quando MyMovies non risponde
  (`status: "unknown"`). Chi **scrive** una provincia riceve da Nominatim il centro
  geometrico del poligono (spesso in campagna): `geocodeProvinceCity` rifà la ricerca con
  `featureType=city` e la posizione viene salvata sul capoluogo, così "il cinema più
  vicino" parte da una città vera. Provincia non riconosciuta → `province_slug` resta
  `null` e la UI mostra "Zona non coperta".
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
- **Estetica cinema** (2026-09-07, scelta dall'utente su canvas di 3 opzioni per sezione,
  generatore in scratchpad `cinema-mock/gen.mjs`): fondali sempre `original` e
  `unoptimized` (nessun `srcset`: l'URL `original` arriva intero, come la banda della
  scheda titolo). **Da `md` i banner di home hanno proporzioni fisse** (`md:min-h-0`): il
  fondale 16:9 li copre centrato (`md:object-center`, taglio simmetrico sopra/sotto),
  niente più strisce da 320px su desktop. `PlanCard` resta 21:9 (`md:aspect-[21/9]`);
  `CinemaEntry` è più alto perché la copertina si veda: `md:aspect-[16/9]`,
  `lg:aspect-[2/1]` (richiesta utente 2026-09-07). Sotto `md` restano le altezze minime di
  prima.
  - Home, `PlanCard` ("Stasera A · Cinematico"): banner `min-h-[292px]` (21:9 da `md`) col
    fondale del film, velo dal basso e da sinistra, pillola in vetro "Stasera"/"Domani"/data
    in alto a sinistra, **conto alla rovescia in cifre grandi e leggere** (`font-light`,
    `tabular-nums`, `countdownParts` in `dates.ts`) sopra titolo e "orario · sala"; a destra
    (sotto, su mobile) Biglietto in accent — apre `QrFullscreen` coi QR importati o
    l'originale, altrimenti "Biglietti" = biglietteria — e Indicazioni in vetro; senza
    biglietto anche `TicketImport compact`. `TicketShape` resta solo nel foglio biglietti.
    **Il banner dura un'ora dall'inizio** (richiesta utente 2026-09-07): `planPhase`
    (`dates.ts`, puro, Vitest) dà la fase della serata — `upcoming` fino a +60 min,
    `during` mentre il film è in sala (inizio + 20 min di pubblicità + `titles.runtime`,
    120 min se manca), `ended` per una settimana dopo, poi `gone`. `getHomePlan`
    (`queries.ts`, al posto di `getUpcomingPlan`) legge in una query le serate della
    finestra e in una seconda le durate, e ritorna insieme il banner e l'ultima serata
    finita; `TonightAtCinema` rende l'uno o l'altra. Durante il film la home non mostra
    niente; a film finito, al primo rientro nell'app, `PostShowCard` (stessa forma del
    banner) chiede "Com'è andata?": L'ho visto → `markWatched` e "Ti è piaciuto?" (voto
    1–10 come nella scheda titolo, o "Salta il voto"), Non ci sono andato → via e basta;
    in entrambi i casi la serata viene cancellata, così la domanda non torna.
    In alto a destra del banner un tondo in vetro (`Icon name="more"`) apre il foglio
    "La tua serata": **Cambia orario** (`getPlanAlternatives` in `plans.ts`: altri
    spettacoli di oggi dello stesso film **nella stessa sala**, dal programma già in
    cache per la home e `/cinema`, quindi nessuna richiesta in più; `movePlan` riscrive
    `starts_at`/`format`/`booking_url`), Rimuovi il biglietto (era una pillola a sé) e
    Rimuovi la serata.
  - Home, `CinemaEntry` ("Al cinema oggi B · Film del giorno"): `Link` a `/cinema` col
    fondale del film dato in più sale vicino all'utente (`filmOfTheDay` in
    `programme.ts`), titolo grande, "In N sale, il prossimo alle HH:MM · altri M film
    oggi", pillola "Al cinema oggi · <città>", tondo/bottone in vetro. Senza posizione o
    programmazione: fondale del primo `now_playing` IT di TMDB e l'invito a dire dove si è.
    **Da `lg` la parete di locandine** (richiesta utente 2026-09-07): sulla destra (68% della
    card) fino a `WALL_MAX` = 9 locandine `w342` dei film di oggi (o dei `now_playing` nel
    ripiego), alte 236/212px alternate (300/268 da `xl`, dove la card è più
    alta), in prospettiva (`rotateY(-14deg)`, origine a destra), ombra forte, `mask-image` che le sfuma sotto il testo; il fondale ha un velo
    nero extra (`bg-black/45`) perché le locandine restino le protagoniste; testo e bottone
    "Tutta la programmazione" nella colonna sinistra (`lg:max-w-[42%]`).
    **Il fondale ruota in continuo** (richiesta utente 2026-09-07): `BackdropRotator`
    (client) dissolve fra i fondali `original` dei film in programmazione (film del
    giorno per primo, max `ROTATION_MAX` = 8), 7 s l'uno (`SLIDE_MS`) + 1,4 s di
    dissolvenza, zoom lento `.backdrop-kenburns` (globals.css) su ciascuno; monta solo
    corrente e successivo (mai 8 `original` insieme), primo fondale nell'HTML del server,
    fermo con reduced-motion. Testo e parete non ruotano.
    I dati vengono da `getTodayProgramme()` (`today.ts`, server-only, React `cache()`):
    le 10 sale vicine coi preferiti in testa, programma delle prime 5, `aggregateByFilm`;
    **condiviso con `/cinema`**, quindi la home paga le stesse pagine MyMovies (cache
    30 min) dentro il suo `Suspense`.
  - `/cinema` ("Cinema A · Copertine"): `ViewSwitch` (pillola in vetro Per film | Per
    cinema, voce attiva in rilievo) + `FavoritesChip`. `FilmsView`: card per film col
    fondale 16:9, badge "N sale" in vetro, titolo sopra l'immagine, sotto la sala
    preferita/più vicina e i 3 prossimi orari a pillola; `lg:grid-cols-3`. `VenuesView`:
    card per sala (nome, "Il più vicino", indirizzo · km · min a piedi, `FavoriteStar`,
    Indicazioni) e scaffale delle sue locandine 96px col prossimo orario in badge (viola
    = il più imminente della sala, barrato = finiti): tocco → foglio biglietti di quello
    spettacolo, titolo → scheda. `loading.tsx` ha la stessa geometria.
  - Scheda film ("Scheda B rivista"): `ShowtimesClient hero` = `NextShowingCard` (il
    primo spettacolo futuro fra tutte le sale, `nextShowing` in `programme.ts`: orario in
    cifre grandi e leggere, formato, sala con stella, distanza, Biglietti = foglio,
    Indicazioni da `lg`, bagliore viola) e sotto **tutte le sale, tutti gli orari**
    (`CinemaCard variant="row"`: niente scatola, filo `border-t white/8`, pillole a capo,
    nessun `limit`). Anche `/cinema?film=` usa `hero`.
- **Cinema preferiti** (migration `0015_cinema_favorites.sql`, applicata via MCP):
  `cinema_favorites (user_id, cinema_id, position 1–3)`, RLS solo proprietario,
  `cinema_id` = id della sorgente attiva (come `cinema_links`: cambiando `CINEMA_SOURCE`
  va svuotata). `getFavoriteCinemaIds()` (`queries.ts`, React `cache()`) si legge in
  `Promise.all` con la posizione; `favorites.ts` (puro, Vitest) `orderCinemas` /
  `orderShowtimes` mettono i preferiti in testa nell'ordine scelto e il resto per
  distanza, marcando `Cinema.favorite`; `nearestCinemaId` dà il badge "Il più vicino"
  (non più `i === 0`). In `/cinema` l'ordine precede lo `slice(0, 5)` del programma, così
  gli orari dei preferiti arrivano sempre; `byFilm` preferisce il cinema preferito al più
  vicino. `toggleFavoriteCinema` (`favorites-actions.ts`) prende la prima posizione
  libera, oltre 3 → errore in toast. UI: `FavoriteStar` (stella in vetro su ogni card,
  ottimistica + `router.refresh()`), `FavoritesChip` ("★ Preferiti n/3" accanto ai
  filtri di `/cinema`, sheet "I tuoi cinema" coi 10 vicini), badge "Preferito" in
  `CinemaHeader`.
- **Biglietteria per spettacolo** (`src/lib/cinema/booking/`, server-only, spec
  `docs/superpowers/specs/2026-09-06-cinema-biglietti-design.md`): `resolveChainLinks(q)`
  interroga i **JSON pubblici** delle catene riconosciute da `chainFor` (nessun HTML, nessuna
  sessione): UCI (`UCI_API_BASE` in `config.ts`; sito **senza `www`**, con `www` c'è
  Queue-it; livello 2 = `cart_link` → login UCI → carrello), Notorious (`prenoRapido.php`,
  servono `Referer` + `X-Requested-With`; livello 2 = `seatsframe.php?sc&se&sp`, che
  incapsula il frame Webtic: login Webtic, poi posti), Cinelandia (`webtic.ts` condiviso:
  `POST restapi.webtic.it/Webtic/CallOldWebtic` getFullScheduling con `localId` fisso
  delle 12 sedi in `CINELANDIA_VENUES`, match per token nel nome; livello 2 = frame
  `secure.webtic.it/angwt/webtic.aspx?lng=it&lid&tpl=default&kid=1#/shoppingmode/it/1/{local}/{event}/{perf}`,
  livello 1 = `#/event/it/1/{local}/{event}` senza login; ripiego pagina film WordPress),
  The Space (`showings/cinemas|films`; solo livello 1 `/cinema/{name}/film/{slug}`). Parti
  pure testate su fixture in `__fixtures__/` (`match.ts`: `nearestVenue` 500 m, `bestByName`
  via `titleSimilarity` ≥ 0,85, `bestByToken`, `hhmm`/`dateOf`); `fetch.ts` = `unstable_cache`
  per URL (cinema 24 h, film 6 h, programmazione 30 min), throttle 4/s, timeout 6 s, `null` →
  gradino inferiore. Cascata in `links.ts` `resolveShowingBookingLinks`: manual → livello 2
  (per orario) → livello 1 → sito → home catena → Google; `Showing.bookingLevel` 2|1|0 e la
  CTA dice "Scegli i posti" a livello 2. Notorious: `Title` prima di `OriginalTitle`
  ("Cinemamma - …" ha lo stesso originale). `booking_url` del piano = link dello spettacolo.
- **Biglietti in app** (migration `0017_cinema_tickets.sql`, via MCP): `cinema_plans.ticket_codes
text[]`, `ticket_path`, `ticket_added_at`; bucket **privato** `tickets` (10 MB, jpeg/png/webp/pdf,
  policy per cartella `auth.uid()`), path `{uid}/{planId}/{ts}.{ext}`, URL firmato 1 h in
  `getUpcomingPlan` (`{plan, ticketUrl, userId}`). Lettura QR **nel browser**
  (`src/lib/qr/decode.ts`): `jsqr` su canvas (1600 px, poi 0,5× e 2×, più QR per immagine
  coprendo quelli letti), PDF con `pdfjs-dist` (import dinamico, fino a 10 pagine rese a 2× e,
  se quella pagina non dà QR, a 3,5×; il testo e i QR di una pagina stanno in due `try`
  separati, così l'uno non si porta giù l'altro; worker
  same-origin `public/pdf.worker.min.mjs` + `public/pdfjs-wasm/` (JBIG2) copiati da
  `scripts/copy-pdf-worker.mjs` **in testa a `pnpm dev`/`pnpm build`** (pnpm 10 non esegue i
  `pre*`), gitignored e ignorati da eslint: `new URL(import.meta.url)` non regge
  in `next build`).
  **Su iPhone non funzionava niente** (2026-09-07, terza segnalazione dell'utente; riprodotto
  con Playwright WebKit sul PDF Notorious `public/info/Biglietti minecraft.pdf`): pdf.js 6 usa
  `Map.prototype.getOrInsertComputed` in `page.render` e i `ReadableStream` asincroni iterabili
  in `page.getTextContent`, **due API che WebKit non ha**, quindi su Safari/iOS ogni biglietto
  finiva in "QR non riconosciuto" (`TypeError` inghiottito dal `catch` di `TicketImport`).
  `src/lib/qr/pdf-polyfills.ts` (`installPdfPolyfills()`, chiamata prima dell'import di pdf.js)
  li aggiunge, più `Map/WeakMap.getOrInsert` e `Math.sumPrecise`. Il build `legacy` di pdf.js
  **non** basta: inciampa sullo stesso `ReadableStream`. Regola: ogni modifica qui si verifica
  con Playwright **WebKit**, non solo Chrome — su Chrome desktop quelle API ci sono già e il
  bug è invisibile. Server Actions `tickets.ts` `attachTicket`/`removeTicket` (≤ 10 codici,
  ≤ 2 KB, path nella cartella giusta); `cancelPlan` rimuove anche l'oggetto. UI:
  `TicketImport` (upload col client browser + decodifica + action; senza QR resta
  l'originale), `TicketQr` (`qrcode` → data URL, tocco → `QrFullscreen` bianco a tutto schermo,
  un QR per schermata, codice in mono, "Vedi l'originale").
  **"Sono qui"** (richiesta utente 2026-09-07): col biglietto caricato, `PlanCard` mostra
  accanto a "Biglietto" una pillola in vetro che apre `ScanMode` — la schermata per
  l'addetto all'ingresso: **fondo nero e solo i QR** (nessun codice, nessun titolo; il QR
  sta su una piastra bianca, che serve allo scanner), uno per schermata, avanti e indietro
  con le frecce o scorrendo (snap + puntini + ← →), `Wake Lock` finché è aperta.
  L'ultima schermata dice **i tuoi posti**: `cinema_plans.seats`/`hall` (migration
  `0019_cinema_seats.sql`, via MCP) riempiti al caricamento del biglietto da `parseSeats`
  (`src/lib/cinema/seats.ts`, puro, Vitest: "Fila G Posto 12", "FILA: G - POSTO: 12",
  "Posti: G12, G13", "Sala 5") sul **testo del PDF** (`decodeTicket` ritorna anche `text`,
  da `getTextContent` delle prime 3 pagine; da un'immagine non c'è testo, i posti li
  scrive l'utente in quella schermata con `cleanSeatInput` + `setSeats`).
  `removeTicket` azzera posti e sala insieme ai QR.
- **Forma biglietto**: `TicketShape` (backdrop 16:9 + locandina + titolo, orario 40px, data,
  formato, cinema, perforazione con tacche `notch` del colore del fondo, tagliando =
  `children`) usato da `TicketSheet` (`Sheet size="tall"` = `min(90svh, 900px)` scorrevole;
  dopo "Ci vado" resta aperto col tagliando "Serata salvata" + `TicketImport`) e da `PlanCard`
  in home (QR o "Aggiungi il biglietto", Biglietti/Indicazioni, "Com'è andata?" invariato).
  **Build**: mai due `next build` nello stesso `.next` (le sessioni parallele si rompono a
  vicenda: TypeError anonimo / ENOENT `pages-manifest.json`); per verificare usare un worktree
  (`Zapp-tickets`).
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
  chiaro e bianca su scuro via `prefers-color-scheme` nell'SVG). Path della Z tracciato
  dal JPEG (soglia + contorno + Douglas-Peucker); cambiando le icone alza `?v=` in
  `manifest.ts`.
- **Icone della nav** (solo mobile): il set del marchio, sorgenti
  `docs/design/brand/ui-icons/ICONE UI-*.png` (glifo nero su trasparente, 2134px).
  `scripts/generate-nav-icons.mjs` (sharp) centra ogni glifo sul suo bounding box e lo
  ritaglia in un riquadro **della stessa misura per tutte** (`BOX`), così la scala del
  disegno — e quindi lo spessore del tratto — resta uniforme nella barra; esce una
  maschera 96px in `public/icons/nav/{home,search,library,cinema,friends,profile}.png`
  (1-3 KB l'una). `TopNav` le rende come `mask-image` su `bg-current`: prendono
  `currentColor` e seguono lo stato attivo come le vecchie SVG inline. La Z del marchio è
  la voce Home; il biglietto è Cinema. Le sorgenti stanno fuori da `public/` apposta
  (100 KB l'una: servite e precacheate dal service worker per niente).
- **Home, "Continua a guardare"** (2026-09-06, su mockup dell'utente): niente più hero a
  tutta larghezza. La home autenticata è `TopBar "Home"` + una fila di card 16:9
  (`ContinueCard`, 240px mobile / 300px da `lg`) con una **grafica ufficiale del titolo**
  — mai il fotogramma dell'episodio (richiesta utente 2026-09-07: "voglio la copertina
  della serie, e ogni tanto cambia, come Netflix") —, durata dell'episodio e barra di
  avanzamento sopra l'immagine, titolo e "S1:E5 · nome episodio" sotto; l'episodio da
  riprendere resta nel testo (il successivo all'ultimo visto, `nextEpisode`, l'ultimo se
  la serie è finita); in alto a destra della card il tondo in vetro che apre la
  piattaforma (`providerHref`). **L'immagine cambia a ogni visita**: `getTitleImages`
  (`movie|tv/{id}/images`, `include_image_language=null,it,en`, cache Next 7 g) e le
  funzioni pure di `src/lib/tmdb/backdrops.ts` (Vitest) — `rankBackdrops` mette davanti
  le grafiche **senza scritte** (`iso_639_1` null, l'artwork pulito che usa Netflix), poi
  per voto e larghezza, scarta sotto 1920px (a meno che nessuna ci arrivi) e ne tiene 8;
  `pickRotating(list, seed)` sceglie con `seed` = contatore di rese della fila + id del
  titolo, così a ogni visita si vede un'altra grafica e due card vicine non cambiano in
  sincrono. Senza `/images` resta il `backdrop_path` già in cache nel DB.
  `getContinueItems` (`src/lib/watch/continue.ts`, server-only) fa per tessera **una
  `getTitleImages` e, per le serie, una `getSeason`** (numero, nome e durata
  dell'episodio) **in parallelo** — memo + throttle del client TMDB —: la fila sta dietro
  un `Suspense` (`ContinueRowSkeleton`) così il resto della home non l'aspetta.
  L'immagine è chiesta in `original` con `sizes` reali: il loader scende a w780/w1280,
  mai il w300 di TMDB. L'hero (`HeroWatching`, `WatchingCard`,
  `PlusOneButton`) è stato rimosso; resta `HeroScrim` per la home vuota
  (`EmptyHero` + `PlatformLauncher`).
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
- **Anteprima al passaggio del mouse** (2026-09-07, richiesta utente): su desktop, il
  mouse fermo **600 ms** (`OPEN_DELAY_MS`) su una copertina della home apre una scheda
  col trailer che parte, il fotogramma, titolo, voto, anno, durata/stagioni, generi,
  trama e loghi delle piattaforme. `PreviewLayer`
  (`src/components/home/PreviewLayer.tsx`, client) avvolge il contenuto della home e
  ascolta **un solo `pointerover` sul documento**: le copertine si dichiarano con
  `data-preview="<href>"` (prop `preview` di `PosterCard`, che resta un componente
  server; in `DiscoverSections` la accende `byType`, che è già il segnale "siamo in
  home"). Fuori dalla home nessuna copertina la espone. Il layer non aggancia nulla
  senza `(min-width:1024px) and (hover: hover) and (pointer: fine)`: telefono e tablet
  non pagano niente. `PreviewCard` sta in un **portal su `body`** — dentro lo scaffale,
  che è `overflow-x-auto`, verrebbe tagliata — ed è posizionata da `previewPlacement`
  (`src/lib/preview/position.ts`, puro, Vitest): centrata sulla copertina e riportata
  dentro la finestra ai bordi dello scaffale. Dati da `/api/preview/[mediaType]/[id]`,
  chiesti **su intenzione** e tenuti in una `Map` per sessione: `getOrFetchTitle` (che è
  la fetch della scheda titolo, quindi l'anteprima ne scalda la cache) +
  `getOfficialTrailers`, DB-first. Senza trailer ufficiale italiano la scheda si apre
  lo stesso col fotogramma e le info: l'hover fa sempre la stessa cosa. Il trailer è
  **ritagliato** (`trailerCoverBox`, stesso modulo): il riquadro resta pieno e le bande
  nere di YouTube restano fuori — l'opposto della scheda titolo, dove il trailer si deve
  vedere intero. La scheda è larga 480 / 540 / 600 / 660px secondo la finestra
  (`previewWidth`, puro, Vitest; titolo e trama salgono di un gradino da 600px in su):
  su desktop deve essere chiaramente una scheda, non una copertina ingrandita (richiesta
  utente 2026-09-07). L'iframe è disposto 3× e ridotto con `transform` (`YT_SCALE`),
  altrimenti YouTube servirebbe 360p, e si scopre **3,5 s dopo il "playing"**
  (`REVEAL_DELAY_MS`): prima YouTube tiene i propri comandi in mezzo al frame. Allo scroll
  la scheda **insegue la copertina** e si chiude solo quando quella esce dallo schermo:
  chiudere a ogni evento di scroll la faceva sparire ogni 4 secondi, perché il carosello
  in testa alla home scorre da solo. Fuori anche il carosello stesso (le sue card si
  muovono) e "Continua a guardare" (card 16:9, non copertine).
- **Navigazione**: una sola barra, `TopNav` (`src/components/layout/TopNav.tsx`),
  84px alta sotto `lg`, 72px da `lg`, `z-30`, **stessa struttura a tutte le larghezze**: colonna sinistra vuota
  (nessun wordmark "Zapp." nell'app: il logo è la Z della voce Home),
  pillola centrale con le 5 voci — Cerca, Libreria, **Home**, Cinema, Profilo: la Z
  del marchio sta **al centro** della barra e l'ordine è quello, non alfabetico
  (richiesta utente 2026-09-08). Amici non è una voce: sta dentro Profilo (vedi sotto) —
  (icone del set del marchio su mobile, solo testo da `lg`, indicatore attivo
  che scorre via `motion.span layoutId`), a destra lo slot `right` (campanella notifiche
  passata dal layout server: nessuna campanella nelle pagine). **Sotto `lg` è fissa in
  basso** (`bottom-0` + `env(safe-area-inset-bottom)`, velo `from-black/95` sfumato verso
  l'alto sempre visibile), **da `lg` è fissa in alto** (trasparente sopra hero/backdrop;
  dopo 16px di scroll compare il velo e la pillola diventa vetro scuro). Nessuna sidebar,
  nessuna seconda barra: `PageShell` non ha `lg:pl-*`, i `sizes` dei backdrop sono `100vw`,
  le barre fisse usano `lg:left-0`. Lo spazio occupato dalla nav è nelle variabili
  `--nav-top` / `--nav-bottom` (`globals.css`: 0/84px sotto `lg`, 72px/0 da `lg`), mai
  numeri fissi: le testate iniziano a
  `pt-[calc(env(safe-area-inset-top,0px)+var(--nav-top)+20px)]` col titolo alto 40px
  (`TopBar` è statica con lo stesso padding), i bottoni assoluti in testata
  (`BackButton`, `ShareButton`, controlli profilo) stanno a
  `top-[calc(env(safe-area-inset-top,0px)+var(--nav-top)+20px)]`, la
  banda della scheda titolo sotto `lg` a `+16px` (`BAND_CLASS`, vedi Fondale) e i suoi
  comandi 12px più giù (`+28px`), il campo di Cerca è sticky da `top-0`
  con `pt-[calc(env(safe-area-inset-top,0px)+var(--nav-top)+14px)]`. In basso
  `PageShell` riserva `pb-[calc(env(safe-area-inset-bottom,0px)+var(--nav-bottom))]`;
  le pagine chiudono con `pb-16`; solo la scheda titolo/stagione tiene `pb-36` su mobile
  per la barra azioni fissa (`TitleActionsBar`, che non è una nav) che, come il bottone
  di import e il `Toaster`, si alza di `var(--nav-bottom)` per stare sopra la nav.
- **Le due icone in alto a destra sono una riga, e le testate le rispettano**
  (2026-09-08, segnalazione utente: si sovrapponevano in Libreria e Cinema): sotto `lg`
  lo slot `right` di `TopNav` (domanda del giorno + campanella, due tondi da 40 con 8 di
  gap) è fisso a `right-5` / `top-[safe+var(--nav-top)+20px]`, quindi occupa **20..60px**
  dall'alto e **108px** da destra. Quei 108px sono `--nav-actions` in `globals.css` (0 da
  `lg`, dove le azioni tornano nella nav) e **ogni testata deve lasciarli liberi**:
  `TopBar` e la Libreria chiudono a `pr-[calc(var(--nav-actions)+12px)]`, il campo di
  Cerca a `+8px` (lo stesso gap che c'è fra i due tondi: barra e icone leggono come una
  riga sola). Verticalmente **tutto è centrato sul loro centro (40px)**: il titolo è alto
  40 (`h-10` sul titolo o `min-h-10` sulla riga) e il campo di Cerca parte da `+14px`
  perché 14 + 52/2 = 20 + 40/2. Quello che non ci sta in linea **va a capo**, come in
  home: la pillola della posizione di `/cinema` (`action` di `TopBar`, in un wrapper
  `flex lg:contents` perché in colonna non si allarghi) e Film/Serie della Libreria, che
  è sceso sulla riga del conteggio. Dove è la pagina a possedere quell'angolo
  (scheda titolo, profilo proprio e altrui, notifiche) le icone spariscono sotto `lg`
  (`cornerTaken` in `TopNav`). Un campo `flex-1` in quella riga vuole `min-w-0`, suo e
  dell'`<input>`: senza, la larghezza minima naturale dell'input sborda sotto le icone.
- **Amici sta dentro Profilo** (2026-09-08, richiesta utente): `/friends` non è più una
  voce di nav. Ci si arriva dalla riga amici della testata del profilo (`ProfileEditor`),
  che ora è **sempre** presente — senza amici dice "Trova i tuoi amici" — è una pillola in
  vetro cliccabile e porta il numero delle richieste ricevute (`incomingCount`, da
  `getFriendsData()` che il profilo già chiama: nessuna query in più). Di conseguenza
  `/friends` ha indietro + briciola "Profilo" come ogni pagina non radice, e il suo
  `loading.tsx` ha la stessa testata.
- **Da ogni pagina si torna indietro** (2026-09-08): le cinque voci di nav sono radici e non
  hanno l'indietro; **tutto il resto sì**. `TopBar` ha due prop: `back` (il tondo
  `BackButton` a sinistra del titolo) e `parent` (la **briciola**, riga 13px
  `accent-soft` sopra il titolo, cliccabile). Chi non usa `TopBar` mette le stesse due
  cose a mano (`/import/netflix` → Profilo, `/u/[username]` → pillola in vetro "Amici"
  accanto all'indietro sopra il muro). Oggi: `/discover` (solo indietro),
  `/discover?genre=` → Scopri, `/cinema?film=` → Cinema (**al posto** del vecchio link
  testuale "← Tutti i cinema"), `/u/[username]` → Amici, `/friends` → Profilo,
  `/import/netflix` → Profilo.
  `/notifications` tiene solo l'indietro: la campanella si apre da ogni pagina, un
  genitore fisso sarebbe una bugia. La briciola non è un doppione dell'indietro: chi
  arriva da un link condiviso non ha cronologia e `router.back()` lo porta fuori
  dall'app, la briciola no.
- **Fra le stagioni si passa senza tornare alla serie** (`src/components/title/SeasonNav.tsx`,
  2026-09-08): `SeasonPills` è una riga sticky di pillole S1 S2 S3… sotto la testata della
  pagina stagione (`top-[calc(env(safe-area-inset-top,0px)+var(--nav-top))]`, mai un numero
  fisso: sotto `lg` la nav è in basso e la riga sta a 0, da `lg` scende sotto i 72px della
  barra), quella attiva in `bg-accent`, scorrimento orizzontale con snap; `SeasonEnds` in
  fondo alla lista episodi dà "Precedente / Successiva" col nome vero della stagione, e ai
  capi resta un solo bottone. I dati sono le `seasons` di `titles.raw` **già in pagina**:
  nessuna chiamata TMDB in più. Stesso filtro di `SeasonList` (`season_number > 0`), con
  una stagione sola le pillole non compaiono. La geometria della riga sta anche nel
  `loading.tsx` della stagione.
  Verifica: `node scripts/nav-check.mjs` contro un'istanza avviata (crea due utenti finti
  e li cancella). Tre trappole dentro allo script, tutte già costate tempo: il **service
  worker** ripresenta l'HTML di una build precedente (contesto Playwright con
  `serviceWorkers: "block"`, altrimenti CSS 404 e click a vuoto); l'**overlay della
  domanda del giorno** copre tutto ed ha a sua volta un bottone "Indietro", va chiuso
  subito dopo il login; le testate si contano con `[data-crumb]`, non con
  `header:first` — mentre la pagina è in streaming c'è ancora la testata del `loading.tsx`
  e la barra di nav è a sua volta un `<header>`.
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
  (`original`, stessi `BAND_*`/`HEADER_*`/`AmbientBackdrop` e **stessa banda fissa** di
  `TitleHeader`; palette della locandina della serie, così
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
  `ResizeObserver` sullo strato del player; nell'HTML del server le stesse percentuali,
  esatte nella banda 16:9): l'immagine sta intera e centrata nella banda, le bande nere
  di YouTube restano fuori dal bordo, e il video viene solo **ridotto** dal layout grande
  del player, mai ingrandito.
  **La banda ha sempre la stessa misura** (`BAND_CLASS` in `TitleHeader.tsx` =
  `aspect-video lg:aspect-auto lg:h-[75svh]`; `--band-end` su `AmbientBackdrop` via
  `BAND_END_CLASS` con gli stessi valori letterali), con o senza trailer, scheda e
  stagione: 16:9 a tutta larghezza sotto `lg`, **75% del viewport** (`75svh`) a tutta
  larghezza da `lg`. Dove il trailer non arriva (un 2,39:1 nella banda 16:9: nero sopra
  e sotto; da `lg` su 1920×1080 un 16:9 è ~1350×760 e un 2,39:1 ~1820×760: nero ai lati)
  **resta nero**: il layer dell'immagine sfuma a `opacity-0` insieme alla dissolvenza del
  video. Così un trailer 1080p da `lg` viene solo ridotto, mai ingrandito oltre i suoi
  pixel (richieste utente 2026-09-06: banner tutti uguali, video intero alla qualità
  massima, da desktop il 75% dell'altezza). **Niente maschera né velo colorato in fondo al
  riquadro, a nessuna larghezza**: `HEADER_FADE` e `HEADER_MASK_CLASS` non esistono più.
  Sotto `lg` (telefono e tablet) la banda è preceduta da un **respiro nero di safe-area +
  64px** (padding del wrapper `BAND_WRAP_CLASS`, mai margine; `lg:pt-0`) che ospita i
  **comandi in vetro fuori dal video** (Indietro, audio, Condividi: 40px a safe-area + 12,
  `HEADER_BACK_CLASS` / `HEADER_CONTROLS_SLOT_CLASS`): nulla copre il trailer (richiesta
  utente 2026-09-06) e in standalone la status bar non lo copre; la TopNav è in basso;
  niente zoom né parallasse (`.ken-burns` anima solo da `lg`). A tutte le larghezze:
  **trailer al 100% fino al bordo**; solo da `lg`, dove i comandi stanno ai due angoli
  del fondale sopra il video, un velo lieve sul bordo alto (`BAND_TOP_FADE` /
  `BAND_TOP_FADE_CLASS` = `hidden lg:block`, metà riquadro, 0,55 → 0) per leggerli.
  L'immagine di fondo (backdrop 16:9) copre il riquadro (`object-cover`): è solo l'attesa
  prima del trailer e il ripiego senza trailer. Subito sotto la banda, **fuori dal video**,
  una **sfumatura nera** (`BAND_BLACK_FADE` / `BAND_BLACK_FADE_CLASS`: dal nero pieno al
  trasparente in 320px, `top-full` nel wrapper `relative` attorno alla banda:
  ancorata al bordo basso reale, non a `56.25vw`, perché la banda è larga 390 − 2px di
  bordo `PageShell` e un varco di 1px lasciava trasparire l'ambient come riga chiara) fa da
  respiro fra il video e la pagina colorata; locandina e titolo stanno **sotto la banda**
  (`HEADER_ROW_CLASS`: `mt-4`, `lg:mt-6 lg:px-10`) su quel nero, anche da `lg`: mai
  sopra il video.
  **Sfondo "ambient"** (`AmbientBackdrop`, `src/components/title/AmbientBackdrop.tsx`,
  server): ogni scheda titolo e stagione ha dietro tutta la pagina (`main` è
  `relative isolate`, i div sono `-z-10`) le sfumature dei due colori
  dominanti della locandina, calcolati da `getPosterPalette(poster_path)`
  (`src/lib/colors/palette.ts`, `server-only`: locandina `w92` via `fetch` con cache
  Next 30 d — chiave con `PALETTE_EPOCH`, da alzare quando cambiano le regole —, `sharp`
  a 40px di larghezza, poi le funzioni pure di `src/lib/colors/dominant.ts`, con test
  Vitest). **La sfumatura deve avere le stesse proporzioni della locandina** (richiesta
  utente 2026-09-08: "copertina bianca e nera, sfumatura bianca e nera; copertina nera e
  rossa, sfumatura nera e rossa"; poi "Sin City è più sul grigio che sul rosso, metti più
  grigio che rosso"). Quindi **grigi e bianchi non sono scarti: sono candidati come i
  colori** e vincono quando occupano più spazio — prima erano ignorati e qualunque
  macchia colorata si prendeva tutta la pagina (una locandina senza pixel saturi cadeva
  addirittura sul viola di ripiego, che ora esce solo se manca l'immagine). Ogni pixel
  non nero va da una parte sola, grigi o cella di colore, e **pesa quanto è chiaro**: su
  fondo nero un grigio scuro non si vede, un bianco sì (così il fondo bianco di *Arcane*
  conta e il nero sporco di *Sin City* no). Le leve: `COLOR_SAT_MIN` 0,35 separa colore e
  grigio; i colori pesano ×1,5 (attirano l'occhio più di un grigio pari esteso) e
  l'incarnato ×0,3 (i volti riempiono le locandine ma non le colorano); le celle entro
  30° di tonalità fanno **famiglia** (il rosso di un titolo è sparso su tre sfumature) e
  la rappresenta la sua cella più **viva** (chroma, non saturazione HSL: un rosso quasi
  nero non deve vincere sul cielo acceso di *Stranger Things*); la seconda tinta è
  l'altro colore o il grigio, quello che pesa di più, e va in pagina col peso che ha
  davvero (`secondaryWeight` 0,55–1); su un bianco e nero basta molto meno per essere
  dettaglio (3% del grigio, o anche solo lo 0,3% dei pixel se il colore è pieno: il
  cappotto rosso di *Schindler's List*); `intensity` (0,5–1) segue quanta locandina non è
  nera, così *The Artist* lascia la pagina scura e *Barbie* l'accende; `tame` corregge
  solo chi non si vedrebbe (S 0,25–0,85, L 0,26–0,52) invece di riportare tutto allo
  stesso colore acceso; `glow()` alleggerisce i veli grigi del 28%, perché un grigio
  chiaro pesa più di una tinta. Qualunque errore → tinta di ripiego, mai errore in
  pagina. `pnpm tsx --env-file=.env.local scripts/palette-preview.ts out.png` mette
  locandina e sfumatura una accanto all'altra su una dozzina di titoli: è così che si
  ritara, guardando l'immagine. Due strati, base
  nera, solo radiali: uno **fisso** (segue lo scroll: due grandi bagliori ai bordi del
  viewport + velo tenue, deriva lenta `.ambient-drift` 48 s, ferma con reduced-motion)
  così la pagina non è mai nera e anonima nemmeno in fondo; uno **assoluto** alto quanto
  il `main`: accenno sopra il trailer (dietro nav e riga comandi), bagliori a 340px
  sotto il bordo basso del riquadro (`--band-end`, passato dal chiamante: `BAND_END_CLASS`
  = respiro + 56,25vw sotto `lg`, 75svh da `lg`; il colore comincia dopo la sfumatura
  nera) ed echi al 55/80/100% dell'altezza alternati
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
  `[data-header-controls]` della testata. Sotto `lg` i comandi stanno **fuori dal video**,
  nel respiro nero sopra la banda (`HEADER_BACK_CLASS` / `HEADER_CONTROLS_SLOT_CLASS`,
  quota safe-area + 12); da `lg` ai due angoli del fondale (safe-area + `--nav-top` + 20),
  sopra `BAND_TOP_FADE`.
  Mai cerchi sparsi. I veli sono `pointer-events-none`. **Qualità**: YouTube sceglie la qualità dalla dimensione di
  layout del player (non dal DPR; `vq=`/`setPlaybackQuality` non hanno effetto misurabile),
  quindi l'iframe ha un layout molto più grande di quanto si vede e viene ridotto con
  `transform` (`SCALE_BAND`/`SCALE_WIDE`, letterali nelle classi `[--yt-k:6]
lg:[--yt-k:2]` dello strato del player): sotto `lg` a 6× (telefono da 390 → ~2340×1316
  → hd1080/hd1440; al doppio sceglieva 360p), da `lg` al doppio (16:9 a ~1350×760 →
  ~2700×1520 → hd1440/hd2160). Lo strato del player è grande esattamente quanto il riquadro e **senza
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
  **Il trailer è solo fondale, mai un link a YouTube**: nessun bottone "Trailer".
  **Solo trailer italiani da canali YouTube ufficiali dei distributori** (`src/lib/trailers/`):
  `getOfficialTrailers({videos, titleId, mediaType, season, name, releaseDate})`
  (`official.ts`, server-only, React `cache()`; `getOfficialTrailerKeys` = solo le chiavi)
  è l'unica sorgente dei trailer (`Trailer {key, frame}`, riquadro senza bande nere da
  `frame.ts`) per `TitleBody`/`TitleHeader` e per la pagina stagione (stagione N, poi
  serie). **DB-first**: ogni visita fa una sola lettura di `title_trailers` (migration 0011
  - 0013: `trailers` jsonb `[{key, frame}]`, `source` tmdb|youtube|none, `keys` legacy
    da togliere; pk `title_id, media_type, season_number`; service client); oEmbed,
    miniature e ricerca girano solo a riga assente o scaduta (piena 30 d, vuota 1 d), così
    il primo chunk non aspetta mai le chiamate esterne; ricerca fallita con riga vecchia → si tiene la
    vecchia; `name` vuoto → niente ricerca né riga (la FK su `titles` esige la riga).
    `parseTrailers` (`stored.ts`, pure, Vitest) valida il JSON: forma diversa → ricalcolo.
    Passo A:
    i video TMDB (`rankTmdbCandidates` in `rank.ts`: YouTube, `iso_639_1` "it" o null,
    Trailer → Teaser, ufficiali prima) passano per l'oEmbed di YouTube (`oembed.ts`,
    nessuna chiave, timeout 3 s, cache Next 30 d): resta solo chi è caricato da un canale in
    `OFFICIAL_CHANNELS` (`channels.ts`: id UC…, handle di `author_url`, nome, flag
    `italian`; 44 canali: Warner/Sony/Universal "International Italy"/Disney IT + Marvel
    Italia + 20th Century IT + Star Wars Italia/Prime Video IT/Netflix Italia/Sky/Rai/
    Mediaset Infinity/Paramount+ Italia/discovery+ Italia/Cartoon Network e Nickelodeon
    Italia/Eagle/01/Lucky Red/Medusa/Paramount IT/Vision/I Wonder/BIM/Notorious/Plaion +
    Midnight Factory/DYNITchannel/Anime Factory/Adler/Teodora/Academy Two/Movies
    Inspired/Wanted/CG Entertainment/Officine UBU/Leone Film Group, più i globali Netflix,
    Still Watching Netflix, Netflix Anime, Prime Video, Crunchyroll, MUBI, Apple TV) ed è
    italiano per quel canale (`isItalianForChannel`: dai canali globali solo con lingua
    "it" di TMDB o **audio italiano dichiarato su YouTube**: con `YOUTUBE_API_KEY` una
    `videos.list` (1 unità, `getVideoDetails` in `youtube.ts`, cache 7 d) dà
    `defaultAudioLanguage`, id canale esatto ed `embeddable`). Un video privato/rimosso o
    con embed disattivato (oEmbed 4xx/401) cade da solo. Passo B, solo con
    `YOUTUBE_API_KEY` (opzionale, Data API v3 gratis, 10.000 unità/giorno, `search.list` =
    100): una ricerca "<nome> trailer italiano" (`youtube.ts`), filtrata da
    `rankSearchResults` (canale ufficiale, "trailer ufficiale" > trailer > teaser, niente
    clip/featurette/spot/interviste/dirette — "live action" resta —, canali globali solo
    con audio italiano da `videos.list` o "ita"/"italiano"/"sub ita" nel titolo, film:
    niente video di oltre 2 anni prima dell'uscita, stagione: solo titoli che la nominano).
    Nessun risultato → solo backdrop: **mai un trailer inglese o di terzi** (regola
    riconfermata dall'utente 2026-09-06: un ripiego su canali qualsiasi è stato scritto e
    ritirato lo stesso giorno; per alzare la copertura si allarga l'allowlist, non la
    regola). Le righe vuote con `checked_at` prima di `EMPTY_BEFORE_MS` (`official.ts`,
    alzarla quando si allarga l'allowlist) si ricalcolano subito. Per aggiungere un canale:
    handle da `author_url` dell'oEmbed di un suo video, id da `"externalId"` nell'HTML di
    `youtube.com/@handle`, **poi `channels.list` (Data API, 1 unità) per iscritti e video**:
    `@dynit`, `@fandangoofficial`, `@minervapictures`, "Disney+ Italia" erano squatter con
    0–1 video, il vero Dynit è `@dynitchannel`. I video TMDB arrivano con
    `include_video_language=it,en,null` (vedi TMDB sopra).
- **Corpo della scheda titolo** (2026-09-07, scelte dell'utente su una tela di mockup
  con dati TMDB veri): dalla trama in giù la scheda è stata rifatta sezione per sezione.
  Ordine di lettura sul telefono (una colonna): azioni → **Trama** →
  **Voti e recensioni** → **Dove guardarlo** → **Al cinema** o **Riprendi** → Stagioni →
  **Cast** → amici → Simili → Scheda tecnica. Da `md` due colonne: a sinistra azioni, Dove
  guardarlo, Cast, amici; a destra Trama, voti e recensioni, Al cinema/Stagioni,
  Simili, Scheda tecnica. **I voti Zapp stanno attaccati al voto TMDB** che
  chiude la trama, non più a tutta larghezza in fondo alla pagina. I due wrapper in `TitleBody` sono
  `display: contents` sotto `md` (`order-*` sulle sezioni) e tornano colonne da `md`:
  una sola resa, nessuna sezione duplicata. **Cast e "Al cinema" si sono scambiati di
  posto**: l'elenco del cast sta nella colonna stretta, gli orari delle sale no.
  - **Trama** (`TitleAbout.tsx`): apre con la tagline (26px, `font-light`), filo accent,
    testo 16px con "Leggi tutto" (`Overview` prende `size` e `heading`), voto TMDB e
    quattro dati — regia/creata da, sceneggiatura, titolo originale, uscita in Italia.
    I **generi non sono più pillole**: riga in chiaro maiuscoletto sopra il titolo in
    `TitleHeader` (richiesta utente: "è più professionale"). `TitleRating` non esiste
    più: il voto sta qui, l'attribuzione TMDB in fondo alla scheda tecnica.
  - **Dove guardarlo**: `ProviderButton` porta una **sfumatura leggera del colore del
    marchio** (`PROVIDER_BRAND` + `providerTint` in `config.ts`, hex grezzi ammessi come
    per `GENRE_COLORS`); il bottone Apri/Cerca resta **neutro in vetro per tutti**.
    Un servizio senza colore noto resta sul `surface`.
  - **Al cinema vicino a te**: niente più card del primo spettacolo in grande
    (`NextShowingCard` rimosso). In testa le **fasce orarie** (Pomeriggio / Sera / Tarda
    sera, `showingBand` in `dates.ts`, puro con test) e sotto tutte le sale con i loro
    orari a pillola; in fondo "Ci vai stasera?" (Ci vado → foglio biglietti, Invita
    amici). La fascia iniziale è quella del prossimo spettacolo; con una sola fascia le
    pillole non compaiono. Senza spettacoli oggi la sezione sparisce.
  - **Cast** (`CastRow.tsx`): elenco verticale con foto tonda 46px e "Vedi tutto il cast"
    che apre il resto sul posto (nessuna pagina cast).
  - **Serie**: `SeriesProgress` è server e async — una `getSeason` per il fotogramma
    dell'episodio da vedere — e rende `ProgressControls` come card 16:9 "Riprendi" con
    numero, titolo, durata, barra e i tasti "Segna come visto" / "Cambia punto"; da `md`
    la card è larga al massimo 480px (560 da `lg`), altrimenti su desktop il fotogramma
    superava i 500px di altezza.
    **La griglia delle stagioni e la pagina della singola stagione restano invariate.**
  - **Simili**: scaffale orizzontale sul telefono, griglia da `md` (4 colonne, 6 da
    `lg`). Le copertine passano un `sizes` reale a `PosterCard` (prop nuova): con la
    griglia da tre venivano 230px chieste come `w342`, cioè sgranate.
  - **Voti e recensioni**: card con media grande e **distribuzione dei voti 10→1**
    (RPC `title_rating_histogram`, migration `0019`, security definer come
    `title_rating_stats`: le policy su `watch_entries` mostrerebbero solo sé e gli amici).
  - **Sezione nuova**: **Scheda tecnica** (`TechnicalSheet.tsx`: lingua, paese,
    produzione, durata, budget/incassi, età). I dati stanno in `src/lib/tmdb/facts.ts`
    e non si ripetono mai fra Trama e scheda tecnica. `getMovie`/`getTv` chiedono ora
    anche `release_dates`/`content_ratings`, quindi `TITLE_CACHE_EPOCH` è stata alzata.
    Una galleria di fotogrammi era stata aggiunta e poi tolta su richiesta dell'utente
    (2026-09-07): niente `images` nell'`append_to_response`, `raw` resta leggero.
- **Build in parallelo**: `next.config.ts` legge `NEXT_DIST_DIR` (default `.next`), così
  una verifica può costruire in una cartella propria senza rompere la build di un'altra
  sessione sullo stesso albero: `NEXT_DIST_DIR=.next-check pnpm build && NEXT_DIST_DIR=.next-check pnpm exec next start -p 3399`.
  Le cartelle `.next-*` sono ignorate da git e da eslint.
- **Backdrop**: sempre TMDB `original`, mai `w780`/`w1280` come sfondo.
  L'immagine della banda (`CinematicBackdrop`) è `unoptimized`: nessun `srcset`, nessun
  `sizes`, il loader (`src/lib/image-loader.ts`) non riscrive la taglia e l'URL
  `original` (fino a 3840px) arriva intero a ogni larghezza. È il fotogramma che si vede
  prima del trailer e deve reggere il confronto col video (richiesta utente 2026-09-06):
  con lo `srcset` un telefono a 390px × DPR 3 scendeva a `w1280`, cioè sgranato.
  Altrove `sizes` segue la geometria di `object-cover`, non la larghezza della pagina:
  un 16:9 che copre un riquadro alto H va richiesto largo H × 16/9.
  Mai chiedere meno del necessario: un file da 1200px scalato 3× è sfocato.
