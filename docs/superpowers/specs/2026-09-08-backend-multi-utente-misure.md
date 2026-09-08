# Misure di scala

Banco: `public.bench_scale(n_utenti, n_entry_per_utente, giri)` — genera utenti
finti con la loro libreria, un grafo di amicizie (8 amici a testa), 50.000
attivita' e 20.000 notifiche; misura ogni query `giri` volte con
`explain (analyze, buffers)` fingendosi uno degli utenti finti e tiene il
**minimo**; poi cancella tutto quello che ha inserito e lo verifica.

Il minimo e non la media: su un'istanza condivisa la stessa query, sullo stesso
identico stato, oscillava fra 2 e 12 ms da una corsa all'altra. Su quel rumore
si sarebbe potuto "dimostrare" tutto e il contrario di tutto — infatti una
prima lettura mostrava la libreria **peggiorata**, e non era vero.

Sul database vero i numeri di partenza (2026-09-08) sono 10 utenti e 5.333 righe
in `watch_entries`: a quel volume ogni query costa meno di un millisecondo, per
questo serve il banco.

## Confronto alla pari

250 utenti, 300 righe di libreria a testa (75.000 in tutto), minimo di 7 giri.
"Prima" = policy e indici com'erano il 2026-09-07; "dopo" = migration 0028-0030.
Stesso banco, stessa taglia, stessa istanza, a pochi minuti di distanza.

| query | prima (ms) | dopo (ms) | |
| --- | --- | --- | --- |
| feed (40 attivita' recenti visibili) | 1239,233 | **0,835** | 1.484 volte piu' veloce |
| libreria (60 titoli "sto guardando" + join sul titolo) | 0,732 | **0,385** | quasi la meta' |
| notifiche non lette | 0,147 | 0,103 | gia' sana |
| consigli ricevuti non visti | 0,006 | 0,006 | invariata (2 righe vere) |

Una misura precedente, a taglia piena (500 utenti, 1.000 righe a testa, corsa
singola) dava il feed a **1.302,61 ms** e la libreria a 132,88: coerente con la
riga qui sopra, e la ragione per cui vale la pena leggere il piano invece del
cronometro.

## Il feed: perche' costava 1,2 secondi

Due cause sovrapposte, misurate separatamente sullo stesso banco:

| configurazione | feed (ms) |
| --- | --- |
| due policy permissive + `are_friends` per riga, nessun indice sul tempo | 1239,2 |
| + indice `activities(created_at desc)` | 26,7 |
| + policy unica con `my_friend_ids()` calcolato una volta | 0,835 |

L'indice toglie la scansione completa che precedeva l'ordinamento; la policy
unica toglie la chiamata di funzione ripetuta per ogni riga esaminata. Serve
tutti e due: l'indice da solo lascia 26 ms, che a mille attivita' per amico
tornerebbero a crescere.

Da notare: gia' con **20** utenti finti il feed costava 1.295 ms. Non era il
numero di utenti a farlo pesare, era la forma della query. Lo stesso vale per
tutto il resto di questo lavoro.

## Un indice tolto dopo averlo misurato

`watch_entries (user_id, updated_at desc)` era stato aggiunto per
`taste_refresh_queue`, che chiede `max(updated_at)` per ogni profilo. Avendo la
stessa colonna di testa di `watch_entries_user_status_last_watched_idx`, il
pianificatore lo preferiva per la query della libreria — e li' e' l'indice
sbagliato: perde `status` come condizione e costringe a un ordinamento. Il
banco lo ha mostrato subito (10,1 ms contro 12,6 di esecuzione), quindi
l'indice e' stato tolto. La coda dei gusti gira una volta all'ora e si
accontenta di quello che c'e' gia'.

E' il tipo di errore che senza una misura sarebbe entrato in produzione con la
motivazione migliore del mondo scritta nel commento.

## Nota operativa

Ogni corsa del banco lascia dietro di se' fino a mezzo milione di tuple morte,
anche quando la transazione viene annullata. Dopo una serie di misure serve

```sql
vacuum (full, analyze) public.watch_entries, public.activities,
                       public.notifications, public.friendships, public.profiles;
```

altrimenti la corsa successiva parte da tabelle gonfie e i numeri non sono
confrontabili — ed e' anche il motivo per cui, a meta' lavoro, un banco che
prima girava in tempo ha cominciato ad andare in timeout.

Il banco a taglia piena (500 x 1.000) supera il tempo massimo dello strumento
MCP: 250 x 300 e' la taglia piu' grande che ci sta comodamente. Se un giorno
servisse la taglia piena, va lanciata da una connessione diretta, non da qui.
