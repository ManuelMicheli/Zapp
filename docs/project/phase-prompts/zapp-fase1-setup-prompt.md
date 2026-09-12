# ZAPP — FASE 1: SETUP DEL PROGETTO

## Contesto
Zapp è una web app mobile-first (PWA) per tracciare film e serie TV su tutte le piattaforme streaming. L'utente segna cosa vuole vedere, cosa sta guardando e cosa ha visto; Zapp mostra su quale piattaforma è disponibile ogni titolo in Italia e apre l'app ufficiale con un deep link. Non riproduce contenuti. In fasi successive arriveranno recensioni, feed amici e programmazione cinema.

Fonte dati unica per il catalogo: TMDB (API v3). Voti, poster, cast e disponibilità streaming (provider "watch/providers", regione IT) vengono da TMDB. Nessuna integrazione con Netflix/Prime/Disney: non hanno API pubbliche e non vanno mai simulate con scraping.

Questa fase costruisce solo le fondamenta: progetto, auth, schema DB, client TMDB con cache, shell UI e PWA. Nessuna feature di prodotto.

## Stack (non negoziabile)
- Next.js 15, App Router, TypeScript strict, Server Components di default
- Tailwind CSS, Framer Motion per le transizioni
- Supabase (Postgres, Auth, RLS) tramite `@supabase/ssr`
- Vercel per il deploy
- Font self-hosted in `/public/fonts` con `next/font/local`, nessuna chiamata a Google Fonts
- Package manager: pnpm

## Struttura cartelle
```
src/
  app/
    (auth)/login, /signup, /auth/callback
    (app)/            layout con bottom nav, pagine protette
      page.tsx        home (placeholder: "Sto guardando" vuoto)
      search/
      profile/
    api/tmdb/[...path]/route.ts   proxy TMDB con cache
  components/ui/      primitive (Button, Card, Sheet, Skeleton)
  components/layout/  BottomNav, TopBar, PageShell
  lib/supabase/       client.ts, server.ts, middleware.ts
  lib/tmdb/           client.ts, types.ts, mappers.ts
  lib/config.ts       costanti (regione IT, lingua it-IT, provider supportati)
  types/database.ts   tipi generati da Supabase
supabase/migrations/
```

## Variabili d'ambiente
Crea `.env.example` con:
```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
TMDB_API_READ_ACCESS_TOKEN=
NEXT_PUBLIC_APP_URL=
```
La chiave TMDB non deve mai arrivare al client: tutte le chiamate passano dal server.

## Auth
- Supabase Auth: email+password e Google OAuth
- Middleware che protegge tutto il gruppo `(app)` e redirige a `/login`
- Alla creazione di un utente, un trigger Postgres crea la riga in `profiles`
- Username obbligatorio, univoco, scelto nell'onboarding (servirà per gli amici in Fase 4)

## Schema database (migration 0001)
Progettalo ora in modo che le fasi successive non richiedano modifiche strutturali.

```sql
-- enum
create type media_type as enum ('movie', 'tv');
create type watch_status as enum ('want', 'watching', 'watched', 'dropped');

-- profili
profiles (
  id uuid pk references auth.users on delete cascade,
  username text unique not null check (username ~ '^[a-z0-9_]{3,20}$'),
  display_name text,
  avatar_url text,
  is_private boolean default false,
  created_at, updated_at
)

-- cache locale dei titoli TMDB (evita chiamate ripetute e permette join)
titles (
  id bigint,                -- tmdb id
  media_type media_type,
  primary key (id, media_type),
  title text not null,
  original_title text,
  overview text,
  poster_path text,
  backdrop_path text,
  release_date date,
  vote_average numeric(3,1),
  vote_count int,
  genres jsonb,             -- [{id,name}]
  runtime int,              -- film
  number_of_seasons int,    -- serie
  number_of_episodes int,
  external_ids jsonb,       -- {imdb_id, wikidata_id, tvdb_id} da TMDB /external_ids
  raw jsonb,                -- risposta TMDB completa
  fetched_at timestamptz    -- per invalidare la cache dopo 7 giorni
)

-- disponibilità streaming in Italia, aggiornata insieme al titolo
title_providers (
  title_id bigint, media_type media_type,
  provider_id int, provider_name text, logo_path text,
  kind text check (kind in ('flatrate','rent','buy')),
  fetched_at timestamptz,
  primary key (title_id, media_type, provider_id, kind)
)

-- link diretto alla pagina del titolo su ogni piattaforma (risolto in Fase 2)
title_provider_links (
  title_id bigint, media_type media_type, provider_id int,
  url text not null,
  source text check (source in ('manual','wikidata','search')),
  resolved_at timestamptz,
  primary key (title_id, media_type, provider_id)
)

-- la tabella centrale del prodotto
watch_entries (
  id uuid pk default gen_random_uuid(),
  user_id uuid references profiles on delete cascade,
  title_id bigint, media_type media_type,
  status watch_status not null,
  rating smallint check (rating between 1 and 10),  -- voto utente, nullable
  season_number int,        -- serie: progresso
  episode_number int,
  is_private boolean default false,
  started_at timestamptz,
  finished_at timestamptz,
  created_at, updated_at,
  unique (user_id, title_id, media_type)
)

-- log episodi visti (serie), alimenta statistiche e feed
episode_watches (
  id uuid pk, user_id uuid, title_id bigint,
  season_number int, episode_number int,
  watched_at timestamptz,
  unique (user_id, title_id, season_number, episode_number)
)
```

