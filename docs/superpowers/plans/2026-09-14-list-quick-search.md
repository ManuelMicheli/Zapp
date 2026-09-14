# Ricerca rapida nelle liste e pulsanti vetro

## Ambito

- Pulsanti Consigliati e Liste della Libreria: riuso di `glass-accent` (lavanda `#c5baf4` sfumato nel grigio), icona Consigliati con pollice in su. Geometria invariata.
- Nuovo campo di ricerca sopra la raccolta della lista, disponibile a proprietario/editor. Risultati compatti film/serie e aggiunta senza uscire dalla pagina.
- Riutilizzare `/api/search`, `SearchItem` e `addTitleToList`; nessuna nuova API, formula di suggerimento o migrazione.

## Criteri di verifica

- Debounce e annullamento richieste; risultati/errori obsoleti non devono sostituire la ricerca corrente.
- Query vuota o troppo corta: nessuna richiesta e nessun risultato precedente visibile.
- Stato caricamento, nessun risultato ed errore leggibili; pulsante per cancellare la ricerca.
- Distinguere film e serie con lo stesso ID. Mostrare i titoli presenti come gia' nella lista.
- Aggiunta, rimozione e riaggiunta coerenti con la rivalidazione server; pending per titolo fino al completamento.
- Viewer senza campo di aggiunta; autorizzazioni server esistenti preservate.
- Controllo browser a 320 e 1440 px, navigazione da tastiera, errori e richieste fuori ordine.
- Typecheck, lint e test del progetto prima del rilascio canonico da `origin/main`; verifica finale sul dominio pubblico e pulizia delle fixture.

## Responsabilita'

Astra definisce e rivede soluzione, diff e verifiche. Sol esegue modifica dei pulsanti, ricerca e banco di prova in incarichi separati. Un unico rilascio dopo la verifica delle due richieste.

## Verifica locale

Implementazione rivista: correzione del caso query con soli spazi aggiunti, abort delle risposte obsolete e riconciliazione delle aggiunte anche quando la rivalidazione server precede il completamento dell'azione. Typecheck, lint e 1221 test superati; build isolata completata con 42/42 pagine. Banco browser dedicato in `scripts/list-search-check.mjs`; verifica vetro in artefatto locale ignorato.

Collaudo locale concluso: ricerca 17/17 verifiche, zero errori runtime; flusso reale aggiunta/rimozione/riaggiunta, permessi e controlli delle risposte fuori ordine. Schermate desktop/mobile riviste. Verifica pulsanti: lavanda, geometria, icona e regola CSS vetro presenti; il browser headless espone `backdrop-filter: none` nel valore calcolato, quindi la verifica del blur riguarda la regola CSS consegnata, non una misura del rendering GPU. Fixture eliminate e server di prova fermato.
