# Algoritmo Zapp — Fase A: segnali utente

Data: 2026-09-07. Stato: approvato in chat (anno di nascita + titoli seed in onboarding;
telemetria impression + click + skip; interruttore di personalizzazione nel profilo).

## Il quadro: dove sta questa fase

| | Sottosistema | Cosa fa | Stato |
|---|---|---|---|
| **A** | **Segnali utente** | **anno di nascita, titoli seed, telemetria implicita, profilo di gusto materializzato** | **questa spec** |
| B | Catalogo & ZappScore | classifiche settimanali per piattaforma + voto aggregato multi-fonte | **fatta**, in produzione dal 2026-09-07 |
| C | Motore di ranking | candidate generation → scoring → diversità → spiegazione | da fare |
| D | Home dinamica | rail personalizzati, ordine dei rail per utente | da fare |
| E | Loop sociale | segnali degli amici, inviti, notifiche, ritorno giornaliero | da fare |

La fase B ha dato a Zapp **un numero pubblico di cui fidarsi** (ZappScore, uguale per tutti).
La fase A dà il secondo numero: **chi è questo utente**. Senza, la fase C non ha niente da
classificare — `PosterCard.affinity` esiste già come prop e resta `null` fino alla C.

## Obiettivo

1. **Non essere ciechi il primo giorno.** Chi si iscrive e non importa Netflix oggi non lascia
   alcun segnale finché non guarda qualcosa. Due domande in onboarding (anno di nascita, cinque
   copertine che gli piacciono) bastano a partire.
2. **Sapere anche cosa NON piace.** La libreria racconta solo i sì. Le impression raccontano i no:
   un titolo mostrato dieci volte e mai aperto è un segnale forte quanto un voto basso.
3. **Un profilo di gusto leggibile in una riga.** `user_taste`, una riga per utente, ricalcolata da
   un job: la fase C non deve mai aggregare la libreria a ogni render della home.

**Fuori scope, e ci resta**: qualunque uso del profilo per ordinare qualcosa (è la fase C), gli
scaffali personalizzati in home (fase D), i segnali degli amici (fase E), la pagina "cosa sa Zapp
di te" (scartata in chat: per ora basta l'interruttore).

## 1. Onboarding in due passi

`/onboarding` resta **una sola rotta e una sola Server Action**: `OnboardingForm` diventa una
procedura a due passi lato client, e `onboarding_completed_at` si scrive **solo alla fine**. Chi
abbandona al passo 2 e riapre l'app ricomincia dal passo 1 senza aver perso niente e senza
finire in un limbo (il layout `(app)` rimanda a `/onboarding` finché quella colonna è nulla).

**Passo 1** — com'è oggi (username, nome, foto) più un campo **Anno di nascita**, quattro cifre,
**saltabile**. Testo: "Serve solo a consigliarti meglio. Puoi non dirlo."

**Passo 2** — *"Scegline almeno 3 che ti piacciono"*: griglia di 30 copertine miste film/serie,
tap per selezionare (bordo accent + spunta), contatore `3/5`, "Fine" attivo da 3 selezioni,
"Salta" sempre visibile. Le copertine le prepara il server component della pagina.

**Da dove vengono le 30 copertine** (`src/lib/taste/seed.ts`):

- candidati = titoli delle classifiche correnti già in DB (`title_charts` risolte, fase B) +
  trending IT di TMDB, entrambe query/fetch che l'app fa già altrove (cache Next condivisa);
- `pickSeedGrid(candidati)` è **puro e testato**: mescola film e serie ~50/50, non più di 3 titoli
  per genere, scarta i titoli senza locandina, ordina per riconoscibilità (posizione in classifica,
  poi ZappScore), taglia a 30.
- Nessuna chiamata nuova a servizi esterni: se il DB delle classifiche fosse vuoto, la griglia
  ricade sul solo trending e, se anche quello manca, il passo 2 **non compare** — l'onboarding non
  si rompe mai per colpa della griglia.

Le scelte finiscono in `user_seed_picks` e valgono come segnale "mi piace" forte, **non** come
"visto": non toccano `watch_entries` e non compaiono in libreria.

## 2. Telemetria implicita

### 2.1 Cosa registriamo

