# Algoritmo Zapp — Fase B: catalogo, classifiche settimanali e ZappScore

Data: 2026-09-07. Stato: approvato in chat (due numeri separati — ZappScore pubblico + affinità
personale; motore periodico su `pg_cron` di Supabase; MDBList a livello Supporter; perimetro
visibile completo: voto ovunque + scaffali classifica + badge sulle locandine).

## Il quadro: dove sta questa fase

L'algoritmo di Zapp è cinque sottosistemi indipendenti. Questa spec copre **solo il secondo**.

| | Sottosistema | Cosa fa | Stato |
|---|---|---|---|
| A | Segnali utente | età in onboarding, telemetria implicita (impression/click/skip/dismiss), profilo di gusto materializzato | da fare |
| **B** | **Catalogo & ZappScore** | **classifiche settimanali per piattaforma + voto aggregato multi-fonte** | **questa spec** |
| C | Motore di ranking | candidate generation → scoring → diversità → spiegazione | da fare |
| D | Home dinamica | rail personalizzati, ordine dei rail per utente | da fare |
| E | Loop sociale | segnali degli amici, inviti, notifiche, ritorno giornaliero | da fare |

## Obiettivo

1. **Un voto di cui fidarsi.** Oggi l'app mostra `titles.vote_average`: il solo voto TMDB, spesso
   su poche migliaia di voti, che premia i titoli di nicchia gonfiati e non sa nulla della critica.
   Al suo posto lo **ZappScore**: media bayesiana pesata di IMDb, TMDB, Trakt, Letterboxd,
   Rotten Tomatoes (critici e pubblico), Metacritic e RogerEbert, col numero di voti reali accanto.
2. **Sapere cosa va adesso.** Classifica **Netflix Italia** settimanale (dato ufficiale) e
   classifiche per Prime Video / Disney+ / Apple TV+ (stima JustWatch IT), con storico per
   calcolare chi **sale** e chi **scende**.
3. **Farlo vedere.** ZappScore ovunque compare un voto, pannello "da dove viene" nella scheda,
   nuovi scaffali di classifica in Home e Scopri, badge `#3 su Netflix` / `↑ in salita` sulle
   locandine.

**Fuori scope, e ci resta**: qualunque personalizzazione per utente (l'affinità "per te 92%" è la
fase C — qui predispongo solo il posto dove andrà), età e telemetria (fase A), consigli degli
amici e notifiche (fase E). Nessuno scraping di IMDb, Rotten Tomatoes, Metacritic o delle
piattaforme: tutto passa da API pubbliche o file pubblicati dai titolari stessi.

## 1. Fonti dati (verificate il 2026-09-07, non a memoria)

| Fonte | Cosa dà | Auth | Limiti | Come verificata |
|---|---|---|---|---|
| **MDBList** `api.mdblist.com` | voti di imdb, tmdb, trakt, letterboxd, tomatoes (RT critici), audience (RT pubblico), metacritic, rogerebert + `score`/`score_average`; per le serie anche `episode_ratings` per stagione/episodio | `X-API-Key` o `?apikey=` | **Supporter 1 €/mese: 10 000 richieste/giorno**, batch fino a 100 id (gratis: 1 000/giorno, batch 10) | schema OpenAPI scaricato da `https://api.mdblist.com/schema/`; limiti da `docs.mdblist.com/docs/api` |
| **Netflix Tudum** | Top 10 **ufficiale** Film e TV **per paese, Italia inclusa**, settimanale, con settimane cumulative in classifica | nessuna, serve User-Agent da browser | file di 31 MB (~5 MB con gzip) | scaricato: 5 380 righe `IT`, ultima settimana `2026-08-23` |
| **JustWatch GraphQL** | popolarità per provider in **country IT** | nessuna | già throttlata in casa | client già in `src/lib/links/justwatch.ts` |
| **TMDB** `discover` | ripiego per provider: `with_watch_providers` + `sort_by=popularity.desc`, region IT | token già presente | già throttlato a 15 req/s | client già in `src/lib/tmdb/client.ts` |

### Dettaglio MDBList

