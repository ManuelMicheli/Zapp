# Home

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
- **Banner a filo pagina** (2026-09-12, richiesta utente): sul fondale del carosello
  stanno **solo la nav con le sue due icone e, in Cerca, la barra di ricerca**. Tutto il
  resto — pillola Tutto/Film/Serie TV, pillole dei generi, titolo della fila del momento
  con le sue pillole mood — sta **sotto** il banner: sopra l'immagine non piaceva.
  In home la scritta "Home" (`HomeTitle`, `HomeType.tsx`) si comporta in due modi,
  perche' la nav cambia posto: **sotto `lg`** la nav e' in basso, la cima e' libera e la
  scritta va **sull'immagine**; **da `lg`** la nav e' in alto e "Home" si tiene una riga
  nera sua, col banner che comincia sotto di lei.
  La leva e' una sola: `BannerCarousel` accetta `bannerTop`, **classi** che impostano
  `--banner-top` (classi e non stile in linea perche' il valore cambia per breakpoint).
  Da quella variabile dipendono tre cose: il margine negativo che fa risalire il banner
  sotto i comandi, la crescita del fondale e l'altezza del velo in cima. In home vale
  safe + nav + 72px sotto `lg` e **`0px` da `lg`**: a zero le tre cose si annullano da
  se', quindi il ramo per breakpoint non serve. In Cerca vale l'altezza della barra piu'
  16px (vedi [routes.md](routes.md)).
  **Il fondale si estende verso l'alto, non trasla.** Sotto `lg` cresce il riquadro
  dell'immagine: `min-h-[calc(56.25cqw + var(--banner-top))]`, col `cqw` che misura la
  card grazie a un `@container` sulla sezione e non la finestra (sotto `md` il guscio e'
  largo 480px). Da `lg` cresce la **card**: `64svh` diventa `64svh + --banner-top`, e con
  lei minimo e massimo. Prima da `lg` il fondale riempiva la card e la card saliva: il
  banner restava della stessa altezza, la stessa fetta 21:9 spostata in su, che non e'
  estendere l'immagine (correzione utente).
  **Tre trappole pagate**, tutte e tre invisibili ai test sui riquadri:
  1. La scritta "Home" c'era nei `boundingBox` ma **non si vedeva**: il banner risale con
     un margine negativo e, venendo dopo nel DOM, le dipingeva addosso. Serve
     `relative z-20` su `HomeTitle`. Da qui `inVista()` in `banner-check.mjs`, che chiede
     a `elementFromPoint` chi c'e' davvero sotto il centro dell'elemento.
  2. La pillola Tutto/Film/Serie TV si stirava da un bordo all'altro su desktop: fuori
     dal vecchio contenitore `lg:flex-row`, il suo `lg:w-auto` non stringe in un `div` a
     blocco. Il contenitore nuovo e' `flex`.
  3. `HomeTitle` sta **fuori** dal `Suspense` di `HomeHero`: dentro spariva mentre TMDB
     rispondeva.
  I veli sono tenuti **bassi e leggeri** (richiesta utente): in fondo un quarto della
  card a `black/70` sotto `lg`, meta' a `black/80` da `lg` — prima erano un terzo a nero
  pieno e due terzi. Su desktop la leggibilita' del titolo la fa il velo da sinistra.
  Le altezze dei comandi sono **costanti scritte a mano** (`HOME_BANNER_TOP` in
  `HomeHero.tsx`, `MOMENT_BANNER_TOP` in `MoodPills.tsx`): misurarle a runtime faceva
  saltare il fondale al primo render. Cambiando un `h-10` in testata vanno rifatti i
  conti, che il commento accanto alla costante elenca.
  Collaudo: `scripts/banner-check.mjs` (build isolata + istanza avviata, utente finto che
  accetta il muro del consenso) misura dove comincia il fondale, che sia cresciuto della
  misura giusta, chi sta sull'immagine e chi sotto, e che dare il fuoco al campo di
  ricerca non sposti il banner. 18 controlli a 390px e 1440px.

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
  `HeroCarousel` e `MoodPills` condividono; `MoodPills` disegna titolo e pillole
  **sotto** il banner (vedi "Banner a filo pagina"). Per disegnarlo servono fondale e trama: `ShelfItem` li porta come campi
  **facoltativi** (le copertine degli altri scaffali non li guardano) e
  `src/data/mood-picks.json` è stato rigenerato con `backdropPath`/`overview`.
  **Città e meteo non si scrivono in pagina** (stessa data): il sopratitolo "Adesso a
  Milano · 32° e nuvoloso" raccontava all'utente cosa sappiamo di lui — restano dentro,
  a scegliere la fila. Lo slot `eyebrow` di `HorizontalShelf`/`ItemShelf` non lo usa
  più nessuno; nemmeno `aside` (le pillole stanno sotto il banner).
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
