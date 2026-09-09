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

# Catalogo nazionale delle sale (riempie cinema_venues; lento di proposito, 0,7 s a richiesta)
pnpm tsx --env-file=.env.local scripts/warm-cinema-venues.ts [slug provincia…]

# Generi della home: liste curate e collaudo
pnpm tsx --conditions=react-server --env-file=.env.local scripts/build-genre-picks.ts  # rigenera src/data/genre-picks.json
pnpm tsx --conditions=react-server scripts/genre-dump.ts <user_id> [chiave…]           # stampa le liste, per leggerle
BASE=http://localhost:3401 node --env-file=.env.local scripts/genre-check.mjs          # verifica in browser (istanza avviata)

# Trailer
pnpm tsx scripts/backfill-trailers.ts --searches 80  # riempie title_trailers rispettando la quota YouTube
pnpm tsx scripts/audit-trailers.ts                   # verifica che ogni trailer salvato sia del suo titolo
pnpm tsx scripts/refresh-trailer-frames.ts           # rimisura le bande nere dei trailer salvati

pnpm test         # vitest, solo funzioni pure (src/**/*.test.ts)

# Banco di prova di scala (genera 500 utenti finti e si ripulisce da solo).
# select jsonb_pretty(public.bench_scale(250, 300, 7));   -- via MCP execute_sql
# Dopo una serie di corse: vacuum (full, analyze) public.watch_entries, ...
```

Vitest copre solo le funzioni pure di `src/lib/cinema/`, di `src/lib/import/` (`netflix-{title,rows,proposals}.ts`), di `src/lib/trailers/` (`channels.ts`, `match.ts`, `compute.ts`, `rank.ts`, `frame-bars.ts`, `stored.ts`) di `src/lib/genres/catalog.ts`, di `src/lib/tmdb/backdrops.ts` e di `src/lib/colors/dominant.ts`; il resto si verifica con `pnpm typecheck && pnpm lint && pnpm build`.

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
  chiusi a tutti tranne al service client, ed e' voluto. `my_friend_ids()` e'
  esposta come RPC a chi ha fatto accesso perche' le policy la devono poter
  chiamare (stessa ragione di `are_friends`): non ha argomenti, quindi risponde
  solo sull'utente della sessione e non dice niente che non sia gia' sulla
  pagina Amici.

## Scala: reggere molti utenti (2026-09-08)

Tre regole nate misurando, non leggendo. Il banco di prova e' la funzione
`public.bench_scale(n_utenti, n_entry, giri)` (migration 0027): genera utenti
finti con libreria, amicizie, attivita' e notifiche, misura le query vere
fingendosi uno di loro e **cancella tutto quello che ha inserito**. Numeri e
metodo in `docs/superpowers/specs/2026-09-08-backend-multi-utente-misure.md`.

- **Ogni policy nuova scrive `(select auth.uid())`, mai `auth.uid()` nudo.**
  Postgres non considera `auth.uid()` una costante e lo rivaluta **per ogni
  riga esaminata**; col sotto-select lo calcola una volta (InitPlan). La
  condizione non cambia, cambia il numero di valutazioni. Stessa cosa per una
  funzione dentro una policy: `are_friends(uid, user_id)` girava per riga, al
  suo posto c'e' `user_id in (select my_friend_ids())`, che gira una volta.
  E **una sola policy permissiva per comando**: due vengono valutate entrambe
  per ogni riga, quindi leggendo la propria libreria si pagava comunque la
  condizione degli amici. Il feed e' passato da **1.239 ms a 0,8 ms**.
- **Ogni chiave esterna nuova nasce con il suo indice.** Senza, ogni lettura
  per quella colonna e' una scansione completa: `recommendations(to_user)` era
  cosi' e la home la interroga a ogni apertura. Attenzione al rovescio: un
  indice con la stessa colonna di testa di uno gia' esistente puo' essere
  **preferito dal pianificatore alla query sbagliata**. Un
  `watch_entries(user_id, updated_at)` aggiunto per la coda dei gusti veniva
  scelto per la libreria, dove perdeva `status` come condizione: e' stato tolto.
  Un indice si aggiunge dopo averlo misurato, non prima.
- **In `titles.raw` sta solo quello che il codice legge.** `titles` e'
  condiviso fra tutti gli utenti: e' l'unica tabella che cresce col numero di
  gusti diversi invece che col numero di persone, e il piano Free si ferma a
  500 MB. `src/lib/tmdb/slim-raw.ts` (puro, Vitest) decide cosa salvare — via
  `watch/providers` (e' gia' in `title_providers`) e `images`, cast ai primi 30,
  crew ai cinque mestieri letti davvero, consigli ai primi 12, uscite e divieti
  alla sola Italia. **Chi aggiunge un campo che il codice legge deve
  aggiungerlo anche li'**, altrimenti sparisce al primo aggiornamento del
  titolo. La chiamata TMDB resta intera: si taglia quello che si salva.

Altre due cose che valgono per tutto il backend:

- **I limiti di frequenza in memoria valgono per istanza.** Su Vercel le
  istanze sono molte, quindi un tetto di 30 all'ora vale 30 *per lambda*.
  `rateLimit(..., { condiviso: true })` lo fa contare da Upstash, ma **non si
  accende ovunque**: il piano gratuito da' 500.000 comandi al mese e un
  contatore condiviso sul proxy TMDB lo brucerebbe da solo. Condiviso dove
  sbagliare costa fuori di qui (Nominatim, import, scritture sociali), in
  memoria dove il limite serve solo a fermare un ciclo impazzito.
- **Le quote dei servizi di terzi sono per applicazione, non per utente.**
  `src/lib/gate.ts`: `attendiTurno` tiene Nominatim a una richiesta al secondo
  in tutta l'app (la loro policy e' quella, e superarla non da' un errore, da'
  il ban); `prendiPosto` tiene a tre gli import contemporanei, perche' il
  throttle del client TMDB e' per istanza e cinque import in parallelo sono
  cinque throttle indipendenti.

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
  Token); il mittente "Zapp" richiede un SMTP proprio. Istruzioni in
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

### Consigli: "Simili" e "Perché hai visto X"

`src/lib/similar/` (2026-09-07). Le due sezioni non mostrano più `recommendations` di
TMDB — che è un segnale collaborativo grezzo, "chi ha aperto questa scheda ha aperto
anche quella" — ma una classifica costruita da **cosa il titolo è**.

- `signals.ts` (puro, Vitest) `seedProfile(details, mediaType)`: l'**identikit** del
  seme — keyword, saga, regia/creatori, sceneggiatori, primi attori, generi, anno. Le
  keyword arrivano gratis dentro `titles.raw` (`keywords` è nell'`append_to_response`;
  per questo `TITLE_CACHE_EPOCH` è stata alzata). Fuori il rumore di produzione
  (`NOISE_KEYWORDS`: `aftercreditsstinger`, `sequel`, `based on…`) **e i luoghi**
  (`usa`, `indiana`: si comportano come i generi). Le keyword più **specifiche** — più
  parole — vanno davanti, perché solo le prime sei vengono interrogate.
- `candidates.ts` (dipendenze iniettate, non `server-only`) `collectCandidates(seed,
source, collab)`: una `discover` **per ciascuna** delle 6 keyword, la saga
  (`/collection/{id}`), la regia e il volto (`person/{id}/movie_credits` filtrato
  `job === "Director"`, o `tv_credits`; **mai `discover?with_crew=`**, che accosta
  qualunque ruolo di troupe e faceva risultare "di Villeneuve" film che non ha
  diretto), `similar` e le `recommendations` già in `raw`. Poi **un secondo giro** con
  le due keyword più rare in AND: chi c'è dentro è il nucleo del filone e vale doppio.
  L'appartenenza di un candidato a una keyword si sa **per costruzione** — nessuna
  chiamata per candidato.
- **La rarità di una keyword si misura gratis**: il `total_results` di ogni `discover`
  dice quanti titoli la portano, e `keywordIdf` la trasforma in peso. "Loop temporale"
  vale cinque volte "amicizia" senza classifiche compilate a mano.
- `score.ts` (puro, Vitest) `rankCandidates`: **filone × qualità × età × forma**.
  Filone = keyword (per rarità, doppie se dal nucleo) + saga 3,0 + regia 1,6 +
  sceneggiatura 0,8 + attori 0,5 + generi Jaccard × **0,6** (il peso più basso di
  tutti) + presenza fra i consigli TMDB 0,4. Qualità = ZappScore della fase B
  (`getRatings`, una query per tutta la lista), 0,75–1,25: rompe i pareggi, non
  ribalta il filone. Età = penalità **morbida e asimmetrica**, pavimento 0,5: per un
  seme degli ultimi 3 anni un candidato più vecchio scende il doppio più in fretta, ma
  il capostipite di un filone può ancora entrare. Forma = ×0,55 se animazione,
  documentario, reality o kids stanno da una parte sola (sotto Stranger Things
  arrivavano tre anime che condividevano "mondo parallelo"). Igiene: fuori il seme, i
  non usciti, chi ha meno di 50/20 voti, gli `adult`, e **max 2 per saga e 2 per
  regista**. I legami **solidi** (due segnali, o saga/regia/keyword del nucleo) vanno
  davanti, ma senza amputare: sotto vengono gli altri, perché uno scaffale mezzo vuoto
  è un difetto quanto uno a caso.
- **Ogni titolo porta il motivo** ("Stessa saga", "Di Denis Villeneuve",
  "Rapina · Vendetta"), reso da `PosterCard reason`. Le keyword TMDB sono in inglese:
  si mostrano solo quelle tradotte in `keyword-labels.ts` — mai inglese in pagina.
- `similar.ts` `getSimilarTitles(id, mediaType, size)` è la facciata, **DB-first**
  come i trailer: una lettura di `title_similar` (migration `0024`, applicata via MCP;
  `items` + `seed`, TTL 30 giorni, 3 se vuota, service client). Misurato dal vivo:
  freddo 1,5 s con 7 chiamate TMDB, **caldo 58 ms**. Se tutto cade si torna a
  `raw.recommendations`, cioè al comportamento di prima.
- **La classifica salvata è impersonale**, uguale per tutti. Il pezzo personale è solo
  in home ed è quello di tutta l'app: **un unico profilo di gusto**, quello della fase A
  (`user_taste`), letto come vettore dalla fase C e pesato con la sua `affinity`.
  `similar/personal.ts` (server) legge il profilo una volta per richiesta, rispetta
  `personalization_enabled` (spenta → resta l'ordine pubblico) e arricchisce **l'unione
  di tutti gli scaffali in una passata sola** riusando `arricchisci` di
  `rank/candidates.ts` — la home ne mostra fino a otto e una passata per scaffale
  sarebbe otto volte le stesse query. `similar/personal-rank.ts` (puro) fa la miscela:
  `punteggio × (0,75 + 0,5 × affinità)`, **la stessa banda della qualità**, così gusto e
  qualità hanno la stessa voce in capitolo e nessuno dei due ribalta il filone — lo
  scaffale si chiama "Perché hai visto X", non "cose che ti piacciono". Qui **non si
  deduce nessun gusto**: c'era un `taste.ts` locale (registi e keyword ricorrenti) ed è
  stato tolto il 2026-09-08, perché due definizioni di "cosa piace a questa persona"
  sono una di troppo. `pickBecauseSources` scarta chi non è stato finito e chi è stato
  **bocciato** (voto < 6); `BecauseYouWatched` prova 8 sorgenti e tiene le 5 che
  producono almeno 6 titoli.
- **Verifica**: `pnpm tsx scripts/similar-check.ts [movie|tv:id …]` stampa la
  classifica vera con punteggio e motivo, e sotto la lista che TMDB dava prima. La
  suite verde prova la formula, non la qualità dei consigli: cinque delle tarature di
  questo modulo sono nate leggendo quell'output, non dai test.

### Provider deep links

**Every provider button must open the exact title page on the platform, never a search or a home.** `src/lib/links/resolve.ts` `resolveProviderLinks(title, providerIds)` (batch; `resolveProviderLink` is the single-provider wrapper): cascade `manual` → `justwatch` → `wikidata` (via `titles.external_ids.wikidata_id`, 3 s timeout, configured providers only) → `search` URL (configured providers only). `src/lib/links/justwatch.ts` `getJustWatchOffers(title)` (React `cache()`, one GraphQL call per title, 4 s timeout, Next fetch cache 1 d): searches `apis.justwatch.com` by `title` then `original_title`, keeps the result whose `tmdbId` matches, and maps IT web offers by `packageId` (= TMDB `provider_id`) to a cleaned `standardWebURL` (tracking params stripped, HBO Max forced to `/it/it/`, "with ASL" variants penalised, home URLs discarded). Result persisted in `title_provider_links` (`justwatch`/`wikidata` TTL 30 d, `search` retried daily, `manual` never overwritten; migration 0006 adds the `justwatch` source). Where a link is not in cache yet (home "Continua", library) use `providerHref()` from `src/lib/links/go.ts`: it returns the cached direct URL or `/go/[mediaType]/[id]/[providerId]` (`src/app/go/.../route.ts`), which resolves on the fly and 302-redirects. `ProviderButton` shows "Apri" only for direct links (`direct` prop), "Cerca" for search fallbacks.

- **Film / Serie TV vale per tutta la home** (2026-09-07): lo stato sta in
  `HomeTypeProvider` (`src/components/home/HomeType.tsx`, client, avvolge il `main`);
  `HomeTypeSwitch` è la testata (h1 "Home" + pillola), **fuori dal Suspense**
  dell'hero. Ogni sezione rende _entrambe_ le varianti già divise dal server e
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
  (client): **un titolo alla volta, banner col fondale a tutte le larghezze**. Sotto `lg`
  il fondale 16:9 `original` è **intero, da bordo a bordo** (niente locandina, niente
  sbirciata sulla card dopo: richiesta utente 2026-09-07, "come su desktop, ben visibili
  e per intero"), con un respiro nero in fondo e titolo, anno · voto e trama (2 righe)
  **sotto** l'immagine; da `lg` banner alla Netflix alto `64svh` con testo e "Vedi scheda"
  a sinistra sopra il fondale. Chip del motivo sull'immagine, `scroll-snap` nativo,
  autoplay 6 s (`AUTOPLAY_MS`), pausa su tocco/drag/rotella/mouse sopra e ripresa dopo
  8 s (`RESUME_AFTER_MS`), fermo con reduced-motion. `HomeHeroSkeleton` ha la stessa
  geometria (16:9 + righe di testo sotto `lg`). Dati `src/lib/home/hero.ts` (`getHomeHero`, React `cache()`): per tipo, a
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

- **Prima carica (audit 2026-09-08).** Misure con Playwright su Chrome, iPhone 13,
  rete 4G (4 Mbit/s, 70 ms) e CPU 4×, su `/login` (la primissima schermata):
  75 richieste / 1852 KB / load 2740 ms → **29 richieste / 1154 KB / load 1242 ms**.
  Da dove venivano:
  - **`PosterWall` con immagini eager.** Ogni schermata col muro ne monta due,
    `lg:hidden` e `hidden lg:block`: un `<img>` eager dentro `display:none` viene
    scaricato lo stesso, quindi il telefono prendeva anche le 60 locandine del muro
    da desktop (780 KB) invece delle 16 che vede (184 KB). Ora sono `loading="lazy"`:
    il muro nascosto non chiede niente, quello visibile parte lo stesso perché è nel
    viewport. Cadono anche i 60 `<link rel="preload" as="image">` che React 19
    emetteva per le eager, in gara con CSS, font e JS. **Non rimettere `eager`.**
  - **Precache del service worker: 1893 → 412 KB** di `public/`. Il default prende
    tutto `public/`, cioè anche pdf.js (worker 1236 KB + JBIG2 142 + wasm 102 = il
    78% del totale) che serve solo a chi carica il PDF di un biglietto. Ora
    `globPublicPatterns` in `next.config.ts` è un elenco esplicito: aggiungendo una
    cartella a `public/` che deve stare offline, va aggiunta lì.
  - **`preconnect` a `image.tmdb.org` e allo storage Supabase** nel root layout: la
    prima immagine di ogni visita non paga più DNS+TCP+TLS dopo essere stata scoperta
    nell'HTML. Niente `crossOrigin`: le locandine sono `<img>` senza CORS.
  - **`prefetch={false}` fra login e signup**: stesso muro, quindi ~100 KB di payload
    RSC scaricati sulla prima schermata per un link che quasi nessuno tocca.
- **Query: nominare gli id, non lasciarli dedurre alla RLS.** `getFriendsWatchingHome`
  filtrava con il solo `user_id <> io`: nessun indice di `watch_entries` parte da
  altro che `user_id`, quindi era un Seq Scan con `are_friends()` (SECURITY DEFINER)
  riga per riga — 262 ms di media, 1,4 s di picco in produzione. Con
  `.in("user_id", idAmici)` torna Index Scan: **105 → 37 ms** con RLS attiva
  (EXPLAIN ANALYZE, 2026-09-08). `getFriendsData` è in React `cache()`: la chiedevano
  due sezioni della scheda titolo, `/cinema` due volte e la home.
- **Il throttle TMDB conta anche le risposte in cache.** Sta prima di `fetch`, e la
  cache dati di Next sta dentro: una risposta già in cache non arriva mai a TMDB ma
  veniva messa in coda lo stesso. "Continua a guardare" (20 tessere × 2 chiamate) ne
  era il caso peggiore. `MAX_PER_WINDOW` 15 → 30 (TMDB regge ~50/s).
- **Trailer: i tempi sono quelli giusti, verificati.** Il player è pronto a ~1,4 s,
  arriva a hd1080 a ~1,7–2,2 s. La dissolvenza a `REVEAL_DELAY_MS` = 4,5 s **non è
  padding**: con screenshot a playing+1,5 / +3,0 / +4,5 s si vede che barra del
  titolo, comandi centrali e "Altri video" di YouTube sono ancora lì a 3 s e spariscono
  solo dopo. Anche `SCALE_BAND` = 6 è giusto: a 6× il player prende hd1080 (7,7 MB),
  a 4× e 3× si ferma a hd720 (6,4 MB), a 2× a 480p. Non abbassarli per "guadagnare
  tempo": si perde qualità senza anticipare la comparsa.

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

### Algoritmo: il segnale sociale (fase E)

Sottosistema E dei cinque, l'ultimo (spec `docs/superpowers/specs/2026-09-08-algoritmo-fase-e-segnale-sociale-design.md`). Zapp aveva già tutto il **prodotto** sociale dalla fase 4 — amicizie, recensioni, consigli, notifiche, feed, "I tuoi amici" in home — ma niente di tutto ciò entrava nei consigli. Questa fase fa entrare gli amici nel motore di ranking, e non aggiunge una sola schermata.

- **La privacy la fa il database, non una `where`.** `watch_entries` ha già la policy `watch_entries_select_friends` (`are_friends(auth.uid(), user_id) and not is_private`): una query normale con il client a cookie restituisce esattamente ciò che l'utente ha diritto di vedere. Per questo `src/lib/rank/social.ts` non filtra a mano l'amicizia e **non usa mai il service client** — sarebbe l'unico modo di sbagliare, perché scavalcherebbe la policy e mostrerebbe le liste di sconosciuti. Corollario: **`scripts/rank-dump.ts` non serve a collaudare la parte sociale**, perché gira col client di servizio e lì "gli amici" sono tutti gli utenti; lo script lo dice in testa e lo stampa a ogni esecuzione. Per quella parte serve il browser.
- **Gli amici moltiplicano, non entrano nella media**: non sono un gusto, sono una spinta. `bonusAmici` dà +8% per amico con un tetto al +25% (oltre non è più "lo guardano i tuoi amici", è "lo guardano tutti", e quello lo dicono già le classifiche), e il punteggio finale è limitato a 1 perché non esista un "per te 112%". Se il voto medio degli amici è ≤ 4 la spinta **non si applica affatto**: che tre amici l'abbiano visto e non gli sia piaciuto non è una raccomandazione.
- **Il contributo sociale va in testa ai contributi**, non in ordine di peso: "Visto da Marco" dice più di "Perché guardi molto dramma" ed è vero in un modo che l'utente può verificare aprendo il profilo dell'amico. Il motivo usa i nomi e mai il numero da solo (`Visto da Marco` / `Visto da Marco e Giulia` / `Visto da Marco e altri 2`); senza nomi si tace.
- **Gli amici portano candidati**: un titolo che un amico ha finito e votato ≥ 7 entra nel pool anche se non sta in nessuna classifica e in nessun `discover`, ed è **esente dalle soglie di voti TMDB** — se è piaciuto a un amico, quanti voti abbia altrove non conta più. È l'unica fonte di candidati che sa qualcosa che TMDB non sa. Quelle righe vengono per prime nell'elenco, così sono loro a vincere la deduplicazione e a portarsi dietro il segnale.
- **`Dimensione` (il gusto) e `MotivoDimensione` (il gusto più `amici`) sono due tipi diversi**: `amici` non deve poter finire in `TasteVector` né nei pesi dell'affinità, e il compilatore lo garantisce.

### Algoritmo: home dinamica (fase D)

Sottosistema D dei cinque (spec `docs/superpowers/specs/2026-09-08-algoritmo-fase-d-home-dinamica-design.md`, piano `docs/superpowers/plans/2026-09-08-algoritmo-fase-d-home-dinamica.md`). Decide **quali scaffali** la home mostra, **come si chiamano** e **in che ordine**. Nessuna fonte di dati nuova: legge ciò che A, B e C hanno già prodotto.

- **Ogni categoria dice da dove viene il suo ordine.** "Top 10 su Netflix in Italia" (classifica ufficiale), "I meglio votati su Zapp" (ZappScore della fase B — prima era "I più amati di sempre", che non lo diceva e per giunta prometteva "di sempre" mostrando la lista TMDB del momento), "Per te" (motore della fase C), "Perché hai visto X" (motore dei simili), "Da vedere" (la tua lista), "In arrivo". In home l'utente non deve mai indovinare chi ha deciso quell'ordine.
- **L'ordine dipende da `user_taste.massa`**: sopra `MASSA_MINIMA` "Per te", i rail personali e "Perché hai visto X" vengono subito dopo "Continua a guardare"; sotto, scendono dopo le classifiche, che a un utente nuovo hanno qualcosa di più vero da dire. È l'unica cosa che cambia struttura fra due utenti.
- **Anche il carosello in testa segue il motore** (richiesta utente 2026-09-08): con `massa` sopra la soglia `getHomeHero` prende le card da `getRankedForYou` e la pillola diventa "Per te 70%"; con un profilo povero restano novità, tendenze e popolari, che a un utente nuovo dicono più di un'affinità inventata — stessa regola dell'ordine degli scaffali. Perché ciò fosse possibile `RankCandidate` porta anche `backdropPath` e `overview`: il carosello è a tutta larghezza e senza fondale una card non esiste.
- **I rail personali** (`src/lib/rank/rails.ts`, puro con Vitest): dal vettore di gusto esce al massimo un rail per dimensione, in ordine **persone → generi → decenni** ("Ancora con Pedro Pascal" dice qualcosa che l'utente non sapeva di aver detto, "Perché ami il dramma" è quasi ovvio, "Il meglio degli anni 2000" è il meno specifico). Soglia `SOGLIA_RAIL` 0,55 del massimo, tetto di 3, e **meno di 6 titoli → il rail non si mostra**: una fila di tre copertine sembra un errore, non una selezione. Profilo debole → nessun rail e la home resta quella di prima, che è voluto.
- **`appartiene`** decide chi entra in un rail: per le persone vale **solo** chi sta fra regia e primi quattro interpreti (quello che restituisce `title_people`) — "Ancora con X" sopra un film dove X compare due minuti è una promessa tradita.
- **Il motivo sotto la copertina non ripete il titolo dello scaffale**, e i contributi vanno potati **prima** di `variaMotivi`: quella funzione ripesca dai contributi quando un motivo si ripete, e senza la potatura anticipata dentro "Il meglio degli anni 2010" ricompariva "Dagli anni 2010".
- **`getRails` non costa una query in più**: `getCandidates` e `getRankedForYou` sono in `cache()` per richiesta, quindi i rail leggono la lista che "Per te" ha già chiesto, e si escludono a vicenda i titoli già mostrati.
- **La qualità dei candidati è un parametro di prodotto, non un dettaglio**: film ≥ 300 voti e ≥ 6,0, serie ≥ 100 e ≥ 6,5, chiesti a TMDB (`discoverByGenre` con `minVotes`/`minScore`) e non filtrati dopo, altrimenti la pagina di 20 risultati si svuota. Con la soglia dei simili (50 voti) i consigli erano uscite recenti di poco conto che `sort_by=popularity.desc` porta in cima solo perché sono di questa settimana; alzata l'asticella escono Perfect Days, The Social Network, Taxi Driver, The Bear, Better Call Saul, e la sovrapposizione fra due utenti diversi è scesa dal 60% al 30% sui film e dal 40% al 10% sulle serie.

### Algoritmo: ranking e affinità (fase C)

Sottosistema C dei cinque (spec `docs/superpowers/specs/2026-09-07-algoritmo-fase-c-ranking-design.md`, piano `docs/superpowers/plans/2026-09-07-algoritmo-fase-c-ranking.md`). Mette insieme il **chi è l'utente** della fase A e il **quanto vale un titolo** della fase B, e risponde a una domanda sola: *quanto è per lui, e perché*. Non decide dove finiscono i titoli — quello è la fase D.

- **Cinque moduli puri** in `src/lib/rank/` (tutti con Vitest in `rank.test.ts`) più due server: `vector.ts` (da riga `user_taste` a vettore), `affinity.ts` (il punteggio), `diversity.ts` (la lista senza ripetizioni), `explain.ts` (il motivo in italiano), `filters.ts` (cosa non entra), `candidates.ts` e `engine.ts`.
- **Il vettore si normalizza sul massimo, non sulla somma**: i generi in `user_taste` non sommano a 1 (un titolo ne ha più d'uno), quindi la somma non è una scala. Diviso per il massimo, una quota si legge come "quanto questo valore è vicino al tuo preferito".
- **L'affinità è moltiplicativa**, come `src/lib/similar/score.ts`: `gustoEffettivo^0,65 × qualità^0,35`. Nessun blocco vince da solo — un capolavoro fuori gusto non arriva primo, un titolo in gusto ma brutto nemmeno. Il gusto è la media pesata di sette dimensioni (generi 0,40; persone 0,20; provider 0,12; decennio 0,10; tipo 0,08; durata 0,05; lingua 0,05) e **le dimensioni che il titolo non ha non lo puniscono**: i pesi si rinormalizzano su quelle presenti.
- **`massa` decide se il numero si mostra.** `fiducia = min(1, massa/60)` tira il gusto verso il neutro quando il profilo è povero, e sotto `MASSA_MINIMA` (20) la percentuale è `null`: l'affinità serve a ordinare, non si scrive. Un "per te 92%" inventato al secondo giorno costa più fiducia di quanta ne guadagni un consiglio azzeccato.
- **`title_ratings.zapp_score` è su 0-10, non 0-100.** Trattarlo come percentuale divideva per dieci la qualità di ogni candidato preso dal database e le liste restavano plausibili lo stesso: è il difetto più silenzioso di questa fase, ed è pinnato da un test apposta. La stessa scala sbagliata era finita nella griglia seed della fase A.
- **`PosterCard` mostra "per te N%" dentro la riga del voto**: uno scaffale che non passa `rating` non mostra la percentuale, anche se l'ha calcolata. Chi usa `ItemShelf` deve passare `rating`, `affinity` e `reason` insieme.
- **Cosa non entra nei consigli** (`filters.ts`, tutto trovato guardando le liste vere, mai da un test): i titoli di cui non abbiamo nemmeno il nome in caratteri latini — TMDB restituisce l'originale quando manca la traduzione, e comparivano "멀리서 보면 푸른 봄" e "監獄風雲"; le serie di generi 10762/10763/10764/10767 (bambini, notiziari, reality, talk). Per "Good Mythical Morning" (su TMDB è solo "Commedia") e "All Elite Wrestling" (è "Azione") il genere non basta: serve `discoverByGenre(..., { scriptedOnly: true })`, che chiede a TMDB `with_type=2|4`, cioè solo miniserie e serie sceneggiate. Il parametro è opzionale e lo usa **solo** il motore: gli altri scaffali non cambiano.
- **TMDB lascia in inglese cinque generi TV** anche con `language=it-IT` (`Action & Adventure`, `Sci-Fi & Fantasy`, `War & Politics`, …): `GENERI_IT` in `explain.ts` li traduce, altrimenti sotto le copertine si leggeva "Perché guardi molto Action & Adventure".
- **Lo stesso motivo ripetuto non è una spiegazione**: `variaMotivi` dalla terza volta prova il contributo successivo e, se non c'è, tace.
- **I candidati non costano una chiamata esterna nuova**: classifiche e voti stanno in DB dalla fase B, e le due `discover` sono le stesse `fetch` del carosello (cache Next 1 h). Regista e cast dei primi 60 arrivano dalla RPC **`title_people`** (migration `0026_title_people.sql`, *security invoker*: `titles` ha già `titles_select_all`), che apre `titles.raw` **dentro Postgres** — sul filo passano i nomi, non i 27 KB per riga.
- **Il motore non chiama `getViewer()`**: utente, client Supabase e libreria arrivano come parametri (`rankFor`, `rankContext`). È l'unico modo di collaudarlo fuori da una richiesta HTTP — `pnpm tsx --conditions=react-server scripts/rank-dump.ts <user_id> <altro_user_id>` stampa le due liste e la loro sovrapposizione. **Il controllo che conta è quello**: due utenti diversi devono avere liste diverse (misurato: serie 0% in comune, film 60%, perché entrambi guardano molto dramma). Due liste uguali vorrebbero dire che il gusto non entra nel conto.

### Algoritmo: segnali utente (fase A)

Sottosistema A dei cinque (spec `docs/superpowers/specs/2026-09-07-algoritmo-fase-a-segnali-utente-design.md`, piano `docs/superpowers/plans/2026-09-07-algoritmo-fase-a-segnali-utente.md`). Dà a Zapp il secondo numero dopo lo ZappScore della fase B: **chi è questo utente**. Non cambia niente di ciò che si vede, tranne l'onboarding e un interruttore: gli scaffali personalizzati sono la fase D, il ranking la C (`PosterCard.affinity` resta `null` fino ad allora).

- **Tabelle nuove** (migration `0024_segnali_utente.sql`): `user_preferences` (anno di nascita + `personalization_enabled`), `user_events`, `user_seed_picks`, `user_taste`. L'anno di nascita **non va in `profiles`**, che è leggibile da chiunque via `user_search` e dai profili pubblici — stessa scelta già fatta per `user_locations`. `user_taste` la scrive solo il service client (nessuna policy di insert/update), il proprietario la legge e la può cancellare.
- **Niente foreign key verso `titles` su `user_events`**, di proposito: una copertina di ricerca può essere di un titolo non ancora in cache, e perdere quell'evento sarebbe un buco silenzioso proprio sui titoli nuovi. Il job ignora gli eventi dei titoli sconosciuti.
- **Lo skip non è un evento.** Nessun client lo manda: `taste_input(uid)` lo deriva come "copertina vista in N sessioni distinte e mai aperta", contando le **sessioni** e non le impression (dieci scroll nella stessa sessione sono una noia sola, non dieci rifiuti).
- **Un solo `IntersectionObserver` per tutta l'app** (`SignalsProvider`, montato nel layout `(app)`), più un `MutationObserver` per gli scaffali che arrivano dopo: le copertine si dichiarano con `data-signal="<tipo>:<id>:<superficie>:<posizione>"` (prop `signal` di `PosterCard`), quindi **restano componenti server** — è lo stesso schema del `PreviewLayer`. Gli elementi che valgono solo al tocco (il bottone di una piattaforma) usano `data-signal-tap="<tipo>|<bersaglio>"`: con `data-signal` l'observer li conterebbe come copertine viste. Le superfici sono un **elenco chiuso** in `src/lib/taste/surfaces.ts`: una stringa scritta a mano viene scartata da `parseSignal` e l'evento non arriva mai.
- **`sessionId` in memoria**, uno per scheda del browser: `localStorage` e `sessionStorage` sono vietati per i dati utente, e la sessione è anche ciò che rende onesto lo skip. Un ricaricamento della pagina apre una sessione nuova; la navigazione dentro l'app no.
- **Il client non può dichiarare `library_add` né `rate`**: `parseEventsBody` (`src/lib/taste/events.ts`, puro, con un test che lo dimostra) li rifiuta, e li scrive il server da `logSignal` dentro le action di `watch/actions.ts`. Accettarli da fuori vorrebbe dire lasciare che chiunque si costruisca il profilo di gusto con un `curl`. Gli altri stati della libreria **non** vanno in `user_events`: `taste_input` li legge da `watch_entries`, e scriverli anche lì li conterebbe due volte.
- **`POST /api/events`** è un route handler e non una Server Action (nessuna rivalidazione, nessun giro di cookie per lotto, e `sendBeacon` non sa invocare una Server Action). Risponde **sempre 204**, anche quando scarta: il client non deve mai avere motivo di riprovare. **Non** va in `PUBLIC_PATHS` del middleware — l'opposto di `/api/jobs`: qui la sessione a cookie *è* l'autenticazione. Scrive col client dell'utente (RLS attiva) e `ignoreDuplicates`.
- **L'indice unico parziale `user_events_impression_unica_idx`** su `(user_id, session_id, title_id, media_type, surface) where kind = 'impression'` è ciò che tiene basso il volume: una copertina rivista nella stessa sessione costa un `on conflict do nothing`, non una riga (verificato: un inserimento identico scrive 0 righe).
- **Il calcolo è una funzione pura**, `buildTasteProfile` (`src/lib/taste/profile.ts`, Vitest), come `zappScore` della fase B. Pesi e decadimento stanno in `weights.ts`: da +10 (voto ≥ 8) a −4 (dismiss), emivita 180 giorni. **Con un voto basso lo stato non conta**: un voto è una dichiarazione, finire una serie è un'abitudine, e sommandoli "l'ho visto tutto e gli do 3" restava +3 e il profilo imparava il contrario di quel che l'utente aveva detto. Le quote positive di una dimensione sono normalizzate sulla **massa positiva** (i rifiuti restano negativi e dicono "questo no"); `massa` è la fiducia nel profilo, e la fase C la userà per decidere quanto personalizzare. I generi **non sommano a 1**: un titolo ne ha più d'uno.
- **`persone` e `lingua` costano una lettura di `titles.raw` limitata ai 50 titoli di testa**: `raw` pesa ~27 KB per riga (è l'errore da 34 MB per cui esiste `TITLE_LIST_COLUMNS`) e `titles` **non ha** una colonna `original_language`.
- **Due job** sulla rotta `/api/jobs/[job]` già esistente, che ereditano il lucchetto di `job_runs`: `taste-refresh` (migration `0025_cron_taste.sql`, ogni ora **al minuto 40** — al minuto 0 gira `ratings-refresh` e al 20 `trailers`, e i tre si contenderebbero la stessa finestra di 60 s della funzione Vercel) e `events-prune` (ogni notte alle 03:00: 90 giorni di storico, più la cancellazione di sicurezza per chi ha spento la personalizzazione). A fine onboarding `refreshTasteFor` gira **subito** per quell'utente: la prima home non deve essere cieca fino all'ora piena.
- **Onboarding in due passi, una sola rotta e una sola Server Action**: `onboarding_completed_at` si scrive solo alla fine, così chi abbandona al passo 2 ricomincia dal passo 1 senza restare in un limbo. Il passo 1 resta montato e nascosto (rimontarlo perderebbe quel che l'utente ha scritto) e "Salta" azzera il campo `seed` **nel DOM**, non con lo stato: React non rirenderizza prima dell'invio e le scelte partirebbero lo stesso. Al passo 2 la testata della pagina viene spenta via `[data-onb-intro]`: dice "Scegli il tuo username", che lì è falso. Griglia da `getSeedCandidates` (classifiche già in DB + trending che Scopri carica comunque: **nessuna chiamata esterna nuova**); fonti vuote → griglia vuota → il passo 2 non compare, invece di rompersi.
- **`getTaste` di `src/lib/home/hero.ts` e `getTasteProfile` di `src/lib/taste/queries.ts` sono due cose diverse**: la prima dà i due generi più visti al carosello, la seconda legge la riga di `user_taste`.
- **L'interruttore "Personalizza i consigli"** (profilo, accanto a "Profilo privato") spegnendosi **cancella** `user_events` e `user_taste`, non li ignora e basta; i titoli seed restano, perché li ha scelti l'utente a mano e non sono telemetria. Il controllo sta su tre livelli: il provider non aggancia nulla, la rotta scarta, il job salta l'utente.
- **Collaudo** (`pnpm tsx --conditions=react-server scripts/taste-dump.ts <user_id>`): stampa il profilo dopo averlo ricalcolato. È l'unico modo di rispondere alla domanda che i test unitari non pongono — "questo profilo somiglia a quello che l'utente guarda davvero?". Su un utente con 1302 entry: massa 648, dramma/commedia/azione in testa, decenni 2020 46% e 2010 34%, film 72% / serie 28%.

### Algoritmo: voti e classifiche (fase B)

Sottosistema B dei cinque dell'algoritmo (spec `docs/superpowers/specs/2026-09-07-algoritmo-fase-b-catalogo-zappscore-design.md`, registro `.superpowers/sdd/2026-09-07-algoritmo-fase-b-catalogo-zappscore/progress.md`: quest'ultimo ha le scoperte fatte sul campo, il codice da solo non le racconta). Sostituisce `titles.vote_average` (TMDB puro, poche migliaia di voti, cieco alla critica) con lo **ZappScore** e aggiunge le classifiche settimanali per piattaforma.

- **Tabelle nuove** (migration `0020_ratings_charts.sql`): `title_ratings` (voti aggregati, pk `title_id, media_type`), `title_charts` (una riga per fonte/provider/paese/periodo/posizione) e `job_runs` (registro esecuzioni, nessuna policy select: solo il service client). **Non colonne su `titles`**: quella riga viene riscritta per intero da `upsertTitle` a ogni rinfresco del cache TMDB (7 giorni) e i voti sparirebbero.
- **Lo ZappScore** (`src/lib/ratings/score.ts`, funzione pura `zappScore`, test in `score.test.ts`): per ogni fonte con voti, tiraggio bayesiano `adjusted = (votes·R + m·C)/(votes + m)` verso la media della fonte (`SOURCE_CALIBRATION`: `m` = soglia di voti, `C` = media globale) — un 10/10 con 3 voti su TMDB (`m` 500) diventa ~6,6. Dentro ogni bacino le fonti pesano `log10(1 + votes)`: lineare farebbe sparire tutto sotto IMDb, uguale farebbe contare 67 critici come un milione di persone. Due bacini — **pubblico** (imdb, tmdb, trakt, letterboxd, audience) e **critica** (tomatoes, metacritic) — mescolati `70/30`, ma il peso della critica (`CRITIC_WEIGHT` 0,30) si riduce quando i critici sono pochi (`min(1, massaCritica / CRITIC_FULL_MASS)`): un solo critico non muove il voto di un film. Nessuna fonte utilizzabile → `score: null`, mai un numero inventato. **`SOURCE_CALIBRATION.c` sono stime dichiarate come tali** (commento con la data), da ricalibrare con una query su `title_ratings` appena supera le 5000 righe.
- **Sette fonti**, non otto: `rogerebert` è stata tolta durante l'implementazione (§ sotto, `score` è `null` su 100/100 titoli verificati) — il bacino critica è solo Rotten Tomatoes critici + Metacritic.
- **Il motore periodico**: quattro job su `pg_cron` (migration `0021_jobs_cron.sql` + `0023_cron_justwatch.sql`) chiamano `src/app/api/jobs/[job]/route.ts` (`export const maxDuration = 60`) via `call_zapp_job`, letto dal Vault (`zapp_jobs_secret`). Autenticazione: header `x-jobs-secret` contro `JOBS_SECRET` con `crypto.timingSafeEqual` (lunghezze diverse rifiutate prima del confronto, mai in query string). Orari UTC: `charts-netflix` martedì e mercoledì 04:00, `charts-justwatch` ogni giorno 05:00, `charts-resolve` ogni giorno 05:30, `ratings-refresh` ogni ora. Lucchetto contro sovrapposizioni: indice unico parziale `job_runs_uno_aperto_idx` (migration `0022_job_runs_lucchetto.sql`) su una riga `job_runs` con `ended_at is null`, non un controllo applicativo — una race fra due `pg_cron` dava due righe aperte prima della correzione.
- **Le classifiche**: `title_charts.source` distingue `netflix_tudum` (Top 10 **ufficiale** IT, settimanale) da `justwatch` (popolarità per provider, stima quotidiana) e da `tmdb` (ripiego quando JustWatch non risponde per un provider). **La distinzione deve restare visibile nelle intestazioni** (Top 10 ufficiale vs "più visti" stimato): non sono la stessa cosa e mescolarle in UI mentirebbe.
- **La lingua**: `en-US` compare **solo** in `src/lib/charts/resolve.ts`, nel ciclo di corrispondenza coi titoli inglesi di Netflix Tudum (`resolveChartTitle` cerca prima in inglese, poi ricade su `it-IT`). Tutto il resto resta italiano: `TMDB_LANGUAGE = "it-IT"` di default, `getOrFetchTitle` non passa lingua, e **`title_charts.raw_title` non va mai renderizzato** — ogni titolo mostrato viene dalla riga `titles` (italiana), risolta via FK prima che l'id arrivi a uno scaffale.

**Le trappole** (costate tempo reale il 2026-09-07, verificate con la chiave/i dati veri in mano, non deducibili dal codice):

1. **MDBList vuole la chiave in `?apikey=`**: `X-API-Key` risponde 401, `Authorization: Bearer` vuole un token OAuth e non la chiave. Unico metodo che funziona: parametro di query (commentato in `mdblist.ts` — un segreto in query string è normalmente sconsigliato, ma qui è l'unico modo supportato e la chiamata parte solo dal server via HTTPS).
2. **Il campo `id` della risposta MDBList non è l'id TMDB** — è l'id interno di MDBList (Star Wars: `id 349`, `ids.tmdb 11`). Su 98 titoli chiesti, **zero corrispondenze** indicizzando per `item.id`; l'id giusto sta in `item.ids.tmdb` (`mdblist.ts`).
3. **`value` cambia scala fra gli endpoint della stessa fonte**: Letterboxd vale 4,4/5 sul titolo singolo e 8,4/10 nel lotto (`value/score*100` dà 5 in un caso, 10 nell'altro). `trakt` e `tmdb` sono 0-100, non 0-10 come dichiarato nella spec iniziale. Per questo `parseMdblistRatings` (`src/lib/ratings/parse.ts`) legge **`score`** (sempre 0-100, presente su quasi tutti i titoli) e mai `value`; la scala nativa (`SOURCE_CALIBRATION.display`) serve solo a _mostrare_ "IMDb 8,4" / "RT 92%", non al calcolo.
4. **I codici pacchetto di JustWatch cambiano da paese a paese**: Prime Video in Italia è `prv` (`packageId 119`), non `amp` (che non esiste nell'elenco italiano — era nella spec iniziale, sbagliato). Rilettura con `packages(country: "IT", platform: WEB)`; `src/lib/charts/justwatch.ts` verifica anche `offers { package { packageId } }` sul risultato, non si fida solo del filtro `packages` in query.
5. **Il TSV di Netflix Tudum risponde 403 senza User-Agent da browser**, pesa 31 MB e va letto **a flusso**, mai `await res.text()` (`src/lib/charts/netflix.ts`/`netflix-parse.ts`): misurati 11,3 s e ~10 MB di crescita d'heap su un file da 31, su una funzione Vercel Hobby — il piano B (Supabase Edge Function) non serve.
6. **Netflix pubblica con ~15 giorni di ritardo** (misurato: settimana più recente scaricata 15 giorni prima della data di scarico). Le classifiche perciò si filtrano sui **periodi correnti letti dal database** (`periodiCorrenti` in `src/lib/charts/queries.ts`), non con una finestra di giorni fissa: una finestra a 8 giorni scelta a tavolino avrebbe escluso _ogni_ riga Netflix in silenzio. Netflix è settimanale e in ritardo, JustWatch è quotidiana: nessun singolo numero di giorni concilia le due cadenze, e ogni coppia `(source, provider)` ha il proprio periodo corrente.
7. **`/api/jobs` deve stare in `PUBLIC_PATHS`** di `src/lib/supabase/middleware.ts`: `pg_cron` non porta cookie di sessione, e senza quella riga ogni chiamata riceveva un 307 verso `/login` — i job non giravano mai, e senza una riga in `job_runs` nessuno se ne accorgeva. Non è un buco: quelle route hanno un'autenticazione più forte (segreto di 64 caratteri, confronto a tempo costante) di quella a cookie che protegge il resto dell'app.

Lettura in `src/lib/ratings/queries.ts` (`getRatings`, batch, React `cache()`) e `src/lib/charts/queries.ts` (`getChartBadges`, `getProviderChart`, `getRisingChart`, `getTopRatedOnZapp` — quest'ultima con l'hint FK esplicito `titles!title_ratings_title_fkey!inner(...)`: la chiave composita `(title_id, media_type)` non è dedotta da PostgREST, un hint implicito darebbe 400 e uno scaffale vuoto in silenzio). UI: `RatingsPanel` (sostituisce `TitleRating` nella scheda titolo), `ChartShelf` in `DiscoverSections.tsx` (Top 10 Netflix, più visti per provider, in salita, i meglio votati su Zapp — quest'ultimo sostituisce i vecchi scaffali ordinati per `vote_average` TMDB). Ovunque manchi ancora la riga `title_ratings`, ripiego sul voto TMDB di oggi: nessuna regressione mentre il catalogo si riempie (riempimento pigro alla prima apertura di una scheda titolo, dentro il `Suspense` che già esiste).

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
- **È un popup, non una pagina**: riquadro 400px in verticale sul telefono e
  **21:9 su desktop** (`lg:aspect-[21/9]`, largo `min(1120px,82vw)` e
  `min(1320px,76vw)` da `2xl`: 1120×480 a 1440, 1320×566 a 1920), con l'app
  velata e visibile tutt'attorno — un velo a
  tutto schermo lo faceva leggere come una schermata a sé. Il fondo del riquadro
  **non è nero**: è `.daily-veil` (globals.css), grigio scuro che sfuma nel
  viola chiaro `#c5baf4` dei bottoni. Dentro c'è il fotogramma del film vincente,
  ma **dietro al vetro, non in primo piano** (richiesta utente 2026-09-09: da
  immagine di copertina "ostruiva la visibilità"; poi "deve comunque esserci
  l'immagine, ma sfumata bene"). È il **fotogramma 16:9**, non la locandina: deve
  riempire la card esattamente a qualunque forma (verticale sul telefono, 21:9 da
  `lg`), e una 2:3 lì dentro o si taglia o lascia dei vuoti — provata a due strati,
  scartata dall'utente. Sorgente `original` e `unoptimized` come gli altri backdrop,
  `object-cover`, `opacity-[0.85]`, `blur-[10px]` (`lg:blur-[14px]`), dentro un
  riquadro che sborda del 14% perché la sfocatura non lasci un alone sui bordi; sopra
  un velo `bg-black/25` e poi `.daily-glass` — le stesse tinte grigio/lavanda del velo,
  qui traslucide (grigio a 0,46/0,52/0,58). Niente veli neri pieni. **Il contenuto sta sopra al vetro solo perché è `relative z-10`**: fotogramma
  e `.daily-glass` sono elementi *posizionati*, quindi si dipingono sopra a un blocco
  statico, e per tre giri di ritocchi il testo bianco è stato letto attraverso il velo
  — cioè grigio, per quanto `color` dicesse `#ffffff`. Misurato, non guardato: lo
  screenshot Playwright del solo `h2` aveva luminanza massima **102**; con lo `z-10`
  è 255. Un colore giusto nel DevTools non prova che sia quello a schermo.
  **Sopra l'immagine il testo è bianco pieno con un'ombra**, mai un grigio dei token
  (richiesta utente: "bianche e ben visibili"): overline e titoli del podio
  `font-semibold`, domanda `font-medium`, voti, motivo e nome bianchi, tutti con
  `text-shadow`. Da `lg` la
  domanda sta a sinistra in grande, le proposte a destra su una riga da sei.
  Sul 21:9 di desktop il podio deve starci **tutto senza scorrere** — overline,
  domanda, gradini, motivo: locandine 124/96px (146/112 da `2xl`), `gap-3`,
  `lg:pt-5 lg:pb-2`; misurato con Playwright (`section.scrollHeight` = `clientHeight`),
  non a occhio: prima la domanda era tagliata in alto e il motivo finiva sotto i puntini. Le informazioni stanno **libere sul fondo**, senza
  scatole interne (richieste utente 2026-09-08): davanti a un
  campo di ricerca vuoto ci si blocca a pensare a tutti i film, quindi il
  composer apre con le **proposte dalla libreria** — `getAnswerSuggestions`
  (voti più alti, poi visti di recente senza doppioni, filtrate per
  `media_scope`) — e un tocco basta a rispondere; la ricerca si apre solo con
  "Cerca un altro titolo". Podio con entrata sfalsata e voti che salgono da zero,
  tutto fermo con `prefers-reduced-motion`.
- Moduli: `src/lib/daily/` (`rank.ts` puro con Vitest — podio, pareggio a chi ha
  scelto per primo, motivo in evidenza, `cleanReason`; `queries.ts` server-only;
  `actions.ts` Server Actions) e `src/components/daily/`. In pagina è **un solo
  componente client** montato nello slot `right` di `TopNav` dal layout `(app)`,
  dietro `Suspense` come la campanella: rende l'icona accanto alla campanella e,
  alla prima apertura del giorno, l'overlay a tutto schermo (podio di ieri →
  domanda di oggi, due schermate a snap come `ScanMode`, chiusura che rimpicciolisce
  verso l'icona).
- **Col popup aperto si scorre dentro il popup, non la pagina sotto**: mentre è
  aperto il `body` è `overflow: hidden` **e** `position: fixed` con `top` alla
  posizione corrente (su iOS il solo `overflow` non basta), rimessa alla chiusura
  con `window.scrollTo` — altrimenti chiudendo si tornava in cima. Dentro:
  `overscroll-contain` ovunque (niente scroll chaining) e **lo scorrevole
  orizzontale ha `min-h-0 flex-1` a tutte le misure**: senza, sotto `lg` cresceva
  col contenuto, il riquadro lo tagliava e non scorreva più niente né dentro né
  fuori (1044px di contenuto in 656 di riquadro, verificato con Playwright).
  Sotto `lg` scorre lo scorrevole (`overflow-y-auto`), da `lg` la singola
  schermata (`lg:h-full lg:overflow-y-auto`), dove il 21:9 dà un'altezza vera.
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
- **Ogni risposta è firmata, anche quella di un profilo privato** (scelta utente
  2026-09-08: dalla risposta si deve poter arrivare al profilo e mandare la
  richiesta di amicizia). L'autore si legge da **`user_search`**, non da
  `profiles`: la vista espone solo nome utente, nome e avatar — gli stessi campi
  che già mostra a chi cerca quel nome utente — ed esiste apposta per trovare un
  privato e invitarlo. `profiles_select_visible` resta com'è, quindi libreria,
  attività e statistiche di un privato restano nascoste; `/u/<username>` di un
  privato mostra nome, foto e il bottone Aggiungi, con le liste vuote. Il motivo segnalato 3 volte sparisce dalla vista (colonna
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
- **Un asse di scorrimento per elemento**: l'overlay scorre in orizzontale (due
  schermate con `snap-x snap-mandatory`) e **ogni schermata** scorre per conto suo in
  verticale. Con i due assi sullo stesso elemento, sul telefono lo snap orizzontale
  rientrava a ogni scorrimento verso il basso e la card tremava scivolando a sinistra
  (segnalazione utente 2026-09-09). Collaudo: `node scripts/daily-scroll-check.mjs`
  (Playwright 390x844, poi schermo corto per far eccedere il contenuto: la card non si
  sposta di lato, il contenuto scorre, le frecce cambiano schermata).
- **Il podio è un podio** (2026-09-09, richiesta utente): tre gradini in vetro
  **attaccati** (separati sembravano tre schede), il vincitore al centro sul più alto
  e più largo, la locandina sopra al suo gradino, la medaglia — oro, argento, bronzo,
  anello in `conic-gradient`, esadecimali grezzi come per `PROVIDER_BRAND` — appesa al
  bordo basso della locandina. Titolo e voti stanno **dentro** al gradino: è la targa
  del posto, non una scatola vuota. Sotto, un filo di luce fa da pavimento; dietro al
  primo, l'unico bagliore dorato della schermata. Da `lg` il riquadro è 21:9 e il podio
  sta a destra, domanda e motivo a sinistra: schiacciato in colonna non ci stava.
  I gradini salgono dal terzo al primo (`framer-motion`, molla), i voti contano da zero.
- **I coriandoli cadono una volta al giorno**: `Confetti.tsx` (canvas, nessuna
  libreria, ~90 rettangoli disegnati a mano, 3,2 s con dissolvenza finale) parte solo
  quando il popup **si apre da solo**, cioè alla prima apertura del giorno
  (`celebrate={!seen}`); riaperto dall'icona il podio è già noto e resta quieto.
  `prefers-reduced-motion`: niente canvas.
  Verifica a occhio: `node scripts/daily-podium-shot.mjs` semina una classifica finta
  su ieri, apre il popup con una sessione vera e salva `podio-390-coriandoli.png`,
  `podio-390.png`, `podio-1440.png`. Va lanciato **a server appena avviato**: i
  conteggi del podio stanno in `unstable_cache` per giorno.

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

### Per genere (pillole della home)

Le pillole "Per genere" **non sono l'elenco di TMDB**: quello è una tassonomia da
archivio (dentro c'è "Film TV", fuori ci sono i classici e gli anime) e ordinato per
popolarità dava, sotto Horror, l'horror uscito questa settimana. Sono un catalogo
curato, e la lista di ognuna è **testa scelta a mano + coda ordinata sul gusto**
(scelta utente 2026-09-08).

- `src/lib/genres/catalog.ts` (puro, Vitest): 18 voci — gli 11 generi veri più
  Classici, Anime, Supereroi, Storie vere, Commedia italiana, Cult anni 80,
  Documentari. Ogni voce porta `pillola`/`titolo`/`sottotitolo` e la **ricetta TMDB**
  (generi in or, esclusioni, keyword, lingua originale, finestra di anni, soglie di
  voti proprie), più `tv`: `null` = solo film, altrimenti le differenze per le serie
  (Thriller → mistero+crime, che fra le serie 53 non esiste). `chiavi` dice su quali
  dimensioni del profilo (fase A) si misura la voce: `generi` per quelle ovvie,
  `decenni` per Classici e Cult anni 80, `lingua` per Anime e Commedia italiana.
  `orderGenres` porta in testa le 4 voci più affini e lascia il resto nell'ordine del
  catalogo — con profilo povero o personalizzazione spenta l'ordine è quello scritto,
  uguale per tutti.
- `src/data/genre-picks.json` (da `scripts/build-genre-picks.ts`, semi scritti a mano
  come i mood; la risoluzione TMDB sta in `scripts/picks-lib.ts`, condivisa con
  `build-mood-picks.ts`): ~290 titoli, la testa di ogni voce. A runtime **non costa
  nessuna chiamata esterna**.
- `src/lib/genres/list.ts` (`getGenreList` in pagina, `genreListFor` per gli script):
  testa curata per fama (`ordinaPerFama`, il gusto ritocca fra vicini) + coda da
  `discoverForGenre` (3 pagine, `revalidate: 3600`, nessun parametro personale: cache
  condivisa fra tutti) ordinata per `affinity` della fase C, con `arricchisci` per
  ZappScore/piattaforme/persone, gli stessi filtri del motore (`consigliabile`,
  niente titoli già in libreria) e `diversify` col tetto per genere alzato — dentro un
  genere quel tetto rimanderebbe in coda quasi tutti.
- **Mai titoli non ancora usciti**: `discoverForGenre` mette sempre un tetto a oggi
  (`primary_release_date.lte` / `first_air_date.lte`). Senza, la coda di Horror si
  riempiva di uscite future con quattro voti. Le telenovelas (10766) sono escluse da
  tutte le liste di serie, come reality e talk show lo sono in `GENERI_TV_ESCLUSI`.
- **Il genere sta nel percorso**: `/discover/movie/classici`, `/discover/tv/classici`.
  Con `?type=…&g=…` sullo stesso `/discover` **il click non navigava affatto** — stesso
  pathname, l'App Router considerava di essere già lì e l'URL non si muoveva (visto con
  Playwright il 2026-09-08; valeva anche per le vecchie pillole `?genre=<id>` di Scopri,
  che quindi erano morte). I vecchi indirizzi con query fanno `redirect` alla pagina
  nuova. Chiave sconosciuta → `notFound()`.
- Verifica: `scripts/genre-dump.ts` per **leggere** le liste (è così che si sono viste le
  uscite future e i polizieschi sotto Thriller) e `scripts/genre-check.mjs` in browser,
  con le stesse due trappole di `nav-check.mjs` (service worker bloccato, domanda del
  giorno segnata come vista).

### ZConnection (estensione browser)

Un'estensione MV3 (`extension/`, JS piano, fuori da `tsconfig.json`/`eslint.config.mjs`:
non passa dal build di Next) segna su Zapp cosa l'utente guarda su Netflix mentre lo
guarda. Spec: `docs/superpowers/specs/2026-09-09-zconnection-browser-design.md`
(la §6 è stata **riscritta** il giorno stesso da una sonda vera, `src/lib/scrobble/__fixtures__/netflix.json`:
la prima stesura si appoggiava a `navigator.mediaSession`, per simmetria col companion
Android — un'idea sopravvissuta tre ore, smentita da dieci minuti di sonda invece di un
prodotto da riscrivere dopo). **L'estensione è muta**: cattura solo i metadati grezzi e li
spedisce a `/api/scrobble`; titolo, stagione/episodio, corrispondenza TMDB e regole di
completamento si calcolano **sul server** (`src/lib/scrobble/*`), con lo stesso codice
pronto a servire anche il companion Android del 4 settembre. Un formato che cambia si
corregge in Zapp, senza aspettare la review dello store.

- **Netflix non popola `navigator.mediaSession`**: undici righe di sonda, `title`/
  `artist`/`album` sempre nulli, `playbackState` sempre `"none"`. **Il titolo viene dal
  DOM**, letto in `extension/capture.js` da uno script iniettato nel **main world**
  (`"world": "MAIN"`, Chrome 111+: nello isolated world `navigator.mediaSession` è un
  oggetto diverso e non vede i metadati della pagina). Tre selettori, in ordine di
  fiducia decrescente e ciascuno con un vincolo che non si vede leggendo il codice da
  solo: `[data-uia="video-title"]` **per intero incolla senza separatori** l'h4 (nome
  pulito) e lo span dell'episodio ("Hajime no Ippo: The Fighting!E23Episodio 23") —
  **non si fa il parse di quella stringa direttamente**, va tolto il prefisso noto
  (`showText`) e letto il residuo; `[data-uia="video-title"] h4` dà il nome pulito **solo
  nelle serie**, e la sua **assenza** è il modo per distinguere un film (non la forma del
  dettaglio); `pause-ad-title-display` (il pannello di pausa) porta stagione, episodio e
  nome espliciti insieme (`"S1:E23 \"Episodio 23\"\n20 minuti restanti"`, si tiene solo
  la prima riga) ed è la fonte migliore quando c'è — compare anche fuori pausa
  (l'autoplay del prossimo episodio l'ha mostrato con `state: "playing"`). **Senza il
  pannello di pausa la stagione non è esposta da nessuna parte**: resta `null`, `parseMedia`
  (`src/lib/scrobble/parse.ts`) non la inventa mai. **`episode-preview-title` non si legge
  mai**: è l'anteprima del **prossimo** episodio mentre si guarda quello corrente (visto
  nella sonda: si guardava l'episodio 24 e quel campo diceva "Episodio 25") — chi lo prende
  per buono scrive il numero sbagliato.