- Singolo: `GET /{provider}/{media_type}/{id}/` — provider fra `imdb|tmdb|trakt|tvdb|mal|mdblist`,
  media_type `movie|show`. Query `append_to_response=review,keyword,extra,recommendations,episode_ratings`.
  Risposta: `{id, imdb_id, title, year, type, score, ratings: [...], streams: [...]}`.
- **Batch**: `POST /{provider}/{media_type}/` con body `{ "ids": [278, 238, 424] }`. È la chiamata
  che useremo: **un solo consumo di quota per 100 titoli**.
- `POST /rating/{media_type}/{source}` esiste ma restituisce **una sola fonte per chiamata** —
  inutile per noi, che le vogliamo tutte insieme. Non lo usiamo.
- `GET /justwatch/streaming-charts/{movie|show}?provider=nfx|amp|dnp&period=weekly` esiste, ma i
  `country` documentati sono US/GB/CA/AU/DE: **niente Italia**. Ci proviamo con `locale=it_IT` in
  fase di implementazione; se non risponde, l'Italia la prendiamo dal nostro client JustWatch.

> **Da verificare con la chiave in mano, alla prima riga di codice**: la forma esatta degli oggetti
> dentro `ratings` (lo schema OpenAPI li dichiara `type: object` senza proprietà). La forma attesa è
> `{source, value, score, votes, popular}`. Il parser va scritto **difensivo** (vedi §3.4) e la
> fixture del test va presa da una risposta reale, non inventata.

### Dettaglio Netflix Tudum

```
GET https://www.netflix.com/tudum/top10/data/all-weeks-countries.tsv
User-Agent: <UA da browser>          # senza, risponde 403
Accept-Encoding: gzip
```

Colonne: `country_name, country_iso2, week, category, weekly_rank, show_title, season_title,
cumulative_weeks_in_top_10`. `category` ∈ `Films | TV`. `week` è la domenica della settimana
(`2026-08-23`). Netflix pubblica il **martedì** e i dati hanno ~2 settimane di ritardo: normale,
non è un bug da inseguire.

I titoli arrivano **in inglese e senza id TMDB** (`Facing El Chapo`, `Outer Banks`,
`I Will Find You: Limited Series`). Vanno risolti (§4.3).

## 2. Schema DB — migration `0020_ratings_charts.sql`

Nessuna colonna nuova su `titles`: quella riga viene **riscritta interamente** da `upsertTitle`
a ogni rinfresco del cache TMDB (7 giorni), e i voti sparirebbero. Due tabelle a parte.

```sql
-- Voti aggregati per titolo. Scritta solo dal service client (job + riempimento pigro).
create table public.title_ratings (
  title_id      bigint not null,
  media_type    public.media_type not null,
  sources       jsonb not null default '{}'::jsonb,  -- {imdb:{value,votes}, tomatoes:{...}, ...}
  zapp_score    numeric(3,1),        -- 0.0-10.0, null quando nessuna fonte è utilizzabile
  zapp_votes    bigint not null default 0,   -- somma dei voti del pubblico
  zapp_critics  integer not null default 0,  -- numero di critici sommati
  confidence    text not null default 'low', -- low | medium | high
  mdblist_miss  boolean not null default false, -- MDBList non conosce il titolo: non riprovarlo ogni ora
  fetched_at    timestamptz not null default now(),
  primary key (title_id, media_type),
  foreign key (title_id, media_type) references public.titles (id, media_type) on delete cascade
);
create index title_ratings_score_idx on public.title_ratings (zapp_score desc nulls last)
  where confidence = 'high';
create index title_ratings_fetched_idx on public.title_ratings (fetched_at);

-- Classifiche. Una riga per (fonte, provider, paese, periodo, posizione).
create table public.title_charts (
  id            bigserial primary key,
  source        text not null,        -- 'netflix_tudum' | 'justwatch' | 'tmdb'
  provider_id   integer not null,     -- id TMDB del provider: 8 Netflix, 119 Prime, 337 Disney+, 350 Apple TV+
  country       text not null default 'IT',
  media_type    public.media_type not null,
  period        date not null,        -- settimana (domenica) per Netflix, giorno per JustWatch
  rank          integer not null,     -- 1..N
  title_id      bigint,               -- null finché non risolto su TMDB
  raw_title     text not null,        -- come lo scrive la fonte, serve alla risoluzione e al debug
  raw_season    text,                 -- 'Outer Banks: Season 5' -> per riconoscere la stagione
  weeks_in_chart integer,
  momentum      integer,              -- posizioni guadagnate sul periodo precedente
  resolve_tries smallint not null default 0,
  resolved_at   timestamptz,
  created_at    timestamptz not null default now(),
  unique (source, provider_id, country, media_type, period, rank),
  foreign key (title_id, media_type) references public.titles (id, media_type) on delete set null
);
create index title_charts_latest_idx
  on public.title_charts (source, provider_id, media_type, period desc, rank);
create index title_charts_title_idx on public.title_charts (title_id, media_type)
  where title_id is not null;
create index title_charts_unresolved_idx on public.title_charts (period desc)
  where title_id is null and resolve_tries < 5;

-- Registro delle esecuzioni: senza, un job che smette di girare non se ne accorge nessuno.
create table public.job_runs (
  id         bigserial primary key,
  job        text not null,
  started_at timestamptz not null default now(),
  ended_at   timestamptz,
  ok         boolean,
  detail     jsonb
);
create index job_runs_job_idx on public.job_runs (job, started_at desc);

alter table public.title_ratings enable row level security;
alter table public.title_charts  enable row level security;
alter table public.job_runs      enable row level security;

-- Stessa regola di `titles`: lettura per tutti, scrittura solo col service client.
create policy "title_ratings_select_all" on public.title_ratings for select using (true);
create policy "title_charts_select_all"  on public.title_charts  for select using (true);
-- `job_runs` non ha policy di select: è roba di servizio, la legge solo il service client.
```

