# Backend pronto a molti utenti

Data: 2026-09-08
Branch: `perf/multi-utente` (da `perf/istantanea`), worktree `D:/PROGETTI/Zapp-scale`
Piano: Supabase Free + Vercel Hobby + Upstash Redis free (scelta dell'utente)
Bersaglio di progetto: ~500 account, ~100 attivi al giorno, picchi di 3-5 import
contemporanei.

## Perche'

Oggi l'app ha 10 utenti e 4.408 righe in `watch_entries`: qualunque query e'
veloce, quindi niente segnala i punti che cederanno. Questa spec elenca solo
cose misurate sul progetto vero (`bbuhwzdbzxgydewmcdwd`, 2026-09-08), non
buone pratiche generiche.

Stato di partenza:

| misura | valore |
| --- | --- |
| utenti / profili | 10 / 10 |
| dimensione DB | 127 MB (tetto del piano Free: 500 MB) |
| `titles` | 3.699 righe, 105 MB |
| `watch_entries` | 4.408 righe |
| policy RLS | 71, di cui **61** chiamano `auth.uid()` per riga |
| foreign key senza indice | 9 |
| job pg_cron | 7 |

## I cinque muri

1. **RLS valutata per riga.** 61 policy su 71 scrivono `auth.uid()` nudo.
   Postgres non lo considera costante e lo rivaluta a ogni riga esaminata
   (advisor `auth_rls_initplan`). Su 4.408 righe non si vede; su 500.000 la
   libreria passa da millisecondi a secondi.
2. **Indici mancanti sulle chiavi esterne.** `recommendations(to_user)` non ha
   indice: la home legge i consigli ricevuti con una scansione completa. Idem
   `watch_entries(title_id, media_type)`, `activity_likes(user_id)`,
   `review_likes(user_id)`, `review_comments(user_id)`,
   `review_comments(parent_id)`, `reports(reporter_id)`, `imports(user_id)`,
   `recommendations(title_id, media_type)`.
3. **Il catalogo condiviso sfonda il piano.** `titles.raw` pesa 105 MB per
   3.699 titoli. A ~100 utenti con librerie diverse il catalogo supera i
   500 MB e il progetto va in sola lettura.
4. **I limiti sono per processo, non per applicazione.** `rateLimit` tiene i
   contatori in memoria e `UPSTASH_*` non sono configurate: con il traffico
   distribuito su N lambda ogni limite vale N volte. Stessa cosa per i freni
   verso TMDB (15 req/s **per istanza**), MyMovies (4/s) e Nominatim, la cui
   policy pubblica e' 1 req/s **complessiva**: oggi il rischio e' il ban.
5. **Il lavoro di fondo non tiene il passo.** `taste-refresh` aggiorna 200
   profili all'ora a rotazione cieca: oltre 200 utenti attivi il profilo di
   gusto arriva sempre in ritardo. `activities` e `notifications` non vengono
   mai potate; i biglietti nello storage delle serate passate restano per
   sempre (bucket da 1 GB).

## Cosa non facciamo

- Niente feed denormalizzato, viste materializzate o coda di lavoro esterna:
  a 500 utenti non servono e costano complessita' permanente.
- Niente sfratto dei titoli morti (valutato e scartato dall'utente): il taglio
  di `raw` sposta il tetto abbastanza in alto da non servire.
- Niente cambio di piano: il design deve stare dentro Free + Upstash free.

---

## 1. Database

Passaggio invisibile all'utente: nessun file applicativo cambia, si deploya da
solo.

### 1.1 Le 61 policy

Ogni `auth.uid()` dentro `using`/`with check` diventa `(select auth.uid())`.
Il sotto-select viene valutato una volta e trattato come costante (InitPlan),
non piu' una volta per riga. **La semantica e' identica**: stesso valore,
stesso risultato, nessun allentamento dei controlli.

La migration non si scrive a mano. Si genera da `pg_policies`: per ogni policy
si legge `qual` e `with_check`, si sostituisce testualmente `auth.uid()` con
`(select auth.uid())` e si riemette `drop policy` + `create policy` con gli
stessi nome, comando e ruoli. Verifica: dopo la migration, `pg_policies` deve
mostrare 0 policy con `auth.uid()` non avvolto e lo **stesso identico insieme**
di (tabella, nome, comando, ruoli, testo normalizzato) di prima.

### 1.2 Le due policy permissive doppie

`watch_entries` e `activities` hanno due policy `SELECT` permissive: Postgres
le valuta **entrambe** per ogni riga, quindi anche `are_friends()` (che e'
SECURITY DEFINER, cioe' una chiamata di funzione) gira sulle proprie righe,
dove non serve.

Si fondono in una sola, con la condizione propria per prima cosi' che l'`or`
corto-circuiti sul caso normale (la propria libreria):

```sql
create policy watch_entries_select on public.watch_entries for select
  to authenticated
  using (
    user_id = (select auth.uid())
    or (not is_private and user_id = any (select public.my_friend_ids()))
  );
```

`my_friend_ids()` e' una funzione nuova, SECURITY DEFINER e `stable`, che
ritorna gli id degli amici accettati **dell'utente corrente**: non espone
niente che l'utente non veda gia' dalla pagina Amici, e per la stessa ragione
di sicurezza di `are_friends` risponde solo su se stessi. Il guadagno e' che
viene eseguita una volta per query invece di una volta per riga.

`are_friends()` e `is_blocked()` restano dove sono usate altrove: si tocca solo
il punto dove giravano per riga su tabelle grandi.

### 1.3 Indici

Si aggiungono i 9 indici sulle chiavi esterne elencate sopra e un indice per il
feed su `activities(created_at desc)`. Si rimuovono i 3 mai usati
(`title_provider_links`, `cinema_films`, `title_charts`): costano a ogni
scrittura e non servono a nessuna lettura.

`watch_entries` e `user_events` sono le due tabelle che crescono per utente:
autovacuum piu' aggressivo (`autovacuum_vacuum_scale_factor = 0.02`), altrimenti
con 500k righe il vacuum parte troppo tardi e le statistiche invecchiano.

---

## 2. Limiti e quote condivise

Il piano Upstash free e' **500.000 comandi al mese** (~16.000 al giorno).
Interpellare Redis a ogni richiesta lo esaurisce: va speso dove cambia
qualcosa.

### 2.1 Chi passa da Redis e chi no

Regola: **Redis per le azioni rare e costose, memoria per quelle frequenti e
a buon mercato.** Un limite per istanza su un'azione che costa una scrittura di
una riga e' un male accettabile; su una chiamata a un servizio esterno no.

| chiave | dove | perche' |
| --- | --- | --- |
| `geocode:` | Redis | Nominatim e' un servizio pubblico gratuito, un abuso costa il ban |
| `import:parse:`, `import:match:` | Redis | un import sono migliaia di chiamate TMDB |
| `friendreq:`, `recommend:`, `review:`, `comment:`, `report:` | Redis | scritture sociali, abuso visibile agli altri |
| `usersearch:` | Redis | interroga una vista SECURITY DEFINER |
| `tmdbproxy:`, `activitylike:`, `reviewlike:`, `friendreply:`, `friendedit:`, `notifread:` | memoria | volume alto, costo per chiamata trascurabile |

Stima: 100 utenti attivi per ~5 azioni "care" al giorno per 2 comandi = ~1.000
comandi al giorno, cioe' ~30.000 al mese. Un ordine di grandezza sotto il tetto.

`rateLimit` prende un parametro nuovo per dire se la chiave e' condivisa; senza
Upstash configurato il comportamento resta quello di oggi (memoria), quindi
sviluppo e anteprime continuano a funzionare senza chiavi.

### 2.2 Freni globali verso l'esterno

- **Nominatim**: gate globale a 1 richiesta al secondo per tutta
  l'applicazione, in Redis. E' l'unico servizio dove la loro policy parla di un
  tetto complessivo. Il volume e' bassissimo (un geocoding per utente ogni
  tanto), quindi costa pochi comandi.
- **Import**: al massimo **3 import contemporanei** in tutta l'app, con un
  lucchetto in Redis a scadenza. Il quarto utente aspetta e la chip glielo
  dice, invece di far cadere TMDB per tutti. Costa 2 comandi per import.
- **TMDB e MyMovies**: **nessun gate globale**. Il throttle per istanza resta
  com'e'. Motivo: la navigazione normale e' quasi tutta servita dal memo in
  processo e dalla cache `fetch` di Next (condivisa fra istanze), quindi non
  genera raffiche; l'unica sorgente di raffiche e' l'import, ed e' gia' limitato
  dal punto sopra. Un token bucket in Redis su ogni chiamata TMDB costerebbe
  centinaia di migliaia di comandi al mese per un problema che non esiste.

---

## 3. Catalogo

`raw` scomposto per chiave, byte logici medi per titolo (misura del 2026-09-08):

| chiave | media | decisione |
| --- | --- | --- |
| `watch/providers` | 41 KB | **si toglie**: gia' tutto in `title_providers` |
| `credits` | 30 KB | ridotto: primi 25 del cast, del crew solo regia/sceneggiatura/produzione |
| `recommendations` | 17,5 KB | ridotto: primi 12, solo i campi letti |
| `images` | 12 KB (su 227 righe) | **si toglie**: la galleria e' stata rimossa il 2026-09-07 |
| `release_dates` | 8,3 KB | solo l'Italia |
| `videos` | 1,7 KB | intero |
| `content_ratings` | 1,3 KB | solo l'Italia |
| `seasons`, `keywords`, resto | ~4 KB | interi |

Stima: da 105 MB a ~18-20 MB, tetto da ~21.000 a ~100.000 titoli.

**Il taglio avviene nei mapper**, non nella chiamata TMDB: `getMovie`/`getTv`
continuano a chiedere l'`append_to_response` completo (una sola chiamata), ma
`toTitleRow` scrive in `raw` solo cio' che resta. `watch/providers` serve ancora
nella risposta perche' e' la sorgente di `title_providers`.

Consumatori di `raw` da verificare uno per uno (non devono cambiare
comportamento): `TitleBody` (`credits.cast`, `seasons`), `TitleAbout`,
`TechnicalSheet`, `CastRow`, `SeriesProgress`, `TitleActions`,
`availableSeasons`, la pagina stagione, `similar/similar.ts`
(`recommendations`), `taste/refresh.ts` (`original_language`, `credits`),
`api/preview` e `api/jobs/trailers` (`videos`).

Perche' i titoli gia' salvati si riscrivano: `TITLE_CACHE_EPOCH` alzata alla
data del deploy. Piu' una **compattazione una tantum in SQL** che toglie le
chiavi dalle 3.699 righe esistenti senza rifare nessuna chiamata a TMDB, cosi'
lo spazio si libera subito invece che titolo per titolo.

Allarme: il job orario aggiunge una riga in `job_runs` quando
`pg_database_size` supera l'80% del piano.

---

## 4. Job e pulizia

- **`taste-refresh`**: da "200 profili a rotazione" a coda per priorita' in SQL
  (`taste_refresh_queue`, sullo stampo di `ratings_refresh_queue`): prima chi ha
  eventi recenti in `user_events`, poi chi ha il profilo piu' vecchio. Con 500
  utenti di cui 100 attivi, i 100 che contano restano aggiornati ogni ora.
- **Potatura**: `activities` e `notifications` oltre i 90 giorni vengono
  cancellate dal job `events-prune`, che gia' esiste per `user_events`.
- **Storage**: i biglietti delle serate finite da oltre 30 giorni vengono
  rimossi dal bucket insieme alla riga `cinema_plans`.

---

## 5. Verifica

Nessuna affermazione di prestazione senza numeri.

1. **Seed sintetico dentro una transazione** sul DB vero: 500 utenti finti,
   ~500.000 `watch_entries`, ~50.000 `activities`, un grafo di amicizie
   realistico (media 8 amici), `notifications` e `recommendations` in
   proporzione. `analyze` sulle tabelle toccate.
2. **`explain (analyze, buffers)`** con il ruolo `authenticated` e un
   `request.jwt.claims` finto, sulle query vere di: home ("in corso", "visti di
   recente", consigli degli amici), libreria paginata, feed amici, profilo
   (`profile_stats`), scheda titolo (recensioni + amici che l'hanno visto).
3. `rollback`. Il DB torna com'era: il seed non lascia niente.
4. Le misure prima/dopo finiscono in una tabella in fondo a questa spec.

Poi, come sempre: `pnpm test`, `pnpm typecheck`, `pnpm lint`,
`NEXT_DIST_DIR=.next-scale pnpm build`, `node scripts/security-check.mjs`
contro l'istanza avviata (le policy cambiano: va rilanciato) e
`get_advisors` di Supabase, che deve tornare 0 `auth_rls_initplan` e 0
`unindexed_foreign_keys`.

---

## Passi manuali per l'utente

1. Creare un database Upstash Redis (piano free) nella regione **eu-central-1**
   o **eu-west-1**, vicino alle funzioni `fra1`.
2. Mettere `UPSTASH_REDIS_REST_URL` e `UPSTASH_REDIS_REST_TOKEN` fra le
   variabili d'ambiente di Vercel, **sia in Production sia in Preview**.

Senza queste due variabili il codice continua a funzionare con i limiti in
memoria, esattamente come oggi: nessun passo di questa spec si rompe se
l'utente rimanda.

---

## Ordine di consegna

Tre passaggi, ognuno deployabile da solo.

| passo | contenuto | rischio |
| --- | --- | --- |
| 1 | Sezione 1 (policy, indici, autovacuum) | nullo: nessun file applicativo |
| 2 | Sezione 2 (limiti condivisi) + sezione 4 (job) | basso: cambia solo sotto carico |
| 3 | Sezione 3 (catalogo) | medio: tocca 12 consumatori di `raw` |

La verifica della sezione 5 gira prima e dopo il passo 1, e di nuovo dopo il
passo 3.
