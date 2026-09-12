# Routes

Route groups: `(auth)` for login/signup, `(app)` for everything protected with the nav (`TopNav`, in basso su mobile e in alto da `lg`: Home, Cerca, Libreria, Amici, Profilo). Title pages: `/title/movie/[id]`, `/title/tv/[id]`, `/title/tv/[id]/season/[n]`. Public profiles at `/u/[username]`. `src/app/api/search/route.ts` returns up to 20 TMDB `search/multi` results with flatrate providers from **one batch query on `title_providers`** (no per-result title fetch); `SearchClient` fires a request 60 ms after each keystroke, aborts the previous one, caches results per query and shows the filtered results of a cached prefix while waiting, never emptying the grid.

- **Barra sopra il banner** (2026-09-12, richiesta utente): a campo vuoto la pagina
  Cerca comincia col **banner del momento a filo pagina** e la barra di ricerca ci sta
  **sopra in trasparenza**, con un velo sfumato al posto del fondo pieno. La barra resta
  `sticky top-0` e al suo posto: il margine negativo che infila il banner sotto di essa
  sta **sul banner** (`MoodPills`), non sulla barra — se la fila del momento non ha
  titoli non si disegna, e la barra si tiene il suo spazio invece di finire sugli
  scaffali di Scopri. `SearchClient` pubblica l'altezza della barra come
  `--search-bar-h` (una costante, `BAR_H`: 14 + 52 + 16 più safe area e fascia nav) e da
  lì la leggono il margine negativo e `MOMENT_BANNER_TOP`. Appena si digita torna il
  fondo pieno: sotto scorre la griglia dei risultati. Geometria e trappole del banner:
  [home.md](home.md), "Banner a filo pagina".
- **Ricerche recenti** (2026-09-08, richiesta utente): toccando la barra a campo vuoto
  compaiono **sotto di essa** i titoli gia' aperti dalla ricerca (elenco compatto:
  locandina 36x54, titolo, "anno · Film/Serie"), e spariscono appena il campo perde il
  fuoco — non uno scaffale fisso, non una sezione. Sotto resta Scopri come prima.
  Tabella `search_history` (migration `0024`, applicata via MCP; pk
  `user_id, title_id, media_type`, RLS solo proprietario, `anon` revocato, trigger
  `prune_search_history` che tiene le 20 piu' recenti): **niente localStorage**, regola
  del progetto. La riga porta **titolo, locandina e anno gia' dentro** invece della sola
  chiave: la riga di `titles` viene scritta dopo, aprendo la scheda, mentre il pannello
  deve comparire subito — cosi' la lettura (`src/lib/search/queries.ts`
  `getRecentSearches`, 12 voci, prop del server a `SearchClient`) e' una query sola,
  senza join ne' chiamate TMDB. Scrive `rememberSearchedTitle`
  (`src/lib/search/actions.ts`) sul `pointerdown` del risultato — subito dopo si naviga
  via — con upsert: un titolo cercato due volte risale in cima invece di duplicarsi;
  stessa azione toccando una voce dello storico. `clearSearchHistory` per "Cancella".
  Il pannello sta **sopra** il contenuto (`absolute`, a `--search-bar-h` dalla cima) e
  non nel flusso: in mezzo alla barra e al banner spostava il banner in basso a ogni
  tocco del campo.
  Il pannello non si smonta all'istante al `blur` (`BLUR_HIDE_MS` = 150 ms): su un tocco
  il `blur` arriva prima del `click` e la riga sparirebbe sotto il dito.

