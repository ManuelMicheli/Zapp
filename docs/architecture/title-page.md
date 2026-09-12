# Scheda titolo e pagina stagione

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
