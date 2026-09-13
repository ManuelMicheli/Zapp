# ZConnection (estensione browser e app TV)

## Nel browser

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

**Serve il consenso, e non è una spunta decorativa.** `/api/scrobble` risponde
`403 consent_required` finché ogni membro del dispositivo non ha il consenso `scrobble`
attivo (`user_consents`), e in quel caso non scrive nulla — nemmeno una `watch_sessions`
con `user_id` nullo. Lo si concede da `/devices/connect` prima di collegare, o dalla
scheda che compare su `/devices` a chi un dispositivo ce l'aveva già da prima; lo si
revoca dal profilo, e revocarlo cancella le sessioni raccolte lasciando i dispositivi
collegati e inerti. Il dettaglio sta in [legal.md](legal.md).

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
- **Copertura: quattro piattaforme, ognuna con la sua sonda.** Netflix, Prime Video,
  Disney+ e NOW hanno un adapter proprio (`extension/adapters/*.js` per la lettura,
  `src/lib/scrobble/providers/*.ts` per l'interpretazione), nato da sonde reali
  (`docs/zconnection/*.md`, fixture in `__fixtures__/`). `mediaSessionFields` in
  `sites.ts` non serve piu' a nessuno dei quattro: Netflix l'ha smentita per tutti.
  **Una piattaforma nuova non si aggiunge a scatola chiusa**: ci vuole la sua sonda sul
  player vero, perche' ognuna espone (o non espone) i metadati a modo suo. Apple TV+
  richiederebbe anche una migrazione: il vincolo `check` su `device_profiles.site`
  elenca solo `netflix | prime | disney | now`.
- **Il percorso del player ha un contorno che cambia con l'account** (2026-09-12): le
  sonde sono state fatte tutte con la stessa configurazione, quindi non potevano
  mostrarlo. Disney+ apre ogni percorso con la **lingua dell'interfaccia** (`/it-it/`,
  ma `/en-gb/` per lo stesso account con l'inglese impostato), Prime Video antepone a
  `/detail/` un prefisso di lingua (`/-/it/`) o di regione (`/region/eu/`), NOW non
  marca sempre l'asset come `_HD`. `WATCH_PATH` in `sites.ts` e i tre adapter tollerano
  il contorno e tengono l'identita' (uuid Disney, id `/detail/` Prime — che l'adapter
  **normalizza** a `origin + /detail/<id>` —, asset NOW); cio' che non si allarga mai e'
  il **tipo** di pagina: catalogo Disney+ (`/browse/`) e diretta NOW
  (`/watch/playback/live/`) restano fuori. Fuori dalla configurazione della sonda
  l'evento veniva scartato da `parseEvent` **prima di ogni diagnostica**, cioe' in
  silenzio.
- **I numeri dichiarati dal player valgono, dopo che TMDB li conferma**
  (`providers/declared-episode.ts`, puro, Vitest; 2026-09-12). Su NOW e Disney+
  l'episodio si accettava **solo** per nome unico su tutte le stagioni
  (`resolvePrimeEpisode`): dove TMDB ha solo "Episodio 5" — anime e serie straniere —
  quella regola non puo' dire di si' nemmeno una volta, e infatti c'era una lista di
  tre nomi scritta a mano per una serie sola. Ora, se il nome non basta, si prendono
  stagione ed episodio che il player dichiara, ma **due conferme prima**: il sommario
  gia' in cache (`titles.seasons`) deve contenere quella coordinata — cosi' una
  coordinata impossibile non arriva a TMDB come 404, che sarebbe un errore di rete da
  ritentare all'infinito — e poi la stagione vera deve avere quella riga. L'ultima
  parola e' di `acceptsDeclaredEpisode`: **due nomi veri e diversi alla stessa
  coordinata** dicono che le numerazioni non coincidono, e li' non si scrive niente.
  **Prime resta fuori**: la sua numerazione e' di Amazon, non di TMDB.
- **Fuori dalla home la pagina si rilegge quando ZConnection scrive**
  (`WatchUpdatedRefresh`, montato nel layout `(app)`): ascolta `zapp:watch-updated`,
  che l'estensione manda **solo** quando il server ha applicato un evento (non a ogni
  battito). Tace se la home ha gia' il suo `WatchingProvider` — che lo stesso segnale
  lo gestisce meglio, distinguendo un minutaggio nuovo da un episodio nuovo —, a scheda
  nascosta, e piu' di una volta ogni 20 s. Il registro dei provider vivi sta in
  `src/lib/watch/sync.ts`: dal layout, che e' **sopra** la pagina, un contesto React
  non si legge.
