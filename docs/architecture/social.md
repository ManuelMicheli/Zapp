# Social (phase 4)

- `src/lib/social/actions.ts` / `queries.ts`: friendships (request → accept, block deletes the row and hides both users), reviews with spoiler flag + comments (depth-limited by trigger), recommendations to friends, notifications, feed.
- **Import multi-sorgente** (2026-09-12, prima era solo Netflix): hub `/import` (`src/app/(app)/import/page.tsx`, elenca `SOURCE_LIST`) e rotta dinamica `/import/[source]` con `generateStaticParams` sui cinque slug `netflix`, `letterboxd`, `tvtime`, `file`, `export` — lo slug è anche il valore di `imports.source` e il segmento di rotta, un solo posto (`src/lib/import/sources/registry.ts`: `SOURCES`/`SOURCE_LIST`/`isSourceSlug`/`parseSource`) elenca marchio, istruzioni, estensioni accettate e parser per sorgente. Ogni sorgente implementa `parse(files: SourceFile[]): ParsedSource` (`src/lib/import/sources/types.ts`) tranne Netflix, il cui parser storico (`parseNetflixCsvText` + `groupRows`, in `sources/netflix.ts`) resta a righe invece che a candidati diretti e viene adattato dentro il registry. Tutte le sorgenti producono `ImportCandidate` (`src/lib/import/candidate.ts`, il campo `netflixTitle` è un nome storico ma vale per tutte): chi porta già `tmdbId` (righe TV Time/Trakt/Simkl con colonna `tmdb_id`, backup Zapp con `title_id`, JSON generico con `tmdb_id`) **salta del tutto il riconoscimento TMDB** — `ImportProvider` lo smista in `giaNoti` prima del ciclo di match, e `matchOne` (`match.ts`) fa lo stesso corto circuito se un candidato del genere ci arriva comunque; un export TV Time da migliaia di righe entra quindi direttamente in fase di scrittura. Letterboxd e TV Time arrivano spesso come zip: `src/lib/import/archive.ts` (`unzipSources`, fflate) li apre in memoria con un tetto di 10 MB sul **decompresso** che vale per l'**intera richiesta**, non per archivio: `parseImportFiles` crea un `UnzipBudget` (`nuovoBudget`) e lo passa a ogni apertura, perché un tetto per archivio si aggirava caricando N zip nella stessa chiamata — e `MAX_UPLOAD_FILES` (`limits.ts`) tiene comunque a 8 i file per richiesta. Il controllo avviene mentre si legge l'intestazione dello zip, prima di decomprimere ogni voce, e conta il **massimo fra `originalSize` e `size`** (il compresso): sono due campi indipendenti della central directory e nessuno li confronta, così una voce STORED (metodo 0, che fflate materializza tagliando `size` byte dal file) dichiarata `originalSize: 0` passava contando zero, e una sola central directory può nominare mille volte lo stesso local header — mille copie vere in memoria, una sola chiave nel risultato, quindi neanche la somma finale se ne accorgeva. Resta la seconda somma dopo `unzipSync` come rete contro un'intestazione che mente. Il caricamento ha un tetto di 5 MB **sulla somma dei file** (`MAX_FILE_BYTES`/`MAX_FILE_LABEL` in `limits.ts`, controllato sia in `ImportClient` sia nella action, che verifica anche l'estensione contro l'`accetta` della sorgente): quello che deve entrarci è il corpo della Server Action, e il default di Next è **1 MB** — oltre quel MB la richiesta non arriva alla action e la promise rifiutata si presentava come "Connessione interrotta", quindi `next.config.ts` alza `experimental.serverActions.bodySizeLimit` a 6mb (un mega sopra il tetto dichiarato, per le intestazioni del multipart).
- `activities` rows are written **only by DB triggers** (`log_watch_activity`, `log_review_activity`, `log_recommendation_activity`). Ogni import chiama la RPC `import_watch_entries` (migration `0043_import_sorgenti.sql`, che ha anche allargato il check su `imports.source` ai quattro slug iniziali, portato a cinque dalla `0059_import_export.sql` con lo slug `export`), which sets `zapp.skip_activities` for the transaction so bulk imports do not flood the feed. The import runs as **short chunked Server Actions** (`src/app/(app)/import/actions.ts`, chunk sizes in `limits.ts`: `parseImportFiles` legge i file caricati e apre gli zip, `matchImportCandidates` riconosce 30 candidati a chiamata, `confirmImport` scrive 25 titoli a chiamata; l'ultimo blocco di conferma porta `final` e scrive la riga `imports`): one request held open for minutes is cut by the browser (Safari after 60 s, Chrome after 300 s) or by the Vercel function limit, and the rejected fetch used to surface as "Application error: a client-side exception" even though the server finished. Never move the per-title loop back into a single action. Un solo "posto" per riconoscimento+scrittura è condiviso da tutta l'app (`prendiPosto`/`lasciaPosto`, `src/lib/gate.ts`: 3 import in corso al massimo, si libera da solo dopo 30 minuti) — va restituito su **ogni** uscita d'errore di `parseImportFiles` dopo averlo preso, altrimenti l'import resta bloccato senza errore visibile. **Recognition _and_ writing run in the background, with no review screen** (2026-09-07): `ImportClient` (sotto `/import/[source]`) only parses the uploaded files (one short action), then calls `startImport(candidates, totalRows, source)` and `router.push("/")`; `src/components/import/ImportProvider.tsx` (client, mounted in the `(app)` layout) owns both loops — match chunks `MATCH_CONCURRENCY` (3) at a time (parallel Server Actions land on different lambdas, each with its own 15 req/s TMDB throttle), then `mergeProposals`, then the confirm chunks **start by themselves** on the matched proposals. `ImportChip` above the nav shows "Riconoscimento n/N" then "Importazione n/N" with a bar, then the outcome ("n titoli importati, m già presenti, k non riconosciuti") with a link to the library, and the provider toasts + `router.refresh()` at the end. It lives as long as the app is open (no server queue on Hobby); written chunks stay, re-running the import is safe.
- **Riconoscimento su TMDB** (`src/lib/import/match.ts`, `server-only`; vale per qualunque sorgente quando il candidato non porta già un `tmdbId`): TV via `searchTv`, films via `searchMovies` (dedicated endpoints in the TMDB client), query variants full → no parentheses → main part → subtitle (≥2 words), comparison always against the full name with `titleSimilarity`: 1 exact after `normalizeTitle` (accents, parentheses, apostrophes, generic "- Il film" suffix, leading article), 0.9 when the TMDB name is the source name plus a real subtitle, 0.88 when the source subtitle (≥2 words) is the whole TMDB name (una sorgente che antepone la saga: "Pirati dei Caraibi - La maledizione della prima luna"), else Dice on bigrams; accept ≥ `MATCH_THRESHOLD` 0.85, ties → TMDB order. A 2-part single that is not a film is retried as an episode of the prefix series with an **exact** name only ("Star Wars: …" must not become "The Clone Wars"). `mergeProposals` (`candidate.ts`, pure, run by `ImportProvider` once every match chunk is back) folds proposals with the same TMDB id (film written two ways; fallback episodes sum up; fallback + real series keeps the series progress). Unmatched proposals are just counted in the chip: there is no manual-search step any more. A `matchOne` that throws is retried once before being given up: a network hiccup used to cost the title for good. `netflix-title.ts` porta le utility usate da questo modulo (`queryVariants`, `pickBestMatch`, `resolveEpisodeNumber`, `normalizeTitle`, `MATCH_THRESHOLD`) — nome storico ma condiviso: `normalizeTitle` la usano anche i parser di Letterboxd, TV Time e file per chiavare i candidati. Il parsing riga per riga specifico di Netflix (`parseNetflixTitle`: season keyword in un pezzo di mezzo — Stagione/Season/Parte/Part/Volume/Libro/Book/Serie/Series + numero — oppure ≥3 parti senza parola chiave, con `inferDateOrder` a decidere giorno/mese sull'intero file) resta in `sources/netflix.ts` e riguarda solo quella sorgente.
- **Il numero di episodio viene dai nomi, non dal conteggio** (2026-09-07): ogni
  candidato serie porta `episodeTitles` (i nomi degli episodi della stagione più
  avanzata, max 60, popolato dal parser Netflix e — dal 2026-09-15 — da quello
  della sorgente `export`, vedi sotto) e `matchOne` fa **una `getSeason`** sul risultato TMDB;
  `resolveEpisodeNumber` (`netflix-title.ts`, puro, Vitest) cerca quei nomi
  nell'elenco della stagione (uguaglianza dopo `normalizeTitle`, poi
  `titleSimilarity ≥ 0,95`) e prende il più avanti. Contare le righe funziona
  solo al primo import completo: su un export parziale ("ho visto le ultime tre
  puntate") dava "episodio 3" e l'import scartava la serie come passo indietro.
  Nessun nome riconosciuto → resta la stima per conteggio. Una riga
  `Serie: Episodio` (due parti) di una serie **già raggruppata dallo stesso CSV**
  non viene più cercata fra i film: `groupRows` la fonde nella serie e ne mette
  il nome fra gli `episodeTitles`. Un "A: B" che non è un film prova come serie
  prima il titolo intero e poi la sola parte A, sempre a nome identico.
- **La sorgente `export`** (Apple TV, Disney+, NOW, Prime Video, 2026-09-15): l'export
  ufficiale di una piattaforma qualunque, di solito uno zip con dentro csv/json/tsv
  dalle intestazioni spesso opache — gli export Apple non scrivono "Title" o
  "Duration". `profilaColonne` (`sources/sniff.ts`) prova prima il dizionario
  IT/EN sul **nome** della colonna e solo per i ruoli rimasti scoperti guarda il
  **contenuto** (titolo = testo lungo e unico, data = tante stringhe che sembrano
  una data), e ogni ruolo si assegna una volta sola, alla colonna col punteggio
  più alto fra quelle rimaste; il riconoscimento per nome vince sempre su quello
  per contenuto quando un'intestazione combacia. Il ruolo "durata" per contenuto
  ha in più un pavimento sulla mediana (`SOGLIA_MEDIANA_DURATA_SEC`): senza,
  una colonna di piccoli interi senza altra colonna a farle concorrenza — i
  numeri di episodio, 1..24, mediana ~12 — si prendeva il ruolo per assenza di
  alternative migliori, e a valle il filtro anti-anteprima (`DURATA_MINIMA_SEC`,
  sotto i 120s — la stessa soglia dello scrobble — la riga è un trailer e si
  scarta) buttava via **tutto** l'import in silenzio, senza un errore da vedere.
  La stessa soglia scioglie anche il pareggio fra due colonne candidate a
  "durata" (un pavimento assoluto da solo le avrebbe scartate entrambe): una
  colonna di minuti veri (22/45/58) resta riconosciuta. In `titolo.ts`,
  `splitTitolo` stacca stagione/episodio/nome episodio da un titolo scritto in
  una riga sola (`S02E05`, `1x03`, "Stagione 1: Episodio 3 - Nome", …) con gruppi
  di cattura **numerati** invece che nominati: i nominati avrebbero preteso di
  alzare il `target` TypeScript di tutto il progetto per un modulo solo.
  L'altra soglia di `sources/export.ts`, `PROGRESSO_VISTO` (85% di avanzamento),
  tiene "watching" invece di "watched" un episodio abbandonato a metà — la
  colonna di progresso, quando c'è, è l'unico modo per saperlo, un export non
  distingue altrimenti una puntata vista fino in fondo da una interrotta.
  `raggruppa` produce `episodeTitles` anche per questa sorgente, prima
  popolati solo da Netflix: è quello che fa funzionare `resolveEpisodeNumber`
  (bullet sopra) fuori da Netflix, prendendo il nome dalla colonna dedicata
  quando la piattaforma lo scrive separato (Apple, NOW) o da dentro il titolo
  unico altrimenti. Il file non passa dal corpo della Server Action per questa
  sorgente: sale dal client nel bucket privato `import-uploads` (100 MB per
  oggetto, una policy RLS per cui ognuno vede solo la propria cartella,
  migration `0059_import_export.sql`) e `parseImportFromStorage` (`actions.ts`)
  riceve solo il percorso — un export vero supera facilmente i 5 MB del
  percorso a corpo, e da telefono non si può chiedere all'utente di aprire uno
  zip per estrarne il csv prima di caricarlo. Il file si cancella dal bucket
  appena letto, su **ogni** uscita (successo o errore): è cronologia
  personale, non deve restare lì. Dentro lo zip si aprono solo `.csv/.json/.tsv/.txt`
  (`archive.ts`, filtro applicato prima del conteggio del budget, vedi sopra):
  fatture e altri allegati che un export bundla non consumano né budget né
  tempo di parsing. La stessa migration aggiunge un guard alla RPC
  `import_watch_entries`, solo per i film: una riga "watching" non può più
  retrocedere a "in corso" un film già "watched", perché l'ordine delle righe
  di un export non è garantito e un secondo import può arrivare mesi dopo il
  primo — per le serie una stagione più avanti segnata "watching" resta un
  progresso legittimo, ed è già filtrata dalla clausola di progresso generale.
- **La scrittura non degrada mai una entry esistente** (`confirmImport`,
  `src/app/(app)/import/actions.ts`, valido per tutte le sorgenti): scrive dove
  `hasNewProgress` — film non ancora `watched`, serie il cui progresso nel file
  è più avanti di quello in libreria — e la RPC `import_watch_entries`
  (migration `0043_import_sorgenti.sql`) ha lo stesso unico guard sul
  progresso, con `rating = coalesce(watch_entries.rating, excluded.rating)`: un
  voto già dato dall'utente non viene mai sovrascritto da quello della
  sorgente. Righe di **watchlist** (`status: "want"`, Letterboxd `watchlist.csv`
  o un backup/JSON con `status: "want"`) si scrivono **solo se il titolo non è
  già in libreria**: `confirmImport` salta la riga se trova già una entry
  esistente per quel `tmdbId`, e la stessa clausola `where` della RPC è la rete
  di sicurezza lato DB (una riga di watchlist non deve mai far tornare "Da
  vedere" un film già visto). Prima (2026-09-06, ai tempi del solo Netflix)
  entrambi i livelli saltavano qualunque riga con un voto o in stato `watched`:
  una serie finita non riceveva mai le stagioni nuove e reimportare scriveva
  **0 titoli** (righe `imports` del 2026-09-06: 6425 righe → `matched` 0).
  Unica entry intoccabile: una serie messa `watched` a mano, senza numero di
  stagione, non confrontabile.
- **Feed e notifiche a banner** (2026-09-06, su mockup dell'utente): ogni attività è un
  `ActivityBanner` (`src/components/social/ActivityBanner.tsx`) — backdrop 16:9 del titolo
  (ripiego: locandina), velo nero in basso e, sopra, l'amico con la sua foto profilo e
  cosa ha fatto; in basso a destra, **fuori dal `Link`**, lo slot `action`. La pagina
  Amici non ha più il titolo "Attività degli amici". Le notifiche che citano un titolo
  usano lo stesso banner (icona del tipo nello slot `action`); richieste e amicizie
  accettate restano righe compatte. **Like sulle attività**: `activity_likes` (migration
  `0016_activity_likes.sql`, applicata via MCP; RLS via `can_see_activity()`, stessa
  regola di `activities`), conteggio + `likedByMe` in `getFeed` con una sola query,
  `toggleActivityLike` (`social/actions.ts`, ottimistico in `ActivityLikeButton`) e
  trigger `notify_activity_like` → notifica di tipo `like` (il `check` su
  `notifications.kind` è stato riscritto per includerla).
  **Su desktop un banner sotto l'altro, come sul telefono** (2026-09-07, richiesta
  utente): niente più griglia a 2-3 colonne — feed e notifiche sono una colonna sola a
  tutte le larghezze. Cambiano le proporzioni: `aspect-[16/9]` su telefono e tablet,
  **`lg:aspect-[21/9]`** da `lg`, dove un 16:9 largo 860px sarebbe alto mezzo schermo.
  Perché il banner non diventi enorme, il gruppo è centrato e limitato
  (`lg:mx-auto`: `/friends` a 1360px = feed 860 + colonna laterale 380,
  `/notifications` a 940px); i `loading.tsx` hanno la stessa geometria. Il banner cresce
  tutto insieme (avatar `size-10 lg:size-12 xl:size-14` via `Avatar sizeClass`, testo
  13 → 16 → 18px, spazi e cuore da `lg`): mai tipografia da telefono dentro una card da
  860px. La colonna laterale di `/friends` è `lg:sticky` e la fila di amici diventa un
  elenco verticale da `lg` (`FriendsStrip`). In `/notifications` **c'è una sola forma di
  card**: le notifiche senza titolo (richieste, amicizie accettate) usano lo stesso
  banner con una sfumatura accent e l'icona del tipo in filigrana al posto
  dell'immagine, così l'elenco non è mai misto.
- **Profilo di un amico = il proprio profilo** (2026-09-07): `/u/[username]` usa gli
  stessi pezzi di `/profile` — `ProfileWallHeader` (muro di locandine personale +
  velo) con `AvatarHalo`, `ProfileStatsSection` (card ore/film/serie/episodi +
  "Generi più visti") e `TopRatedShelf` ("I voti più alti di X"), più gli scaffali
  Sto guardando / Visti di recente. `parseStats` sta in `src/lib/profile/stats.ts`.
  `profile_stats(uid)` è **security invoker**: chiamata sull'id dell'amico conta solo
  le entry che le policy lasciano vedere (`watch_entries_select_friends`: amici, non
  private), quindi per un estraneo statistiche e liste sono vuote e la pagina mostra
  "Nessuna attività visibile". `getFriendsWatching` porta anche `avatar_url`: il
  "Guardato da" sulla scheda titolo mostra le vere foto degli amici.
- **Percorso cinefilo** (2026-09-14): `profile_progression(uid)` e' una funzione
  `SECURITY INVOKER`, chiamata solo col client Supabase di sessione. Restituisce
  `null` fuori dal profilo proprio o da un'amicizia, anche quando il profilo e'
  pubblico: quattro zeri non devono mascherare una libreria che la sessione non puo'
  leggere. Sul profilo di un amico conta soltanto le `watch_entries` non private che
  la RLS rende visibili; sul proprio profilo conta anche le proprie entry private.
  Non usa mai il service role. I conteggi correnti sono titoli distinti perche' la
  tabella ha una sola entry per utente/titolo/tipo: film e serie in stato `watched`,
  titoli con voto e recensioni con meno di tre segnalazioni e almeno 80 caratteri
  dopo la rimozione degli spazi bianchi iniziali/finali. Undo, cancellazione, modifica
  e moderazione ricalcolano quindi il risultato, senza uno storico di punti
  incrementabile dal client.

  Il calcolo puro assegna 5 punti per film o serie, 2 per voto e 10 per recensione;
  limita rispettivamente visioni, voti e recensioni a 2.500, 2.000 e 5.000 punti.
  I livelli sono Spettatore (0), Appassionato (150), Esploratore (500), Cinefilo
  (1.200), Grande cinefilo (2.500), Cultore del cinema (4.000), Ambasciatore (6.000)
  e Voce della community (8.500). I traguardi sono
  film 1/25/100/500, serie 1/10/50/100, voti 1/25/100/500 e recensioni
  1/5/25/100. Sono indicatori di partecipazione: non danno privilegi, non cambiano
  aggregazione o ordine dei voti e non formano una classifica.

  La fascia (`ProgressionJourney`) e' un muro di 40 locandine che si girano una a
  una salendo di livello, e la sua geometria e' vincolata da quel numero: le tessere
  devono coprire la card in righe intere, quindi il rapporto e' `colonne / (1,5 x
righe)` con `righe x colonne ~ 40`. Le sole combinazioni sensate sono 8x5 sul
  telefono (16/15), 10x4 fino agli 860px di contenitore (5/3) e **13x3 oltre**
  (25/9): da li' in su la card e' una banda larga, perche' tenere il 5/3 a tutta
  riga significherebbe 720px di altezza su uno schermo da 1.280. Per lo stesso
  motivo la card si ferma a 1.440px invece di arrivare ai bordi come le scaffalature:
  a filo, su un monitor grande, sarebbe alta 662px. Un 21/9 sarebbe **piu' alto**,
  non piu' basso, e lascerebbe una banda vuota sotto le tre file.

  Attorno alla card la parete prosegue (`.bleed`): le stesse locandine, stessi file
  gia' in cache, in colonne che scorrono con le animazioni globali `wall-up`/
  `wall-down`, sbiadite e mascherate verso il nero. E' `display: none` sotto gli
  860px di contenitore, dove la card e' gia' a filo: con le immagini `loading="lazy"`
  quel fondale sul telefono non costa un byte (un `<img>` eager dentro un contenitore
  nascosto verrebbe scaricato lo stesso).

  `profiles.verified_at` distingue un'identita' verificata;
  `profiles.verified_role` accetta soltanto `critic`, `director`, `actor` o
  `public_figure` e puo' restare nullo per la sola identita'. Il vincolo vieta un
  ruolo senza data di verifica e i grant per colonna impediscono ad `authenticated`
  di scrivere entrambi i campi sia in INSERT sia in UPDATE. Nessun flusso applicativo
  assegna automaticamente la verifica. Un operatore DB la assegna e la revoca
  manualmente, dopo aver verificato identita' e qualifica, con una delle operazioni
  seguenti (l'esempio con ruolo nullo verifica la sola identita'):

  ```sql
  update public.profiles
  set verified_at = now(), verified_role = 'critic'
  where id = '<UUID_UTENTE>';

  update public.profiles
  set verified_at = now(), verified_role = null
  where id = '<UUID_UTENTE>';

  update public.profiles
  set verified_at = null, verified_role = null
  where id = '<UUID_UTENTE>';
  ```

  Le etichette UI sono Critico/a, Regista, Attore/attrice e Personaggio pubblico.

- Feed is cursor-paginated and aggregated in the query layer (same-day episodes of one series → one row; `finished` + `rated` within 10 min → one row).
- RLS policies rely on `are_friends()` / `is_blocked()` (SECURITY DEFINER). Views `user_search` and `reviews_with_counts` and the helper RPCs are intentionally SECURITY DEFINER with grants only to `authenticated` (migration 0005 revokes `anon`/`PUBLIC`); Supabase advisor warnings about them are accepted (see README).
- Moderation: reviews with `report_count >= 3` are hidden by the `reviews` SELECT
  policy and therefore also by the `reviews_with_counts` invoker view.
- **Avatar** (`src/lib/avatars.ts`, puro, Vitest): 18 icone predefinite, silhouette
  **bianca su trasparente** (`public/avatars/<id>.png`, generate da
  `scripts/generate-avatars.mjs` dalle sorgenti in `docs/design/brand/avatars`). Lo sfondo
  lo dipinge chi rende l'avatar (`Avatar`, `AvatarPicker`) con `avatarBackgroundCss`:
  colore pieno o sfumatura fra due colori scelti dall'utente, nero di default. Salvato in
  `profiles.avatar_url` come `/avatars/<id>.png?bg=<hex>[&bg2=<hex>]` (nessuna colonna in
  più: ogni query che legge `avatar_url` porta anche lo sfondo; URL senza query = nero);
  `parsePresetAvatar(url)` lo decodifica, `saveAvatarPreset(id, bg)` valida gli hex.
  Le foto caricate restano `object-cover` senza sfondo.
- `src/lib/rate-limit.ts`: per-user sliding window, in-memory by default, Upstash REST if `UPSTASH_REDIS_REST_URL/TOKEN` are set. Limits are declared inline at each call site in `social/actions.ts`.
- **Push dell'app nativa** (fase 1, 2026-09-12): ogni insert in `notifications`
  sveglia il push dell'app nativa tramite un trigger SQL (`notifications_push_wake`
  → job `push-send`), oltre a comparire nella pagina Notifiche — dettaglio in
  `docs/architecture/mobile.md`. I testi del push sono copiati dallo `switch` di
  `src/app/(app)/notifications/page.tsx` (`src/lib/push/compose.ts`): un testo
  cambiato qui e non li' fa vedere due frasi diverse per la stessa notifica.
