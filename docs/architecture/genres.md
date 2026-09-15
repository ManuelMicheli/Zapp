# Per genere (pillole della home)

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

## Per piattaforma (le pillole sotto quelle dei generi)

Seconda fila di pillole nella home, **sotto** "Per genere" (richiesta utente
2026-09-15): scegli il servizio che paghi e trovi cosa ci puoi guardare. Stessa
geometria di `GenreFilter` — da `lg` etichetta più fila unica scorrevole, sotto `lg`
solo la scritta che apre il foglio. Le due etichette condividono una larghezza
(`NAV_FILTRO_LABEL`): ogni gruppo etichetta + pillole è centrato per conto suo, quindi
con etichette di larghezza diversa le due file partivano da due x diverse.

**Dal 2026-09-15 (sera) le pillole — dei generi come delle piattaforme — non aprono più
una pagina di Scopri: cambiano l'ambito della home**, che resta la stessa pagina con
ogni sezione ristretta a quel genere, a quella piattaforma o a tutti e due ("Storie vere
su Netflix"). Il meccanismo è descritto in [home.md](home.md), voce "Home filtrata".
`src/lib/genres/list.ts` e `src/lib/platforms/list.ts` restano per le pagine
`/discover/[type]/[chiave]`, ancora raggiungibili per indirizzo, e prestano al motore
la ricetta tradotta (`filtriDi`, `daPick`) e il catalogo con secondo giro
(`platformCandidates`).

- `src/lib/platforms/catalog.ts` (puro, Vitest): le dieci piattaforme dell'accesso
  rapido (`MAIN_PROVIDER_IDS`), nello stesso ordine, col **nome preso da `PROVIDERS`** —
  non riscritto qui. Ogni voce porta **tutti** gli id con cui TMDB pubblica quel
  servizio, non solo il principale: Prime Video esiste anche come "with Ads" (2100),
  Paramount+, Discovery+, HBO Max e Infinity anche come canale Amazon o Apple TV.
  Chiedere il solo id principale lasciava fuori titoli che su quell'app ci sono. Id
  verificati contro `watch/providers?watch_region=IT` il 2026-09-15: in Italia Netflix
  **non** ha un id separato per la versione con pubblicità, e `2` (Apple TV Store) è
  noleggio, quindi sta fuori da Apple TV+. `orderPlatforms` porta in testa le 4
  piattaforme più affini leggendo la dimensione `provider` del profilo (fase A) su tutti
  gli id della voce; profilo povero o personalizzazione spenta → l'ordine del catalogo,
  uguale per tutti.
- `src/lib/platforms/list.ts`: **nessuna testa curata**, al contrario dei generi. Il
  catalogo di Netflix cambia ogni mese: una lista scritta a mano in un file
  invecchierebbe in silenzio e mostrerebbe titoli che quella piattaforma non ha più.
  Quindi tutto arriva da `discoverForPlatform` (4 pagine, i più popolari **di quel
  catalogo**) e l'ordine è l'affinità della fase C, con `arricchisci`, gli stessi filtri
  del motore (`consigliabile`, niente titoli già in libreria) e `diversify` col tetto
  per piattaforma alzato — dentro una piattaforma quel tetto rimanderebbe in coda tutti
  tranne i primi quattro. Il tetto per genere resta 3: una pagina di Netflix tutta
  d'azione non è un catalogo, è un genere.
- `with_watch_monetization_types=flatrate` è la differenza fra "cosa c'è su Prime Video"
  e "cosa Amazon ti vende": senza, le liste di Prime e Apple TV+ si riempivano di
  noleggi, cioè di film che l'abbonamento non comprende.
- **Il secondo giro senza soglie** serve ai cataloghi minuscoli: Discovery+ ha 67 film in
  abbonamento in Italia e **quattro** con almeno cento voti, e la sua pagina dei film
  usciva con quattro copertine (misurato il 2026-09-15). Se dopo il primo giro i
  candidati distinti sono meno di venti, `candidati()` richiede le stesse pagine con
  `senzaSoglie: true` e le mette in coda: i titoli votati restano davanti. Le soglie del
  primo giro sono comunque più basse di quelle dei generi (100/40 invece di 300/100),
  perché il catalogo di una singola piattaforma è un centesimo di TMDB.
- **La pagina della piattaforma sta sulla rotta dei generi**: `/discover/movie/netflix`,
  `/discover/tv/netflix`. La pagina `[type]/[genre]` guarda prima `genreByKey`, poi
  `platformByKey`; un test controlla che le chiavi dei due cataloghi non si sovrappongano
  (una chiave in comune sarebbe una pagina che ne nasconde un'altra — e, da quando
  l'ambito della home vive in un segmento catch-all, anche un ambito ambiguo).
  Una rotta propria — `/discover/platform/[type]/[slug]` — è stata **scritta, provata e
  buttata** il 2026-09-15: da lì il click su "Serie" non navigava. La richiesta RSC del
  nuovo percorso partiva e tornava 200 con l'albero giusto (`platform/[type=tv]`), ma
  l'URL non si muoveva e restava la pagina dei film; la navigazione diretta allo stesso
  indirizzo funzionava. È la stessa trappola delle pillole in query, con un'altra faccia:
  su `/discover/[type]/[chiave]` quella navigazione funziona da mesi, e non vale spendere
  una rotta in più per riscoprirlo.
- I loghi delle pillole arrivano da `getProviderList()` (`watch/providers`, cache 7
  giorni: la stessa lettura che serve all'accesso rapido della home). Se TMDB non
  risponde restano le iniziali, non un buco.
- Verifica in browser: `scripts/platform-check.mjs` (istanza avviata, come
  `genre-check.mjs`), che dal 2026-09-15 collauda la **home filtrata**: click veri sulle
  pillole (Netflix, poi Thriller sopra, poi i due secondi tocchi che tolgono i filtri),
  il percorso non canonico che rimanda, i casi difficili (RaiPlay, Discovery+, Storie
  vere, Anime su Netflix) che non escono vuoti, e il telefono — le due scritte una sotto
  l'altra, il foglio con dieci voci, la scritta che prende il nome del servizio scelto.
  Ha **una trappola in più** di `genre-check.mjs`: l'utente
  finto va creato con i consensi obbligatori (`user_consents`, versioni in
  `src/lib/legal/versions.ts`), altrimenti il layout `(app)` mostra "Abbiamo aggiornato
  i documenti" e in home non c'è niente da misurare.
