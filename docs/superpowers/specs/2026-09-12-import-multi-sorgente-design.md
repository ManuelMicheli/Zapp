# Import multi-sorgente — Letterboxd, TV Time, file JSON/CSV

Data: 2026-09-12 · Stato: progettato, non implementato

## 1. Perché

Oggi Zapp importa da una sola sorgente, Netflix, e solo la cronologia di visione.
Chi arriva da Letterboxd (film e voti) o da TV Time (serie, episodio per episodio)
deve rifare a mano anni di libreria, e chi esporta i propri dati da Zapp — l'export
GDPR del sottoprogetto "conformità legale" — non ha modo di rimetterli dentro.

La pipeline esistente è già quasi agnostica: dopo il parsing del CSV, i candidati
passano per il riconoscimento TMDB e la scrittura senza sapere da dove vengono. Il
lavoro è quindi **generalizzare l'ingresso**, non riscrivere l'import.

## 2. Obiettivo

Quattro sorgenti dietro una sola pipeline:

| Sorgente | File | Porta dentro |
| --- | --- | --- |
| Netflix | `NetflixViewingHistory.csv` | visti, progresso serie |
| Letterboxd | zip dell'export o i singoli `watched/ratings/diary/watchlist.csv` | film visti, voti, date di visione, watchlist |
| TV Time | csv dell'export (zip o file singolo) | serie e film visti, episodio, voti, date |
| File | `.json` (backup Zapp o elenco generico) o `.csv` generico | tutto quello che il file dichiara |

### Non-obiettivi

- **Non** si costruisce qui l'export `GET /api/account/export`: è del sottoprogetto
  conformità legale. Questa spec ne fissa solo il *formato* che l'import sa rileggere.
- Niente recensioni: il `reviews.csv` di Letterboxd resta fuori. Una recensione
  importata comparirebbe nel feed sociale a nome dell'utente senza che l'abbia
  scritta qui; è una decisione a sé.
- Nessuna schermata di conferma titolo per titolo: l'import resta "carica e vai",
  con il chip di avanzamento sopra la barra.
- Nessun import incrementale programmato (niente sincronizzazione periodica con
  Letterboxd o TV Time).

## 3. Decisioni prese

| Decisione | Scelta | Motivo |
| --- | --- | --- |
| Struttura | una pipeline, un file per sorgente | Il filtro "mai un passo indietro" e il chunking vanno corretti in un posto solo; una sorgente nuova è un file |
| `import JSON` | backup Zapp **e** elenco generico, riconosciuti dal contenuto | L'utente carica un file, non sceglie un dialetto |
| Voti | importati, ma non sovrascrivono | La RPC fa già `rating = coalesce(watch_entries.rating, excluded.rating)`: il voto dato in Zapp vince sempre |
| Watchlist | diventa `status = 'want'` | Zapp ha già lo stato; è la metà del valore di Letterboxd |
| Date | dal diario quando c'è, altrimenti dalla data di export | `last_watched_at` ordina home e libreria: una data sbagliata si vede subito |
| Zip | accettato, insieme ai csv singoli | L'export arriva zippato; costringere ad aprirlo è il punto dove si sbaglia file |
| Formato TV Time | il tracciato del campione in `public/info/tvtime_export_example.csv` | Fornito dall'utente; le colonne si leggono per nome, non per posizione |
| Voce nel profilo | una riga sola → hub `/import` | Impostazioni non cresce a ogni sorgente nuova |

## 4. Architettura

### 4.1 Il nucleo

```
src/lib/import/
  candidate.ts        ImportCandidate + ImportProposal + mergeProposals
  match.ts            riconoscimento TMDB (l'attuale netflix.ts)
  archive.ts          zip → mappa nome file → testo (fflate)
  sources/
    registry.ts       metadati delle sorgenti (slug, marchio, istruzioni, estensioni)
    netflix.ts        l'attuale netflix-rows.ts
    letterboxd.ts
    tvtime.ts
    generic.ts        json backup Zapp | json/csv generico
  netflix-title.ts    invariato, nome compreso
```

`netflix-title.ts` **non si tocca e non si rinomina**: lo importano
`lib/charts/resolve.ts`, `lib/cinema/booking/{match,webtic}.ts` e
`lib/scrobble/match.ts`. È il matcher di titoli, non un pezzo di Netflix; il nome è
storico ma rinominarlo qui allarga il diff su quattro sottosistemi estranei per
zero valore.

Ogni sorgente espone la stessa firma:

```ts
export interface SourceFile {
  name: string;   // nome originale, serve a Letterboxd per capire quale csv è
  text: string;
}

export interface ParsedSource {
  candidates: ImportCandidate[];
  rows: number;        // righe lette, per la riga in `imports`
  error?: string;      // messaggio pronto per l'utente
}

export function parse(files: SourceFile[]): ParsedSource;
```

Funzioni pure, niente `server-only`: sono la parte coperta da Vitest.

### 4.2 Il candidato cresce di tre campi