- **La copia caricata non pacchettizzata va allineata a mano.** `/devices/connect`
  indica una cartella locale come "gia' pronta": il 2026-09-12 era ferma alla 1.3.1,
  quattro versioni indietro e **senza `zapp-sync.js`**, cioe' senza il pezzo che tiene
  aggiornata la UI di Zapp. Chi tocca `extension/` aggiorna anche
  `public/downloads/zconnection-<versione>{,.zip}` e la versione in
  `ConnectionGuide.tsx` (una costante sola: i tre numeri scritti a mano si erano gia'
  disallineati fra loro).
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
- **"Continua a guardare" si muove mentre guardi** (2026-09-09, richiesta utente), con due
  meccanismi di costo molto diverso e un solo sondaggio a reggerli entrambi:
  `WatchingProvider` chiede a `GET /api/watching` ogni 10 s — **solo a scheda in primo
  piano**, e subito al ritorno — cosa i dispositivi collegati stanno riproducendo
  (`getLiveSessions`, una query su `watch_sessions`, policy `watch_sessions_select_own`).
  Da li':
  1. **il minutaggio lo interpola il client** (`LiveProgress`): posizione dell'ultimo
     battito + tempo trascorso, **solo se `state === "playing"`**. Questa condizione e' il
     perno: l'estensione manda un battito ogni 30 s **anche in pausa**, quindi "la
     posizione e' fresca" non vuol dire "il video sta andando", e senza lo `state` la barra
     avanzerebbe a film fermo. Un tic al secondo, non `requestAnimationFrame`: il numero e'
     in minuti e la barra e' larga 300px.
  2. **la pagina si rifa' solo quando cambia l'identita' di cio' che si guarda** (titolo,
     stagione, episodio), che e' anche quando cambia **l'ordine della fila** — l'ordine e'
     `last_watched_at desc` e `scrobble_apply` la aggiorna a ogni battito, quindi l'ultima
     cosa iniziata sale in testa da sola. Rifare la home a intervalli fissi vorrebbe dire
     rirenderizzare carosello, scaffali e sezioni cinema per aggiornare due numeri.
  Senza sessione in corso la tessera mostra i valori del server, identici a prima: chi non
  usa l'estensione non vede nessuna differenza.
