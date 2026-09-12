# Social (phase 4)

- `src/lib/social/actions.ts` / `queries.ts`: friendships (request → accept, block deletes the row and hides both users), reviews with spoiler flag + comments (depth-limited by trigger), recommendations to friends, notifications, feed.
- **Import multi-sorgente** (2026-09-12, prima era solo Netflix): hub `/import` (`src/app/(app)/import/page.tsx`, elenca `SOURCE_LIST`) e rotta dinamica `/import/[source]` con `generateStaticParams` sui quattro slug `netflix`, `letterboxd`, `tvtime`, `file` — lo slug è anche il valore di `imports.source` e il segmento di rotta, un solo posto (`src/lib/import/sources/registry.ts`: `SOURCES`/`SOURCE_LIST`/`isSourceSlug`/`parseSource`) elenca marchio, istruzioni, estensioni accettate e parser per sorgente. Ogni sorgente implementa `parse(files: SourceFile[]): ParsedSource` (`src/lib/import/sources/types.ts`) tranne Netflix, il cui parser storico (`parseNetflixCsvText` + `groupRows`, in `sources/netflix.ts`) resta a righe invece che a candidati diretti e viene adattato dentro il registry. Tutte le sorgenti producono `ImportCandidate` (`src/lib/import/candidate.ts`, il campo `netflixTitle` è un nome storico ma vale per tutte): chi porta già `tmdbId` (righe TV Time/Trakt/Simkl con colonna `tmdb_id`, backup Zapp con `title_id`, JSON generico con `tmdb_id`) **salta del tutto il riconoscimento TMDB** — `ImportProvider` lo smista in `giaNoti` prima del ciclo di match, e `matchOne` (`match.ts`) fa lo stesso corto circuito se un candidato del genere ci arriva comunque; un export TV Time da migliaia di righe entra quindi direttamente in fase di scrittura. Letterboxd e TV Time arrivano spesso come zip: `src/lib/import/archive.ts` (`unzipSources`, fflate) li apre in memoria con un tetto di 10 MB sul **decompresso** che vale per l'**intera richiesta**, non per archivio: `parseImportFiles` crea un `UnzipBudget` (`nuovoBudget`) e lo passa a ogni apertura, perché un tetto per archivio si aggirava caricando N zip nella stessa chiamata — e `MAX_UPLOAD_FILES` (`limits.ts`) tiene comunque a 8 i file per richiesta. Il controllo avviene mentre si legge l'intestazione dello zip, prima di decomprimere ogni voce, e conta il **massimo fra `originalSize` e `size`** (il compresso): sono due campi indipendenti della central directory e nessuno li confronta, così una voce STORED (metodo 0, che fflate materializza tagliando `size` byte dal file) dichiarata `originalSize: 0` passava contando zero, e una sola central directory può nominare mille volte lo stesso local header — mille copie vere in memoria, una sola chiave nel risultato, quindi neanche la somma finale se ne accorgeva. Resta la seconda somma dopo `unzipSync` come rete contro un'intestazione che mente.
- `activities` rows are written **only by DB triggers** (`log_watch_activity`, `log_review_activity`, `log_recommendation_activity`). Ogni import chiama la RPC `import_watch_entries` (migration `0043_import_sorgenti.sql`, che ha anche allargato il check su `imports.source` ai quattro slug), which sets `zapp.skip_activities` for the transaction so bulk imports do not flood the feed. The import runs as **short chunked Server Actions** (`src/app/(app)/import/actions.ts`, chunk sizes in `limits.ts`: `parseImportFiles` legge i file caricati e apre gli zip, `matchImportCandidates` riconosce 30 candidati a chiamata, `confirmImport` scrive 25 titoli a chiamata; l'ultimo blocco di conferma porta `final` e scrive la riga `imports`): one request held open for minutes is cut by the browser (Safari after 60 s, Chrome after 300 s) or by the Vercel function limit, and the rejected fetch used to surface as "Application error: a client-side exception" even though the server finished. Never move the per-title loop back into a single action. Un solo "posto" per riconoscimento+scrittura è condiviso da tutta l'app (`prendiPosto`/`lasciaPosto`, `src/lib/gate.ts`: 3 import in corso al massimo, si libera da solo dopo 30 minuti) — va restituito su **ogni** uscita d'errore di `parseImportFiles` dopo averlo preso, altrimenti l'import resta bloccato senza errore visibile. **Recognition _and_ writing run in the background, with no review screen** (2026-09-07): `ImportClient` (sotto `/import/[source]`) only parses the uploaded files (one short action), then calls `startImport(candidates, totalRows, source)` and `router.push("/")`; `src/components/import/ImportProvider.tsx` (client, mounted in the `(app)` layout) owns both loops — match chunks `MATCH_CONCURRENCY` (3) at a time (parallel Server Actions land on different lambdas, each with its own 15 req/s TMDB throttle), then `mergeProposals`, then the confirm chunks **start by themselves** on the matched proposals. `ImportChip` above the nav shows "Riconoscimento n/N" then "Importazione n/N" with a bar, then the outcome ("n titoli importati, m già presenti, k non riconosciuti") with a link to the library, and the provider toasts + `router.refresh()` at the end. It lives as long as the app is open (no server queue on Hobby); written chunks stay, re-running the import is safe.
- **Riconoscimento su TMDB** (`src/lib/import/match.ts`, `server-only`; vale per qualunque sorgente quando il candidato non porta già un `tmdbId`): TV via `searchTv`, films via `searchMovies` (dedicated endpoints in the TMDB client), query variants full → no parentheses → main part → subtitle (≥2 words), comparison always against the full name with `titleSimilarity`: 1 exact after `normalizeTitle` (accents, parentheses, apostrophes, generic "- Il film" suffix, leading article), 0.9 when the TMDB name is the source name plus a real subtitle, 0.88 when the source subtitle (≥2 words) is the whole TMDB name (una sorgente che antepone la saga: "Pirati dei Caraibi - La maledizione della prima luna"), else Dice on bigrams; accept ≥ `MATCH_THRESHOLD` 0.85, ties → TMDB order. A 2-part single that is not a film is retried as an episode of the prefix series with an **exact** name only ("Star Wars: …" must not become "The Clone Wars"). `mergeProposals` (`candidate.ts`, pure, run by `ImportProvider` once every match chunk is back) folds proposals with the same TMDB id (film written two ways; fallback episodes sum up; fallback + real series keeps the series progress). Unmatched proposals are just counted in the chip: there is no manual-search step any more. A `matchOne` that throws is retried once before being given up: a network hiccup used to cost the title for good. `netflix-title.ts` porta le utility usate da questo modulo (`queryVariants`, `pickBestMatch`, `resolveEpisodeNumber`, `normalizeTitle`, `MATCH_THRESHOLD`) — nome storico ma condiviso: `normalizeTitle` la usano anche i parser di Letterboxd, TV Time e file per chiavare i candidati. Il parsing riga per riga specifico di Netflix (`parseNetflixTitle`: season keyword in un pezzo di mezzo — Stagione/Season/Parte/Part/Volume/Libro/Book/Serie/Series + numero — oppure ≥3 parti senza parola chiave, con `inferDateOrder` a decidere giorno/mese sull'intero file) resta in `sources/netflix.ts` e riguarda solo quella sorgente.
- **Il numero di episodio viene dai nomi, non dal conteggio** (2026-09-07): ogni
  candidato serie porta `episodeTitles` (i nomi degli episodi della stagione più
  avanzata, max 60, popolato solo dal parser Netflix) e `matchOne` fa **una `getSeason`** sul risultato TMDB;
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
- Feed is cursor-paginated and aggregated in the query layer (same-day episodes of one series → one row; `finished` + `rated` within 10 min → one row).
- RLS policies rely on `are_friends()` / `is_blocked()` (SECURITY DEFINER). Views `user_search` and `reviews_with_counts` and the helper RPCs are intentionally SECURITY DEFINER with grants only to `authenticated` (migration 0005 revokes `anon`/`PUBLIC`); Supabase advisor warnings about them are accepted (see README).
- Moderation: reviews with `report_count >= 3` are hidden by query filter.
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

