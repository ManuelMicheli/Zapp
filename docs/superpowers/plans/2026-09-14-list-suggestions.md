# Liste: suggerimenti personali e condivisi

**Obiettivo:** proporzionare creazione e pagine lista su desktop e permettere di aggiungere film/serie da suggerimenti che usano il motore di gusto esistente.

**Architettura:** `user_taste` resta l'unica sorgente dei gusti. La lista personale usa il vettore e il ranking già esistenti. Per il gruppo una RPC autorizzata sulla lista combina le sette dimensioni normalizzate dei soli proprietario/editor con personalizzazione attiva. Il risultato aggregato attraversa `getCandidates`, `affinity` e `diversify`: nessuna seconda formula di affinità. Non vengono restituite righe di gusto individuali né allargate le policy di `user_taste`.

## Regole e criteri di accettazione

- Ogni profilo valido ha lo stesso peso; la massa determina la fiducia, non il peso della persona. Normalizzare ogni profilo prima della combinazione e non rinormalizzare il risultato: un contrasto fra gusti deve restare visibile nel valore medio. Un solo profilo deve dare lo stesso vettore del percorso personale.
- I viewer non contribuiscono. Le RPC dei suggerimenti sono riservate a chi può modificare. I suggerimenti condivisi non dipendono da quale editor apre la pagina; niente bonus sociale del solo richiedente.
- Nessuna cache persistente del profilo di lista: ruoli, partecipanti, opt-out e aggiornamenti di `user_taste` sono riletti a ogni richiesta. Rispettare il ciclo di aggiornamento dell'algoritmo esistente.
- Profili assenti o personalizzazione spenta: ripiego pubblico esplicito, senza percentuali personali inventate. La percentuale di gruppo non viene mostrata.
- Escludere sempre i titoli già presenti nella lista. Regola iniziale in attesa della preferenza utente: per il gruppo escludere i titoli già visti/in corso/abbandonati da chi può modificare; la verifica restituisce soltanto candidati ammessi, mai le librerie dei membri.
- Griglia persistente nella pagina dopo la creazione, film e serie con filtro locale, pulsante Aggiungi per titolo, errori visibili e stato aggiornato anche dopo rivalidazione. Niente aggiunta automatica.
- Desktop: modulo personale una colonna senza vuoti, condiviso due colonne; pagine a tutta larghezza con griglie fluide e locandine proporzionate. Mobile da 320px senza overflow, testate rispettose della navigazione.
- Preservare le modifiche precedenti ai pulsanti Libreria. Nessun deploy implicito dell'app.

## Esecuzione

- [x] UI creazione e indice: `CreateListSheet.tsx`, `ListCard.tsx`, pagine `/lists`; gestire gli inviti falliti senza creare liste duplicate e aprire la lista dopo la creazione.
- [x] Motore: migration additiva con RPC aggregate/autorizzate, adattatore server `src/lib/lists/suggestions.ts`, contratto serializzabile separato, riuso ranking e social disattivabile senza cambiare i default della home. Rigenerare tipi DB.
- [x] UI dettaglio: testata/collezione/suggerimenti, aggiunta tramite action esistente e corretto aggiornamento della raccolta. Aggiornare documentazione del sottosistema.
- [x] Prove: test della parità a un profilo, opposizione/condivisione dei gusti, ruoli/opt-out/assenza profili, chiavi film-serie e duplicati; collaudo SQL con rollback per accessi e aggregazione; typecheck, lint, test e build isolata; verifica browser creazione, aggiunta e dimensioni desktop/mobile.

Le preferenze chieste all'utente possono modificare bilanciamento, trattamento dei già visti e posizione della griglia prima della consegna.

## Stato di consegna locale

Implementazione del motore completata e migrazione 0056 collaudata sul database remoto in transazione con rollback. Tipi RPC aggiunti localmente. Test: 115 file, 1221 test superati. Verifica componenti browser con backend simulato: dialog desktop centrati, viewport 320/390/768/1280, aggiunta/rimozione/riaggiunta senza errori.

Dopo autorizzazione esplicita dell'utente, migrazione 0056 applicata e tipi rigenerati dal database. Gli advisor aggiungono soltanto i due avvisi attesi sulle nuove funzioni security definer, protette dai controlli di accesso collaudati. Typecheck e lint superati; build finale completata (42/42 pagine). Un primo tentativo di build ha avuto un errore interno non riprodotto nel successivo run diagnostico, senza modifiche applicative. Le prove RPC reali confermano ruoli e aggiornamento profili; collaudo E2E browser finale superato: 35 verifiche, zero errori runtime. Report e screenshot in `artifacts/list-suggestions-check/`. Il report annota il limite preesistente del componente Sheet globale, che non implementa un focus trap; verificata la navigazione dei controlli del modulo e il pulsante invio con nome valido. Nessuna pubblicazione dell'app eseguita.