- **Si guarda solo dentro `/watch/<id>`** (`isWatchUrl` in `src/lib/scrobble/sites.ts`).
  Sfogliando il catalogo (`/browse`, `/browse/genre/...`) ci sono `<video>` **veri**: la
  sonda ne ha visto uno arrivare a 70,118/70,118 secondi, cioè al 100%, da solo — senza
  questo filtro l'estensione avrebbe segnato come vista un'anteprima mai scelta
  dall'utente.
- **La memoria del titolo sta nell'estensione, non nel server.** I tre selettori
  spariscono dal DOM quando i comandi del player si nascondono (successo in due battiti
  su nove nella sonda): `capture.js` ricorda l'ultima stringa non vuota vista per
  l'`id` di `/watch/` corrente e la rispedisce finché quell'id non cambia; al cambio di
  id la memoria si azzera **sempre**, un episodio non deve mai ereditare il titolo di un
  altro. C'è anche il battito inverso, catturato dalla sonda: l'`id` nell'URL è già
  cambiato (autoplay) ma il `<video>` non è ancora arrivato (`currentTime`/`duration`
  nulli) — `stato()` ritorna `null` e non si manda nulla, non si eredita la posizione di
  un episodio diverso. Il modulo di riconoscimento (`parse.ts`, `sites.ts`) resta **puro e
  senza stato**: prende `{show, detail}` o un `RawEvent` e ritorna un `ParsedMedia` o
  `null`, sempre la stessa cosa per lo stesso input. I test non girano tutti sulla stessa
  fonte: `sites.test.ts` importa davvero `__fixtures__/netflix.json` e ci gira sopra
  (`parseEvent`, `isWatchUrl`); `parse.test.ts` copre `parseMedia` con stringhe scritte a
  mano nel test, identiche nella forma ai valori della sonda ma non caricate da quel file.
