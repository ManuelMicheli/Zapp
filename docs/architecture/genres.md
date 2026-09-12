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