Dopo la migration: **rigenerare `src/types/database.ts`** (`supabase gen types typescript`).

## 3. Lo ZappScore — funzione pura `src/lib/ratings/score.ts`

Vive fuori dal DB e fuori dalla rete: entra un oggetto di voti grezzi, esce un punteggio. Test
Vitest come `hero-rank.ts`, `favorites.ts`, `netflix-title.ts`.

### 3.1 Normalizzazione

Ogni fonte ha una scala sua. Tutte portate a 0-10:

| fonte | scala nativa | -> 0-10 | bacino | `m` (soglia) | `C` (media globale) |
|---|---|---|---|---|---|
| `imdb` | 0-10 | identità | pubblico | 2 500 | 6,7 |
| `tmdb` | 0-10 | identità | pubblico | 500 | 6,6 |
| `trakt` | 0-10 | identità | pubblico | 500 | 7,2 |
| `letterboxd` | 0-5 | ×2 | pubblico | 1 000 | 6,4 |
| `audience` (RT pubblico) | 0-100 | ÷10 | pubblico | 1 000 | 6,6 |
| `tomatoes` (RT critici) | 0-100 | ÷10 | critica | 20 | 6,2 |
| `metacritic` | 0-100 | ÷10 | critica | 12 | 6,1 |
| `rogerebert` | 0-4 | ×2,5 | critica | 1 | 6,5 |

I valori `C` sono **stime iniziali dichiarate come tali**: vanno ricalibrate con una query sul
nostro `title_ratings` appena supera le 5 000 righe. La costante sta in un unico posto,
`SOURCE_CALIBRATION`, con un commento che dice quando è stata calcolata l'ultima volta.

### 3.2 Tiraggio bayesiano (uccide i voti gonfiati)

Per ogni fonte con `votes > 0`:

```
adjusted = (v / (v + m)) * R  +  (m / (v + m)) * C
```

Un 10/10 con 3 voti su TMDB (`m` = 500) diventa 6,62: praticamente la media. Un 9,2 con 500 000
voti su IMDb resta 9,18. È esattamente il problema che rende sbagliati i film mostrati oggi.

### 3.3 Due bacini, pesati in logaritmo

Il problema vero: IMDb ha 1,2 milioni di voti, Metacritic ne ha 67. Pesare linearmente sui voti
significa che **esiste solo IMDb**; pesare tutti uguale significa che 67 critici contano quanto un
milione di persone. Quindi:

```
peso(fonte) = log10(1 + votes)
```

IMDb 1,2 M -> 6,08 · Letterboxd 890 k -> 5,95 · TMDB 11 k -> 4,04. Rapporti sensati, nessuno sparisce.

