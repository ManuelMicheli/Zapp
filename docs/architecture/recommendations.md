# Consigli: "Simili" e "Perché hai visto X"

`src/lib/similar/` (2026-09-07). Le due sezioni non mostrano più `recommendations` di
TMDB — che è un segnale collaborativo grezzo, "chi ha aperto questa scheda ha aperto
anche quella" — ma una classifica costruita da **cosa il titolo è**.

- `signals.ts` (puro, Vitest) `seedProfile(details, mediaType)`: l'**identikit** del
  seme — keyword, saga, regia/creatori, sceneggiatori, primi attori, generi, anno. Le
  keyword arrivano gratis dentro `titles.raw` (`keywords` è nell'`append_to_response`;
  per questo `TITLE_CACHE_EPOCH` è stata alzata). Fuori il rumore di produzione
  (`NOISE_KEYWORDS`: `aftercreditsstinger`, `sequel`, `based on…`) **e i luoghi**
  (`usa`, `indiana`: si comportano come i generi). Le keyword più **specifiche** — più
  parole — vanno davanti, perché solo le prime sei vengono interrogate.
- `candidates.ts` (dipendenze iniettate, non `server-only`) `collectCandidates(seed,
source, collab)`: una `discover` **per ciascuna** delle 6 keyword, la saga
  (`/collection/{id}`), la regia e il volto (`person/{id}/movie_credits` filtrato
  `job === "Director"`, o `tv_credits`; **mai `discover?with_crew=`**, che accosta
  qualunque ruolo di troupe e faceva risultare "di Villeneuve" film che non ha
  diretto), `similar` e le `recommendations` già in `raw`. Poi **un secondo giro** con
  le due keyword più rare in AND: chi c'è dentro è il nucleo del filone e vale doppio.
  L'appartenenza di un candidato a una keyword si sa **per costruzione** — nessuna
  chiamata per candidato.
- **La rarità di una keyword si misura gratis**: il `total_results` di ogni `discover`
  dice quanti titoli la portano, e `keywordIdf` la trasforma in peso. "Loop temporale"
  vale cinque volte "amicizia" senza classifiche compilate a mano.
- `score.ts` (puro, Vitest) `rankCandidates`: **filone × qualità × età × forma**.
  Filone = keyword (per rarità, doppie se dal nucleo) + saga 3,0 + regia 1,6 +
  sceneggiatura 0,8 + attori 0,5 + generi Jaccard × **0,6** (il peso più basso di
  tutti) + presenza fra i consigli TMDB 0,4. Qualità = ZappScore della fase B
  (`getRatings`, una query per tutta la lista), 0,75–1,25: rompe i pareggi, non
  ribalta il filone. Età = penalità **morbida e asimmetrica**, pavimento 0,5: per un
  seme degli ultimi 3 anni un candidato più vecchio scende il doppio più in fretta, ma
  il capostipite di un filone può ancora entrare. Forma = ×0,55 se animazione,
  documentario, reality o kids stanno da una parte sola (sotto Stranger Things
  arrivavano tre anime che condividevano "mondo parallelo"). Igiene: fuori il seme, i
  non usciti, chi ha meno di 50/20 voti, gli `adult`, e **max 2 per saga e 2 per
  regista**. I legami **solidi** (due segnali, o saga/regia/keyword del nucleo) vanno
  davanti, ma senza amputare: sotto vengono gli altri, perché uno scaffale mezzo vuoto
  è un difetto quanto uno a caso.
- **Ogni titolo porta il motivo** ("Stessa saga", "Di Denis Villeneuve",
  "Rapina · Vendetta"), reso da `PosterCard reason`. Le keyword TMDB sono in inglese:
  si mostrano solo quelle tradotte in `keyword-labels.ts` — mai inglese in pagina.
- `similar.ts` `getSimilarTitles(id, mediaType, size)` è la facciata, **DB-first**
  come i trailer: una lettura di `title_similar` (migration `0024`, applicata via MCP;
  `items` + `seed`, TTL 30 giorni, 3 se vuota, service client). Misurato dal vivo:
  freddo 1,5 s con 7 chiamate TMDB, **caldo 58 ms**. Se tutto cade si torna a
  `raw.recommendations`, cioè al comportamento di prima.
- **La classifica salvata è impersonale**, uguale per tutti. Il pezzo personale è solo
  in home ed è quello di tutta l'app: **un unico profilo di gusto**, quello della fase A
  (`user_taste`), letto come vettore dalla fase C e pesato con la sua `affinity`.
  `similar/personal.ts` (server) legge il profilo una volta per richiesta, rispetta
  `personalization_enabled` (spenta → resta l'ordine pubblico) e arricchisce **l'unione
  di tutti gli scaffali in una passata sola** riusando `arricchisci` di
  `rank/candidates.ts` — la home ne mostra fino a otto e una passata per scaffale
  sarebbe otto volte le stesse query. `similar/personal-rank.ts` (puro) fa la miscela:
  `punteggio × (0,75 + 0,5 × affinità)`, **la stessa banda della qualità**, così gusto e
  qualità hanno la stessa voce in capitolo e nessuno dei due ribalta il filone — lo
  scaffale si chiama "Perché hai visto X", non "cose che ti piacciono". Qui **non si
  deduce nessun gusto**: c'era un `taste.ts` locale (registi e keyword ricorrenti) ed è
  stato tolto il 2026-09-08, perché due definizioni di "cosa piace a questa persona"
  sono una di troppo. `pickBecauseSources` scarta chi non è stato finito e chi è stato
  **bocciato** (voto < 6); `BecauseYouWatched` prova 8 sorgenti e tiene le 5 che
  producono almeno 6 titoli.
- **Verifica**: `pnpm tsx scripts/similar-check.ts [movie|tv:id …]` stampa la
  classifica vera con punteggio e motivo, e sotto la lista che TMDB dava prima. La
  suite verde prova la formula, non la qualità dei consigli: cinque delle tarature di
  questo modulo sono nate leggendo quell'output, non dai test.