- **Le tre parti pure e testate** sono `parse.ts` (`parseMedia`/`stableKey`), `rules.ts`
  (`decide`: soglie di completamento e minutaggio) e `rank.ts` (`scoreCandidate`, il
  punteggio di un candidato TMDB). `match.ts` **non è puro**: importa `server-only`
  perché `matchTitle` fa rete (TMDB) e DB (cache `titles`, `title_providers`), quindi non
  si carica da Vitest — lo score che usa vive apposta in `rank.ts`, un file a sé, con lo
  stesso schema di `src/lib/cinema/booking/match.ts` rispetto a `fetch.ts`. `matchTitle`
  prova prima la cache `titles` (nessuna chiamata di rete: quasi sempre il titolo è già
  stato aperto in Zapp), poi `searchTv`/`searchMovies`; il punteggio pesa anche **se la
  piattaforma su cui si guarda offre quel candidato** in `title_providers` IT (segnale
  forte: si sta guardando su Netflix, il candidato giusto è quasi sempre offerto da
  Netflix).
- **`position_ms`/`position_season`/`position_episode` sono "dove sei adesso"**, colonne
  di `watch_entries` (migration `0034_scrobble_profiles_progress.sql`) diverse da
  `season_number`/`episode_number`, che restano "l'ultimo episodio **finito**". Confonderle
  dichiara viste puntate mai viste — è successo davvero in revisione. La RPC
  `scrobble_apply` lo tiene separato: a completamento `position_ms`,
  `position_duration_ms`, `position_season` e `position_episode` tornano `null` (non c'è
  più un "riprendi"), ma `position_at` **non** si azzera — resta impostata all'`at`
  dell'evento, perché è anche la guardia temporale: si scrive solo se l'evento è più
  recente di `position_at` (un riavvolgimento voluto dall'utente è invece legittimo,
  perché arriva con un `at` più recente); `season_number`/`episode_number` avanzano **per
  stagione**, non per numero di episodio nudo (un vecchio `greatest` sull'episodio
  confrontava S2E1 con S1E10 e dichiarava "visto fino a S2E10").