```
pubblico     = somma(adjusted * peso) / somma(peso)   sulle 5 fonti del pubblico
critica      = somma(adjusted * peso) / somma(peso)   sulle 3 fonti della critica
massaCritica = somma(peso) delle fonti critica
pesoCritica  = 0,30 * min(1, massaCritica / 2,5)
zappScore    = (1 - pesoCritica) * pubblico + pesoCritica * critica
```

- Nessuna fonte di critica -> `pesoCritica` = 0: il pubblico prende tutto, **senza distorsione**.
- Solo RogerEbert (1 critico, peso 0,30) -> `pesoCritica` ≈ 0,036: un singolo critico non muove il
  voto di un film. RT (410 critici) + Metacritic (67) -> massa 4,4 -> peso pieno 0,30.
- Nessuna fonte pubblica (rarissimo) -> solo critica, `confidence` forzata a `low`.
- Nessuna fonte utilizzabile -> `zappScore = null`. La UI ricade sul voto TMDB, e se manca anche
  quello non mostra niente. **Mai un numero inventato.**

### 3.4 Uscita

```ts
export interface ZappScore {
  score: number | null;      // arrotondato a 1 decimale
  votes: number;             // somma dei voti reali del pubblico -> il "(2,5M voti)" mostrato
  critics: number;           // numero di critici sommati
  confidence: "low" | "medium" | "high";
  breakdown: Array<{ source: RatingSource; value: number; votes: number; scale: string }>;
}
```

`confidence`: `high` con >= 10 000 voti **e** >= 2 fonti pubbliche; `medium` con >= 1 000 voti;
altrimenti `low`. Sotto `medium` la UI scrive "poche valutazioni" invece di fingere precisione.

Il parser `parseMdblistRatings(raw): SourceValues` è **anch'esso puro e difensivo**: sorgenti
sconosciute ignorate, valori fuori scala scartati, `votes` mancanti = 0 (fonte esclusa dai bacini
pesati ma tenuta nel `breakdown`). Stessa filosofia di `parseTrailers` in `trailers/stored.ts`:
forma inattesa -> si ricalcola, non si esplode.

## 4. Ingestione

### 4.1 `src/lib/ratings/mdblist.ts` (`server-only`)

- `fetchRatingsBatch(ids: number[], mediaType)` -> `POST /tmdb/{movie|show}/` con `{ids}`, batch di
  **100** (Supporter). Timeout 8 s, throttle 4 richieste/s come `cinema/mymovies/client.ts`.
- Guardia di quota: contatore giornaliero in memoria + rispetto del `429` (`Retry-After`); superata
  la soglia il job si ferma e scrive `job_runs.detail`, **non ritenta a raffica**.
- Un id che torna vuoto -> `mdblist_miss = true`, riprovato solo dopo 30 giorni.
- Se il batch da 100 viene rifiutato (400/413), scende a 50, poi a 10: il limite reale del piano
  Supporter va confermato a runtime, non dato per buono.
- Interfaccia `RatingsProvider` con un solo metodo, così sostituire MDBList con OMDb (o affiancarlo)
  è un file nuovo e nessuna modifica altrove. MDBList è un fornitore piccolo: se sparisce, restano
  gli ultimi valori in `title_ratings.sources` e si cambia implementazione.

### 4.2 `src/lib/charts/netflix.ts` (`server-only`)

`fetchNetflixItaly()`: scarica il TSV con `Accept-Encoding: gzip` e **lo processa a flusso, riga per
riga**, tenendo solo `country_iso2 === "IT"` della settimana più recente (20 righe). 31 MB non
entrano comodi nella memoria di una funzione: mai un `await res.text()`.

Il parsing è **puro e testato** (`parseTudumRow`, `latestWeek`, `chartRowsFor`) su una fixture
ridotta in `__fixtures__/`, come `cinema/mymovies/parse.ts`.

### 4.3 `src/lib/charts/resolve.ts` — dal titolo inglese all'id TMDB

Il pezzo delicato. Riusa **integralmente** ciò che è già scritto e testato per l'import Netflix:
`normalizeTitle` e `titleSimilarity` da `src/lib/import/netflix-title.ts`, `searchMovies`/`searchTv`
da `src/lib/tmdb/client.ts`, soglia `MATCH_THRESHOLD` 0,85.

