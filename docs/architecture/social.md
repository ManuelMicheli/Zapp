# Social (phase 4)

- `src/lib/social/actions.ts` / `queries.ts`: friendships (request → accept, block deletes the row and hides both users), reviews with spoiler flag + comments (depth-limited by trigger), recommendations to friends, notifications, feed.
- **Import multi-sorgente** (2026-09-12, prima era solo Netflix): hub `/import` (`src/app/(app)/import/page.tsx`, elenca `SOURCE_LIST`) e rotta dinamica `/import/[source]` con `generateStaticParams` sui cinque slug `netflix`, `letterboxd`, `tvtime`, `file`, `export` — lo slug è anche il valore di `imports.source` e il segmento di rotta, un solo posto (`src/lib/import/sources/registry.ts`: `SOURCES`/`SOURCE_LIST`/`isSourceSlug`/`parseSource`) elenca marchio, istruzioni, estensioni accettate e parser per sorgente. Ogni sorgente implementa `parse(files: SourceFile[]): ParsedSource` (`src/lib/import/sources/types.ts`) tranne Netflix, il cui parser storico (`parseNetflixCsvText` + `groupRows`, in `sources/netflix.ts`) resta a righe invece che a candidati diretti e viene adattato dentro il registry. Tutte le sorgenti producono `ImportCandidate` (`src/lib/import/candidate.ts`, il campo `netflixTitle` è un nome storico ma vale per tutte): chi porta già `tmdbId` (righe TV Time/Trakt/Simkl con colonna `tmdb_id`, backup Zapp con `title_id`, JSON generico con `tmdb_id`) **salta del tutto il riconoscimento TMDB** — `ImportProvider` lo smista in `giaNoti` prima del ciclo di match, e `matchOne` (`match.ts`) fa lo stesso corto circuito se un candidato del genere ci arriva comunque; un export TV Time da migliaia di righe entra quindi direttamente in fase di scrittura. Letterboxd e TV Time arrivano spesso come zip: `src/lib/import/archive.ts` (`unzipSources`, fflate) li apre in memoria con un tetto di 10 MB sul **decompresso** che vale per l'**intera richiesta**, non per archivio: `parseImportFiles` crea un `UnzipBudget` (`nuovoBudget`) e lo passa a ogni apertura, perché un tetto per archivio si aggirava caricando N zip nella stessa chiamata — e `MAX_UPLOAD_FILES` (`limits.ts`) tiene comunque a 8 i file per richiesta. Il controllo avviene mentre si legge l'intestazione dello zip, prima di decomprimere ogni voce, e conta il **massimo fra `originalSize` e `size`** (il compresso): sono due campi indipendenti della central directory e nessuno li confronta, così una voce STORED (metodo 0, che fflate materializza tagliando `size` byte dal file) dichiarata `originalSize: 0` passava contando zero, e una sola central directory può nominare mille volte lo stesso local header — mille copie vere in memoria, una sola chiave nel risultato, quindi neanche la somma finale se ne accorgeva. Resta la seconda somma dopo `unzipSync` come rete contro un'intestazione che mente. Il caricamento ha un tetto di 5 MB **sulla somma dei file** (`MAX_FILE_BYTES`/`MAX_FILE_LABEL` in `limits.ts`, controllato sia in `ImportClient` sia nella action, che verifica anche l'estensione contro l'`accetta` della sorgente): quello che deve entrarci è il corpo della Server Action, e il default di Next è **1 MB** — oltre quel MB la richiesta non arriva alla action e la promise rifiutata si presentava come "Connessione interrotta", quindi `next.config.ts` alza `experimental.serverActions.bodySizeLimit` a 6mb (un mega sopra il tetto dichiarato, per le intestazioni del multipart).
- `activities` rows are written **only by DB triggers** (`log_watch_activity`, `log_review_activity`, `log_recommendation_activity`). Ogni import chiama la RPC `import_watch_entries` (migration `0043_import_sorgenti.sql`, che ha anche allargato il check su `imports.source` ai quattro slug iniziali, portato a cinque dalla `0060_import_export.sql` con lo slug `export`), which sets `zapp.skip_activities` for the transaction so bulk imports do not flood the feed. The import runs as **short chunked Server Actions** (`src/app/(app)/import/actions.ts`, chunk sizes in `limits.ts`: `parseImportFiles` legge i file caricati e apre gli zip, `matchImportCandidates` riconosce 30 candidati a chiamata, `confirmImport` scrive 25 titoli a chiamata; l'ultimo blocco di conferma porta `final` e scrive la riga `imports`): one request held open for minutes is cut by the browser (Safari after 60 s, Chrome after 300 s) or by the Vercel function limit, and the rejected fetch used to surface as "Application error: a client-side exception" even though the server finished. Never move the per-title loop back into a single action. Un solo "posto" per riconoscimento+scrittura è condiviso da tutta l'app (`prendiPosto`/`lasciaPosto`, `src/lib/gate.ts`: 3 import in corso al massimo, si libera da solo dopo 30 minuti) — va restituito su **ogni** uscita d'errore di `parseImportFiles` dopo averlo preso, altrimenti l'import resta bloccato senza errore visibile. **Recognition _and_ writing run in the background, with no review screen** (2026-09-07): `ImportClient` (sotto `/import/[source]`) only parses the uploaded files (one short action), then calls `startImport(candidates, totalRows, source)` and `router.push("/")`; `src/components/import/ImportProvider.tsx` (client, mounted in the `(app)` layout) owns both loops — match chunks `MATCH_CONCURRENCY` (3) at a time (parallel Server Actions land on different lambdas, each with its own 15 req/s TMDB throttle), then `mergeProposals`, then the confirm chunks **start by themselves** on the matched proposals. `ImportChip` above the nav shows "Riconoscimento n/N" then "Importazione n/N" with a bar, then the outcome ("n titoli importati, m già presenti, k non riconosciuti") with a link to the library, and the provider toasts + `router.refresh()` at the end. It lives as long as the app is open (no server queue on Hobby); written chunks stay, re-running the import is safe.
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
  migration `0060_import_export.sql`) e `parseImportFromStorage` (`actions.ts`)
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
  **Tre debiti noti, lasciati aperti con cognizione di causa** (review del
  2026-09-15, misurati, nessuno dei tre può produrre un dato falso in libreria):
  un **epoch** conta come data solo dove l'intestazione lo dichiara, mai per
  contenuto — altrimenti una colonna di identificativi a 10 o 13 cifre si
  prendeva il ruolo e datava ogni riga al 2009 — quindi una colonna di epoch con
  un'intestazione fuori dal dizionario fa scartare il file, **rumorosamente**
  (il nome del file compare fra gli ignorati); il dizionario dei nomi della data
  è tutto inglese, ed è lì che si allarga se mai servisse. Il passo 3 di
  `profilaColonne` — che rimette al suo posto una colonna rilasciata quando
  senza di lei il file non sembrerebbe più una cronologia — tiene in vita anche
  file che cronologie non sono (un `Impostazioni.csv` con una colonna "Start
  Date" illeggibile): produce righe di rumore che l'utente vede, mai valori
  sbagliati, perché ripristina solo colonne i cui valori il lettore a valle non
  sa leggere e che quindi restano nulle. Infine quel passo ripristina la **prima**
  colonna rilasciata, non quella col ruolo più utile: con una durata e una data
  entrambe illeggibili torna la durata.
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
- **Le piattaforme si dichiarano all'iscrizione, non si scoprono dopo** (fase 5,
  2026-09-15): l'onboarding aggiunge un passo 3 "Cosa guardi?" (`PlatformPicker`,
  pillole del catalogo `src/lib/platforms/catalog.ts`) dopo i gusti, prima di
  entrare in app. Come il passo dei gusti, **non blocca mai l'iscrizione**: "Salta"
  azzera il campo e invia comunque, e un JSON storto in arrivo alla Server Action
  (`completeOnboarding`) viene ignorato invece di far fallire il resto — le
  piattaforme sono un aiuto per l'import, non un requisito d'accesso. Le chiavi
  scelte finiscono in `user_platforms` (migration `0062_user_platforms.sql`,
  RLS solo proprietario) come la **`key` del catalogo condiviso**, non un id
  TMDB: il catalogo mappa già ogni `key` su un `providerId` principale e sugli id
  secondari dello stesso servizio (Prime Video "with Ads" è un id TMDB diverso
  dallo stesso abbonamento, HBO Max e Paramount+ si vendono anche come canale
  Amazon o Apple) — salvare un id TMDB avrebbe legato la dichiarazione a **una**
  di quelle varianti invece che al servizio. Chi ha dichiarato almeno una
  piattaforma viene rimandato a `/benvenuto`, che trasforma ogni piattaforma in
  una card con un'azione sola: **le azioni non stanno nel form di onboarding**
  perché `src/app/onboarding` sta fuori dal gruppo di rotta `(app)` e quindi
  fuori da `ImportProvider` (montato solo in `(app)/layout.tsx`), il componente
  client che possiede i cicli di riconoscimento e scrittura — un import avviato
  nell'onboarding morirebbe al primo cambio pagina verso l'app, proprio nel
  momento in cui l'utente lascia quella rotta. Fra le cinque piattaforme con una
  strada d'importazione, **NOW è l'unica senza portale self-service** (verificato
  il 2026-09-15): la sua card apre un `mailto:privacy@sky.it` con oggetto e corpo
  già scritti (richiesta ex art. 15 GDPR, cronologia di visione nominata
  esplicitamente) invece di un link a un centro privacy, perché un utente lasciato
  a scrivere da sé una richiesta GDPR quasi sempre non la scrive. Su `/benvenuto`
  il popup della domanda del giorno non si apre: `DailyQuestionGate` non monta
  affatto `DailyQuestion` su quella rotta (non un `display:none`, che lascerebbe
  comunque partire l'effetto che la apre) perché lì la prima visita del giorno
  coincide quasi sempre con la primissima visita in assoluto di chi si è appena
  iscritto, e il popup coprirebbe la pagina nel momento peggiore.
- **La memoria delle richieste dati** (`import_requests`, migration `0063`, fase 3
  2026-09-15): Disney+, NOW e Apple TV non hanno un export self-service immediato,
  solo una richiesta formale che arriva dopo giorni; senza memoria l'utente la
  chiede e se ne dimentica. Quando preme l'azione "ad attesa" di una card di
  `/benvenuto`, `segnaRichiesta` (`src/lib/import/richieste-store.ts`, un indice
  unico parziale su `(user_id, platform_key) where state = 'requested'` garantisce
  una sola riga aperta per piattaforma — due clic ravvicinati fanno leggere a
  `segnaRichiesta` la violazione `23505` come "c'è già", non come errore) apre una
  riga con la data attesa da `stimaArrivo` (`src/lib/import/richieste.ts`, puro:
  oggi più i giorni tipici del portale di quella piattaforma, `GIORNI_ATTESA` —
  5-7-30, 30 di default per una chiave ignota). È **una stima, non una promessa**:
  l'export lo riceve l'utente via email, in una casella che Zapp non vede, e non
  c'è modo di sapere se il portale ha davvero già consegnato — per questo sia la
  card sia il testo del promemoria (`src/lib/push/compose.ts`, caso
  `"export_pronto"`) dicono sempre "dovrebbe essere pronto", mai "è pronto". Il job
  giornaliero `promemoria-export` (`src/lib/import/promemoria.ts`, cron alle 8 UTC
  aggiunto dalla stessa `0063`) manda **al massimo due** promemoria per richiesta:
  un terzo sarebbe una molestia per qualcosa che l'utente ha già scelto di
  aspettare. Fermarsi al secondo richiede di sapere *quanti* ne sono già partiti,
  e una sola colonna non lo direbbe — `reminded_at` da solo non distingue "già
  mandati due" da "ne ho mandato uno sette giorni fa, tocca al secondo" — da qui
  la colonna in più `second_reminded_at` e `prossimoPromemoria` (`richieste.ts`,
  puro) che risponde "primo" (data attesa arrivata, `reminded_at` ancora nullo),
  "secondo" (sette giorni dopo il primo, `second_reminded_at` ancora nullo) o
  `null` in ogni altro caso, senza un terzo ramo: la richiesta può restare aperta
  per mesi senza generare altro rumore. Il job **non ha codice di push suo**: per
  ogni riga dovuta inserisce una notifica (`kind: "export_pronto"`,
  `payload.platform_key`) nella tabella `notifications` — un tipo in più nel
  vincolo `notifications_kind_check`, riscritto per intero copiando l'elenco dalla
  0044 invece di fidarsi della memoria, perché perdere un tipo esistente
  spegnerebbe in silenzio, dentro una transazione che nessuno guarda, una
  notifica viva — e lascia che l'infrastruttura già esistente (`drainNotifications`,
  `src/lib/push/fanout.ts`, più `compose.ts` per il testo) faccia il resto: stesso
  canale di ogni altra notifica dell'app, non uno a parte. L'ordine delle due
  scritture dentro il job è deliberato — **prima l'insert in `notifications`, poi
  l'update di `reminded_at`/`second_reminded_at`**, mai il contrario: se il job
  muore fra le due, la riga resta candidata al giro dopo e l'utente riceve un
  doppione, fastidioso ma visibile; invertendo l'ordine, un update riuscito prima
  di un insert poi fallito segnerebbe per sempre "già ricordato" un promemoria che
  non è mai partito — un errore silenzioso e permanente, lo stesso motivo per cui
  `drainNotifications` scrive `pushed_at` solo dopo l'invio. All'import riuscito
  (`confirmImport`, `src/app/(app)/import/actions.ts`, sorgente `export` con
  almeno un titolo scritto nell'intero import, non nel solo ultimo blocco) si
  chiudono a `dismissed` **tutte** le richieste aperte dell'utente, non solo
  quella della piattaforma da cui è arrivato il file: lo sniffer di
  `sources/export.ts` non chiede all'utente quale piattaforma stia caricando,
  quindi non c'è modo di saperlo. Meglio un promemoria in meno — per una
  piattaforma diversa, magari ancora da arrivare — che un promemoria per una
  cosa che l'utente ha già fatto. `dismissed`, non `imported`: `imported`
  spegnerebbe per sempre la card anche di una piattaforma che l'utente non ha
  ancora davvero importato (falso, e senza più un modo di caricarla); `state
  === "requested"` di `prossimoPromemoria` (`richieste.ts`) ferma i promemoria
  in entrambi i casi, ma solo `dismissed` lascia `cardsAttesa`
  (`src/lib/platforms/azioni.ts`) trattarla di nuovo come "da fare".
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

  **Fondale della fascia: la parete della testata continua** (2026-09-15). Su
  `/profile` il percorso cinefilo non sta su fondo nero: e' passato a
  `ProfileWallHeader` come `below`, quindi la **stessa** parete di locandine della
  testata (stesse tessere, stesso scorrimento `wall-up`/`wall-down`, nessun file in
  piu' in rete) copre anche la fascia e i suoi dettagli e si spegne dove comincia
  "Le tue statistiche". Le tessere in piu' per colonna riusano le quattro locandine
  di quella colonna: il muro piu' alto non scarica nulla di nuovo.

  Tre vincoli, in ordine di quanto costano se si sbagliano:

  - **Il muro non puo' allungarsi a piacere.** `wallGeometry` ferma le colonne prima
    del piano camera (`PERSPECTIVE / sin(24°)` ≈ 2.459px): oltre, il compositor fa
    sparire le tessere. Le altezze scelte sono le piu' alte che restano al di qua
    (13 tessere per colonna): **2.400px** sul telefono a 4 colonne e **1.650px** da
    `md` a 20 colonne. Alzarle ancora non allunga il muro, lo rompe.
  - **Il velo e' ancorato in px all'altezza della testata** (`--ph`, 480px / 620px da
    `lg`), non in percentuale: cosi' la testata resta identica a prima anche se la
    regione sotto cambia altezza. Poi il velo si tiene su 0,86 — le locandine si
    intravedono dietro la fascia senza mangiarsi il testo — e chiude sul nero negli
    ultimi 300px.
  - **Il riquadro della parete e' tagliato sull'intera regione.** Se il contenuto e'
    piu' corto del muro (telefono: ~1.620px contro 2.280 di copertura) il taglio cade
    dove il velo e' gia' nero; se e' piu' lungo (desktop: ~1.700 contro 1.530) il
    muro finisce sotto una maschera che lo sfuma nei suoi ultimi 18%. In entrambi i
    casi non si vede un bordo netto: e' l'unico motivo per cui la cosa regge senza
    misurare l'altezza del contenuto a runtime.

  Restano parcheggiate, recuperabili dai commit, le due strade provate prima: un
  fondale **diverso** dal muro della testata (`aa4bcf4`, con parallasse) e un'aura
  colorata che cresce col livello, prima dietro l'immagine profilo (`1bcc63d`), poi
  come fondo della fascia (`d6c1140`, scala in `src/lib/profile/aura.ts`). Due cose
  imparate: nei layer di `background` il primo elencato sta sopra, quindi un velo
  messo dopo i gradienti non si vede; e il picco di un alone dietro la card non puo'
  stare al centro, perche' li' la card e' opaca e lo copre.

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