- **Sulle serie servivano altre due cose, e senza nessuna delle due il minutaggio vero non
  compariva mai** (2026-09-09, segnalazione utente: restava la durata dell'episodio).
  1. **La stagione si confronta con tolleranza in una direzione sola**
     (`samePlayingEpisode` in `progress.ts`, puro e testato): Netflix espone il numero di
     stagione **solo** dal pannello di pausa, quindi guardando normalmente
     `position_season` resta `null` mentre la tessera sa di mostrare la stagione 1 —
     e `null === 1` e' falso. Ora: episodio uguale sempre, stagione uguale **oppure
     sconosciuta**. Mai tollerante sul diverso: una stagione 2 dichiarata non combacia con
     una tessera della stagione 1.
  2. **La tessera mostra l'episodio che si sta guardando, non quello da riprendere**
     (`episodioDaMostrare`): `episode_number` avanza solo a episodio **completato**, quindi
     su una serie appena cominciata era ancora nullo e `targetEpisode` proponeva S1E1
     mentre l'utente era all'episodio 23. Due episodi diversi, e il minutaggio non aveva a
     cosa attaccarsi. Quando un dispositivo collegato sta riproducendo quella serie, la sua
     stagione/episodio diventano quelli della tessera (stagione sconosciuta -> resta quella
     che la tessera aveva gia'); l'avanzamento sulla serie resta calcolato sugli episodi
     visti, che e' un'altra misura. `ContinueRow` legge le sessioni una volta e le passa a
     `getContinueItems`.
- **Il toast su Netflix esce a inizio visione, non a ogni battito** (richiesta utente):
  compariva ogni 30 s e a ogni pausa, sopra il player. Serve a dire "l'estensione sta
  funzionando", e per dirlo basta una volta: ora esce al massimo due volte per ciascun
  `/watch/` — quando comincia, e quando il titolo viene segnato come visto, che e'
  un'informazione diversa. Il conto si azzera al cambio di `/watch/`, quindi ogni episodio
  nuovo ha il suo.
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

---

## Su TV

App Android nativa (repo separato `D:\PROGETTI\ZConnection`, Kotlin senza dipendenze,
`minSdk 22` per Fire OS 5). Spec: `docs/superpowers/specs/2026-09-12-zconnection-fire-tv-design.md`;
le misure che la giustificano: `docs/zconnection/FIRETV-SONDA-2026-09-12.md`.
**Muta come l'estensione**: legge le `MediaSession` e manda metadati grezzi alla
**stessa** rotta `/api/scrobble`, con `{ source: "android", events: [...] }`. Dal titolo
riconosciuto in giu' il codice e' condiviso (`applicaEventoRiconosciuto` nella rotta):
una regola che cambia vale per browser e TV insieme.

- **Due modalita', e la differenza e' un permesso.** `MediaSessionManager.getActiveSessions`
  si apre solo a chi ha l'"accesso alle notifiche": per questo esiste `ZListener`, un
  `NotificationListenerService` che non legge una sola notifica — serve il suo binding.
  Senza permesso l'app resta in **modalita' base** e non si rompe: i titoli li dichiarera'
  Zapp lanciandoli. Su Fire OS la schermata di sistema per concederlo **non esiste** e
  `adbd` non serve i chiamanti locali (provato): l'app mostra il proprio IP e rimanda a
  Zapp, che guida dal computer. Nessun tentativo di auto-concessione.
- **Solo NOW e Disney+ pubblicano il titolo** nei metadati. Netflix, Prime e Apple TV su
  Fire OS espongono una sessione senza nome: `parseAndroidEvent` torna `null`, l'evento
  finisce in `pending_scrobbles` come sessione anonima con chiave `anon:<provider>:<giorno>`
  — **per giorno, non per istante**: col battito da 30 s un film di due ore scriverebbe
  240 righe identiche.
- **NOW pubblica il nome dell'EPISODIO, non quello della serie** — e nemmeno i numeri di
  stagione ed episodio. Verificato sul televisore il 12/09: guardando *Atomic — Una Corsa
  Infernale* la `MediaSession` diceva `TITLE=Al Britani`, che e' il primo episodio (TMDB
  254701, S1E1). Cercare quel testo su TMDB come opera non trova niente, o trova un
  omonimo. **Si cerca al contrario**, dall'episodio alla serie, su `src/data/now-episodes.json`
  (`risolviEpisodioNow`): TMDB non sa cercare per nome di episodio, ma NOW Italia e'
  piccolo — 375 serie — quindi l'indice si costruisce una volta
  (`scripts/build-now-episodes.ts`, ~30 min) e si tiene in memoria.
  - **La data che NOW pubblica non e' quella di messa in onda** e non serve a
    identificare: per *Al Britani* diceva 2026-08-20, TMDB dice 2025-08-28. E' la data di
    disponibilita' sulla piattaforma. La **durata** invece combacia (46,2 contro 46 minuti)
    ed e' l'unico secondo segnale utilizzabile.
  - **Indice e risolutore si rifiutano di sapere quando non sanno**: fuori i nomi generici
    (`Episodio 4`) e quelli uguali in serie diverse con la stessa durata; e fra piu'
    candidati non si sceglie senza una durata che li separi (±2 minuti). Un episodio
    indovinato male scrive in libreria qualcosa che l'utente non ha visto, in silenzio;
    uno non riconosciuto finisce in `pending_scrobbles`, dove si vede. Un nome **unico**
    invece vale da solo, durata o no: le durate di TMDB mancano spesso e le sigle
    allungano lo stream.
  - Il rilievo era gia' nella sonda (`FIRETV-SONDA-2026-09-12.md`, §1) e non e' stato
    raccolto scrivendo il codice: **nessun test poteva accorgersene**, perche' le fixture
    usavano quello stesso nome come se fosse un titolo.
- **Sulla TV il tipo e' sempre dedotto.** La `MediaSession` da' un titolo e basta, quindi
  `parseAndroidEvent` conclude "film" per qualunque cosa. Un alias di catalogo che vale
  solo per le serie non scatterebbe mai: per questo `disneyCatalogMatch` accetta un
  `tipoIncerto`.
- **Disney+ e' il caso opposto a NOW: da' il nome della serie e nessun episodio.** Quella
  serie si registra lo stesso, **senza stagione ne' episodio** ("sta guardando Made in
  Korea" e' vero, e serve a "Continua a guardare"), con **un solo divieto**: non si
  completa mai. La durata che arriva e' quella di una puntata, e usarla per dire "serie
  finita" sarebbe falso. Verificato: un evento al 97% dell'episodio, e anche la chiusura
  della sessione al 99%, lasciano `completed` a `false` e `finished_at` nullo.
  - **Il minutaggio invece si tiene**, ed e' stato un errore vietarlo insieme al
    completamento: la posizione viaggia con `position_season`/`position_episode`, che qui
    restano nulli, e `resumeEpisode` legge quel nullo come "non so quale puntata" — quindi
    non fa riprendere niente dal minuto sbagliato, e intanto la tessera mostra a che punto
    sei. Senza, la scheda della serie non diceva l'ora dell'episodio in corso mentre su
    NOW la diceva.
  - **`decide()` butta via il punto di ripresa quando considera finita la puntata**: ha
    senso per un film o per un episodio noto, dove "finito" vuol dire che non c'e' piu'
    niente da riprendere. Qui no, la serie continua — e senza rimetterlo a mano il
    minutaggio si fermava al 90% e la tessera restava indietro per sempre.
  La scorciatoia vale **solo per la TV** (`tipoIncerto`): nel browser un episodio che
  manca significa che la lettura del DOM e' fallita, e li' tirare a indovinare e' peggio
  che fermarsi.
- **Fra omonimi decide la piattaforma, non il nome** (`scegliFraOmonimi`). *Doctor Who* su
  TMDB e' tre serie (1963, 2005, 2024) piu' un film, tutte con lo stesso nome e tutte con
  episodi da tre quarti d'ora: il nome non le separa e la durata nemmeno. **Una sola sta
  su Disney+ Italia**, la 2024 — e qual e' la piattaforma lo sappiamo con certezza, perche'
  e' l'app da cui arriva l'evento. Quando la strada normale rinuncia, sulla TV si cercano
  gli omonimi, si chiede a TMDB chi li offre e si tiene quello giusto; se sono zero o piu'
  d'uno ci si ferma. Senza, la strada normale prendeva il **film** omonimo (sulla TV il
  tipo dedotto e' sempre "film") e la verifica del nome lo scartava: errore evitato,
  visione persa.
  - **La cache dei provider era vuota** e per questo non aiutava: la presenza sulla
    piattaforma li' e' solo uno dei punteggi, e nessuno dei Doctor Who aveva righe in
    `title_providers`. La scelta le riempie chiamando `getOrFetchTitle` — ed e' il motivo
    per cui costa.
  - **Si paga una volta**: la risposta resta in memoria di processo per sei ore. Senza,
    ogni battito da 30 s rifaceva due ricerche TMDB per essere rifiutato di nuovo
    (misurato: 1,3 s a battito, poi 0,6 s).
- **Disney+ invece funziona**: stesso giorno, *Maze Runner — La fuga* riconosciuto dal
  titolo con la durata giusta (7.998.000 ms) e scritto in libreria senza toccare niente.
- **Soglia anti-anteprima, due minuti** (`riproduzioneVera`). Netflix e Prime riproducono
  le anteprime del catalogo come sessioni indistinguibili da un film, e su una TV non c'e'
  un URL che le smentisca come nel browser: sotto i due minuti di riproduzione, o con una
  durata sotto i cinque, non si tocca niente.
- **La posizione va estrapolata.** Prime non notifica la posizione durante la
  riproduzione: `PlaybackState.position` resta al valore dell'ultimo aggiornamento. La
  sonda somma il tempo trascorso da `lastPositionUpdateTime` — senza, la soglia dei due
  minuti non scatterebbe mai — e manda comunque un battito ogni 30 s.
- **Il token lo genera la TV**, il server ne vede solo l'hash (`/api/devices/pair` accetta
  `token_hash`, e non restituisce mai nulla che permetta di ricostruire il token).
  L'abbinamento e' un codice a sei cifre che la TV mostra e il telefono digita: scrivere
  col telecomando e' una pena. `pairing_codes` ha RLS accesa e **nessuna policy** — ci
  arriva solo il service role — e `claim_pairing_code` e' l'unico modo per reclamarlo.