Due differenze rispetto all'import:

1. `season_title` (`Outer Banks: Season 5`, `I Will Find You: Limited Series`) va **tolto** prima
   di cercare: la classifica premia la serie, non la stagione. Il numero di stagione lo teniamo in
   `raw_season` perché servirà alla fase C ("la stagione 5 è appena uscita").
2. Il titolo è **inglese** mentre TMDB ci risponde in `it-IT`: la ricerca va fatta **anche** con
   `language=en-US`, e il confronto contro `title` **e** `original_title`. Senza questo, "The Last
   House" non trova "L'ultima casa".

Falliti: `resolve_tries + 1`, riprovati per 5 giorni, poi lasciati stare — la riga resta comunque
in tabella col `raw_title`, così la classifica è ispezionabile anche dove il match non c'è.

### 4.4 `src/lib/charts/justwatch.ts`

Estende il client GraphQL già in `src/lib/links/justwatch.ts` con la query dei titoli popolari per
`country: IT` filtrata per package (`nfx`, `amp`, `dnp`, `atp`). Provider che non risponde ->
ripiego su TMDB `discover` con `with_watch_providers` + `sort_by=popularity.desc`, e la riga viene
scritta con `source = 'tmdb'`: **l'origine del dato resta sempre leggibile**, e la UI può dire
"stima" dove non è una classifica ufficiale.

### 4.5 Momentum

Calcolato quando si scrive un periodo nuovo, confrontando col periodo precedente della stessa
`(source, provider_id, media_type)`:

- già in classifica -> `momentum = rankPrecedente - rank`
- ingresso nuovo -> `momentum = 11 - rank` (un debutto al #1 vale +10)
- uscito dalla classifica -> nessuna riga, quindi nessun momentum: giusto così

Funzione pura `computeMomentum(previous, current)`, con test.

## 5. Il motore periodico — `pg_cron` -> route protette

### 5.1 Le route

`src/app/api/jobs/[job]/route.ts`, runtime Node, `export const maxDuration = 60`.
Autenticazione: header `x-jobs-secret` confrontato con `JOBS_SECRET` in **tempo costante**
(`crypto.timingSafeEqual` su buffer di pari lunghezza; lunghezza diversa = rifiuto immediato).
Nessun segreto in query string: finirebbe nei log di Vercel. Ogni esecuzione apre e chiude una riga
in `job_runs`; un job già in corso (`ended_at is null` da meno di 15 minuti) esce subito con 409,
così due `pg_cron` sovrapposti non si pestano i piedi.

### 5.2 Il calendario

| Job | Quando (UTC) | Cosa fa |
|---|---|---|
| `charts-netflix` | martedì e mercoledì 04:00 | scarica il TSV, scrive la settimana nuova se non c'è già (due giorni = un tentativo di riserva se il martedì Netflix è in ritardo) |
| `charts-justwatch` | ogni giorno 05:00 | classifiche per Prime/Disney+/Apple TV+/Netflix da JustWatch IT |
| `charts-resolve` | ogni giorno 05:30 | risolve i `title_id` mancanti e ricalcola il momentum |
| `ratings-refresh` | ogni ora | 5 batch da 100 id = **5 richieste** e 500 titoli aggiornati per ora, cioè 120 richieste e 12 000 titoli al giorno: il 1,2% delle 10 000 richieste/giorno del piano Supporter |

Lo schedule sta in `supabase/migrations/0021_jobs_cron.sql` con `cron.schedule` + `net.http_post`,
e il segreto **non** finisce nella migration: si legge da `vault` (Supabase Vault), che è il posto
previsto per questo. La migration documenta il comando `vault.create_secret` da lanciare una volta.

### 5.3 Chi ha diritto ai voti (la coda di `ratings-refresh`)

La quota è generosa ma non infinita. Ordine di priorità, in una sola query:

1. titoli in `title_charts` del periodo corrente — TTL 7 giorni
2. titoli presenti in almeno una `watch_entries` — TTL 7 giorni
3. tutti gli altri titoli in `titles` — TTL 30 giorni

più `mdblist_miss = false` e `fetched_at` più vecchio per primo. In più, **riempimento pigro**: una
scheda titolo aperta senza riga in `title_ratings` ne chiede una al volo (una richiesta, dentro il
`Suspense` che già esiste per palette/link/recensioni, quindi non rallenta il primo chunk).

## 6. Lettura

`src/lib/ratings/queries.ts` (`server-only`):

- `getRatings(keys)` — batch su `(title_id, media_type)`, React `cache()`. Le liste fanno **una**
  query per pagina, non una per riga. Righe da ~200 byte: nessun problema di peso (la regola
  "mai `titles.raw` nelle liste" resta intatta, qui non tocchiamo `titles`).
- `getChartRow(titleId, mediaType)` — posizione e momentum del periodo corrente, per il badge.
- `getChart(source, providerId, mediaType)` — le righe di uno scaffale, già unite a
  `TITLE_LIST_COLUMNS` di `watch/queries.ts` (stesse colonne, stessa dieta).

## 7. UI

### 7.1 Il voto

- **`PosterCard`** ha già la prop `rating`: passa a ricevere lo ZappScore invece di
  `vote_average`. Nessun cambiamento di forma.
- **`TitleAbout`** (scheda titolo): il blocco voto diventa `RatingsPanel` — ZappScore grande, voti
  totali, e al tocco l'elenco per fonte con le scale native (`IMDb 8,5 · 1,2 M voti`,
  `Rotten Tomatoes 92% · 410 critici`, `Metacritic 79 · 67 critici`). Con `confidence: "low"` il
  numero c'è ma sotto scrive "poche valutazioni".
