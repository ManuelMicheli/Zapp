# Watch tracking

- `src/lib/watch/actions.ts` (`"use server"`): all mutations of `watch_entries`. Every action returns `{ok, prev, entry}` snapshots so the toast can undo via `restoreEntry`. Actions call `revalidatePath` on `/`, `/library`, `/profile` and the title page.
- **Ordine cronologico.** `watch_entries.last_watched_at` (migration 0014, not null, default `now()`, indice `user_id, status, last_watched_at desc`) è l'ultima visione effettiva: l'import (qualunque sorgente) vi scrive la data della sorgente (`lastDate`, l'RPC tiene la più recente con `greatest` su conflitto), le azioni Inizia/Finito/progresso scrivono `now()`; Voglio vederlo, voto, privato e Abbandona non la toccano. Home "In corso"/"Visti di recente" e libreria Sto guardando/Visti ordinano per questa colonna (`orderColumn()` in `queries.ts`; Da vedere per `created_at`, Abbandonati per `updated_at`). `updated_at` non serve a ordinare: l'import scrive a blocchi con lo stesso `now()` per RPC, quindi mostrava l'ordine dei chunk. Lo snapshot per l'undo la porta come campo opzionale.
- `src/lib/watch/queries.ts`: read side. `ENTRY_SELECT` embeds the title via the explicit FK hint `titles!watch_entries_title_id_media_type_fkey` (composite key `id, media_type`), so home/library render with zero TMDB calls. **Lists never select `titles.raw`** (~27 KB per row: with 1261 entries the profile serialised ~34 MB): `TITLE_LIST_COLUMNS` lists explicit columns and series progress reads `titles.seasons`, a stored generated column (`raw->'seasons'`, migration 0010); `availableSeasons()` accepts either `raw` or that array. Home `watching` is capped at 20; the library is paginated (`getLibraryPage`, 60 per page, `loadMoreLibrary` Server Action + "Carica altri"); profile statistics come from the SQL RPC `profile_stats(uid)` (films/series/episodes/minutes/top genres, ~400 bytes) plus two slim queries (wall posters, top rated).
- **Instant navigation.** Every `(app)` route has a `loading.tsx` with the real page geometry; `next.config.ts` sets `experimental.staleTimes` (dynamic 30 s, static 5 min) so visited pages reopen from the router cache; the five `TopNav` links use full `prefetch`. Title pages stream: `TitleBody` renders `TitleHeader` (image + trailer iframe) in the first chunk and puts the poster palette (`getPosterPalette`, `unstable_cache` 30 d per poster), the viewer entry, links, reviews and friends behind Suspense.

- **Prima carica (audit 2026-09-08).** Misure con Playwright su Chrome, iPhone 13,
  rete 4G (4 Mbit/s, 70 ms) e CPU 4×, su `/login` (la primissima schermata):
  75 richieste / 1852 KB / load 2740 ms → **29 richieste / 1154 KB / load 1242 ms**.
  Da dove venivano:
  - **`PosterWall` con immagini eager.** Ogni schermata col muro ne monta due,
    `lg:hidden` e `hidden lg:block`: un `<img>` eager dentro `display:none` viene
    scaricato lo stesso, quindi il telefono prendeva anche le 60 locandine del muro
    da desktop (780 KB) invece delle 16 che vede (184 KB). Ora sono `loading="lazy"`:
    il muro nascosto non chiede niente, quello visibile parte lo stesso perché è nel
    viewport. Cadono anche i 60 `<link rel="preload" as="image">` che React 19
    emetteva per le eager, in gara con CSS, font e JS. **Non rimettere `eager`.**
  - **Precache del service worker: 1893 → 412 KB** di `public/`. Il default prende
    tutto `public/`, cioè anche pdf.js (worker 1236 KB + JBIG2 142 + wasm 102 = il
    78% del totale) che serve solo a chi carica il PDF di un biglietto. Ora
    `globPublicPatterns` in `next.config.ts` è un elenco esplicito: aggiungendo una
    cartella a `public/` che deve stare offline, va aggiunta lì.
  - **`preconnect` a `image.tmdb.org` e allo storage Supabase** nel root layout: la
    prima immagine di ogni visita non paga più DNS+TCP+TLS dopo essere stata scoperta
    nell'HTML. Niente `crossOrigin`: le locandine sono `<img>` senza CORS.
  - **`prefetch={false}` fra login e signup**: stesso muro, quindi ~100 KB di payload
    RSC scaricati sulla prima schermata per un link che quasi nessuno tocca.
- **Query: nominare gli id, non lasciarli dedurre alla RLS.** `getFriendsWatchingHome`
  filtrava con il solo `user_id <> io`: nessun indice di `watch_entries` parte da
  altro che `user_id`, quindi era un Seq Scan con `are_friends()` (SECURITY DEFINER)
  riga per riga — 262 ms di media, 1,4 s di picco in produzione. Con
  `.in("user_id", idAmici)` torna Index Scan: **105 → 37 ms** con RLS attiva
  (EXPLAIN ANALYZE, 2026-09-08). `getFriendsData` è in React `cache()`: la chiedevano
  due sezioni della scheda titolo, `/cinema` due volte e la home.
- **Il throttle TMDB conta anche le risposte in cache.** Sta prima di `fetch`, e la
  cache dati di Next sta dentro: una risposta già in cache non arriva mai a TMDB ma
  veniva messa in coda lo stesso. "Continua a guardare" (20 tessere × 2 chiamate) ne
  era il caso peggiore. `MAX_PER_WINDOW` 15 → 30 (TMDB regge ~50/s).
- **Trailer: i tempi sono quelli giusti, verificati.** Il player è pronto a ~1,4 s,
  arriva a hd1080 a ~1,7–2,2 s. La dissolvenza a `REVEAL_DELAY_MS` = 4,5 s **non è
  padding**: con screenshot a playing+1,5 / +3,0 / +4,5 s si vede che barra del
  titolo, comandi centrali e "Altri video" di YouTube sono ancora lì a 3 s e spariscono
  solo dopo. Anche `SCALE_BAND` = 6 è giusto: a 6× il player prende hd1080 (7,7 MB),
  a 4× e 3× si ferma a hd720 (6,4 MB), a 2× a 480p. Non abbassarli per "guadagnare
  tempo": si perde qualità senza anticipare la comparsa.