`user_events`, una riga per evento:

| `kind` | Quando | Chi lo scrive |
|---|---|---|
| `impression` | copertina visibile ≥ 50% per ≥ 1 s | client, in batch |
| `open` | tocco su una copertina dichiarata | client, in batch |
| `provider_open` | tocco su un `ProviderButton` (Apri/Cerca) | client, in batch |
| `trailer_play` | il trailer della scheda parte davvero (evento "playing") | client, in batch |
| `dismiss` | rifiuto esplicito ("non mi interessa", esiste da qui in poi) | client, in batch |
| `library_add` | aggiunta in libreria | **server**, dentro le action di `watch/actions.ts` |
| `rate` | voto | **server**, stessa via |

Le due azioni esplicite le scrive il server perché lì il dato è certo e gratuito: sono già dentro
una Server Action che scrive su `watch_entries`.

**Lo `skip` non è un evento.** Nessun client lo manda: è derivato in SQL (§3.2) come "titolo con
impression e nessuna `open`". Un evento in meno da inventare, e nessun rischio che il telefono
mandi skip fantasma quando l'utente semplicemente chiude l'app.

### 2.2 Come li raccoglie il client

`SignalsProvider` (`src/components/signals/SignalsProvider.tsx`, client, montato nel layout
`(app)` accanto a `ImportProvider`):

- **un solo `IntersectionObserver`** su tutti gli elementi `[data-signal]`, più un `MutationObserver`
  per agganciare quelli che arrivano dopo (scaffali, "Carica altri"). Stesso schema del
  `PreviewLayer`, che già ascolta un solo evento sul documento: **`PosterCard` resta un componente
  server**, qui esce solo un attributo in più.
- l'attributo è `data-signal="<mediaType>:<id>:<superficie>:<posizione>"`, prodotto dalla nuova prop
  `signal` di `PosterCard` (e delle poche card che non sono `PosterCard`: `ContinueCard`,
  `HeroCarousel`, `ActivityBanner`). Le superfici hanno nomi fissi in
  `src/lib/taste/surfaces.ts` (`home-hero`, `home-continua`, `home-top10`, `discover-*`, `search`,
  `library`, `title-simili`, …): un elenco chiuso, così la fase C non deve indovinare stringhe.
- `sessionId` = `crypto.randomUUID()` **in memoria**, uno per scheda del browser. Mai
  `localStorage` né `sessionStorage`: sono dati dell'utente, e la regola del progetto lo vieta.
- dedup lato client: una impression per `(titolo, superficie)` per sessione.
- invio: coda in memoria, flush ogni **5 s** e su `visibilitychange: hidden` con
  `navigator.sendBeacon` (ripiego `fetch(..., {keepalive: true})`). Massimo **100 eventi per
  richiesta**, massimo 20 richieste per sessione: una home lunga non può diventare un fiume.
- se la personalizzazione è spenta il provider **non aggancia nulla**: nessun observer, nessuna
  coda, nessuna richiesta. Il flag arriva dal layout server come prop.

### 2.3 La rotta

`POST /api/events` (route handler, **non** una Server Action: non deve rivalidare niente né
rigirare i cookie di sessione ad ogni batch).

- corpo: `{ sessionId, events: [{ kind, titleId, mediaType, surface, position, at }] }`, ≤ 100;
- autenticazione: sessione a cookie (`createClient()` + `getUser()`), quindi la rotta **non** va in
  `PUBLIC_PATHS` del middleware — l'opposto di `/api/jobs`, che invece ci deve stare;
- se `personalization_enabled` è falso: `204`, nessuna scrittura;
- rate limit per utente con `src/lib/rate-limit.ts` (già in casa): 40 richieste / 5 minuti;
- scrittura **con il client dell'utente** (RLS attiva, mai il service client per dati utente) e
  `on conflict do nothing` sull'indice unico delle impression;
- risposta sempre `204`: il client non deve mai avere motivo di riprovare.

## 3. Schema DB — migration `0024_segnali_utente.sql`