- **`HeroCarousel`** e i risultati di ricerca: `★ 8,4` dallo ZappScore.
- Ovunque manchi la riga in `title_ratings`, **ripiego sul voto TMDB di oggi**: nessuna regressione
  visiva mentre il catalogo si riempie.
- Il posto per `per te 92%` si apre **ora**: `PosterCard` e `RatingsPanel` accettano
  `affinity?: number | null` e non rendono nulla finché è `null`. Così la fase C accende
  l'affinità senza rimettere le mani sui componenti.

### 7.2 Gli scaffali

In `DiscoverSections` (Scopri e, con `byType`, Home), sopra gli scaffali TMDB attuali:

1. **Top 10 su Netflix in Italia** — `source = 'netflix_tudum'`, settimana corrente
2. **Più visti su Prime Video** / **su Disney+** / **su Apple TV+** — JustWatch IT, resi solo se la
   classifica esiste davvero (uno scaffale vuoto non compare, come già fa `OneShelf`)
3. **In salita questa settimana** — titoli con `momentum >= 2` in **almeno una** delle fonti,
   ordinati per momentum decrescente e deduplicati per `(title_id, media_type)`
4. **I meglio votati su Zapp** — `zapp_score desc` con `confidence = 'high'`: **sostituisce**
   "Film più amati di sempre" e "Serie più amate di sempre", che oggi ordinano per
   `vote_average` TMDB con `vote_count >= 5000` — cioè esattamente la classifica che hai detto
   essere sbagliata.

Ogni scaffale rispetta `HomeTypeGate`/`byType` come gli altri: film e serie già divisi dal server,
nessun ritorno al server al cambio scheda.

### 7.3 I badge

Sulla locandina, in alto a sinistra, una pillola `.glass`: `#3 su Netflix` quando il titolo è nella
classifica corrente, `↑ in salita` quando `momentum >= 2` e non è in Top 10. **Uno solo alla
volta**, mai due pillole sovrapposte; la classifica ha la precedenza.

### 7.4 Attribuzione

Sotto il `RatingsPanel`: «Voti da IMDb, Rotten Tomatoes, Metacritic, Letterboxd, TMDB e Trakt via
MDBList». L'attribuzione TMDB nel footer del profilo resta dov'è (regola del progetto).

## 8. Errori e degradazione

Ogni pezzo cade da solo, senza portarsi dietro gli altri:

