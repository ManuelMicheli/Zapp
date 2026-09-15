# Motore dei consigli: fama, coerenza e ciclo chiuso

Data: 2026-09-15. Richiesta utente: «grandi classici, cose più viste e in voga del
momento, combinate con i gusti dell'utente, in continuo aggiornamento», e «a volte alcune
sezioni in home hanno film sconosciuti e che non c'entrano nulla con l'utente».

Non è una fase nuova: è una revisione delle fasi **C** (ranking) e **D** (home) e
l'aggiunta di un sesto pezzo, la **taratura per utente**. Le fasi A, B ed E restano.

## Perché la home mostrava titoli sconosciuti

Tre difetti, tutti misurati, nessuno visibile da un test unitario.

**1. La qualità non era tirata.** `qualitaDi` usa lo ZappScore quando c'è, altrimenti il
`vote_average` TMDB **crudo**. Chiesto a TMDB con i parametri veri del motore (genere
28, `vote_count.gte=300`, `vote_average.gte=6`, `popularity.desc`) il 2026-09-15:

```
   307 voti  9.171  2026  Batman: Knightfall Part 1   -> qualità 0,92
   669 voti  8.836  2026  La captura                  -> qualità 0,88
 23559 voti  8.700  1972  Il padrino                  -> qualità 0,90  (ZappScore)
```

Un film del 2026 con 307 voti di fan batteva Il Padrino. La fase B aveva già la cura —
il tiraggio bayesiano — e il motore non la applicava al ripiego.

**2. La notorietà non entrava nel punteggio.** `gusto^0,65 × qualità^0,35`: quante
persone abbiano visto un titolo non compariva da nessuna parte, se non come soglia di
ammissione (300 voti per i film: una soglia che non esclude niente di quel che disturba).

**3. Un titolo fuori gusto non veniva punito, veniva ignorato.** In `affinity.ts`:
`if (valori.length === 0) continue`. Se **nessun** genere del titolo stava nel profilo,
la dimensione generi — peso 0,40 — usciva dal conto e i pesi si rinormalizzavano sulle
altre. "Non c'entra niente con te" valeva quanto "non lo so".

E due omissioni:

**4. Le classifiche non erano candidati.** `title_charts` (Netflix Top 10 ufficiale +
stima JustWatch) alimentava una fila a sé e **mai** il motore: "in voga del momento" non
entrava nei consigli.

**5. I classici erano una lista fissa di 120 righe uguale per tutti** e "I meglio votati
su Zapp" mostrava gli stessi venti titoli a chiunque, **senza escludere la libreria**:
per un utente con mille visioni era una fila di roba già vista.

Più una regressione: `rankFor` era documentato come "non chiama `getViewer()`" e da
`getFavoriteKeys()` lo chiamava, rompendo `scripts/rank-dump.ts` con
`cookies was called outside a request scope`. Finché è così nessuno può leggere le
liste vere, che in questo progetto è l'unico metodo che ha trovato i difetti veri.

## Il punteggio nuovo

```
punteggio = gusto^0,55 × qualità^0,25 × fama^0,20 × bonusAmici
```

### fama (`src/lib/rank/fame.ts`, puro)

Il massimo fra due misure:

- **quanta gente l'ha visto**: `log10(1+voti) / log10(1+RIF)`, `RIF` 50.000 film /
  15.000 serie. Logaritmica: lineare farebbe sparire tutto ciò che non è Avatar.
- **lo stanno guardando adesso**: se il titolo sta in `title_charts` nella finestra
  corrente, `fama = max(fama, 0,85)`.

Il secondo punto non è un dettaglio: una serie Netflix uscita martedì ha 200 voti su
TMDB, e con la sola prima misura il motore la ucciderebbe. È l'unico modo di far entrare
"in voga del momento" senza abbassare l'asticella per tutti gli altri.

**Pavimento**: sotto 800 voti (film) / 200 (serie) il titolo non entra. Tre eccezioni,
tutte cose che sappiamo noi e TMDB no: è in classifica, l'ha visto e votato bene un
amico, porta una persona che l'utente ha messo fra i preferiti.

### qualità

Lo ZappScore quando c'è. Altrimenti il **tiraggio bayesiano** della fase B con la
calibrazione TMDB già scritta (`SOURCE_CALIBRATION.tmdb`, `m`=500, `c`=6,6):
`(voti·R + m·C) / (voti + m)`. Senza voti, `QUALITA_NEUTRA`.

### gusto

- **Dimensioni chiuse** (generi, decenni, tipo, durata, lingua, provider): il titolo ha
  le chiavi ma nessuna sta nel profilo → vale `MISS` (0,10) **e pesa per intero**.
- **`persone`**: resta com'è, si salta. Nessun profilo contiene la maggior parte degli
  attori del mondo: lì l'assenza non è informazione.
- **I generi si mediano su tutti i generi del titolo**, non solo su quelli che
  corrispondono: un Dramma+Horror per chi ama il dramma e rifiuta l'horror deve scendere,
  e se l'horror nel profilo è negativo deve affondare.

### Verifica attesa

| candidato | prima | dopo |
|---|---|---|
| Il padrino, per chi ama il dramma | ~0,84 | ~0,85 |
| Batman: Knightfall 2026 (307 voti), per chi ama l'azione | ~0,82 | ~0,67 |
| Film 2019, 2.000 voti, 7,8, del regista preferito | ~0,80 | ~0,84 |
| Film 2026, 399 voti, fuori genere | ~0,60 | ~0,32 |

Quattro casi pinnati da un test.

## I candidati

Sei sorgenti, tutte già pagate da altre parti dell'app.