```sql
create table public.user_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  birth_year smallint check (birth_year between 1900 and 2100),
  personalization_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

L'anno di nascita **non va in `profiles`**: quella tabella è leggibile da chiunque
(`user_search`, profili pubblici). Stessa scelta già fatta per `user_locations`. Il `check` usa
un limite letterale e non `extract(year from now())`: Postgres rifiuta le funzioni non immutabili
in un vincolo.

```sql
create type public.signal_kind as enum
  ('impression','open','provider_open','trailer_play','dismiss','library_add','rate');

create table public.user_events (
  id bigserial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  kind public.signal_kind not null,
  title_id bigint,
  media_type public.media_type,
  surface text not null,
  position smallint,
  session_id uuid not null,
  created_at timestamptz not null default now()
);
```

**Nessuna foreign key verso `titles`**, di proposito: una copertina di ricerca può essere di un
titolo che non abbiamo ancora in cache, e un evento perso perché la riga non c'è ancora sarebbe un
buco silenzioso proprio sui titoli nuovi. Il job ignora gli eventi di titoli sconosciuti.

Indici: `(user_id, created_at desc)` per il job, `(created_at)` per la potatura, e l'unico che
conta davvero —

```sql
create unique index user_events_impression_unica_idx
  on public.user_events (user_id, session_id, title_id, media_type, surface)
  where kind = 'impression';
