# Cinema vicino a te — design

Data: 2026-09-04. Stato: approvato in chat, da pianificare.

## Obiettivo

Per i film "al cinema", partendo dalla posizione dell'utente, mostrare i cinema più
vicini che li proiettano con gli orari già visibili, e accompagnare all'acquisto del
biglietto con un flow corto e interattivo. Fuori scope esplicito: posti in sala live
(nessuna API pubblica in Italia li espone: Webtic / 18Tickets / UCI / The Space li
mostrano solo dentro il proprio checkout), mappa, prezzi, checkout in-app, attività nel
feed.

Fonte dati: **MovieGlu API** (cinema vicini, orari, formato, distanza) — chiave a
pagamento, richiesta sandbox. Geocoding: **Nominatim** (OSM), solo server.

## 1. Dati e adapter (`src/lib/cinema/`, tutto `server-only`)

### `movieglu.ts`

- Base `https://api-gate2.movieglu.com`. Header: `client`, `x-api-key`,
  `authorization`, `territory=IT`, `api-version=v201`, `geolocation=lat;lng`,
  `device-datetime` (ISO, ora corrente).
- Env: `MOVIEGLU_CLIENT`, `MOVIEGLU_API_KEY`, `MOVIEGLU_AUTHORIZATION`; throw se mancanti
  o `INSERISCI…`. `isCinemaEnabled()` = tutte e tre presenti (o `MOVIEGLU_MOCK=1`).
- Throttle in memoria 2 req/s (stesso schema di `tmdb/client.ts`). Log
  `[movieglu] fetch <path>`.
- Endpoint: `filmsNowShowing`, `cinemasNearby`, `filmShowTimes`, `cinemaShowTimes`,
  `cinemaDetails`. Tipi raw in `types.ts`.