RLS su tutte le tabelle utente:
- `profiles`: lettura pubblica dei campi non sensibili, scrittura solo del proprio
- `watch_entries` e `episode_watches`: l'utente legge e scrive solo le proprie righe (la lettura degli amici arriverà in Fase 4 con una policy aggiuntiva, non modificare queste)
- `titles`, `title_providers`, `title_provider_links`: lettura pubblica, scrittura solo con service role

Indici: `watch_entries(user_id, status, updated_at desc)`, `titles(fetched_at)`, `title_provider_links(resolved_at)`.

## Client TMDB
- Wrapper server-only in `lib/tmdb/client.ts` con Bearer token, `language=it-IT`, `region=IT`
- Funzioni: `searchMulti`, `getMovie`, `getTv`, `getSeason`, `getTrending`, `getWatchProviders(id, type)` (filtra solo i risultati `IT`), `getExternalIds(id, type)`
- I dettagli usano `append_to_response=external_ids,watch/providers` per fare una sola chiamata
- Ogni fetch di dettaglio fa upsert in `titles` (incluso `external_ids`) e `title_providers` e restituisce dal DB se `fetched_at` è più recente di 7 giorni
- Route handler `/api/tmdb/[...path]` con `revalidate` di Next e rate limiting semplice in memoria (TMDB: ~40 req/s, stai sotto i 20)
- Mapper `tmdb → Title` con tipi stretti, nessun `any`
- Helper `posterUrl(path, size)` con i size TMDB (w185, w342, w500, original)

## Deep link piattaforme
In `lib/config.ts` definisci `PROVIDERS`, la mappa dei provider supportati in Italia. Per ciascuno: `tmdbId`, `name`, `searchUrl` (template con `{query}`), `titleUrl` (template con `{id}`, se esiste) e `wikidataProperty` (l'ID Wikidata della proprietà che contiene l'ID nativo della piattaforma, se esiste). Il resolver che costruisce i link diretti arriva in Fase 2; qui solo la configurazione.

```
Netflix       tmdb 8   | titleUrl https://www.netflix.com/title/{id}        | wikidata P1874
Prime Video   tmdb 119 | titleUrl https://www.primevideo.com/detail/{id}    | wikidata P8055 (ASIN, può non aprire la pagina IT)
Disney+       tmdb 337 | titleUrl https://www.disneyplus.com/browse/entity-{id} | wikidata P7595
Apple TV+     tmdb 350 | titleUrl https://tv.apple.com/it/{id}              | wikidata P9586
NOW           tmdb 39  | solo searchUrl https://www.nowtv.it/search?q={query}
Paramount+    tmdb 531 | solo searchUrl
RaiPlay       tmdb 222 | solo searchUrl https://www.raiplay.it/ricerca.html?q={query}
Discovery+    tmdb 524 | solo searchUrl
Infinity+     tmdb (verifica id) | solo searchUrl
```
Verifica ogni ID TMDB e ogni proprietà Wikidata contro la documentazione prima di scriverli in codice: se non trovi conferma, lascia il campo vuoto e segnalalo in un commento. Non inventare ID.

## UI shell
- Mobile-first, viewport max 480px centrato su desktop, `safe-area-inset` per iOS
- Tema scuro di default (app da divano), token colore in `tailwind.config`
- Bottom nav con 4 tab: Home, Cerca, Amici (disabilitata, "Prossimamente"), Profilo
- Componenti base: `PosterCard` (poster + titolo + badge provider), `Skeleton`, `Sheet` (bottom sheet per le azioni), `EmptyState`
- Home: solo `EmptyState` "Non stai guardando nulla. Cerca un titolo per iniziare."
- Cerca: input con debounce 300ms che chiama `searchMulti`, griglia di `PosterCard`, nessuna azione al tap (arriva in Fase 3)

## PWA
- `manifest.webmanifest` (name Zapp, display standalone, theme color scuro, icone 192/512 placeholder)
- Service worker minimale via `@serwist/next`: cache-first per poster TMDB, network-first per il resto
- Meta tag `apple-mobile-web-app-capable`

## Qualità
- ESLint + Prettier, `pnpm typecheck` e `pnpm lint` devono passare
- Tipi DB generati con `supabase gen types` in `types/database.ts`
- README con: setup locale, come ottenere il token TMDB, come applicare le migration, attribuzione TMDB obbligatoria ("This product uses the TMDB API but is not endorsed or certified by TMDB") da mostrare nel footer del profilo

## Criteri di accettazione
1. Signup, login (email e Google), logout funzionano; utente non autenticato viene rediretto
2. Onboarding chiede username e lo salva in `profiles`
3. `/search?q=inception` mostra risultati con poster in italiano e badge dei provider IT
4. Il secondo caricamento dello stesso titolo non chiama TMDB (verificabile dai log)
5. Migration applicata senza errori, RLS attiva su tutte le tabelle, tipi generati
6. Lighthouse mobile: PWA installabile, performance ≥ 90 sulla home
7. Nessuna chiave segreta nel bundle client (verifica con `grep` sulla build)

## Cosa NON fare
- Non implementare stati di visione, azioni sui titoli, recensioni, amici, cinema
- Non creare tabelle oltre quelle elencate
- Non usare librerie UI esterne (shadcn incluso): componenti scritti a mano
- Non fare chiamate TMDB dal client
- Non usare `localStorage` per dati utente

Procedi per step, commit atomici, fermati e chiedi se una scelta di schema ti sembra discutibile.