- **Le scritture per conto di un dispositivo passano solo dalla RPC `scrobble_apply`**
  (migration `0035_scrobble_apply.sql`), `security definer` e **revocata da `anon`,
  `authenticated` e `public`**: mai il service client sui dati utente da `/api/scrobble`
  (`src/app/api/scrobble/route.ts`), che gli passa solo un `intent` già calcolato da
  `decide()`. Conseguenza pratica: essendo revocata, PostgREST non la espone e
  `supabase gen types` **non la elenca mai** (come `log_watch_activity`,
  `notify_friendship`) — il tipo `ScrobbleApplyClient` in `route.ts` è scritto a mano di
  proposito, per sempre, non un debito da chiudere al prossimo giro di generazione.
- **`min(user_id)` non esiste in Postgres, e ha tenuto ferma tutta la funzionalita'**
  (migration `0036`, 2026-09-09). `scrobble_apply` contava i membri con
  `select count(*), min(user_id)`: `min()` non e' definito su `uuid`, quindi la funzione
  sollevava `42883` a **ogni** chiamata. Il sintomo non assomigliava alla causa: l'eccezione
  annulla la transazione, quindi spariva anche l'`update devices set last_seen_at` fatto
  tre righe sopra, e da fuori — `last_seen_at` nullo, zero `watch_sessions`, zero
  `pending_scrobbles` — sembrava che le richieste **non arrivassero affatto**, mandando a
  cercare il guasto nell'estensione. Ora e' `(array_agg(user_id))[1]`: il valore serve solo
  quando i membri attivi sono esattamente uno, quindi va bene un elemento qualsiasi.
  **Nessun test poteva vederlo**: Vitest copre solo funzioni pure, e una migration si legge
  come SQL plausibile finche' non la si esegue. La lezione operativa: dopo aver applicato
  una migration che definisce una funzione, **chiamarla** (`select public.scrobble_apply(...)`
  via MCP con dati finti) prima di dichiararla fatta — `apply_migration` che risponde
  `success` dice solo che il corpo e' stato accettato, non che gira.