- `MOVIEGLU_MOCK=1`: legge fixture JSON in `src/lib/cinema/fixtures/` (3 cinema
  milanesi, 4 film, orari generati intorno all'ora corrente) — per sviluppare e fare
  screenshot senza chiave.

### `match.ts` — TMDB → MovieGlu

- `getMovieGluFilmId(tmdbId)`: legge `cinema_films`; se assente o `fetched_at` > 24 h,
  chiama `filmsNowShowing` (n=50, cache Next 1 h) e cerca `imdb_title_id ===
  titles.external_ids.imdb_id`. Salva (`movieglu_film_id` null = non in programmazione).
- Nessun match → il film non ha sezione cinema.

### `showtimes.ts`

- `getNearbyCinemas({lat,lng, n=10})` → `Cinema[]`.
- `getFilmShowtimes({lat,lng, filmId, date})` → `{cinema: Cinema, showings: Showing[]}[]`.
- `getCinemaProgramme({lat,lng, cinemaId, date})` → `{film, showings}[]` con `film`
  agganciato a TMDB via `cinema_films` inverso (imdb → tmdb con `find/{imdb}` TMDB,
  cache 24 h nella stessa tabella).
- Cache: `unstable_cache` con chiave `cell(lat,lng)` = arrotondamento a 0,01°
  (~1 km) + film/cinema + data, `revalidate = SHOWTIME_CACHE_TTL_MS / 1000` (15 min).
  Nessuna tabella per gli orari.
- Tipi pubblici:
  ```ts
  interface Cinema { id: number; name: string; address: string; city: string;
    lat: number; lng: number; distanceKm: number; logoUrl: string | null }
  interface Showing { start: string /* ISO */; end: string | null;
    format: "standard" | "3d" | "imax" | "imax3d" | string; bookingUrl: string }
  ```
  `distanceKm` = MovieGlu `distance` (miglia) × 1,609. Tempo a piedi stimato = km / 5 km/h.

### `links.ts` — link biglietteria

`resolveBookingLink(cinema, film, showing)`, cascata come `resolveProviderLink`:

1. `cinema_links` con `source='manual'` (mai sovrascritto; script `scripts/set-cinema-link.ts`).
2. Template catena da nome cinema (`CINEMA_CHAINS` in `config.ts`: UCI, The Space,
   Notorious, Cinelandia, Webtic) → url della pagina cinema/film della catena.
3. `cinemaDetails.website` (TTL 30 g in `cinema_links`, `source='movieglu'`).
4. Google `https://www.google.com/search?q=<cinema> <film> biglietti` (`source='search'`, retry 7 g).

Il link non è mai vuoto: la CTA è sempre attiva.

### Migrazione `0006_cinema.sql`

```sql
alter table public.profiles
  add column location_lat double precision,
  add column location_lng double precision,
  add column location_label text,
  add column location_updated_at timestamptz;

create table public.cinema_films (
  tmdb_id bigint primary key,
  movieglu_film_id integer,
  imdb_id text,
  fetched_at timestamptz not null default now()
);

create table public.cinema_links (
  cinema_id integer primary key,
  url text not null,
  source text not null check (source in ('manual','movieglu','search')),
  fetched_at timestamptz not null default now()
);

create table public.cinema_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  tmdb_id bigint not null,
  cinema_id integer not null,
  cinema_name text not null,
  cinema_address text not null,
  cinema_lat double precision,
  cinema_lng double precision,
  starts_at timestamptz not null,
  format text,
  booking_url text not null,
  created_at timestamptz not null default now(),
  unique (user_id, tmdb_id, starts_at)
);
```

- `cinema_films` / `cinema_links`: sistema, scritte solo dal service client, RLS on con
  policy `select` per `authenticated`.
- `cinema_plans`: RLS owner-only (select/insert/delete `user_id = auth.uid()`).
- Dopo la migrazione: `supabase gen types …` → `src/types/database.ts`.

## 2. Posizione utente

- `src/lib/cinema/location.ts` (`"use server"`):
  - `setLocation({lat,lng,label?})`: valida range, se `label` assente → reverse
    geocoding Nominatim (`/reverse`, `zoom=14`, `Accept-Language=it`, User-Agent
    `Zapp/1.0 (NEXT_PUBLIC_APP_URL)`, timeout 3 s) → "Quartiere, Città"; fallito →
    "Posizione attuale". Aggiorna `profiles` e `revalidatePath` di `/`, `/cinema`,
    `/title/movie/[id]`.
  - `setLocationByQuery(q)`: `/search?countrycodes=it&limit=1`; nessun risultato →
    `{ok:false, error:"Città non trovata"}`.
  - `getViewerLocation()` (queries): lat/lng/label dal profilo, `null` se assenti.
- `LocationPrompt` (client): card vetro "Cinema vicino a te" con "Usa la mia posizione"
  (`navigator.geolocation.getCurrentPosition`, `maximumAge 600000`, `timeout 8000`) e
  "Scrivi la città" (campo con `AUTH_FIELD_CLASS`). Errore GPS → apre il campo città.
- `LocationChip` (client): "📍 Milano · Cambia" in testa alle liste; apre `Sheet` con le
  stesse due opzioni.
- Nessun nuovo origin nella CSP: Nominatim e MovieGlu solo lato server.

## 3. UI

### Scheda film (`TitleBody`, solo `movie`)

- Nuova sezione `NearbyShowtimes` (server, Suspense + skeleton) sotto "Dove vederlo".
  Renderizzata solo se `isCinemaEnabled()` e `getMovieGluFilmId` ≠ null.
- Testata: "Al cinema vicino a te" + `LocationChip`.
- `DayBar` (client): 7 giorni da oggi ("Oggi", "Domani", "Gio 7"…), pillola segmentata
  con indicatore `motion.span layoutId`; cambia giorno via `?day=YYYY-MM-DD` (server
  refetch, cache 15 min).
- Card cinema (max 5, `rounded-[20px] border border-border bg-surface p-4`):
  nome + logo catena, badge distanza "1,2 km · 15 min a piedi", indirizzo `text-muted`,
  riga orari scorrevole: chip `glass` "21:00" + badge formato `accent-pale`
  ("IMAX", "3D"). Orari passati (oggi) `text-muted-2 line-through`, prossimo spettacolo
  `bg-accent` con "tra 2 h 10". Primo cinema: etichetta "Il più vicino". Se ≤ 2 orari
  futuri oggi: badge "Ultimi spettacoli oggi".
- Tap orario → `TicketSheet`. Link "Vedi tutti i cinema" → `/cinema?film=<tmdbId>`.
- Senza posizione → `LocationPrompt` al posto della lista.

### Pagina `/cinema` (`src/app/(app)/cinema/page.tsx`)

- Da Scopri: la shelf "Al cinema adesso" ottiene `seeAllHref="/cinema"`.
- `TopBar` "Cinema", `LocationChip`, `DayBar`, tab pill **Per film** | **Per cinema**
  (`?view=films|cinemas`, default `films`).
- **Per film**: film in programmazione vicino (da `cinemasNearby` n=10 →
  `cinemaShowTimes` per i primi 5, aggregati per film): poster, titolo, cinema più
  vicino, prossimi 3 orari come chip (tap → `TicketSheet`), tap card → scheda film.
- **Per cinema**: card cinema per distanza, `GlassIconButton` "Indicazioni"
  (`https://maps.google.com/?q=lat,lng`; su iOS `https://maps.apple.com/?daddr=lat,lng`),
  dentro elenco film con chip orari.
- `?film=<tmdbId>` filtra su un titolo (stesso layout di "Per cinema").
- Desktop `lg`: griglia 2 colonne. Chiude con `pb-16`. Senza posizione: `LocationPrompt`
  a tutta pagina.

### `TicketSheet` (client, riusa `Sheet`)

- Header: poster w92 + titolo. Riga grande "Gio 7 set · 21:00" + badge formato.
  Cinema, indirizzo, distanza; "Finisce ~23:05" se `end`.
- CTA primaria `bg-accent` **"Compra i biglietti"** → `bookingUrl`, `target="_blank"
  rel="noopener"`. Mai iframe.
- Secondarie in vetro: **"Ci vado"** (sez. 4), **"Invita amici"** (apre `RecommendSheet`
  con messaggio precompilato "Vieni al <cinema> gio 7 alle 21:00?").
- Nota `text-muted-2`: "Posti e prezzi si scelgono sul sito del cinema."

## 4. "Ci vado", amici, home

- `src/lib/cinema/plans.ts` (`"use server"`): `planShowing(input)` inserisce in
  `cinema_plans` e, se il film non ha `watch_entries`, chiama `addWant`; ritorna
  `{ok, planId, prevEntry}` per l'undo del toast ("Serata salvata · Annulla" →
  `cancelPlan` + `restoreEntry`). `cancelPlan(id)`. `revalidatePath("/")`.
