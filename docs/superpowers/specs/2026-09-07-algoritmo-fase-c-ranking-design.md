# Algoritmo Zapp — Fase C: motore di ranking e affinità

Data: 2026-09-07. Stato: progettata dopo la fase A, sulle decisioni già prese in chat
(due numeri separati: ZappScore pubblico + affinità personale "per te 92%").

## Il quadro

| | Sottosistema | Stato |
|---|---|---|
| A | Segnali utente (`user_taste`) | **fatta**, in produzione dal 2026-09-07 |
| B | Catalogo & ZappScore (`title_ratings`, `title_charts`) | **fatta**, in produzione dal 2026-09-07 |
| **C** | **Motore di ranking: candidati → affinità → diversità → spiegazione** | **questa spec** |
| D | Home dinamica (quali rail, in che ordine, per utente) | da fare |
| E | Loop sociale | da fare |

La A ha prodotto **chi è l'utente** (`user_taste`: generi, decenni, provider, persone, tipo,
durata, lingua, `novita`, e soprattutto `massa` = quanta fiducia meritano quei numeri).
La B ha prodotto **quanto vale un titolo** (ZappScore, classifiche).
La C li mette insieme e risponde a una domanda sola:

> dato questo utente e questo titolo, **quanto è per lui**, e **perché**.

## Obiettivo

1. **Un numero personale accanto a quello pubblico.** `PosterCard.affinity` esiste come prop dalla
   fase B e da allora è sempre `null`: questa fase la accende. "★ 8,2 · per te 92%".
2. **Un motivo, non solo un numero.** `PosterCard.reason` esiste già (la usa il motore dei simili):
   sotto la copertina compare *perché* quel titolo è lì — "Perché guardi molto Fantascienza",
   "Con Pedro Pascal", "Su Netflix, che usi spesso".
3. **Una lista che non si ripete.** Dieci titoli dello stesso genere non sono una lista di
   consigli: sono un genere. La diversità è parte del motore, non un ritocco dopo.
4. **Onestà quando non si sa.** Con `massa` bassa (utente nuovo, o che ha spento la
   personalizzazione) l'affinità **non si mostra affatto** e l'ordine resta quello pubblico. Un
   "per te 92%" inventato al secondo giorno è peggio di nessun numero.

**Fuori scope, e ci resta**: quali scaffali compongono la home e in che ordine (fase D), i segnali
degli amici come input del ranking (fase E), qualunque modello addestrato — qui è tutta aritmetica
leggibile in un file, e deve restare tale.

## 1. Architettura

Cinque moduli, tre dei quali **puri e provati con Vitest** — la stessa divisione della fase A e
del motore dei simili (`src/lib/similar/`), che questa fase riusa invece di rifare.

```
src/lib/rank/types.ts        tipi condivisi fra parte pura e parte server
src/lib/rank/vector.ts       puro: da riga `user_taste` a vettore normalizzato
src/lib/rank/affinity.ts     puro: affinità 0-100 + contributi, per un candidato
src/lib/rank/diversity.ts    puro: la lista finale, senza ripetizioni
src/lib/rank/explain.ts      puro: il motivo in italiano
src/lib/rank/candidates.ts   server: da dove vengono i candidati
src/lib/rank/engine.ts       server: candidati → affinità → diversità → motivo
```

Nessuna tabella nuova, nessuna migration: la C **legge** ciò che A e B hanno già scritto.

## 2. Il vettore di gusto

`user_taste` è una riga di mappe `chiave → quota`. `toTasteVector(row)` (`vector.ts`) la
trasforma in qualcosa di confrontabile:

- ogni dimensione viene divisa per il **suo massimo**, così una quota si legge come "quanto questo
  valore è vicino al tuo preferito", da 0 a 1 (i negativi restano negativi);
- `massa` diventa `fiducia = min(1, massa / MASSA_PIENA)` con `MASSA_PIENA = 60` — grosso modo
  dieci titoli finiti e votati bene;
- il vettore porta anche `abbastanza = massa >= MASSA_MINIMA` (20): sotto quella soglia l'affinità
  esiste per l'ordinamento interno ma **non si mostra**.

