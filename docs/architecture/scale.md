# Scala: reggere molti utenti (2026-09-08)

Tre regole nate misurando, non leggendo. Il banco di prova e' la funzione
`public.bench_scale(n_utenti, n_entry, giri)` (migration 0027): genera utenti
finti con libreria, amicizie, attivita' e notifiche, misura le query vere
fingendosi uno di loro e **cancella tutto quello che ha inserito**. Numeri e
metodo in `docs/superpowers/specs/2026-09-08-backend-multi-utente-misure.md`.

- **Ogni policy nuova scrive `(select auth.uid())`, mai `auth.uid()` nudo.**
  Postgres non considera `auth.uid()` una costante e lo rivaluta **per ogni
  riga esaminata**; col sotto-select lo calcola una volta (InitPlan). La
  condizione non cambia, cambia il numero di valutazioni. Stessa cosa per una
  funzione dentro una policy: `are_friends(uid, user_id)` girava per riga, al
  suo posto c'e' `user_id in (select my_friend_ids())`, che gira una volta.
  E **una sola policy permissiva per comando**: due vengono valutate entrambe
  per ogni riga, quindi leggendo la propria libreria si pagava comunque la
  condizione degli amici. Il feed e' passato da **1.239 ms a 0,8 ms**.
- **Ogni chiave esterna nuova nasce con il suo indice.** Senza, ogni lettura
  per quella colonna e' una scansione completa: `recommendations(to_user)` era
  cosi' e la home la interroga a ogni apertura. Attenzione al rovescio: un
  indice con la stessa colonna di testa di uno gia' esistente puo' essere
  **preferito dal pianificatore alla query sbagliata**. Un
  `watch_entries(user_id, updated_at)` aggiunto per la coda dei gusti veniva
  scelto per la libreria, dove perdeva `status` come condizione: e' stato tolto.
  Un indice si aggiunge dopo averlo misurato, non prima.
- **In `titles.raw` sta solo quello che il codice legge.** `titles` e'
  condiviso fra tutti gli utenti: e' l'unica tabella che cresce col numero di
  gusti diversi invece che col numero di persone, e il piano Free si ferma a
  500 MB. `src/lib/tmdb/slim-raw.ts` (puro, Vitest) decide cosa salvare — via
  `watch/providers` (e' gia' in `title_providers`) e `images`, cast ai primi 30,
  crew ai cinque mestieri letti davvero, consigli ai primi 12, uscite e divieti
  alla sola Italia. **Chi aggiunge un campo che il codice legge deve
  aggiungerlo anche li'**, altrimenti sparisce al primo aggiornamento del
  titolo. La chiamata TMDB resta intera: si taglia quello che si salva.

Altre due cose che valgono per tutto il backend:

- **I limiti di frequenza in memoria valgono per istanza.** Su Vercel le
  istanze sono molte, quindi un tetto di 30 all'ora vale 30 *per lambda*.
  `rateLimit(..., { condiviso: true })` lo fa contare da Upstash, ma **non si
  accende ovunque**: il piano gratuito da' 500.000 comandi al mese e un
  contatore condiviso sul proxy TMDB lo brucerebbe da solo. Condiviso dove
  sbagliare costa fuori di qui (Nominatim, import, scritture sociali), in
  memoria dove il limite serve solo a fermare un ciclo impazzito.
- **Le quote dei servizi di terzi sono per applicazione, non per utente.**
  `src/lib/gate.ts`: `attendiTurno` tiene Nominatim a una richiesta al secondo
  in tutta l'app (la loro policy e' quella, e superarla non da' un errore, da'
  il ban); `prendiPosto` tiene a tre gli import contemporanei, perche' il
  throttle del client TMDB e' per istanza e cinque import in parallelo sono
  cinque throttle indipendenti.

