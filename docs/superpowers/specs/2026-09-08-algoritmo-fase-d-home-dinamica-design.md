# Algoritmo Zapp — Fase D: home dinamica

Data: 2026-09-08. Stato: progettata dopo A, B e C, già in produzione.

## Il quadro

| | Sottosistema | Stato |
|---|---|---|
| A | Segnali utente (`user_taste`) | **fatta** (2026-09-07) |
| B | Catalogo & ZappScore | **fatta** (2026-09-07) |
| C | Motore di ranking (affinità + motivo) | **fatta** (2026-09-07) |
| **D** | **Home dinamica: quali scaffali, con che nome, in che ordine** | **questa spec** |
| E | Loop sociale | da fare |

**Metà della fase D è già in produzione** (commit `55d347e`): l'ordine degli scaffali
dipende da `user_taste.massa` — con un profilo pieno "Per te" e "Perché hai visto X"
vengono subito dopo "Continua a guardare", con un profilo povero scendono sotto le
classifiche — e ogni categoria ha un nome che dice **da dove viene**
("Top 10 su Netflix in Italia", "I meglio votati su Zapp").

Resta la parte che questa spec copre: **gli scaffali che nascono dal profilo**.

## Obiettivo

Oggi la home ha un solo scaffale personale con molti titoli dentro ("Per te", 20
copertine). Una home fatta bene ne ha **tre o quattro corti e ben nominati**, ognuno con
una ragione diversa:

- *Perché ami la fantascienza* — la dimensione `generi`
- *Ancora con Pedro Pascal* — la dimensione `persone`
- *Il meglio degli anni 2000* — la dimensione `decenni`

Non è una decorazione: uno scaffale che dice **perché esiste** si scorre, uno che dice
"Per te" e basta si salta. E le stesse informazioni ci sono già tutte — la fase A le ha
raccolte, la fase C sa pesarle.

**Fuori scope**: i segnali degli amici come input (fase E), qualunque nuova fonte di
candidati, e la struttura sopra gli scaffali (carosello, filtro generi, "Continua a
guardare"), che resta com'è.

## 1. Come nascono gli scaffali

`buildRails(vector, nomi)` — **puro, con Vitest**, in `src/lib/rank/rails.ts`.

Dal vettore di gusto escono le dimensioni più forti, una per tipo, in questo ordine di
preferenza: **persone → generi → decenni**. Perché quell'ordine: "Ancora con Pedro
Pascal" dice qualcosa che l'utente non sapeva di aver detto, "Perché ami il dramma" è
quasi ovvio, e "Il meglio degli anni 2000" è il meno specifico dei tre.

Regole:

- una dimensione entra solo se la sua chiave di testa vale almeno `SOGLIA_RAIL` (0,55
  del massimo): sotto, il legame è troppo debole per intitolarci uno scaffale;
- **massimo 3 scaffali**, per non trasformare la home in un elenco di sé stessa;
- niente due scaffali dello stesso tipo (mai "Perché ami il dramma" e "Perché ami il
  crime" insieme: sarebbero la stessa fila spezzata in due);
- se il profilo non regge nemmeno un rail, non se ne mostra nessuno e la home resta
  quella di oggi — **nessun titolo inventato per riempire**.

## 2. Come si riempiono

`getRails()` (server, React `cache()`) riusa il motore della fase C: gli stessi
candidati, la stessa affinità, la stessa diversità. Per ogni rail:

1. si tengono i candidati che **toccano** la chiave del rail (quel genere, quella
   persona, quel decennio);
2. si ordinano per affinità;
3. si escludono i titoli già mostrati in "Per te" e negli altri rail — un titolo in due
   file della stessa home è un errore che si vede subito;
4. se restano meno di `MIN_RAIL` (6) titoli, il rail **non si mostra**: una fila di tre
   copertine sembra un errore, non una selezione.

Nessuna chiamata in più: `getCandidates` è già in `cache()` per richiesta, e i rail
attingono alla stessa lista che "Per te" ha già chiesto.

## 3. Cosa si vede

Sotto "Per te", da uno a tre scaffali con lo stesso aspetto degli altri (`ItemShelf`),
con affinità e motivo sulle copertine come tutto ciò che passa dal motore. Il **motivo
sotto la copertina non ripete il titolo dello scaffale**: dentro "Perché ami la
fantascienza" non ha senso scrivere "Perché guardi molto Fantascienza" venti volte, e
`variaMotivi` da solo non basta perché non sa dove finirà la lista.

## 4. Verifica

**Puro (Vitest)**: la scelta delle dimensioni e il loro ordine, la soglia, il tetto di
tre, il divieto di due rail dello stesso tipo, il profilo povero che non produce rail.

**Con i dati veri**: `scripts/rails-dump.ts <user_id>` stampa i rail di un utente coi
loro titoli; su due utenti diversi devono uscire rail **diversi**. Poi build, home
dell'utente di prova su Playwright: i titoli degli scaffali, e nessun titolo ripetuto
fra "Per te" e i rail.

## 5. Rischi noti

- **Il nome di una persona è un impegno più grande di un genere.** "Ancora con Pedro
  Pascal" su una fila che contiene un film dove Pascal compare due minuti è una promessa
  tradita: il rail per persona si costruisce solo sui candidati che hanno quel nome fra
  i primi quattro del cast o come regista, che è esattamente ciò che `title_people`
  restituisce.
- **La home può accorciarsi.** Con un profilo debole i rail non compaiono e la home
  torna quella di prima: è il comportamento voluto, non una regressione.
