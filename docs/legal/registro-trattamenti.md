# Registro delle attività di trattamento (art. 30 GDPR)

**Titolare:** Manuel Micheli — contatto: `<EMAIL_PRIVACY>`
**Servizio:** Zapp (zapp.app), applicazione web per tenere traccia di film e serie TV
**Ultimo aggiornamento:** 2026-09-12

> **Perché questo registro esiste.** L'art. 30(5) esenta chi ha meno di 250 dipendenti,
> ma **solo per i trattamenti occasionali** e privi di dati particolari. Quelli di Zapp
> sono continuativi — l'account esiste finché l'utente lo tiene, la libreria cresce ogni
> giorno — quindi l'esenzione non si applica e il registro va tenuto. Non è una formalità
> in più: è il documento che il Garante chiede per primo.

## 1. Finalità e basi giuridiche

Le finalità sono le stesse della sezione 3 dell'informativa pubblica (`/privacy`): se una
cambia lì, va cambiata anche qui, e viceversa.

| # | Finalità | Base giuridica | Interessati | Categorie di dati | Destinatari | Trasferimenti extra-UE | Cancellazione | Misure di sicurezza |
|---|---|---|---|---|---|---|---|---|
| 1 | Fornire il servizio: account, libreria, funzioni sociali | Esecuzione del contratto — art. 6(1)(b) | Utenti registrati | Email, nome utente, nome visualizzato, foto profilo, anno di nascita, libreria, voti, recensioni, commenti, amicizie, liste | Supabase (hosting DB, auth, storage), Vercel (hosting ed esecuzione) | Vercel: società USA, esecuzione a Francoforte — SCC + DPF | Alla cancellazione dell'account, immediata; backup entro 30 giorni | RLS per riga su ogni tabella, TLS in transito, cifratura a riposo del fornitore, chiave di servizio mai esposta al client |
| 2 | Personalizzare i consigli | Consenso — art. 6(1)(a) | Utenti che l'hanno concesso | Eventi di navigazione (titoli aperti, saltati, cercati), profilo di gusto calcolato | Supabase, Vercel | come sopra | 90 giorni dalla raccolta; alla revoca, cancellazione immediata di `user_events` e `user_taste` | Consenso versionato in `user_consents`, revoca dal profilo che cancella davvero |
| 3 | Registrare automaticamente le visioni (ZConnection) | Consenso — art. 6(1)(a), chiesto a parte | Utenti che collegano un dispositivo | Titolo in riproduzione, minutaggio, piattaforma, identificativo del dispositivo | Supabase, Vercel | come sopra | 90 giorni | Consenso separato, dispositivo revocabile, nessun contenuto video mai letto o salvato |
| 4 | Cinema: orari, sale preferite, biglietti | Esecuzione del contratto — art. 6(1)(b) | Utenti che usano la sezione Cinema | Posizione dichiarata o concessa, cinema preferiti, serate pianificate, file dei biglietti caricati | Supabase (storage) | nessuno oltre ai precedenti | Biglietti: finché non si elimina la serata o l'account | Bucket privato, un percorso per utente, RLS sullo storage |
| 5 | Sicurezza e prevenzione degli abusi | Legittimo interesse — art. 6(1)(f) | Tutti gli utenti | Identificativo utente, conteggi di frequenza, segnalazioni | Upstash (limiti di frequenza condivisi) | Upstash: regione UE | Contatori: finestra di pochi minuti. Segnalazioni: finché serve la moderazione | Limiti per utente e per azione, moderazione a soglia, log senza contenuti |
| 6 | Adempimenti legali: consensi dimostrabili, esiti della moderazione | Obbligo legale — art. 6(1)(c) (artt. 7(1) GDPR, 16 DSA) | Tutti gli utenti | Tipo e versione del documento accettato, data, revoca; esito delle segnalazioni | Supabase | — | Alla cancellazione dell'account | Storico non sovrascritto: la revoca scrive una data, non cancella la riga |

**Nessuna categoria particolare di dati** (art. 9) è trattata di proposito. L'anno di
nascita serve a verificare l'età minima e a calibrare i decenni dei consigli: non è un
dato particolare, e non compare mai sul profilo pubblico.

## 2. Valutazione del legittimo interesse (finalità 5)

- **Interesse perseguito:** impedire che un utente inondi il servizio di richieste o che
  contenuti abusivi restino visibili.
- **Necessità:** senza limiti di frequenza il database è esposto a un singolo client;
  senza moderazione a soglia un contenuto segnalato resterebbe online indefinitamente.
- **Bilanciamento:** si trattano identificativi e conteggi, mai il contenuto delle
  comunicazioni; l'interessato riceve una notifica quando un suo contenuto viene
  nascosto (art. 16 DSA) e può contestare scrivendo a `<EMAIL_PRIVACY>`.

## 3. Manutenzione

Va aggiornato quando: nasce una finalità nuova, si aggiunge un fornitore, cambia un
termine di conservazione, o si aggiunge una categoria di dati. Ogni modifica qui va
riflessa nell'informativa pubblica — e viceversa.
