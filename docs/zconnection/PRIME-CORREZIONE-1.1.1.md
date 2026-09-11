# Correzione Prime 1.1.1

Caso segnalato: Spider-Man: Homecoming letto dal player ma mai salvato su Zapp.
Riproduzione in sola lettura con il catalogo reale: film TMDB 315635, risultato
TV secondario 888 (Spider-Man). Il filtro precedente rifiutava qualsiasi film
quando la ricerca TV produceva un risultato, anche soltanto simile.

Correzione server: riuso del confronto titoli Netflix, con nomi locali/originali
e sottotitoli; una serie blocca il film solo se il suo nome e' altrettanto
convincente (soglia 0,85, margine 0,03). Protezione esplicita sui numeri dei
seguiti. Gli errori TMDB conservano l'evento per il retry. Restano le verifiche
sul nome episodio e sull'identita' della copertina.

Correzione estensione: il passaggio da titolo a titolo+episodio, e la sparizione
temporanea del dettaglio sul medesimo video, non bloccano piu' il tracker.

Verifiche: Homecoming accettato dal catalogo reale; 811 test Vitest e 22 test
estensione/cattura/worker/regressione Netflix passati. Revisione senza rilievi.
Il riconoscimento richiede i metadati esposti dal player e il tempo di risposta
di rete/TMDB: non viene promessa latenza zero per un titolo ancora sconosciuto.

Pubblicato su https://zapp-mu.vercel.app: dpl_Dqcs4fR5xvkQacsEvxAbFwPvwurQ.
Build locale e Vercel passate.
