# UI: navigazione e contenitori

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