- **Finché i membri attivi del dispositivo non sono esattamente uno, la libreria non si
  tocca**: `scrobble_apply` conta `device_members` non in pausa, scrive comunque
  `watch_sessions` (con `user_id = null` se i membri non sono uno) ma con zero o più di
  uno **esce subito dopo**, senza toccare `watch_entries`. Con un solo membro attivo è
  certo per definizione e scrive subito. **Qui il codice si ferma**: `device_profiles`
  (migration `0034_scrobble_profiles_progress.sql`, mappatura profilo del sito -> utente
  Zapp) e `pending_scrobbles` (migration `0033_zconnection.sql`, la coda degli eventi
  **ambigui o non risolti**, con `reason` fra `ambiguous_title`/`unknown_title`/
  `ambiguous_user`) esistono come tabelle ma nessun modulo applicativo le legge o le
  scrive (solo i tipi generati le elencano), e nel popup dell'estensione non c'è un
  bottone "Non sono io". La risoluzione dell'attribuzione — quella mappatura, quella
  coda, "Non sono io" — è fase 3 della spec (§17): dichiarata fuori scope da questo
  piano, non ancora scritta.
- **Il riconoscimento del titolo non si ferma alla prima ipotesi** (2026-09-09, dal primo
  collaudo vero: cattura e minutaggio funzionavano e in libreria non arrivava niente).
  Tre difetti distinti, tutti dentro `matchTitle`/`parseMedia`:
  1. **Il tipo lo dice il sito, non il dettaglio.** `parseMedia` deduceva
     `kind` dal solo `detail` (`rest ? "tv" : "movie"`), ma su Netflix l'h4 dentro
     `[data-uia="video-title"]` esiste **solo nelle serie**: nei battiti coi comandi del
     player nascosti il dettaglio manca e una serie passava per film, quindi si cercava su
     `search/movie` dove non poteva esserci. Ora `parseMedia(show, detail, kindHint)` e
     `netflixFields` dichiara `"tv"` quando l'h4 c'e'. Un episodio riconosciuto batte
     comunque qualunque suggerimento contrario. **E il tipo resta un'ipotesi**: se sul
     primo non si trova niente, `matchTitle` prova l'altro — tranne quando stagione o
     episodio sono noti, che e' una prova e non un'ipotesi.
  2. **Il sottotitolo del distributore affondava il confronto.** `titleSimilarity` esclude
     **di proposito** il caso "titolo di partenza piu' lungo del nome TMDB", perche'
     nell'import del CSV quella coda e' quasi sempre un "Parte II" (un'opera diversa). Su
     un player e' un'altra cosa: l'h4 dava "Hajime no Ippo: The Fighting!" mentre TMDB ha
     **solo** "Hajime no Ippo" — un unico risultato, somiglianza 0,667, mai riconosciuto.
     `playerTitleSimilarity` (in `rank.ts`, puro e testato) da' `MAIN_PART_SCORE` 0,87 a un
     titolo che combacia a meno del sottotitolo: sopra la soglia, ma **sotto**
     l'uguaglianza esatta, cosi' dove TMDB ha entrambi ("Squid Game" e "Squid Game: La
     sfida") vince quello giusto. I seguiti restano fuori (`SEGUITO`: parte, stagione,
     volume, capitolo, numero nudo). **La regola non va spostata in
     `text/similarity.ts`**: li' la severita' e' voluta e serve all'import.
  3. **Si confrontava un nome solo.** Netflix scrive il titolo con cui distribuisce
     l'opera in Italia, che a volte e' quello italiano di TMDB e a volte l'originale: ora
     `scoreCandidate` tiene il migliore fra `name` e `originalName`, come fa gia'
     `pickBestMatch` per l'import. E la ricerca prova fino a `MAX_VARIANTS` (3)
     formulazioni da `queryVariants` — le stesse dell'import, perche' Netflix scrive i
     titoli allo stesso modo — fermandosi alla prima che convince, quindi il costo normale
     resta una ricerca sola. **Il punteggio si misura sempre contro il titolo intero**, non
     contro la formulazione ridotta: la variante serve a farsi dare i candidati, non ad
     abbassare l'asticella.
  Collaudo: dieci titoli veri (anime col sottotitolo, film col titolo italiano e
  con l'originale, serie italiana, serie senza dettaglio) passati per `parseEvent` +
  `matchTitle` contro TMDB vero — 8 su 10 prima, 10 su 10 dopo. I test unitari fissano le
  regole; **la prova che il riconoscimento funziona e' quella contro TMDB**, perche' i
  due difetti veri dipendevano da cosa TMDB ha davvero in catalogo.
- **Un titolo non riconosciuto finisce in `pending_scrobbles`** (`reason: unknown_title`,
  una riga sola per dispositivo e per `ParsedMedia.key` — col battito da 30 s un episodio
  guardato un'ora ne scriverebbe 120). Serve perche' il guasto non sia muto: da fuori
  "non riconosciuto" e "non sta guardando niente" si assomigliano troppo. `user_id` resta
  nullo: chi sia lo decide `scrobble_apply`, che qui non viene chiamata. E' anche la coda
  da cui la fase 3 fara' scegliere il titolo a mano.
- **Copertura: solo Netflix.** Prime Video, Disney+ e NOW restano sulla forma standard di
  `navigator.mediaSession` (`mediaSessionFields` in `sites.ts`) **non ancora verificata da
  una sonda**: ogni sito la richiede a sé, perché ognuno espone (o non espone) i metadati
  a modo suo — Netflix l'ha appena smentita per tutti e tre gli altri contemporaneamente.
  Apple TV+ non è previsto e in più richiederebbe una migrazione: il vincolo `check` su
  `device_profiles.site` elenca solo `netflix | prime | disney | now`.
- **Collaudo**: `pnpm test` copre `parse.ts`/`rules.ts`/`rank.ts`/`sites.ts` sulle fixture
  vere; `node scripts/security-check.mjs` dopo ogni modifica al CORS di
  `/api/scrobble` (origine fissa da `ZCONNECTION_EXTENSION_ORIGIN`, mai riflessa, mai
  `*`). **Playwright non riproduce contenuti DRM** (il suo Chromium non ha Widevine):
  Netflix vero si collauda solo a mano su Chrome installato — collega il dispositivo, un
  episodio dall'inizio alla fine, autoplay del successivo, revoca da `/devices`.
- **Chrome non inietta le content script nelle schede gia' aperte.** Installare o
  ricaricare l'estensione con Netflix gia' aperto lascia quella scheda senza
  `capture.js`, per sempre e in silenzio: non arriva un evento, `devices.last_seen_at`
  resta `null` e il popup non ha niente da dire. Ci e' costato un giro durante la sonda
  e un altro al primo collaudo vero. Ora `adottaSchedeAperte()` (background.js, permesso
  `scripting`) le adotta a `onInstalled` e `onStartup`, chiedendo prima alla scheda se
  risponde a `zapp-ping` per non iniettare due volte.
- **Il popup legge due fonti, non una.** `corrente` e' quello che dice la pagina, scritto
  dal service worker **prima** di parlare col server: c'e' sempre mentre qualcosa va, e
  porta gia' minuto e barra. `ultima` e' la card confermata dal server (copertina e nome
  TMDB) e vale **solo se il suo `/watch/` e' quello in corso**, altrimenti dopo un cambio
  episodio mostrerebbe il precedente. `ultima` non si sovrascrive mai con `null`: prima
  era `dati.card ?? null` e un solo lotto senza card — un titolo non riconosciuto, un
  battito in ritardo — cancellava la card buona e il popup tornava vuoto a episodio in
  corso. Quando qualcosa non torna il popup dice **dove** si e' fermata la catena
  (`ultimoInvio`): tre guasti diversi, tre rimedi diversi.
- **Il popup e' la copertina, il titolo e la barra** (2026-09-09, richiesta utente). Lo
  sfondo e' il **fotogramma 16:9** del titolo in corso, non la locandina: il popup e' largo
  340 e basso, e una 2:3 andrebbe tagliata quasi tutta. Nitido, non sfocato — la
  leggibilita' la fa il velo, trasparente in alto e quasi nero in basso, non una sfocatura
  che spegnerebbe proprio la copertina che si vuole vedere. **La barra avanza da sola**:
  fra un battito e l'altro passano 30 s, quindi il popup **interpola** (`posizioneOra`:
  posizione dell'ultimo evento + tempo trascorso, e solo mentre `state === "playing"`), e
  ridisegna a `requestAnimationFrame` — e' un pannello di 340px che vive pochi secondi, e
  una barra che scatta una volta al secondo si vede. Un salto fatto dall'utente non manda
  nessun evento, quindi la barra puo' restare disallineata fino al battito successivo, che
  la rimette a posto. All'apertura il popup **chiede la posizione esatta** invece di
  partire da un minutaggio vecchio fino a mezzo minuto: `chrome.tabs.sendMessage`
  `zapp-refresh` -> bridge -> `postMessage` sul canale `zapp-richiesta` -> `capture.js`
  manda subito un evento (il main world e' l'unico che vede il `<video>`).
  Verifica: `node scripts/popup-shot.mjs [cartella]` rende il popup in Chrome con un
  `chrome.*` finto e tre stati. Lo stub va iniettato come tag `<script>` e **non** con
  `addInitScript`: il `window.chrome` vero vince su quello e la pagina resta muta.
- **Fase rapida all'avvio di un titolo** (`AVVIO_MS` 1 s, tetto `AVVIO_MAX` 60): l'evento
  `play` arriva spesso prima che il `<video>` abbia una durata e prima che i selettori del
  titolo esistano, quindi `stato()` torna `null` e il primo segnale slittava al battito
  dei 30 s. Si guarda ogni secondo finche' non parte un evento **col titolo dentro** — non
  basta un invio qualsiasi: uno senza i tre campi DOM il server lo scarta, e contarlo
  spegnerebbe la fase rapida a mani vuote. Vale anche per l'episodio successivo, che su
  Netflix e' un pushState senza nessun evento nostro.
- **Cambiare scheda non chiude la sessione.** `visibilitychange` mandava `stopped`:
  passare su Zapp a guardare la libreria — il gesto piu' normale che ci sia — troncava la
  sessione a meta' episodio. Ora manda solo la posizione; la chiusura vera resta `ended`
  (video finito) e `pagehide` (scheda chiusa), e le sessioni abbandonate le raccoglie la
  pulizia a 4 ore dentro `scrobble_apply`.
- **La home si rilegge quando ci torni sopra** (`RefreshOnFocus`, montato in
  `src/app/(app)/page.tsx`): ZConnection scrive in libreria mentre si guarda Netflix,
  cioe' fuori da Zapp, e la home e' resa dal server. Si aggiorna al ritorno sulla scheda,
  non a intervalli (niente richieste da una scheda in secondo piano), con un minimo di
  10 s fra due riletture.
- **L'id dell'estensione e' fissato nel manifest** (`"key"`, la chiave pubblica RSA in
  base64): senza, Chrome lo ricava dall'hash del **percorso della cartella**, quindi
  cambierebbe fra il PC fisso e il portatile e fra due checkout dello stesso repo — e
  `ZCONNECTION_EXTENSION_ORIGIN`, che e' un'origine sola e fissa, smetterebbe di
  combaciare senza dire perche'. Con la chiave l'id e'
  `gkkifcgcboeoiaelccgbnehdopljeopf` ovunque, e le due variabili d'ambiente si possono
  configurare **prima** di aver mai caricato l'estensione.
- **⚠️ Da togliere prima di pubblicare sullo store**: il campo `"key"` (lo store assegna
  la sua, e l'id cambiera' di conseguenza: vanno riscritte le due variabili) e
  `http://localhost:3000/*` sia in `host_permissions` sia in `externally_connectable`,
  serve solo per provare l'estensione contro `pnpm dev` in locale. In
  `externally_connectable` è un rischio vero, non solo superfluo: qualunque pagina
  servita su `localhost:3000` nel browser di un utente — non solo Zapp in sviluppo,
  chiunque altro giri un server lì — potrebbe mandare un token all'estensione e
  dirottargli le visioni. Va rimosso da entrambe le liste prima della submission allo
  store.

### Routes

Route groups: `(auth)` for login/signup, `(app)` for everything protected with the nav (`TopNav`, in basso su mobile e in alto da `lg`: Home, Cerca, Libreria, Amici, Profilo). Title pages: `/title/movie/[id]`, `/title/tv/[id]`, `/title/tv/[id]/season/[n]`. Public profiles at `/u/[username]`. `src/app/api/search/route.ts` returns up to 20 TMDB `search/multi` results with flatrate providers from **one batch query on `title_providers`** (no per-result title fetch); `SearchClient` fires a request 60 ms after each keystroke, aborts the previous one, caches results per query and shows the filtered results of a cached prefix while waiting, never emptying the grid.

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
- **Tre giorni: oggi, domani, dopodomani** (2026-09-07, richiesta utente). MyMovies non
  espone i giorni futuri (provati `?giorno=`, `?data=`, `/domani/`, `/settimana/`, RSS:
  niente; di notte, finché non pubblica, ha **zero orari anche per oggi**). I giorni dopo
  vengono dai **JSON delle catene** già usati per i link biglietteria: `booking/day.ts`
  (puro, Vitest su fixture) `uciDayProgramme` (`/theatres/{slug}/programming/{date}`
  senza `movieSlug`: tutti i film del giorno, formato dalla chiave schermo + lingua
  ≠ ITA → vos) e `webticDayProgramme` (`getFullScheduling` porta tutti i giorni; le
  varianti "(Lingua Orig.)"/"Cinemamma -"/"… 3D" si fondono per `OriginalTitle`), ogni
  spettacolo col link di acquisto (livello 2); `booking/programme.ts` (server)
  `getChainProgramme(cinema, date)` per UCI, Notorious, Cinelandia (`chainHasProgramme`;
  The Space non ha orari). `src/lib/cinema/day.ts` (server) è il centro:
  `getDayProgramme(date)` (React `cache()` per data; `today.ts` vi delega) chiede per
  ogni sala oggi MyMovies e, se vuoto o giorno futuro, la catena; `getFilmDays` dà i tre
  giorni di un film (oggi MyMovies + catene vicine non elencate, dopo solo catene) alla
  scheda film e a `/cinema?film=`. Le sale indipendenti hanno solo oggi. Film delle
  catene → TMDB via `summary.ts` `filmSummaryByTitle` (`searchMovie`, `unstable_cache`
  per titolo normalizzato 1 g; senza esito `sourceFilmId` = hash negativo del titolo);
  `aggregateByFilm` fonde per `filmKey` (TMDB id, poi id sorgente) così lo stesso film da
  MyMovies e da una catena conta una volta. UI: `DayPills` (Oggi | Domani | Mer 9; link
  con `hrefs` mappa data→URL in `/cinema?day=`, bottoni con `onSelect` nella scheda dove
  i tre giorni sono già caricati e `ShowtimesClient` parte dal primo giorno con uno
  spettacolo futuro); `/cinema` senza `?day=` con oggi vuoto passa a domani con un
  avviso; `NextShowingCard` per un giorno futuro scrive "domani"/"mer 9" al posto del
  conto alla rovescia (`relativeDayLabel` in `dates.ts`).
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
- **Estetica cinema** (2026-09-07, scelta dall'utente su canvas di 3 opzioni per sezione,
  generatore in scratchpad `cinema-mock/gen.mjs`): fondali sempre `original`, `quality` 95.
  - Home, `PlanCard` ("Stasera A · Cinematico"): banner `min-h-[292px]` sul telefono,
    **fascia bassa da `md`** (`w-full md:aspect-[42/9] md:min-h-[225px]`) col
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
    oggi", pillola "Al cinema oggi · <città>", tondo/bottone in vetro. **Da `md` la card
    è una fascia bassa a proporzioni fisse** (`w-full md:aspect-[32/9] md:min-h-0
lg:aspect-[4/1] lg:min-h-[264px]`): sotto `md` resta `min-h-[196px]`. Storia delle due
    misure, stessa giornata: `lg:min-h-[320px]` la riduceva a una striscia a piena
    larghezza, 16:9/2:1 l'ha portata a 680px a 1440 ("troppo grande"), e il valore attuale
    è **la metà esatta** di quello (340px a 1440, 460 a 1920, 219 su tablet — richieste
    utente 2026-09-07). Due trappole da non ripetere: `min-height` **senza `w-full`**
    insieme a `aspect-ratio` fa allargare la card oltre la pagina (la larghezza viene
    ricavata dal rapporto: 1050px dentro un viewport da 820); e `min-h-fit` non regge
    contro `aspect-ratio`, il contenuto viene tagliato lo stesso — il fondo va misurato e
    scritto in px. Senza posizione o
    programmazione: fondale del primo `now_playing` IT di TMDB e l'invito a dire dove si è.
    **Da `lg` la parete di locandine** (richiesta utente 2026-09-07): sulla destra (68% della
    card) fino a `WALL_MAX` = 9 locandine `w342` dei film di oggi (o dei `now_playing` nel
    ripiego), alte 120/108px alternate (150/134 da `xl`), in prospettiva (`rotateY(-14deg)`, origine a
    destra), ombra forte, `mask-image` che le sfuma sotto il testo; il fondale ha un velo
    nero extra (`bg-black/45`) perché le locandine restino le protagoniste; testo e bottone
    "Tutta la programmazione" nella colonna sinistra (`lg:max-w-[42%]`).
    **Il fondale ruota in continuo** (richiesta utente 2026-09-07): `CinemaRotation`
    (`src/components/cinema/CinemaRotation.tsx`, client) possiede l'indice del film
    corrente (context) e lo dà a `RotatingBackdrop` e `RotatingCaption`. Il giro sono i
    film **che hanno ancora uno spettacolo oggi** (`filmsWithNext` in `programme.ts`,
    puro, Vitest; film del giorno per primo, max `ROTATION_MAX` = 8), 7 s l'uno
    (`SLIDE_MS`) + 1,4 s di dissolvenza, zoom lento `.backdrop-kenburns` (globals.css) su
    ciascuno; monta solo corrente e successivo (mai 8 `original` insieme), primo fondale
    nell'HTML del server, fermo con reduced-motion. **Su telefono titolo e riga cambiano
    col fondale** (`RotatingCaption`, `lg:hidden`, ogni film con la sua "In N sale, il
    prossimo alle HH:MM"; titolo su due righe riservate `min-h-[2lh]` così la card non
    salta; dissolvenza `.caption-fade`): richiesta utente 2026-09-07. Da `lg` il testo
    resta quello del film del giorno accanto alla parete, che non ruota.
    I dati vengono da `getTodayProgramme()` (`today.ts`, server-only, React `cache()`):
    le `NEARBY_MAX` sale in ordine di importanza (vedi Ordine delle sale), `aggregateByFilm`;
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
- **Ordine delle sale** (regola dell'utente 2026-09-07): `src/lib/cinema/rank.ts` (puro,
  Vitest) `venueTier(name)` — 1 grandi catene nazionali (UCI, The Space, Notorious),
  2 multisala e catene regionali (Cinelandia, Arcadia, Multiplex/Multisala, Anteo, …),
  3 indipendenti — e `compareByTier` (livello, poi distanza). `orderCinemas` /
  `orderShowtimes` (`favorites.ts`) mettono i preferiti in testa e poi ordinano così:
  **mai più le 10 più vicine** (a Milano centro erano tutte monosala e UCI/The Space/
  Notorious a 5–10 km non comparivano). `day.ts` `getRankedCinemas(location, favIds)`
  (React `cache()` su chiave primitiva) prende **tutte** le sale della provincia entro
  `CINEMA_RADIUS_KM` (`getNearbyCinemas` senza tetto), le ordina e tiene le prime
  `NEARBY_MAX` = 12: oggi pagina MyMovies per le prime `PROGRAMME_VENUES` = 12, JSON di
  catena per le sale di catena (domani/dopodomani solo quelle); `DayProgramme.allCinemas`
  è la lista intera per il foglio "I tuoi cinema" (`FavoritesChip`: gruppi Grandi catene /
  Multisala / Altre sale, campo di ricerca sopra 8 sale). `aggregateByFilm` tiene la sala
  preferita, altrimenti la **prima in ordine** (non la più vicina) e `FilmEntry.venues`
  porta tutte le sale del film: `FilmsView` mostra la principale coi 3 orari a pillola e
  sotto 2 altre sale (`shortVenueName`: "UCI Bicocca") con 3 orari, poi "Altre N sale →"
  verso `/cinema?film=`. Nomi: `prettyVenueName(name, town)` in `venues.ts` `toCinema`
  ("CINEMA Eliseo" → "Cinema Eliseo", "Uci" → "UCI", nome di sola catena + comune: "The
  Space Cinema Rozzano", che così passa anche il match per slug/parole delle catene).
  **MyMovies spezza la provincia in due pagine** (trovato dalla sessione zapp-cb,
  2026-09-07): `/cinema/milano/provincia/` ha solo l'hinterland (21 sale, markup
  `link-19`), `/cinema/milano/` il capoluogo (27, Merlata Bloom e NOISE compresi, markup
  `<a href="//www.mymovies.it/cinema/milano/<id>/" title="Programmazione del cinema
<nome> di <comune>">`, badge = film di oggi, anche 0). `parseCityIndex` (fixture
  `city-index.html`) + `mymovies.cityIndex(prov)` (6 h, vuota → non in cache come
  l'indice) e `getProvinceVenues` fonde le due pagine con dedupe per id. Coordinate
  assenti su mappa.asp (`lat=&lng=`; `parseMappa` ora torna `lat/lng: null` con nome e
  indirizzo) → Nominatim con l'indirizzo, poi `venueGeocodeQueries` ("Cinema Troisi, San
  Donato Milanese", poi "Troisi, …"; max 3 per richiesta), altrimenti la sala spariva per
  sempre. The Space resta solo oggi (MyMovies):
  il microservizio showings risponde 401 senza sessione, il token anonimo è `null`
  (2026-09-07). Verifica: `rank-check.mjs` (Playwright, utente test, `next start -p 3023`
  dal worktree Zapp-quality).
- **Audit copertura, 2026-09-08** (110 province verificate una per una: Zapp vedeva 337
  sale su 659). Tre cose mancavano:
  1. **Lo slug del capoluogo** (`capitalSlug` in `parse.ts`): per dieci province
     l'URL vuole il nome del **comune** capoluogo, non della provincia
     (monzabrianza→monza, forlicesena→forli, pesaroeurbino→pesaro,
     verbanocusioossola→verbania, massacarrara→massa, barlettaandriatrani→barletta, più
     le quattro sarde abolite). `/cinema/monzabrianza/provincia/` è **vuota sempre**,
     anche con `?f=`: tutta Monza e Brianza non vedeva un solo cinema né un solo
     orario. `cityIndex`, `getProvinceVenues` e `filmShowtimes` ripiegano su
     quello slug quando il primo tentativo torna vuoto.
  2. **L'id `?f=` del film non sta più nell'indice di provincia** (zero link `?f=`
     su tutte le province): `getMyMoviesFilmId` lo cerca nella pagina del capoluogo
     (`parseNowShowing` legge sia i link col `title` sia quelli col solo testo) e,
     se lì non c'è, prende titolo e slug dalle locandine (`parseFilmPageLinks`) e
     legge `idfilm` dalla scheda del film (`parseFilmId`, cache 30 giorni). Senza,
     "Oggi al cinema vicino a te" spariva da ogni scheda titolo.
  3. **Il confine di provincia dentro i 25 km**: da Monza il multiplex più vicino è a
     Milano, da Prato quelli di Firenze. `nearbyKnownVenues` (riquadro lat/lng,
     `boundingBox` in `geo.ts`) unisce le sale note **di qualunque provincia** a
     quelle dell'indice, e `nearbyProvinceSlugs` dice a `filmShowtimes` quali altre
     province interrogare (al massimo 2). Il catalogo si riempie con l'uso e con
     `pnpm tsx --env-file=.env.local scripts/warm-cinema-venues.ts [slug…]` (una
     richiesta ogni 700 ms). Perciò **`province_slug` non è più obbligatorio**: senza,
     home, `/cinema` e scheda titolo usano le sale note nel raggio invece di dire
     "Zona non coperta".
  **MyMovies blocca l'IP con 403** dopo qualche minuto a ~5 richieste/s (verificato, sia
  con lo User-Agent di Zapp sia con quello di un browser): dopo un 403/429 il client
  smette di chiedere per 60 s.
- **Il posto lo sceglie l'utente da un elenco, non lo indovina una ricerca**
  (2026-09-08): `src/data/comuni-it.json` ha tutti i **7.904 comuni** italiani
  (`[nome, sigla, lat, lng, popolazione]`, ISTAT + coordinate ufficiali; i 48 comuni
  nati da fusioni recenti geocodificati una volta con Nominatim).
  `src/lib/cinema/comuni.ts` (puro, Vitest) espone `searchComuni` (prefisso prima,
  poi "contiene", i più popolosi in testa; accenti e apostrofi ignorati),
  `findComune`, `nearestComune`, `comuneLabel` ("Ossona, MI") e
  `PROVINCE_SLUG_BY_SIGLA` (sigla → slug MyMovies; solo `SU` è `null`, il Sud
  Sardegna per MyMovies non esiste ancora). `ComuneSearch` chiede `/api/comuni?q=`
  a ogni tasto (80 ms di debounce, elenco in memoria, nessuna chiamata esterna);
  scegliendo parte `setLocationByComune(nome, sigla)`, che **rilegge la riga dal
  file** e salva coordinate, etichetta e provincia esatte. `setLocationByQuery` (testo
  libero → Nominatim → primo risultato) non esiste più: prendeva il primo omonimo e su
  una provincia scritta a mano cadeva in aperta campagna. Anche il GPS ricava la
  provincia dal comune più vicino (`nearestComune`); Nominatim resta solo per
  l'etichetta ("Isola, Milano") ed è facoltativo.
- **Cinema preferiti** (migration `0015_cinema_favorites.sql`, applicata via MCP):
  `cinema_favorites (user_id, cinema_id, position 1–3)`, RLS solo proprietario,
  `cinema_id` = id della sorgente attiva (come `cinema_links`: cambiando `CINEMA_SOURCE`
  va svuotata). `getFavoriteCinemaIds()` (`queries.ts`, React `cache()`) si legge in
  `Promise.all` con la posizione; `favorites.ts` (puro, Vitest) `orderCinemas` /
  `orderShowtimes` mettono i preferiti in testa nell'ordine scelto e il resto per
  importanza e distanza (`compareByTier`), marcando `Cinema.favorite`; `nearestCinemaId`
  dà il badge "Il più vicino" (non più `i === 0`). In `/cinema` l'ordine precede lo
  `slice(0, NEARBY_MAX)` del programma, così gli orari dei preferiti arrivano sempre;
  `aggregateByFilm` preferisce il cinema preferito. `toggleFavoriteCinema` (`favorites-actions.ts`) prende la prima posizione
  libera, oltre 3 → errore in toast. UI: `FavoriteStar` (stella in vetro su ogni card,
  ottimistica + `router.refresh()`), `FavoritesChip` ("★ Preferiti n/3" accanto ai
  filtri di `/cinema`, sheet "I tuoi cinema" con tutte le sale entro il raggio, a gruppi),
  badge "Preferito" in `CinemaHeader`.
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
- **Il momento giusto** (2026-09-08): la prima fila di consigli della home nasce da
  **ora, giorno e meteo**, non dal solo gusto. `src/lib/moment/`: `context.ts`
  (`contextAt(now, meteo)`, puro — l'ora si legge con `Intl.DateTimeFormat` su
  `Europe/Rome`, perché le funzioni girano in `fra1` a orologio UTC e alle 23:40
  italiane `getHours()` dice 21); `recipes.ts` (puro: diciotto momenti in ordine di
  priorità — **pioggia/neve > momenti con un nome (pausa pranzo, aperitivo del
  venerdì, sabato sera) > caldo/freddo > fasce generiche** —, il ripiego `sempre` e
  sei mood, tutti nella stessa forma `Recipe`. Ogni momento porta un `complemento`
  ("il pomeriggio") e `titoloPerTipo` ne compone il titolo per scheda: **"Film per il
  pomeriggio" sotto Film, "Serie per il pomeriggio" sotto Serie TV, "Per il pomeriggio"
  su Tutto** — la fila mostra anche serie, e un titolo che dice "Film" sarebbe falso su
  due schede su tre. I mood non hanno complemento e tengono il loro nome ovunque.
  `sempre` esce solo fra le 5 e le 8 del mattino, dove non c'è niente di sensato da
  dire: il test lo enumera invece di descriverlo.
  **La temperatura è un momento, non un aggettivo**: sopra i 28 °C la fila diventa
  "Film per un pomeriggio rinfrescante" / "per una serata rinfrescante", sotto i 4 °C
  "Film per un caldo pomeriggio" / "per una serata al caldo" / "per una mattina sotto
  le coperte", con generi accoglienti e senza horror. Vale tutto l'anno — una sera
  gelida di novembre merita lo stesso invito di una di gennaio —, e per questo il
  vecchio `freddo-inverno`, legato ai mesi, non c'è più. Sotto la pioggia il termometro
  non conta, come già dice `meteoFromWmo`); `weather-code.ts`
  (puro: l'osservazione → `pioggia|neve|sereno|caldo|freddo`. **Comanda la pioggia
  misurata, non il codice WMO**: a Ossona il 2026-09-08 Open-Meteo dava
  `weather_code: 80` ("rovesci") con `precipitation: 0.0` e 30,8 °C, e la fila diceva
  "piove" mentre fuori c'era il sole — il codice descrive la situazione prevista sulla
  cella, i millimetri sono quelli caduti davvero. Con zero millimetri non piove e non
  nevica, qualunque cosa dica il codice; il codice serve solo a distinguere neve da
  pioggia quando qualcosa *sta* cadendo. `etichettaMeteo` scrive la riga che si legge
  in pagina e **ci mette sempre i gradi** ("31° e sereno", "12° e piove"):
  un'incoerenza come quella si vede a colpo d'occhio invece di restare nascosta dietro
  una parola); `weather.ts`
  (`server-only`: Open-Meteo, senza chiave, chiede
  `temperature_2m,weather_code,precipitation,cloud_cover`, **coordinate arrotondate a
  0,1°** prima della chiave di `unstable_cache` **15 min** — quanto l'intervallo di
  Open-Meteo: a 30 si serviva una misura vecchia il doppio del passo con cui si
  aggiorna —, così mille utenti della stessa città sono
  una chiamata sola; timeout 3 s, qualunque errore vale `null` e la fila esce lo
  stesso — verificato il 2026-09-08 negando `api.open-meteo.com` al processo del
  server: fila presente, nessun errore in console); `shelf.ts` (una
  `discoverForRecipe` per tipo, `revalidate` 1 h e nessun parametro personale →
  **cache condivisa fra tutti gli utenti**, poi `affinity` + `diversify` della fase C).
  **I mood non sono generi**: ogni mood ha una **lista curata** di ~25 titoli
  (`src/data/mood-picks.json`, generata da `scripts/build-mood-picks.ts`, 148 in tutto,
  film e serie), perché `with_genres=18` per "triste" dava un dramma qualsiasi molto
  votato e mai *quello* che uno cerca quando è triste. La lista sta in un file: la testa
  di una fila di mood **non costa una chiamata esterna**. L'ordine è la **fama misurata**
  (i voti TMDB, dal più visto al meno) con una spinta leggera dal gusto — `pesoFama` in
  `mood-rank.ts`, `SPINTA_GUSTO` 0,15: più alta scavalcava titoli molto più visti e non
  era più una spinta. Sotto i curati, la coda generata riempie la fila per chi li ha già
  visti quasi tutti. Nella scheda "Tutto" un mood **non alterna** film e serie
  (`mixShelf` metteva Fleabag, 1.935 voti, sopra Lei, 15.601): ordina per fama. Chi
  rigenera il file guardi i nomi che stampa — cercando "The Ring" col solo filtro
  sull'anno usciva *Il Signore degli Anelli*, il cui titolo originale contiene "the
  Ring".
  **La sezione sta in cima a `/search`, non in home** (scelta utente 2026-09-08): è una
  fila per chi sta cercando cosa guardare, non per chi riprende quello che aveva
  lasciato. Fuori dalla home `MomentShelf` va con `conSchede={false}`, perché
  `HomeTypeGate` filtra **solo** dentro `HomeTypeProvider` e senza provider avrebbe
  disegnato le tre varianti una sotto l'altra.
  UI: `MomentShelf` (server) → `MoodPills` (client), che rende le tre varianti con
  `HomeTypeGate` e chiede i titoli di un mood a `/api/moment` **solo al tocco**,
  tenendoli in una `Map` per sessione; secondo tocco sulla stessa pillola = torna il
  momento automatico.
  **La fila è un banner come il carosello in testa alla home** (scelta utente
  2026-09-08), non uno scaffale di copertine: forma, `scroll-snap`, autoplay, puntini e
  frecce stanno in `BannerCarousel` (`src/components/home/BannerCarousel.tsx`), che
  `HeroCarousel` e `MoodPills` condividono; `MoodPills` gli passa titolo e pillole come
  `header`. Per disegnarlo servono fondale e trama: `ShelfItem` li porta come campi
  **facoltativi** (le copertine degli altri scaffali non li guardano) e
  `src/data/mood-picks.json` è stato rigenerato con `backdropPath`/`overview`.
  **Città e meteo non si scrivono in pagina** (stessa data): il sopratitolo "Adesso a
  Milano · 32° e nuvoloso" raccontava all'utente cosa sappiamo di lui — restano dentro,
  a scegliere la fila. Lo slot `eyebrow` di `HorizontalShelf`/`ItemShelf` non lo usa
  più nessuno; `aside` (le pillole) sì, fuori dal banner.
  **I titoli invogliano, non descrivono**: "Troppo caldo per uscire", non "Per un
  pomeriggio rinfrescante"; sobri, senza punti esclamativi, e corti abbastanza da non
  prendere tre righe su un telefono. Il `complemento` compone le schede Film e Serie
  ("Film per una pausa nel pomeriggio"), quindi cambia insieme al titolo.
  Superficie dei segnali: `home-momento`
  (`src/lib/taste/surfaces.ts` è un **elenco chiuso**: senza la voce, `parseSignal`
  scarta gli eventi della fila).
  **Il mood non si salva da nessuna parte**: dura la sessione, e non entra in
  `user_taste` — è uno stato d'animo, non un gusto. Nessuna migration, nessuna
  chiamata dal browser verso l'esterno, CSP invariata.
  **Le keyword TMDB non reggono una fila**: misurato il 2026-09-08 con le soglie del
  motore, `cozy` dà 0 titoli e `feel-good` 12, mentre `commedia|famiglia` ne dà 3488.
  Le ricette poggiano su generi, durata e soglie; le keyword sono un secondo
  `discover` opzionale i cui risultati vanno in testa alla fila.
  Collaudo: `pnpm tsx --conditions=react-server --env-file=.env.local
  scripts/moment-dump.ts [chiave-ricetta]` (senza argomenti stampa quale momento vince
  in undici scenari; con una chiave, i titoli veri di quella ricetta).
- **Home, "Continua a guardare"** (2026-09-06, su mockup dell'utente): niente più hero a
  tutta larghezza. La home autenticata è `TopBar "Home"` + una fila di card 16:9
  (`ContinueCard`, 280px mobile / 380px da `lg`) con una **grafica ufficiale del titolo**
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
  che scorre via `motion.span layoutId`). **Sul telefono la pillola è larga quanto la
  pagina** (richiesta utente 2026-09-08): stesso gutter di `PageShell` (`px-5`, `px-3`
  sotto 380px), voci `flex-1` alte 48px con icona da 25px, così le due esterne arrivano
  ai bordi. Da `md` la pillola torna della sua larghezza, centrata — distesa su 728px
  sarebbe una barra vuota con cinque icone perse dentro, a destra lo slot `right` (campanella notifiche
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
  40 (`h-10`) e il campo di Cerca parte da `+14px` perché 14 + 52/2 = 20 + 40/2. Quello
  che non ci sta in linea **va a capo**, come in home: la pillola della posizione di
  `/cinema` (`action` di `TopBar`, in un wrapper `flex lg:contents` perché in colonna non
  si allarghi) e Film/Serie della Libreria, che è sceso sulla riga del conteggio. Dove è
  la pagina a possedere quell'angolo (scheda titolo, profilo proprio e altrui, notifiche)
  le icone spariscono sotto `lg` (`cornerTaken` in `TopNav`). Un campo `flex-1` in quella
  riga vuole `min-w-0`, suo e dell'`<input>`: senza, la larghezza minima naturale
  dell'input sborda sotto le icone.
- **Amici sta dentro Profilo** (2026-09-08, richiesta utente): `/friends` non è più una
  voce di nav. Ci si arriva dalla riga amici della testata del profilo (`ProfileEditor`),
  che ora è **sempre** presente — senza amici dice "Trova i tuoi amici" — è una pillola in
  vetro cliccabile e porta il numero delle richieste ricevute (`incomingCount`, da
  `getFriendsData()` che il profilo già chiama: nessuna query in più). Di conseguenza
  `/friends` ha indietro + briciola "Profilo" come ogni pagina non radice, e il suo
  `loading.tsx` ha la stessa testata.
- **Da ogni pagina si torna indietro** (2026-09-08): le sei voci di nav sono radici e non
  hanno l'indietro; **tutto il resto sì**. `TopBar` ha due prop: `back` (il tondo
  `BackButton` a sinistra del titolo) e `parent` (la **briciola**, riga 13px
  `accent-soft` sopra il titolo, cliccabile, marcata `data-crumb`). Chi non usa `TopBar`
  mette le stesse due cose a mano (`/import/netflix` → Profilo, `/u/[username]` → pillola
  in vetro "Amici" accanto all'indietro sopra il muro). Oggi: `/discover` (solo indietro),
  `/discover?genre=` → Scopri, `/cinema?film=` → Cinema (**al posto** del vecchio link
  testuale "← Tutti i cinema"), `/u/[username]` → Amici, `/import/netflix` → Profilo.
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
  domanda del giorno** copre tutto ed ha a sua volta un bottone "Indietro", quindi la
  domanda di oggi si segna come già vista in `daily_question_views` prima di aprire il
  browser (chiuderlo dall'interfaccia non regge: il tondo "Chiudi" sta dentro al riquadro
  e durante l'animazione non è cliccabile); le testate si contano con `[data-crumb]`, non con
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
- **`Sheet`** (pannello modale ancorato in basso) regge quattro cose, tutte nate dal
  foglio "Dove sei?" della sezione Cinema (2026-09-08): lo **swipe che chiude parte solo
  dalla maniglia** (`useDragControls` + `dragListener={false}`), altrimenti scorrere una
  lista dentro al foglio lo trascinava giù fino a chiuderlo; col foglio aperto **la pagina
  dietro non scorre** (`body.overflow` bloccato); il pannello è **sempre una colonna col
  contenuto scorrevole** e un tetto d'altezza (`88svh`, `min(90svh,900px)` per `tall`),
  così un foglio che cresce non sborda; e con la **tastiera aperta** si alza e si accorcia
  sul `visualViewport` — un `position: fixed; bottom: 0` non lo sposta nessuno, quindi su
  iOS il campo appena messo a fuoco finiva dietro la tastiera. Regola per chi ci mette
  dentro un elenco (`ComuneSearch`): **niente elenco sospeso in assoluto**, va nel flusso
  e fa crescere il foglio; sospeso o finiva fuori dallo schermo o si apriva in su coprendo
  titolo e bottoni. Verifica: `node --env-file=.env.local scripts/popup-check.mjs`.
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
  **Trailer sempre presente e sempre del titolo giusto** (rivisto 2026-09-07, spec e
  piano in `docs/superpowers/`): `getOfficialTrailers({videos, titleId, mediaType,
  season, name, originalTitle, releaseDate})` (`official.ts`, server-only, React
  `cache()`; `getOfficialTrailerKeys` = solo le chiavi) è l'unica sorgente dei trailer
  (`Trailer {key, frame, lang}`, riquadro senza bande nere da `frame.ts`) per
  `TitleBody`/`TitleHeader`, per la pagina stagione (stagione N, poi serie) e per
  l'anteprima al passaggio del mouse.
  **La scala** (`compute.ts`, dipendenze iniettate, coperta da Vitest per intero) si
  ferma al primo gradino che dà un risultato: **1.** video TMDB in italiano da canale
  ufficiale; **2.** ricerca YouTube "`<nome>` trailer italiano" con **verifica dura del
  titolo**; **3.** video TMDB in altra lingua da canale ufficiale, dichiarato in pagina
  con la pillola "Trailer in inglese" (`HeaderControls language`); **4.** niente, resta
  il fondale. Un trailer italiano da canale ufficiale batte sempre un trailer inglese,
  perciò la ricerca sta *prima* del ripiego; il ripiego però non costa nulla (i video
  TMDB sono già letti al gradino 1) mentre la ricerca costa quota, e infatti è razionata.
  **Mai un trailer di terzi**: cambia la lingua di ripiego, non la fonte.
  **`match.ts` (puro, Vitest) è l'unico punto in cui si decide se un video è di un
  titolo**, ed esiste perché la ricerca non lo verificava affatto: il fondale di "Prison
  Break" era il trailer di "Scappa - Get Out", quello di "Breaking Bad" "El Camino",
  "Batman Begins" "Il Cavaliere Oscuro" (nove righe sbagliate su dieci campionate).
  `workName` riduce il nome YouTube al nome dell'opera (via etichette, firma del canale —
  ma **mai dalla prima parte**, perché in allowlist ci sono canali di franchise come
  Avatar o Ghostbusters —, code promozionali, numeri di stagione, edizioni);
  `videoMatchesTitle` accetta **solo per uguaglianza** parte per parte contro `title` e
  `original_title` (`MATCH_MIN` 0,9), con regola anti-sequel (numero finale diverso ⇒
  scarto: "Madagascar 3" non è "Madagascar") e anti-sottotitolo (un sottotitolo in più da
  una sola parte ⇒ scarto: "El Camino: Il film di Breaking Bad" non è "Breaking Bad"),
  più la stagione nominata; `videoContradictsTitle` è un veto largo (`CONTRADICTION_MAX`
  0,45) applicato **solo alle voci TMDB non marcate `official`** — quelle ufficiali
  arrivano da un canale già verificato e possono usare il nome originale ("Bloodhounds"
  per "I segugi"). Se un trailer buono viene scartato si allarga la pulizia dei nomi, non
  si abbassa la soglia.
  **Allowlist** (`channels.ts`): 155 canali di studi, distributori e piattaforme, scritti
  a mano, nessuno entra da solo; la lista di partenza è il censimento dei canali che
  ospitano i trailer del catalogo (`docs/design/data/youtube-channel-census.txt`, 1201
  canali su 9833 video). Restano fuori aggregatori, testate e agenzie stampa. Per
  aggiungerne uno: handle da `author_url` dell'oEmbed di un suo video, id da
  `channels.list`, **e sempre `channels.list` per iscritti e numero di video** —
  `@dynit`, `@fandangoofficial`, `@minervapictures`, "Disney+ Italia" e
  `@notoriouspictures` erano squatter con 0–3 video.
  **DB-first**: ogni visita fa una sola lettura di `title_trailers` (migration 0011-0013 +
  **0020** `search_at`/`search_tries`; `trailers` jsonb `[{key, frame, lang}]`, `source`
  tmdb|youtube|none, pk `title_id, media_type, season_number`, service client). oEmbed,
  miniature e ricerca girano solo a riga assente o scaduta: **30 giorni** se il trailer è
  italiano o i tentativi di ricerca sono finiti, **7 giorni** se mostra il ripiego inglese
  e una ricerca è ancora possibile (così l'italiano arriva appena c'è quota), **1 giorno**
  se vuota, e sempre scaduta se scritta prima di `EMPTY_BEFORE_MS` (alzarla a ogni cambio
  di regole o di allowlist). `parseTrailers` (`stored.ts`, puro, Vitest) pretende `lang`:
  un cambio di forma invalida il cache da solo. Ricerca fallita con riga vecchia → si
  tiene la vecchia; `name` vuoto → niente ricerca né riga (la FK su `titles` la esige).
  **Quota**: `search.list` costa 100 unità su 10.000 al giorno = **100 ricerche**, contro
  migliaia di titoli. Perciò: la ricerca parte solo se il gradino 1 è a vuoto; ogni titolo
  ha al massimo **tre tentativi** in tutta la sua vita (subito, +7 giorni, +30,
  `shouldSearch`); al primo 403 la ricerca si spegne per il resto della giornata
  (`quotaExhaustedUntil` in `youtube.ts`, reset a mezzanotte del Pacifico).
  `getVideoDetails` (`videos.list`, 1 unità, cache 7 d) dà id canale esatto,
  `defaultAudioLanguage` ed `embeddable`; `isItalianForChannel` decide la lingua (dai
  canali globali serve la conferma). I video TMDB arrivano con
  `include_video_language=it,en,null` (vedi TMDB sopra).
  **Sottotitoli**: dove il fondale **non** è italiano, YouTube traduce i sottotitoli in
  italiano. Non si interroga il player (l'app lo pilota a `postMessage`, non con
  `YT.Player`, e `getOption` non risponde su quel canale): quando il video ha una traccia
  il player manda **da solo** un `apiInfoDelivery` con `captions.tracklist`, e da lì si
  chiede `translationLanguage` "it" più la traccia tradotta. Se il video non ha
  sottotitoli quel messaggio non arriva e non compare niente: sono 33 trailer inglesi su
  107. Sui trailer italiani i sottotitoli restano spenti come prima (alcuni video li
  accendono da soli). L'URL porta `cc_load_policy`/`cc_lang_pref` solo per l'inglese.
  **La riga di testo sta dentro il riquadro** (2026-09-07, "Lanterns"): YouTube appoggia i
  sottotitoli al bordo basso del **player**, non a quello dell'immagine, cioè dentro la
  banda nera che il fondale tiene fuori dal riquadro; da `lg`, dove le bande escono
  davvero, si leggevano tagliati a metà. Da quando arriva la `tracklist`
  (`captionsShown`), `playerBox` allarga il riquadro visibile fino a `CAPTION_TAIL` (2%
  dell'altezza del player: la coda misurata sotto l'ultima riga) dal bordo del video: il
  trailer rimpicciolisce un po' e i sottotitoli si leggono interi sul nero, come al
  cinema. Senza sottotitoli, e sotto `lg` (dove la banda è 16:9 e il player la riempie
  già tutta), non cambia niente.
  **Il catalogo si riempie da solo**: `/api/jobs/trailers` (rotta con segreto dal Vault e
  riga in `job_runs`, come gli altri job) gira ogni ora al minuto 20 via `pg_cron`, prende
  15 titoli da `trailers_refresh_queue` (migration 0023: prima quelli in libreria, poi il
  resto, infine le righe col ripiego inglese da riprovare) e per ognuno chiama
  `getOfficialTrailers`, cioè la stessa funzione della scheda titolo — nel job non c'è
  logica sui trailer, solo il ritmo. Tetto di 4 ricerche per giro (`setSearchBudget` in
  `youtube.ts`, rimesso a infinito alla fine: su una lambda calda il valore sopravvive
  alla richiesta e affamerebbe i render). Un giro reale: 15 titoli in 4,3 s.
  **Stato al 2026-09-07**: nessuna riga vuota fra quelle calcolate (81 italiane da TMDB,
  17 italiane dalla ricerca, 67 inglesi etichettate), `scripts/audit-trailers.ts` → 0
  sospetti. Il riquadro delle bande nere lo misura anche il backfill
  (`scripts/refresh-trailer-frames.ts` ripara le righe scritte senza misura): scriverci il
  frame intero significherebbe dichiarare 16:9 un trailer che non lo è, per un mese.
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
    (`NextShowingCard` rimosso). Sotto il selettore dei giorni ci sono le **fasce
    orarie** (Pomeriggio / Sera / Tarda sera, `showingBand` in `dates.ts`, puro con test) e sotto tutte le sale con i loro
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