La normalizzazione per il massimo, e non per la somma, è la scelta che conta: i generi in
`user_taste` non sommano a 1 (un titolo ne ha più d'uno), quindi la somma non è una scala.

## 3. L'affinità

`affinity(vector, candidate): { punteggio, percentuale, contributi }` — puro.

**Gusto** (0..1), media pesata delle dimensioni che il candidato tocca davvero (le dimensioni
mancanti non contano e i pesi si rinormalizzano, altrimenti un titolo senza `runtime` sarebbe
punito per un dato che non abbiamo):

| dimensione | peso |
|---|---|
| generi (media delle quote dei generi del titolo) | 0,40 |
| persone (regia e cast principale) | 0,20 |
| provider dove è disponibile | 0,12 |
| decennio di uscita | 0,10 |
| film o serie | 0,08 |
| fascia di durata | 0,05 |
| lingua originale | 0,05 |

**Qualità** (0..1): `zapp_score / 100`; se manca, il voto TMDB `/10`; se manca anche quello, 0,6
(neutro: un titolo senza voti non va né premiato né punito).

**Fiducia**: `gustoEffettivo = gusto × fiducia + 0,5 × (1 − fiducia)`. Con un profilo povero
l'affinità tende al neutro e a decidere resta la qualità — cioè l'ordine pubblico della fase B.
È esattamente il motivo per cui la fase A calcola `massa`.

**Punteggio finale**: `gustoEffettivo^0,65 × qualità^0,35`, moltiplicativo come in
`src/lib/similar/score.ts`: nessun blocco può vincere da solo, un capolavoro fuori gusto non
arriva primo e un titolo perfettamente in gusto ma brutto nemmeno.

`percentuale = round(100 × punteggio)`, mostrata **solo se `vector.abbastanza`**.

## 4. La diversità

`diversify(items, opts)` — puro. Scorre la lista ordinata e prende un titolo solo se non sfora:

- **3 per genere principale** (il primo genere del titolo),
- **4 per provider**,
- **2 per persona** (stesso regista o stesso interprete in testa).

Chi sfora non viene buttato: scende in coda e rientra se la lista non si riempie. Una lista corta
di roba giusta è meglio di una lista lunga tutta uguale, ma una lista mezza vuota è peggio di
entrambe.

## 5. La spiegazione

`explain(contributi, nomi)` — puro. Prende il contributo più alto e lo dice in italiano:

| contributo dominante | testo |
|---|---|
| genere | "Perché guardi molto <Genere>" |
| persona (regia) | "Di <Nome>" |
| persona (cast) | "Con <Nome>" |
| provider | "Su <Provider>, che guardi spesso" |
| decennio | "Dagli anni <decennio>" |
| nessuno (gusto neutro) | "Molto amato su Zapp" se la qualità è alta, altrimenti niente |

I nomi dei generi e dei provider arrivano già tradotti da `getGenres` e `PROVIDERS`: **niente
inglese in pagina**, come impone la regola della lingua del progetto. Le persone vengono dalle
chiavi di `user_taste.persone` (`Regia:Nome`, `Cast:Nome`), che sono nomi propri e non si
traducono.

## 6. I candidati

`getCandidates(type, opts)` — server. Quattro fonti, tutte **già pagate da altre parti dell'app**,
unite e deduplicate:

1. le classifiche correnti in `title_charts` (fase B: nessuna chiamata esterna);
2. i titoli meglio votati su Zapp (`title_ratings`, stessa query di uno scaffale che esiste);
3. `discoverByGenre` sui **tre generi di testa del profilo** (stessa `fetch` del carosello, cache
   Next 1 h);
4. `discoverNewOnStreaming` sui **provider di testa del profilo** (idem).

Poi: si escludono i titoli in libreria, quelli senza locandina e quelli con troppi pochi voti
(`MIN_VOTI` 50 film / 20 serie, la stessa soglia del motore dei simili). Dei candidati serve il
metadato per l'affinità: generi, anno, durata, lingua, provider — che per i titoli già in cache
arriva da `titles` (colonne esplicite, mai `raw`), e per gli altri dai campi che TMDB restituisce
già in `discover`.

**Le persone dei candidati non si leggono.** Servirebbe `raw.credits` per centinaia di titoli, cioè
l'errore da 27 KB per riga. La dimensione `persone` entra nell'affinità **solo per i titoli già in
cache con i crediti**, e per gli altri il peso si rinormalizza (§3). Il motore dei simili, che
quei crediti li ha già, resta la strada per "dal regista di X".

## 7. Cosa si vede

Una cosa sola, e piccola: lo scaffale **"Per te"** della home smette di essere "il genere che
guardi di più via `discover`" e diventa la lista del motore, con **affinità e motivo su ogni
copertina**. `ForYouShelf` resta lo stesso componente e lo stesso posto: cambia da dove prende gli
item.

Tutto il resto della home non si tocca — è materia della fase D.

## 8. Verifica

**Puro (Vitest)**: normalizzazione del vettore, affinità (gusto alto/basso, qualità mancante,
fiducia bassa che tira al neutro, dimensioni mancanti che rinormalizzano i pesi), diversità (tetti
per genere/provider/persona, riempimento con gli scartati), spiegazione (ogni ramo, e il caso
"nessun motivo").

**Con i dati veri** — la regola imparata nelle fasi A e B, dove ogni difetto grave era "sbaglia in
silenzio" e nessuno era visibile a suite verde:

1. `scripts/rank-dump.ts <user_id>`: stampa i primi 20 consigli con affinità e motivo. Devono
   somigliare all'utente: se a chi guarda solo commedie escono horror, la formula è sbagliata.
2. Confronto fra due utenti diversi con lo stesso comando: **le liste devono differire**. Due
   liste uguali vorrebbero dire che il gusto non sta entrando nel conto — il difetto più
   probabile e il meno visibile.
3. Un utente nuovo (profilo con la sola griglia seed): niente percentuale sulle copertine, ordine
   sensato lo stesso.
4. Build, `next start`, home dell'utente di prova su Playwright: lo scaffale "Per te" ha le
   percentuali e i motivi, e non contiene titoli già in libreria.

## 9. Rischi noti

- **La percentuale è un impegno.** Un "per te 92%" su un titolo che l'utente odia costa più
  fiducia di quanta ne guadagni un consiglio giusto. Per questo si mostra solo sopra `MASSA_MINIMA`
  e per questo la qualità pesa comunque per un terzo.
- **I candidati sono limitati a ciò che TMDB `discover` e le classifiche restituiscono**: qualche
  centinaio di titoli, non il catalogo. È abbastanza per uno scaffale, non per una ricerca; la
  fase D non deve costruirci sopra una promessa più grande.
- **`persone` copre solo i titoli in cache** (§6): l'affinità di un titolo nuovo è calcolata su
  meno dimensioni. La rinormalizzazione dei pesi lo rende corretto, non completo.
