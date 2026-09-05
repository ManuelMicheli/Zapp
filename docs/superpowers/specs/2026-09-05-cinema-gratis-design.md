# Cinema vicino a te, fonte gratuita — design

Data: 2026-09-05. Stato: approvato in chat. Sostituisce lo strato dati MovieGlu della
feature "Cinema vicino a te" (`2026-09-04-cinema-vicino-design.md`) con fonti gratuite.
UI, tabella `cinema_plans`, posizione (`user_locations`), foglio biglietti, home card
restano quelli esistenti.

## Perché

MovieGlu non offre l'Italia nel trial e a regime è a pagamento; International
Showtimes costa 299 €/mese. L'utente vuole tenere la feature gratis: posizione →
cinema nel raggio → orari di oggi → mostrati in Zapp.

## Fonte: MyMovies (HTML pubblico, letto lato server)

Verificato il 2026-09-05 (campioni salvati durante lo spike):

| Cosa | URL | Contenuto |
|---|---|---|
| Indice provincia | `https://www.mymovies.it/cinema/<prov>/provincia/` | tutti i cinema con programmazione oggi: `<a class="link-19" href="https://www.mymovies.it/cinema/<prov>(/<comune>)?/<id>/" title="Programmazione del cinema <nome> di …">` seguito da `<span class="mm-small"><Comune></span>` |
| Coordinate cinema | `https://www.mymovies.it/ajax/mappe/mappa.asp?sala=<id>&film=<filmId>` | iframe `googlemaps.asp?lat=45.479714&lng=9.187763&nomecinema=…&indirizzo=Via+Milazzo+9&local=Milano` |
| Programma cinema (oggi) | `https://www.mymovies.it/cinema/<prov>(/<comune>)?/<id>/` | per film: `<div class="schedine-titolo"><a href="https://www.mymovies.it/film/<anno>/<slug>/" title="<Titolo>">`, `id="mappa_<cinemaId>_<filmId>"`, poi `<div class="… orari-dettaglio">` con etichette `<div class="mm-medium" style="font-weight:400;"><Etichetta>:</div>` (es. "Versione originale con sottotitoli") e orari `<span class="mm-medium mm-weight-700">HH:MM</span>` |
| Film in provincia (oggi) | `https://www.mymovies.it/cinema/<prov>/provincia/?f=<filmId>` | stesse voci cinema dell'indice, ciascuna seguita dal proprio blocco `orari-dettaglio` |
| Film in programmazione | nell'indice città/provincia: `href="//www.mymovies.it/cinema/<prov>/provincia/?f=<filmId>" title="<Titolo> a <Città>"` | mappa titolo → filmId |

Limiti accettati: **solo oggi** (nessun parametro giorno); nessun link di acquisto
(bottoni `btn-buy-no`): il link biglietti resta la cascata esistente (manual → sito
cinema → catena → Google). Termini d'uso di MyMovies: lettura di pagine pubbliche con
User-Agent identificabile, cache aggressiva, mai più di 2 richieste al secondo; se il
layout cambia il parser torna vuoto e la UI degrada a "Orari non disponibili".

## Architettura

`src/lib/cinema/mymovies/` (nuovo):

- `parse.ts` (puro, test Vitest su fixture ridotte in `__fixtures__/`):
  `parseProvinceIndex(html) → MmCinemaRef[]` (`{id, name, town, path}`),
  `parseNowShowing(html) → MmFilmRef[]` (`{filmId, title}` dai link `?f=`),
  `parseCinemaPage(html) → MmFilmProgramme[]` (`{filmId, title, year, slug, showings: {format, time}[]}`),
  `parseFilmProvincePage(html) → MmCinemaProgramme[]` (`{cinemaId, name, town, showings}`),
  `parseMappa(html) → {lat, lng, address, town} | null`,
  `slugify("Sesto San Giovanni") → "sestosangiovanni"`, `normalizeFormat("Versione originale con sottotitoli") → "vos"`.
- `client.ts` (`server-only`): `fetchText(url)` con UA `Zapp/1.0 (+NEXT_PUBLIC_APP_URL)`,
  throttle 2 req/s, timeout 8 s, `null` su errore; `unstable_cache` per pagina:
  indice provincia 6 h, programma cinema e film-in-provincia 30 min, mappa 30 giorni.
- `venues.ts` (`server-only`): `getProvinceVenues(prov) → Venue[]` = indice provincia +
  coordinate da `cinema_venues` (DB, 30 giorni) o `mappa.asp` (poi upsert con il service
  client: dato di sistema). `Venue = Cinema` del tipo pubblico esistente (id = id MyMovies).
- `source.ts`: adapter unico dietro `showtimes.ts`: `CINEMA_SOURCE=mymovies` (default),
  `mock` (`MOVIEGLU_MOCK=1` resta un alias), `movieglu` (codice esistente, opzionale).
  `isCinemaEnabled()` → `true` salvo `CINEMA_SOURCE=off`.

`showtimes.ts` (stessa interfaccia pubblica):

- `getNearbyCinemas(geo, n)`: provincia da `user_locations.province_slug`; venues
  con distanza haversine (`geo.ts`), ordinati, entro `CINEMA_RADIUS_KM = 25`, primi `n`.
  Se la provincia del punto non copre il raggio (confine), si accetta il limite.
- `getCinemaProgramme(geo, cinema, date)`: pagina cinema di oggi → film abbinati a TMDB
  (`match.ts`: `cinema_films` per `mymovies_film_id`, altrimenti TMDB `search/movie`
  con titolo e anno, upsert). `date` ignorata (solo oggi).
- `getFilmShowtimes(geo, filmId, filmName, date)`: `filmId` è ora il **MyMovies film id**
  del titolo (`getMyMoviesFilmId(title)`: `cinema_films.mymovies_film_id` o match del
  titolo TMDB/originale contro `parseNowShowing(indice provincia)`; 24 h). Pagina
  film-in-provincia → cinema filtrati per raggio con coordinate dai venues.

Posizione: `location.ts` al salvataggio calcola `province_slug` da Nominatim
(`address.county`, altrimenti `city`/`town`) con `slugify`, verificato con un GET
dell'indice provincia (200 e almeno un cinema) e salvato in `user_locations`; assente →
UI "Zona non coperta da MyMovies".

DB (migrazione `0012_cinema_free.sql`): `cinema_venues (mymovies_id int pk, name, address,
town, lat, lng, province_slug, fetched_at)`; `cinema_films.mymovies_film_id int` (+ index);
`user_locations.province_slug text`. RLS: `cinema_venues` sistema (nessuna policy).

UI: `DayBar` rimossa dalla scheda film e da `/cinema` (testata "Oggi al cinema vicino a
te"); il resto invariato. `TicketSheet` continua a usare `bookingUrl` dalla cascata link.

Config (`config.ts`): `CINEMA_RADIUS_KM = 25`, `MYMOVIES_BASE`, TTL sopra.

Verifica: Vitest sui parser (fixture ridotte dai campioni reali), `pnpm typecheck && lint
&& build`, screenshot con produzione locale (`next build` + `next start`) e posizione
Milano, poi deploy Vercel senza nuove env (Nominatim e MyMovies solo server).