```ts
export interface ImportCandidate {
  // … campi di oggi (key, netflixTitle, kind, season, episode, lastDate,
  //    rowCount, altTitle, fallbackShow, episodeTitles)

  /** Già noto (TV Time, backup Zapp): salta del tutto il riconoscimento TMDB. */
  tmdbId?: number | null;
  /** 1-10 sulla scala di Zapp, già convertito dalla sorgente. */
  rating?: number | null;
  /** Default 'watched'. 'want' = watchlist, non è mai stato visto. */
  status?: "watched" | "want";
}
```

`netflixTitle` resta il nome del campo — è il titolo come lo scrive la sorgente, e
rinominarlo tocca matcher e test senza cambiare comportamento. Il commento lo dice.

I candidati con `tmdbId` valorizzato saltano `matchCandidates` e vanno diritti alla
scrittura: un export TV Time da 2000 righe non fa **nessuna** chiamata TMDB in fase
di riconoscimento, solo le `getOrFetchTitle` della scrittura. È il guadagno più
grosso di tutta la feature.

### 4.3 Le sorgenti, una per una

**Netflix** — il parser di oggi, spostato. Nessun cambiamento di comportamento.

**Letterboxd** — quattro file, uniti per chiave `titolo+anno`:

| File | Colonne usate | Effetto |
| --- | --- | --- |
| `watched.csv` | Name, Year, Date | film visto |
| `ratings.csv` | Name, Year, Rating | voto 0,5-5 → `rating = Math.round(stelle * 2)` |
| `diary.csv` | Name, Year, Watched Date | data vera di visione, vince su quella di `watched.csv` |
| `watchlist.csv` | Name, Year | `status = 'want'`, solo se non compare fra i visti |

Tutti film (`kind: "movie"`): Letterboxd non ha serie. L'anno entra nella query TMDB
e alza la precisione rispetto a Netflix, che l'anno non ce l'ha.

**TV Time** — un csv a colonne riconosciute per nome, nel tracciato del campione:

```
type,title,year,season,episode,watched_date,rating,tmdb_id,imdb_id
```

- `type`: `show`/`tv`/`series` → serie, `movie`/`film` → film
- righe della stessa serie raggruppate: vince la coppia (stagione, episodio) più
  alta, come fa `groupRows` per Netflix
