# Simili e "Perché hai visto X": consigli sullo stesso filone

Data: 2026-09-07 — spec approvata in chat (approccio A, sezioni 1 e 2 approvate,
sezioni 3 e 4 delegate all'implementatore).

## Il problema

Oggi le due sezioni di consiglio sono TMDB grezzo:

- **Simili** (scheda titolo) rende `raw.recommendations`, i primi 12 risultati, senza
  toccarli.
- **Perché hai visto X** (home) chiama `movie|tv/{id}/recommendations` e mostra i
  primi 20, tolti i titoli già in libreria.

Il risultato è quello che l'utente lamenta: titoli **dello stesso genere** ma di un
altro filone, e per un film appena uscito una fila di titoli di trent'anni fa. Le
raccomandazioni di TMDB sono un segnale collaborativo grezzo ("chi ha aperto questa
scheda ha aperto anche quella"), non una lettura di *cosa sia* un film.

## Cosa deve fare

1. **Simili** = titoli dello **stesso filone** del titolo aperto: stessa saga, stesso
   autore, stessi temi riconoscibili (le keyword TMDB), non "anche lui è un thriller".
2. **Perché hai visto X** = lo stesso filone, ma **pesato sul gusto** di chi guarda, e
   con sorgenti scelte: solo titoli che l'utente ha davvero finito e non ha bocciato.
3. **Rispetto dell'età**: se il seme è recente, i consigli sono recenti; un titolo
   molto più vecchio entra solo se il filone combacia davvero. Penalità morbida, mai
   una finestra netta: il capostipite di un filone deve poter comparire.

Fuori perimetro (deciso dall'utente): "Per te: <Genere>", carosello di testa, consigli
fra amici, e l'affinità personale "per te 92%" della fase C.

## Architettura

Nuovo modulo `src/lib/similar/`, sulla falsariga di `src/lib/trailers/`.

| File | Natura | Responsabilità |
| --- | --- | --- |
| `signals.ts` | puro, Vitest | Dal dettaglio TMDB ricava l'**identikit** del seme: keyword ammesse, saga, registi/creatori, sceneggiatori, primi attori, generi, anno, tipo. |
| `score.ts` | puro, Vitest | La formula: identikit + candidati + voti → classifica con il motivo di ogni titolo. Tutta la logica di prodotto sta qui e si prova senza rete. |
| `taste.ts` | puro, Vitest | Profilo di gusto dai semi della home (registi e keyword ricorrenti, voti dell'utente) e ri-ordino personale della classifica impersonale. |
| `candidates.ts` | `server-only` | Genera i candidati con le `discover` e le liste TMDB. Unico punto che parla con TMDB. |
| `store.ts` | `server-only` | Legge/scrive `title_similar` col service client; `parseSimilar` (puro) valida il JSON. |
| `similar.ts` | `server-only`, React `cache()` | Facciata: `getSimilarTitles(id, mediaType)` DB-first. |

### Flusso

```
scheda titolo ──▶ getSimilarTitles(id, type)
                    │
                    ├─ riga in title_similar fresca?  ──▶ sì: una select, zero TMDB
                    │
                    └─ no: identikit (da titles.raw, già in cache)
                           ├─ candidates.ts: 7-9 chiamate TMDB in parallelo
                           ├─ getRatings(candidati): 1 query (ZappScore, fase B)
                           ├─ score.ts: classifica + motivi
                           └─ store.ts: scrive la riga, TTL 30 giorni
```

La home aggiunge un passo dopo la facciata: `taste.ts` ri-ordina in memoria la
classifica impersonale con i pesi del gusto ed esclude la libreria. **La cache resta
condivisa fra tutti gli utenti**: il pezzo personale non ci finisce mai dentro.

## Segnali

### Identikit del seme

Le keyword arrivano **senza una chiamata in più**: `keywords` va aggiunto
all'`append_to_response` di `getMovie`/`getTv`, quindi entra in `titles.raw`. Va
alzata `TITLE_CACHE_EPOCH` (`src/lib/config.ts`), che è il meccanismo già previsto per
rileggere una volta le righe vecchie.

Keyword scartate sempre (rumore di produzione, non filone):
`aftercreditsstinger`, `duringcreditsstinger`, `woman director`, `sequel`, `remake`,
`imax`, `3d`, `live action`, `based on novel or book`, `based on comic`,
`based on true story` — quest'ultima resta come *motivo* mostrabile ma non genera
candidati, perché ne genererebbe diecimila scollegati.

### Candidati

Tutte le chiamate del primo giro in parallelo; il secondo giro è una sola chiamata.

**Giro 1**

| Fonte | Film | Serie |
| --- | --- | --- |
| Una `discover` **per ciascuna** delle 4 keyword più promettenti | `discover/movie?with_keywords=K` | `discover/tv?with_keywords=K` |
| Saga | `/collection/{id}` se `belongs_to_collection` | — |
| Autore | `discover/movie?with_crew={registaId}` | `person/{creatoreId}/tv_credits` |
| Volto | `discover/movie?with_cast={attoreId}` | `person/{attoreId}/tv_credits` |
| Collaborativo | `movie/{id}/similar` + `raw.recommendations` (gratis) | idem |

**Giro 2**: `discover?with_keywords=A,B` (in AND) sulle **due keyword più rare**
emerse dal giro 1. È il nucleo del filone e i suoi risultati valgono doppio.

**La rarità si misura gratis**: ogni `discover` restituisce `total_results`, cioè
quanti titoli portano quella keyword. Il peso di una keyword condivisa è
`1 / log10(max(total_results, 10))`: "loop temporale" (poche centinaia) pesa molte
volte più di "amicizia" (decine di migliaia), senza compilare classifiche a mano.

Nessuna chiamata per candidato: l'appartenenza di un candidato a una keyword si sa
**per costruzione**, perché è la lista in cui è comparso.

### Punteggio

Tre blocchi che si **moltiplicano**, così nessuno vince da solo:

```
punteggio = filone × qualità × età
```

**filone** (somma):

| Segnale | Peso |
| --- | --- |
| Keyword condivisa | `2,2 × idf(keyword)`, e `× 2` se il titolo viene dalla query in AND |
| Stessa saga | +3,0 |
| Stesso regista / creatore | +1,6 |
| Stesso sceneggiatore | +0,8 |
| Attore principale condiviso | +0,5 a testa, massimo 2 |
| Generi in comune | Jaccard × 0,6 — **il peso più basso**: il genere è l'ultimo dei segnali |
| Presente fra `recommendations`/`similar` | +0,4 con decadimento sulla posizione |

**qualità** = da 0,75 a 1,25, lineare sullo ZappScore della fase B
(`getRatings`, una query per tutta la lista); chi non ha ancora una riga usa il
`vote_average` che la `discover` restituisce già. Non ribalta il filone, ma affonda la
spazzatura e rompe i pareggi.

**età** = `1 − k · max(0, |anni di distanza| − 5) / 40`, pavimento 0,5.
`k = 0,5` quando il seme è degli ultimi 3 anni e il candidato è più vecchio (il caso
che disturba l'utente), `k = 0,25` in tutti gli altri casi.

### Igiene

- Via il seme stesso e i doppioni.
- Via i titoli senza locandina.
- Via i non ancora usciti: un consiglio dev'essere guardabile stasera.
- Soglia di voti: 50 (film) / 20 (serie); sotto, il titolo non entra.
- Via i contenuti per adulti (`adult`).
- **Massimo 2 titoli per saga e 2 per regista**, altrimenti i simili di un film Marvel
  sono l'elenco dei film Marvel.
- Ordine finale deterministico: a pari punteggio decide l'id, così due render danno la
  stessa cosa.

### Motivo

Ogni titolo esce con la ragione già scritta, in ordine di forza: `Stessa saga` →
`Di <regista>` → `Con <attore>` → `<Keyword A> · <Keyword B>` (le due condivise più
rare, con l'iniziale maiuscola) → `Anche <genere>`. Le keyword TMDB sono in inglese:
si mostrano solo quelle presenti in un piccolo dizionario `keyword-labels.ts`
(le ~120 più comuni, tradotte a mano); una keyword senza traduzione non compare come
motivo — vedi il vincolo di lingua del progetto, l'inglese non si mostra mai.

## Personalizzazione ("Perché hai visto X")

`taste.ts`, puro:

- **Profilo**: dai 5 semi candidati della home (che l'identikit ce l'hanno già)
  ricava registi e keyword che ricorrono in **almeno 2** titoli, più il voto che
  l'utente ha dato a ciascuno (`watch_entries.rating`).
- **Ri-ordino**: `+0,6` a un candidato il cui regista è nel profilo, `+0,4 × idf` per
  ogni keyword del profilo che il candidato porta, `× 1,1` se il seme ha voto ≥ 8.
- **Esclusioni**: tutto ciò che è già in libreria (`getTaste().owned`).

**Scelta delle sorgenti** (`pickBecauseSources` in `shelves-rank.ts`, già puro e
testato, va esteso):

- solo `status = "watched"` (oggi la home passa già `watched`, ma la funzione non lo
  verifica: un domani basterebbe un chiamante distratto);
- **fuori i bocciati**: voto presente e < 6;
- **fuori chi non ha filone**: meno di 2 keyword ammesse e nessuna saga — la sua
  pillola non compare, invece di riempire lo scaffale di roba a caso;
- restano gli ultimi 5 per `last_watched_at`, senza ripetizioni di titolo.

Se dopo il filtro non resta nessuna sorgente, la sezione sparisce: meglio niente che
un consiglio a caso.

## Dati

Migration `0024_title_similar.sql` (da applicare **via MCP**, come le ultime):

```sql
create table public.title_similar (
  title_id bigint not null,
  media_type public.media_type not null,
  items jsonb not null default '[]'::jsonb,
  seed jsonb not null default '{}'::jsonb,
  computed_at timestamptz not null default now(),
  primary key (title_id, media_type),
  foreign key (title_id, media_type) references public.titles (id, media_type)
    on delete cascade
);
alter table public.title_similar enable row level security;
create policy "title_similar_select_all" on public.title_similar for select using (true);
```

Scrive solo il service client (dato di sistema, come `title_trailers`).

`items` è compatto (~40 titoli, ~150 byte l'uno): id, tipo, titolo, locandina, anno,
punteggio, motivo, e i pochi campi che servono al ri-ordino personale (regista,
keyword combacianti, generi). `seed` è l'identikit, così un ricalcolo parziale non
richiede di nuovo `titles.raw`.

TTL: **30 giorni** se la lista è piena, **3 giorni** se è vuota (un film appena
annunciato non ha ancora simili; fra tre giorni forse sì).

Chi legge una riga con una forma diversa da quella attesa (`parseSimilar` fallisce)
ricalcola: è la stessa regola di `parseTrailers`.

## UI

Forma invariata in entrambe le sezioni. Una sola aggiunta: `PosterCard` prende
`reason?: string | null` e la rende come riga piccola in `text-muted`, sotto titolo e
anno — è ciò che rende visibile che il consiglio non è casuale. Nessun altro
componente cambia.

`RecommendationsShelf` smette di ricevere `raw.recommendations` e riceve la lista
già ordinata; il titolo della sezione resta "Simili".

## Errori

Nessun errore di questo modulo può rompere una pagina. TMDB che non risponde su una
delle chiamate → quella fonte manca, le altre bastano. Tutte cadute → si torna a
`raw.recommendations`, cioè al comportamento di oggi. `title_similar` illeggibile →
si calcola al volo e si prova a scrivere; se anche la scrittura fallisce, la pagina
esce lo stesso.

## Verifica

Vitest sulle funzioni pure (`signals`, `score`, `taste`, `parseSimilar`), che coprono
la formula ma **non** dicono se i consigli sono buoni.

La verifica che conta è guardare l'output vero, come insegna la fase B (sette difetti
gravi, tutti invisibili a suite verde):
`scripts/similar-check.mjs` stampa i primi 12 simili con punteggio e motivo per una
lista di titoli scelti apposta — un film di saga recente, un autore riconoscibile, un
titolo di genere puro, una serie, un titolo vecchio — e si legge a occhio prima di
dire che funziona.

Poi `pnpm test && pnpm typecheck && pnpm lint` e una build in `NEXT_DIST_DIR` dedicata
(mai due build nello stesso `.next`, il tree è condiviso con altre sessioni).
