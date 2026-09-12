# Cinema

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