- `rating` 1-5 → `× 2`; per una serie vale il voto più alto fra le righe (il voto
  in Zapp è del titolo, non dell'episodio)
- `tmdb_id` quando c'è; `imdb_id` ignorato (risolverlo costa una chiamata `find/`
  per riga e il titolo c'è già)
- colonne mancanti: si va avanti con quelle che ci sono. Senza colonna titolo **e**
  senza `tmdb_id` il file è rifiutato con un messaggio che elenca le colonne attese

Le colonne si leggono per nome normalizzato (minuscole, `_`/spazi equivalenti), così
lo stesso parser regge gli export di Trakt e Simkl senza codice in più.

**File (generic.ts)** — riconoscimento dal contenuto, in quest'ordine:

1. **Backup Zapp**: oggetto JSON con un array `watch_entries` le cui righe hanno
   `title_id` e `media_type`. Si rilegge direttamente: `tmdbId`, `status`, `rating`,
   stagione, episodio, `last_watched_at`. Zero TMDB in riconoscimento.
2. **Elenco JSON generico**: array di oggetti (o oggetto con un array dentro) con un
   campo titolo (`title`/`name`/`titolo`) e, se ci sono, `year`, `type`, `season`,
   `episode`, `rating`, `date`. Stesso trattamento del CSV generico.
3. **CSV generico**: le colonne riconosciute di TV Time — è lo stesso parser.

Se nessuno dei tre attacca, errore che dice cosa manca, non "formato non valido".

> **Vincolo per l'export GDPR**: perché il punto 1 funzioni, `/api/account/export`
> deve emettere `watch_entries` come array di oggetti con almeno `title_id`,
> `media_type`, `status`, `rating`, `season_number`, `episode_number`,
> `last_watched_at`. Va annotato nella spec di conformità legale § 5.

### 4.4 Dati

**Migrazione `0043_import_sorgenti.sql`**, due cose:

```sql
alter table public.imports drop constraint imports_source_check;
alter table public.imports add constraint imports_source_check
  check (source in ('netflix', 'letterboxd', 'tvtime', 'file'));
```

e il guard sullo stato `want` dentro `import_watch_entries`: la clausola `where`
dell'`on conflict do update` oggi aggiorna **sempre** un film (`media_type = 'movie'`),
quindi una riga di watchlist riporterebbe a `want` un film già visto. Si aggiunge:

```sql
and not (excluded.status = 'want'
         and watch_entries.status in ('watching', 'watched', 'dropped'))
```

I voti **non** richiedono modifiche alla RPC: `rating = coalesce(watch_entries.rating,
excluded.rating)` fa già la cosa giusta. Basta smettere di passare `null`.

Il filtro fine resta dov'è, in `confirmImport`: le righe esistenti sono già in
memoria lì (`existingMap`), e `hasNewProgress` sa già decidere. Il guard SQL è la
rete di sicurezza, non la regola.

### 4.5 Azioni server

`src/app/(app)/import/actions.ts`, generalizzate dalle tre di oggi:

| Oggi | Domani |
| --- | --- |
| `parseNetflixCsv(formData)` | `parseImportFiles(formData)` — legge `source` dal form, smista al parser, apre lo zip |
| `matchNetflixCandidates(c)` | `matchImportCandidates(c)` — salta chi ha già `tmdbId` |
| `confirmNetflixImport(items, final)` | `confirmImport(items, final)` — `final.source` finisce in `imports.source` |

Restano identici: rate limit, `prendiPosto`/`lasciaPosto` (3 import in tutta l'app),
tetto 5 MB per file, chunking `MATCH_CHUNK_SIZE`/`CONFIRM_CHUNK_SIZE`. Il tetto vale
per file, con un tetto complessivo di 10 MB sullo zip decompresso: uno zip piccolo
che si espande in un gigabyte è l'unico modo per far male al server da qui.

`ConfirmItem` prende `rating` e `status`. `ImportProvider` non cambia struttura: passa
i due campi in più e continua a non sapere da dove arrivano.

### 4.6 UI

**Profilo** — la riga Netflix diventa:

```
[↓] Importa i tuoi dati          >
    Netflix, Letterboxd, TV Time, file
```

**`/import`** — hub: quattro schede in griglia 2×2 (una colonna sotto i 380 px), con
marchio, nome e una riga di descrizione. Stessa testata delle altre pagine di secondo
livello (`BackButton` + briciola "Profilo").

**`/import/[source]`** — la pagina di oggi resa parametrica sul registry: cambia
marchio, titolo, istruzioni numerate ed estensioni accettate; impaginazione, area di
trascinamento e bottone restano quelli. `generateStaticParams` sui quattro slug,
`notFound()` per gli altri.

`/import/netflix` continua a funzionare: è lo slug della sorgente, non un redirect da
mantenere. Il link in home (`src/app/(app)/page.tsx:113`) punta a `/import`.

L'area di caricamento accetta più file insieme (Letterboxd) e, per lo slug `file`, un
link "scarica un esempio" verso `public/info/tvtime_export_example.csv`. Il controllo
di estensione lato client resta prima della chiamata al server.

## 5. Errori

| Caso | Cosa vede l'utente |
| --- | --- |
| Estensione non accettata | "Questa pagina accetta .csv o .zip" — prima di chiamare il server |
| Zip senza file utili | "Nello zip non ci sono i csv di Letterboxd (watched.csv, ratings.csv…)" |
| CSV senza colonna titolo | "Colonne attese: title, season, episode, watched_date. Trovate: …" |
| JSON non riconosciuto | "Il file non sembra un backup Zapp né un elenco di titoli" |
| Zip che si espande oltre 10 MB | "File troppo grande" — e si smette di decomprimere, non si legge fino in fondo |
| Nessuna riga utile | Il messaggio di oggi, con il nome della sorgente |

Comportamento invariato per rete caduta e TMDB muto: il titolo resta non riconosciuto,
l'import va avanti.

## 6. Dipendenze

`fflate` (~10 KB, zero dipendenze transitive) per lo zip, usata solo lato server.
`papaparse` c'è già e regge tutti i CSV.

## 7. Come si verifica

**Vitest** (funzioni pure, il grosso della copertura):

- `letterboxd.test.ts`: unione dei quattro csv, stelle → 1-10, watchlist che non
  sovrascrive un visto, film presente sia in `watched` sia in `diary`
- `tvtime.test.ts`: sul campione vero in `public/info/` — 5 film e 5 serie, Breaking
  Bad a S1E3, voti convertiti, `tmdb_id` riportato
- `generic.test.ts`: le tre forme riconosciute più una quarta che deve fallire con
  messaggio
- `netflix-rows.test.ts`: invariati, sono la prova che il refactor non ha mosso nulla

**A mano**, su account di collaudo:

1. import del campione TV Time → 10 titoli in libreria, voti visibili, nessuna
   chiamata TMDB in fase di riconoscimento (si vede dal tempo: istantaneo)
2. stesso import ripetuto → 0 scritti, 10 saltati
3. export Letterboxd vero (zip) → film e voti dentro, watchlist in "Da vedere"
4. un film già visto e votato 9 in Zapp, presente in Letterboxd con 3 stelle → il
   voto resta 9
5. `pnpm test && pnpm typecheck && pnpm lint && NEXT_DIST_DIR=.next-import pnpm build`

## 8. Cosa resta fuori, e perché

- **Recensioni Letterboxd**: comparirebbero nel feed a nome dell'utente senza che le
  abbia scritte qui. Decisione separata.
- **`imdb_id`**: una chiamata `find/` per riga per un dato che il titolo già dà.
- **Import periodico**: nessuna delle due piattaforme ha un'API pubblica gratuita per
  farlo; servirebbe scraping, che è fuori dalle regole del progetto.
- **Trakt come sorgente dichiarata**: il parser generico la legge già; una scheda
  dedicata si aggiunge quando qualcuno la chiede (una riga nel registry).