| Cosa cade | Cosa succede |
|---|---|
| MDBList giù o quota finita | restano i voti in `title_ratings` (fino a 30 giorni), la UI non cambia; `job_runs.ok = false` |
| Netflix cambia URL o forma del TSV | il parser puro fallisce, il job scrive l'errore, resta la settimana precedente in tabella; lo scaffale mostra dati vecchi con la data, mai una lista vuota |
| JustWatch non risponde per un provider | ripiego TMDB `discover`, riga con `source = 'tmdb'` |
| Titolo non risolto su TMDB | riga senza `title_id`: **saltata** negli scaffali, ma leggibile in tabella per capire perché |
| `pg_cron` smette di girare | `job_runs` lo dice a colpo d'occhio (`select job, max(started_at) group by job`) |

Nessun `throw` arriva in pagina: le query di lettura ricadono sempre sul comportamento di oggi.

## 9. Test

Vitest, solo funzioni pure — la regola del progetto:

- `src/lib/ratings/score.test.ts` — tiraggio bayesiano (10/10 con 3 voti -> circa la media), pesi
  logaritmici, bacino critica vuoto, solo RogerEbert, nessuna fonte, soglie di `confidence`,
  arrotondamento.
- `src/lib/ratings/parse.test.ts` — `parseMdblistRatings` su **fixture reale**, più: fonte
  sconosciuta, valore fuori scala, `votes` mancante, array vuoto, campo assente.
- `src/lib/charts/netflix.test.ts` — `parseTudumRow`, `latestWeek`, filtro IT, `season_title`
  `N/A`, righe malformate, su fixture ridotta in `__fixtures__/`.
- `src/lib/charts/resolve.test.ts` — pulizia del `season_title` (`: Season 5`, `: Limited Series`,
  `: Part 2`), scelta fra `title` e `original_title`.
- `src/lib/charts/momentum.test.ts` — salita, discesa, debutto, invariato.

Il resto (`route.ts`, `mdblist.ts`, `queries.ts`) si verifica con
`pnpm typecheck && pnpm lint && pnpm build`. **La build va lanciata in un worktree separato**: mai
due `next build` nello stesso `.next` (regola già in CLAUDE.md).

## 10. Variabili d'ambiente

| Variabile | Dove | A cosa serve |
|---|---|---|
| `MDBLIST_API_KEY` | server (Vercel: Production **e** Preview) | chiave Supporter, da `mdblist.com` -> Preferences |
| `JOBS_SECRET` | server + Supabase Vault | protegge `/api/jobs/*`; stringa casuale di almeno 32 byte |

Da aggiungere a `.env.example` con lo stesso schema `INSERISCI...` degli altri, e il codice deve
alzare un errore se mancano o cominciano ancora per `INSERISCI` (come già fa per TMDB e Supabase).
La CSP non cambia: MDBList, Netflix e JustWatch sono chiamati **solo dal server**.

## 11. Ordine di lavoro

1. Migration `0020_ratings_charts.sql` + rigenerazione di `src/types/database.ts`
2. `score.ts` + `parse.ts` con i test — puro, verificabile subito, nessuna rete
3. `mdblist.ts` + riempimento pigro nella scheda titolo -> **il primo ZappScore visibile**
4. `RatingsPanel` e la sostituzione del voto nelle card
5. `netflix.ts` + `resolve.ts` + `momentum.ts` con i test
6. Route `/api/jobs/[job]` + migration `0021_jobs_cron.sql` + segreto nel Vault
7. `justwatch.ts` per gli altri provider
8. Scaffali di classifica e badge

Ogni passo è deployabile da solo e non rompe niente di ciò che c'è prima.

## 12. Punti da verificare durante l'implementazione

1. **Forma di `ratings` in MDBList** — prima riga di codice, con la chiave in mano. La fixture dei
   test si prende da una risposta vera.
2. **Dimensione reale del batch** sul piano Supporter (100 dichiarati, da confermare).
3. **`locale=it_IT`** su `/justwatch/streaming-charts`: se funziona, è una chiamata sola al posto di
   quattro alla nostra GraphQL.
4. **31 MB in 60 secondi** su una funzione Vercel Hobby: misurare il job Netflix al primo giro. Se
   non ce la fa, il piano B è spostare quel job dentro una Supabase Edge Function (nessun limite di
   60 s) che scrive direttamente in tabella.
5. **Ricalibrare `SOURCE_CALIBRATION`** con una query sui nostri dati veri appena `title_ratings`
   supera le 5 000 righe.