- `getUpcomingPlan()` (queries): primo piano con `starts_at` tra −3 h e +48 h.
- Home: card `TonightAtCinema` sopra "In corso" (backdrop del film, "Stasera 21:00 ·
  UCI Bicocca", countdown live, bottoni "Biglietti" e "Indicazioni"). Se `starts_at`
  < ora − 3 h: variante "L'hai visto?" con "Segna visto" (`markWatched`) e "No" (cancella
  piano).
- Invita amici: riuso di `recommendations` senza colonne nuove; nessun piano creato
  per l'amico.
- Nessun trigger attività su `cinema_plans`.

## 5. Errori, config, verifica

- MovieGlu giù / quota / chiave assente: sezione scheda film assente; `/cinema` mostra
  `EmptyState` "Orari non disponibili ora, riprova tra poco". Mai errore di pagina.
- Nominatim fallito: coordinate salvate, label "Posizione attuale".
- Booking url sempre valorizzato (fallback Google).
- `config.ts`: `SHOWTIME_CACHE_TTL_MS = 15 min`, `CINEMA_CHAINS`, `NOMINATIM_BASE`.
- `.env.example` e README: le tre env MovieGlu, `MOVIEGLU_MOCK`.
- Verifica: `pnpm typecheck && pnpm lint && pnpm build`; sviluppo con `MOVIEGLU_MOCK=1`;
  screenshot mobile/desktop di scheda film, `/cinema` (entrambe le viste), `TicketSheet`,
  card home.