```

— così una impression ripetuta costa `on conflict do nothing` e non una riga.

`user_seed_picks (user_id, title_id, media_type, created_at)`, chiave primaria sui primi tre.

```sql
create table public.user_taste (
  user_id uuid primary key references auth.users(id) on delete cascade,
  generi jsonb not null default '{}'::jsonb,
  decenni jsonb not null default '{}'::jsonb,
  provider jsonb not null default '{}'::jsonb,
  persone jsonb not null default '{}'::jsonb,
  tipo jsonb not null default '{}'::jsonb,
  runtime jsonb not null default '{}'::jsonb,
  lingua jsonb not null default '{}'::jsonb,
  novita real,
  massa real not null default 0,
  eventi_contati integer not null default 0,
  updated_at timestamptz not null default now()
);
```

RLS ovunque: `user_preferences`, `user_events` e `user_seed_picks` sono **solo del proprietario**
(select/insert/delete; nessun update sugli eventi). `user_taste` è **in sola lettura** per il
proprietario e la scrive soltanto il service client dal job: nessuna policy di scrittura, come già
per `job_runs`.

### 3.1 Le dimensioni del gusto, e quelle che ho lasciato fuori

Dentro: `generi`, `decenni` (di uscita), `tipo` (film/serie), `runtime` (fasce), `lingua`
(originale), `provider`, `novita` (quanto pesa l'uscita recente), `persone`.

`persone` **e `lingua`** sono **limitate ai 50 titoli col peso più alto**: i registi e gli
interpreti stanno in `titles.raw->credits`, ~27 KB per riga, e leggere la libreria intera per
estrarli ripeterebbe l'errore che la fase 2 ha già pagato (`TITLE_LIST_COLUMNS` esiste apposta).
La lingua è nello stesso `raw` per un motivo scoperto leggendo lo schema durante il piano:
**`titles` non ha una colonna `original_language`**. Quei 50 titoli si leggono comunque per le
persone, quindi la lingua non costa niente in più — ma copre solo loro, e nel profilo la sua
somma resta sotto 1.

Fuori: le **keyword** TMDB (non le chiediamo nell'`append_to_response` e non voglio allargare
`titles.raw` per questo — semmai è materiale della fase C) e qualunque embedding.

### 3.2 `taste_input(uid)` e `taste_refresh_queue(want)`

Due funzioni SQL `security definer`, revocate a `public/anon/authenticated` come quelle della
fase B.

`taste_input(uid)` torna **una riga per titolo** con tutto ciò che serve, già aggregato:

```
title_id, media_type, status, rating, last_watched_at, is_seed,
impression_sessioni, aperture, provider_aperture, dismissi, ultimo_evento
```

Lo `skip` si legge da qui: `impression_sessioni > 0 and aperture = 0`. Contiamo le **sessioni**
distinte con impression, non le impression: dieci scroll nella stessa sessione sono una noia sola,
non dieci rifiuti. Finestra: 90 giorni, `limit 1000` titoli per utente.

`taste_refresh_queue(want)` torna gli utenti con qualcosa di nuovo dall'ultimo
`user_taste.updated_at` (evento, entry di libreria, o seed pick), i più vecchi per primi.

## 4. Il calcolo: una funzione pura, un job

`src/lib/taste/profile.ts`, `buildTasteProfile(input): TasteProfile` — **pura, senza `server-only`,
con test Vitest**, come `zappScore` della fase B e come tutte le funzioni di `src/lib/cinema/`.

Peso base per segnale, prima del decadimento:

| segnale | peso |
|---|---|
| voto ≥ 8 | +10 |
| finito (`watched`) | +6 |
| seed pick | +5 |
| in corso (`watching`) | +3 |
| apertura piattaforma | +3 |
| aggiunta in libreria (`want`) | +2 |
| trailer guardato | +1,5 |
| apertura scheda | +1 |
| impression senza apertura (skip) | −0,5 per sessione, al massimo −2 |
| voto ≤ 4 | −3 |
| abbandonato (`dropped`) | −3 |
| dismiss | −4 |

**Decadimento**: peso × `0.5 ^ (giorni / 180)` sulla data del segnale. Un gusto di due anni fa vale
un quarto di uno di oggi, senza sparire.

Ogni dimensione esce come mappa `chiave → peso normalizzato a somma 1`, più `massa` = somma dei
pesi positivi grezzi: è la **fiducia** del profilo, e la fase C la userà per decidere quanto
personalizzare (massa bassa → si resta vicini alle classifiche pubbliche).

`novita` = quota del peso su titoli usciti negli ultimi 24 mesi. `birth_year`, quando c'è, entra
**solo** come prior leggero sui decenni (la nostalgia esiste, ma il gusto vero la supera) e come
guardia sui contenuti per adulti, che la fase C applicherà come filtro.

**Il job** `taste-refresh`, nuovo `JobName` nella rotta `/api/jobs/[job]` già esistente: prende
fino a 200 utenti dalla coda, per ognuno chiama `taste_input`, arricchisce con i metadati dei
titoli (una query su `titles` con `TITLE_LIST_COLUMNS`, una su `title_providers`, e `raw->credits`
solo per i 50 titoli di testa), esegue `buildTasteProfile` e fa upsert su `user_taste`. Su
`pg_cron` **ogni ora al minuto 20**, per non accavallarsi con `ratings-refresh` che parte al
minuto 0. Il lucchetto contro le sovrapposizioni è quello che c'è già (indice unico parziale su
`job_runs`): i job nuovi lo ereditano senza codice.

Secondo job, `events-prune`, ogni giorno alle 03:00 UTC: cancella gli eventi più vecchi di 90
giorni e, per sicurezza, quelli di chi ha la personalizzazione spenta.

**Ricalcolo immediato** a fine onboarding: `completeOnboarding` chiama `refreshTasteFor(userId)`
(la stessa funzione del job, per un utente solo) prima del `redirect("/")`, così il profilo esiste
già alla prima home e non si aspetta l'ora piena.

## 5. Privacy

Interruttore **"Personalizza i consigli"** nello sheet delle impostazioni del profilo
(`ProfileEditor`, dove sta già `setProfilePrivacy`), acceso di default.

Spegnendolo, una Server Action `setPersonalization(false)`:

1. scrive `personalization_enabled = false`;
2. **cancella** `user_events` e `user_taste` di quell'utente (i seed pick restano: li ha scelti a
   mano, sono suoi, e non sono telemetria);
3. il `SignalsProvider` smette di agganciare qualsiasi cosa al render successivo.

Riaccendendolo si riparte da zero: nessuno storico nascosto da qualche parte.

Testo sotto l'interruttore: *"Zapp usa quello che guardi e quello che salti per consigliarti
meglio. Da spento non registra nulla e cancella quello che ha raccolto."*

## 6. File

**Nuovi**

```
supabase/migrations/0024_segnali_utente.sql
src/lib/taste/profile.ts          buildTasteProfile — puro
src/lib/taste/profile.test.ts
src/lib/taste/weights.ts          pesi e decadimento — puro
src/lib/taste/surfaces.ts         elenco chiuso delle superfici — puro
src/lib/taste/seed.ts             candidati + pickSeedGrid (puro)
src/lib/taste/seed.test.ts
src/lib/taste/refresh.ts          server-only: legge, calcola, upsert (job + onboarding)
src/lib/taste/events.ts           validazione dei lotti di /api/events — puro
src/lib/taste/events.test.ts
src/lib/taste/seed-source.ts      server-only: candidati per la griglia seed
src/lib/taste/queries.ts          server-only: getPreferences, getTasteProfile
supabase/migrations/0025_cron_taste.sql
src/lib/taste/log.ts              server-only: logSignal() per le action esplicite
src/app/api/events/route.ts
src/components/signals/SignalsProvider.tsx
src/app/onboarding/SeedGrid.tsx
scripts/taste-dump.ts             stampa il profilo di un utente (collaudo)
```

**Toccati**

```
src/app/onboarding/page.tsx             carica la griglia seed
src/app/onboarding/OnboardingForm.tsx   due passi, anno di nascita
src/app/onboarding/actions.ts           salva anno + seed, ricalcola il profilo
src/app/(app)/layout.tsx                monta SignalsProvider con il flag
src/app/(app)/profile/ProfileEditor.tsx + actions.ts   interruttore
src/components/ui/PosterCard.tsx        prop `signal`
src/components/home/ContinueCard.tsx, HeroCarousel.tsx  prop `signal`
src/components/title/ProviderButton.tsx segnala provider_open
src/lib/watch/actions.ts                logSignal su library_add e rate
src/app/api/jobs/[job]/route.ts         taste-refresh, events-prune
src/types/database.ts                   rigenerato dopo la migration
CLAUDE.md                               sezione "Algoritmo: segnali utente (fase A)"
```

## 7. Verifica

**Test puri (Vitest)**: pesi e decadimento, normalizzazione, skip da impression senza apertura,
`pickSeedGrid` (mix film/serie, tetto per genere, niente doppioni), parsing di `data-signal`.

**Con i servizi veri** — la lezione della fase B è che i difetti gravi erano tutti "sbaglia in
silenzio" e **nessuno era visibile a suite verde**:

1. `pnpm build` + `next start` su porta propria, login con l'utente di prova, home scorsa su
   Chrome: contare le righe scritte in `user_events` e verificare che una seconda scorsa **non**
   ne aggiunga (indice unico).
2. Onboarding completo su un utente nuovo, iPhone 13 e desktop 1440 con Playwright: due passi,
   "Salta" funzionante, `user_preferences` e `user_seed_picks` scritte.
3. `scripts/taste-dump.ts` sull'utente di prova: il profilo deve somigliare alla sua libreria
   (se non somiglia, i pesi sono sbagliati e si vede solo così).
4. Interruttore spento → `user_events` e `user_taste` vuote per quell'utente, e nessuna richiesta
   a `/api/events` nel pannello di rete.
5. Job a mano: `curl -H "x-jobs-secret: …" .../api/jobs/taste-refresh` → `job_runs` con esito, e
   `user_taste.updated_at` aggiornata.

## 8. Rischi noti

- **Volume delle impression.** Una home lunga mostra ~200 copertine. Con la dedup per sessione e
  l'indice unico, un utente attivo scrive nell'ordine di qualche centinaio di righe al giorno; a
  90 giorni di ritenzione e ~80 byte per riga il conto resta ampiamente dentro il piano Supabase.
  Se il numero di utenti crescesse, la leva è la ritenzione, non lo schema.
- **`sendBeacon` non ritorna errori**: il client non saprà mai se un batch è andato perso, ed è
  giusto così — la telemetria non deve mai rallentare o disturbare l'app. Chi conta le righe è il
  collaudo, non il telefono.
- **Il primo profilo è povero.** Con soli seed pick la `massa` è bassa; è il segnale che la fase C
  dovrà leggere per non fingere sicurezza che non ha.
- **Numerazione migration**: `0020` e `0023` esistono già due volte per lavoro parallelo fra
  sessioni. Uso `0024`, che è libero; se un'altra sessione lo prendesse nel frattempo, si rinomina
  prima di applicare — Supabase tiene la cronologia per nome completo.