1. **Grandi classici** — `title_ratings` per ZappScore. Non più i 120 fissi: si legge una
   finestra di 500 e se ne prendono 140 con una **rotazione giornaliera per utente**
   (seme = id utente + giorno), escludendo la libreria. Così i classici ci sono sempre e
   non sono gli stessi per tutti né gli stessi di ieri.
2. **In voga adesso** — `title_charts` nella finestra corrente (`chart_periodi_correnti`).
   Nuova. Porta con sé `inChart`, che alza la fama e scrive il motivo.
3. **Del tuo gusto** — `discoverByGenre` sui 3 generi di testa, **2 pagine**, soglie
   allineate al pavimento (800/200 invece di 300/100): il filtro costa zero perché lo fa
   TMDB.
4. **Novità dove hai l'abbonamento** — `discoverNewOnStreaming`, che passa da
   `vote_count.gte=20` a 200/50 e da `release_date.desc` a `popularity.desc`. Le novità
   vere che contano entrano comunque dalla sorgente 2.
5. **Chi ami** — `discoverByPerson` sulle persone in `favorite_people` (max 2),
   `with_cast` / `with_crew`. Nuova: prima "Ancora con X" pescava solo ciò che per caso
   stava già nel pool.
6. **Amici** — invariata (fase E).

**Stanchezza**: i titoli mostrati in ≥3 sessioni negli ultimi 14 giorni e mai aperti
prendono `×0,6`; a ≥6 sessioni escono. Legge `user_events`, che le impression le registra
già. Non è un doppione dello skip della fase A: quello cambia il **profilo** (i generi),
questa cambia **questo titolo**, e subito invece che al prossimo giro del job.

## Le sezioni della home

Meno e più forti (scelta utente).

- **Tolte**: il rail dei generi ("Perché ami la fantascienza") e quello dei decenni ("Il
  meglio degli anni 2000"). Il primo ripete le pillole "Per genere" che stanno già in
  testa alla home e lo fanno meglio; il secondo è, per ammissione della sua stessa
  documentazione, "il meno specifico dei tre".
- **Ripensata**: "I meglio votati su Zapp" → **"Grandi classici da recuperare"**. Stessa
  fonte, ma esclude la libreria, ruota per utente e per giorno, e chiede fama alta. Il
  nome dice ancora da dove viene l'ordine e per la prima volta la fila è personale.
- **Restano**: Continua a guardare, carosello, cinema, Per te, Ancora con X, Perché hai
  visto X, Top 10, Amici, Da vedere, Saghe, In arrivo.

## Il ciclo chiuso (la parte che impara)

Obiettivo su **due livelli** (scelta utente): il tocco pesa poco, la visione pesa tanto.

- **esito forte** (peso 1,0): il titolo entra in libreria, viene iniziato o finito, o
  viene votato ≥ 7.
- **esito lieve** (peso 0,3): apertura della scheda, del trailer o della piattaforma.
- **rifiuto**: mostrato in ≥ 2 sessioni e mai aperto.

Niente contributi salvati per impression: al momento della taratura si **ricalcola** il
valore di ogni dimensione sui titoli coinvolti, dal profilo e dai metadati che sono già
in `titles`. Nessuna scrittura nuova nel percorso caldo.

`tuneWeights` (`src/lib/rank/tune.ts`, puro, Vitest):

```
lift(d)  = mediaPesata(valore di d sui successi) − mediaPesata(valore di d sui rifiuti)
peso(d)  = PESI[d] × (1 + K · lift(d) · fiducia)      K = 1,0
fiducia  = min(1, successi / 20)
```

poi ogni peso è **limitato** a [0,4×, 2,0×] del suo valore di partenza e il vettore è
rinormalizzato a somma 1. Un utente senza campione tiene i pesi di partenza: la taratura
può spostare, mai inventare.

Persistenza: tabella nuova `user_rank_weights` (migration `0061_rank_tuning.sql`), scritta
solo dal service client come `user_taste`, letta dal proprietario. **Non** una colonna di
`user_taste`: quella riga la riscrive per intero `refreshTasteFor` a ogni giro, e i pesi
sparirebbero — è lo stesso motivo per cui la fase B non mise i voti dentro `titles`.

Job `rank-tune` sulla rotta `/api/jobs/[job]` già esistente, `pg_cron` ogni notte alle
**03:40** (alle 03:00 gira `events-prune`, e i due leggono la stessa tabella).
Spegnendo la personalizzazione la riga si cancella come `user_taste`.

## Generi e piattaforme

`src/lib/genres/list.ts` e `src/lib/platforms/list.ts` ordinano già con `affinity` della
fase C: prendono il punteggio nuovo senza modifiche strutturali. Cambiano due cose:
`arricchisci` deve portare anche `voteCount`/`voteAverage` (senza, la fama di un
candidato letto dal database è zero), e le liste ricevono i pesi tarati dell'utente.

## Collaudo

- Vitest sui puri: `fame.ts`, `tune.ts`, la nuova `affinity`, i quattro casi della
  tabella qui sopra.
- `scripts/rank-dump.ts` riparato (`rankFor` torna a non chiamare `getViewer()`:
  preferiti e pesi arrivano come parametri) e **arricchito**: stampa per ogni titolo
  gusto, qualità, fama e punteggio, così una lista si può giudicare leggendola.
- `scripts/genre-dump.ts` per le pillole.
- La domanda che decide se il lavoro è riuscito resta quella della fase C: due utenti
  diversi devono avere liste diverse, e **nessuna delle due deve contenere un titolo che
  l'utente non ha mai sentito nominare**.