- **I tetti di frequenza stanno su cio' che il chiamante non sceglie.** La registrazione
  (`/api/devices/pair`) e' l'unica rotta che scrive senza sessione: il tetto per
  `install_id` da solo non era un tetto, perche' l'`install_id` lo manda il client — un
  UUID nuovo a ogni richiesta non lo incontrava mai. Accanto c'e' quello per indirizzo, e
  i codici scaduti si spazzano nella stessa richiesta (prima non li cancellava nessuno).
  Sul reclamo valgono tre tetti insieme: per utente (10/minuto), **per codice** (5 ogni
  dieci minuti: ferma chi martella quel codice, da qualunque account arrivi) e per
  indirizzo (20/minuto: ferma chi spara a caso, che cambia bersaglio a ogni tentativo e
  il tetto per codice non lo vedrebbe mai). **Resta scoperto** chi ha molti account *e*
  molti indirizzi. E' una scelta, non una svista: chi la rilegge non deve rifare il conto
  da capo. Le tre leve per stringere, **in ordine di costo per l'utente**:
  1. **accorciare la vita del codice** (`CODICE_TTL_MS`, oggi dieci minuti). Quel che
     conta non e' lo spazio dei codici ma quanti ne sono vivi nello stesso istante, e
     quello scala con la finestra: da dieci minuti a due, i codici vivi calano di cinque
     volte e con loro la probabilita' di colpirne uno a caso. Per l'utente non cambia
     niente — la TV si abbina in trenta secondi o non si abbina;
  2. **abbassare i tetti**, che si paga solo quando si sbaglia a digitare;
  3. **allungare il codice**, che si paga *ogni volta*, su un telecomando. E' la leva
     piu' forte e l'ultima da tirare.
- **La forma degli eventi si verifica lato server** (`isAndroidEvent`): l'app e' nostra,
  ma il token vive su un dispositivo che non controlliamo. Stesso tetto del browser sui
  campi che finiscono in TMDB e in un `.ilike()`. Un evento malformato non entra nemmeno
  fra gli `acknowledged` — non ha un `id` di cui fidarsi.
- **Gli eventi della TV si confermano sempre**, anche quando falliscono: senza un `url` da
  isolare non esiste un "ritenta questo singolo evento", e un battito nuovo arriva fra 30 s
  con una posizione aggiornata. La coda sta su file (200 eventi, i piu' vecchi cadono) e
  ritenta a 5 s, 15 s, 60 s; su 401 si svuota, perche' appartiene a un dispositivo revocato.
- **I package riconosciuti** stanno in `SITI` (`src/lib/scrobble/android.ts`): Netflix
  (`com.netflix.ninja`, `com.netflix.mediaclient`), Prime (`com.amazon.firebat`,
  `com.amazon.avod`, `com.amazon.avod.thirdpartyclient`), Disney+ (`com.disney.disneyplus`),
  NOW (`com.nowtv.it`). La whitelist vale **anche lato server**: non ci si fida del client.
- **Il matcher da solo prenderebbe un omonimo; e' il controllo dopo che lo ferma.** Sempre
  il 12/09: su Disney+ una serie coreana pubblicata come `Made in Korea` (TMDB la conosce
  solo col titolo coreano, `메이드 인 코리아`). `matchTitle` restituiva un documentario
  olandese del 2007 che si chiama davvero cosi'; il confronto fra nome letto e nome del
  candidato, dentro la rotta, l'ha scartato e ha scritto "titolo sconosciuto". Quella
  verifica non e' una cintura in piu': e' l'unica cosa fra un catalogo pieno di omonimi e
  una libreria sporca.
### Il lancio dalla scheda titolo

Dalla scheda di un titolo (e dalla card "Continua a guardare") un tondo apre quel
titolo su una TV collegata. Non scrive niente in libreria da solo: quello lo fa la
riproduzione vera, oltre i due minuti, con la stessa strada dello scrobble sopra.

- **Come viaggia.** La Server Action `lanciaSullaTv`
  (`src/app/(app)/devices/actions.ts`) scrive una riga in `device_commands`; la TV la
  ritira dalla rotta GET `/api/devices/commands` (la stessa vista sopra per i tetti di
  frequenza) e riferisce l'esito — `ok`, `assente` o `errore` — col sondaggio
  successivo. La consegna e' "confronta-e-imposta": l'UPDATE prende solo righe con
  `delivered_at is null`, quindi un comando non parte mai due volte anche se due
  sondaggi arrivano vicini. I comandi hanno una scadenza (`expires_at`): una TV accesa
  un'ora dopo il lancio non si mette a riprodurre da sola.
- **I due orologi non sono lo stesso.** La TV sonda ogni 2 s e, appena eseguito un
  comando, il giro successivo parte subito invece di aspettare, cosi' l'esito arriva
  presto. Il bottone sul telefono invece controlla ogni secondo per 30 s e dichiara il
  successo solo quando arriva `result = "ok"` — non alla consegna: la TV riferisce
  l'esito nel sondaggio *dopo* aver eseguito il comando, quindi "consegnato" non vuol
  dire ancora "aperto".
- **Le forme di lancio sono misurate sull'hardware**, non dedotte
  (`src/lib/devices/launch.ts`):
  - **Netflix**: l'URL non basta, avvia solo l'extra `amzn_deeplink_data` con l'id
    nudo piu' il componente esplicito. L'app mostra la scheda del titolo mentre
    carica e poi parte da sola.
  - **Disney+**: conta il percorso. `play/<uuid>` avvia, `browse/entity-<uuid>` no;
    si riscrive tenendo lo stesso uuid.
  - **Prime Video**: apre la scheda del titolo, e da li' serve un Play col
    telecomando — il testo del bottone lo dice.
  - **NOW**: non si lancia affatto. Misurato il 13/09: l'app espone solo l'activity
    di avvio, nessun filtro VIEW, e il protocollo Amazon delle capacita' risponde al
    launcher di Amazon, non a noi. Sui titoli solo-NOW il tondo non compare — e non
    serviva nemmeno all'identita', perche' NOW pubblica il titolo di cio' che
    riproduce e si riconosce gia' da sola (vedi sopra).
  - L'intent porta `FLAG_ACTIVITY_NEW_TASK` **e** `FLAG_ACTIVITY_CLEAR_TASK`: senza
    il secondo, un lancio verso un'app gia' aperta non viene consegnato (Android
    porta il task in primo piano e butta l'intent).

### La dichiarazione: dare un titolo alle sessioni anonime

`src/lib/scrobble/declared.ts` decide come un lancio da' identita' alle sessioni
anonime di Netflix, Prime e Apple TV, che pubblicano posizione e stato ma nessun
titolo. Un lancio vale come dichiarazione di cosa si sta guardando finche':

- non passa mezz'ora di silenzio (`FINESTRA_MS`, con una tolleranza simmetrica per
  lo scarto fra gli orologi);
- non si torna vicino all'inizio (sotto i 5 minuti) con un salto indietro di oltre
  un minuto;
- non si salta indietro di oltre venti minuti;
- **e la posizione non corre piu' dell'orologio**: fra due eventi attribuiti allo
  stesso lancio la posizione puo' avanzare al massimo quanto il tempo davvero
  trascorso piu' due minuti di tolleranza (salta-sigla). E' la regola della
  continuita', aggiunta il 13/09 perche' Netflix **riprende** un titolo gia'
  iniziato: cambiando film col telecomando non c'e' nessun salto all'indietro da
  vedere, quindi le regole sopra da sole non bastavano. Si controlla solo il lato
  "troppo avanti": gli eventi in pausa non arrivano fin li', quindi andare piu'
  piano dell'orologio e' normale e non deve rompere l'attribuzione.

Buco residuo, da scrivere apertamente: se il titolo nuovo riprende quasi allo
stesso minuto del vecchio, non c'e' segnale che li distingua.

Collaudato sul televisore il 13/09: *Matrix* lanciato da Zapp e guardato fino a
4:26, poi cambio su *Scarface* (ripreso da circa 15 minuti) — l'attribuzione si
ferma li', e in libreria resta *Matrix* a 4:26 con *Scarface* intatto.

**La durata quando la piattaforma non la manda**: per i film si usa il `runtime` di
TMDB come denominatore, cosi' il completamento (90%) funziona anche su Netflix e
Prime, che non pubblicano mai la durata totale.
