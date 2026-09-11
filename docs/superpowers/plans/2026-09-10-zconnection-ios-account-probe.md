# ZConnection iOS: piano della prova di collegamento account

## Aggiornamento operativo 2026-09-11: prova con Expo Go

L'utente dispone soltanto di iPhone. Per la prima prova si sostituisce lo scaffold Swift/Xcode qui sotto con un progetto diagnostico Expo Go in `tools/zconnection-iphone-probe/`: WebView nativa già inclusa in Expo Go, senza build iOS personalizzata. Le sezioni Swift rimangono riferimento per una possibile fase successiva e non sono task da eseguire ora.

Regia richiesta esplicitamente: Astra coordina e rivede; GPT-5.6 Sol implementa la sola cartella del prototipo. Nessun agente modifica il backend o i sorgenti Zapp in produzione.

Sequenza attuale:

1. Scaffold Expo ufficiale, package/lock autonomi; nessuna dipendenza aggiunta al package principale.
2. Test del contratto di raccolta prima dell'implementazione: host/path autorizzati, messaggi limitati e con campi consentiti, nessun dato credenziale, nessuna interpretazione di completamento.
3. Interfaccia italiana per aprire Netflix, effettuare login e leggere la cronologia dal DOM già osservato. Risultati solo in memoria.
4. WebView incognito per questa prova, con azzeramento dei risultati quando si scollega. L'archivio WebKit persistente separato della proposta Swift non è incluso né dichiarato equivalente in Expo Go.
5. Verifiche locali di test e bundle JavaScript iOS; apertura da iPhone tramite Expo Go con QR/link della sessione di sviluppo. La compilazione del bundle non equivale a una build nativa né a un login iPhone riuscito.
6. Prova manuale dell'utente: collegamento Netflix e confronto dei record. In caso di rifiuto WebView da parte del servizio, documentare il blocco prima di cambiare architettura.

Scaffold scaricato con `NODE_USE_SYSTEM_CA=1` perché npm inizialmente segnalava `UNABLE_TO_VERIFY_LEAF_SIGNATURE`. La verifica TLS rimane attiva. Nessuna impostazione globale TLS o di sicurezza è stata disabilitata.

Fonte della compatibilità Expo Go/WebView: https://docs.expo.dev/versions/latest/sdk/webview/

---

**Obiettivo:** dimostrare su iPhone che Zapp può collegare il profilo Netflix e leggere una visione eseguita nell'app Netflix ufficiale, senza Trakt o Younify.

**Architettura candidata:** applicazione diagnostica SwiftUI con `WKWebView` e archivio WebKit dedicato. Lettura locale di cronologia e scheda titolo; nessuna scrittura remota nella prima prova. L'interfaccia definitiva e il collegamento al backend vengono dopo il collaudo della sorgente su iPhone.

**Stack:** SwiftUI, WebKit, JavaScript per estrazione DOM; deployment target candidato iOS 17 per gli archivi WebKit persistenti separati. Confermare versione del telefono prima di fissarlo.

**Riferimento:** `docs/zconnection/ACCOUNT-SYNC.md`, incluse evidenze Edge e autorizzazione allo scraping.

**Stato:** piano della prova, non implementazione. Ambiente Mac/Xcode e distribuzione iPhone ancora da confermare. Usare il flusso executing-plans quando si passa all'implementazione; nessuna delega con sostituzione silenziosa dei modelli richiesti dall'utente.

## 1. Collegamento iOS locale

File previsti in una nuova cartella isolata `tools/zconnection-ios-probe/`:

- `ZConnectionProbeApp.swift`: applicazione diagnostica e composizione.
- `NetflixConnection.swift`: stato del collegamento, archivio WebKit, navigazione e revoca locale.
- `NetflixConnectionView.swift`: login ufficiale, profilo visibile, risultato e messaggi italiani.
- Progetto Xcode e `README.md`: avvio e firma sul dispositivo scelto, senza chiavi o team di sviluppo precompilati.

Criteri:

- [ ] Aprire il sito ufficiale e completare login e selezione profilo sul dispositivo.
- [ ] Conservare la sessione nel solo archivio WebKit della prova e verificare riapertura dell'app.
- [ ] Gestire sessione scaduta con richiesta di accesso, senza mascherarla come cronologia vuota.
- [ ] Valutare script solo nel frame principale su host Netflix esplicitamente consentiti e sulle pagine di raccolta previste; nessun handler che accetti payload di credenziali.
- [ ] Revocare il collegamento eliminando i dati del relativo archivio senza intervenire sulla sessione dell'app Netflix o di Safari.
- [ ] Collaudare login reale in WKWebView. Un fallimento di autenticazione blocca la prova: non presumere che il successo in Edge sia trasferibile.

## 2. Raccolta locale dei dati verificati

File previsti:

- `Resources/netflix-history.js`: estrazione read-only da `[data-uia="activity-row"]`, `.col.date`, `.col.title a`; profilo visibile separato dagli identificativi stabili ancora da validare.
- `Resources/netflix-progress.js`: lettura della scheda con collegamento Riprendi, episodio corrente e `progress.titleCard-progress` associato alla riga corretta. Associazione al DOM mobile da verificare sul dispositivo.
- `Tests/`: fixture anonimizzate e verifiche del contratto.

Record candidato: sorgente, ID contenuto Netflix, titolo grezzo, data grezza/locale/precisione, stagione ed episodio soltanto quando espliciti, progresso frazionario opzionale, durata testuale, momento di raccolta. Ora esatta della visione, posizione esatta in secondi e completamento restano assenti se non esposti da una fonte verificata.

Criteri:

- [ ] Leggere una prima pagina senza salvare la pagina autenticata completa.
- [ ] Mostrare dati reali sul telefono senza inviarli al backend.
- [ ] Verificare dati mancanti, data italiana ambigua, serie con due punti nel nome, profilo cambiato, ID episodio distinto da ID serie e aggiornamento non ancora propagato.
- [ ] Non convertire una durata arrotondata e una frazione in una posizione dichiarata esatta.
- [ ] Non trasformare cronologia in evento live o completamento.
- [ ] Nessuna riproduzione dell'episodio avviata per misurare il punto salvato.

## 3. Prova di accettazione iPhone

- [ ] Compilare su Xcode e installare sul dispositivo: annotare versioni reali di iOS, Xcode e modalità di firma.
- [ ] Collegare Netflix dal prototipo e verificare il profilo.
- [ ] Aprire l'app Netflix ufficiale, guardare/interrompere un episodio scelto dall'utente e tornare a Zapp.
- [ ] Leggere titolo, stagione/episodio e progresso; confrontarli con quelli dichiarati dall'utente e registrare il ritardo osservato.
- [ ] Chiudere e riaprire il prototipo, verificare sessione e ripetibilità; verificare disconnessione e cambio profilo.

Il caso VINLAND SAGA S1:E2 a circa 10:40 è il primo riferimento confermato da iPhone a browser. Non inserirne manualmente il minuto nel risultato del connettore.

## Passaggio alla libreria Zapp

Solo dopo i criteri precedenti: definire collegamento appartenente all'utente Zapp autenticato, identità stabile del profilo Netflix, deduplicazione degli eventi e precedenza tra progresso manuale, player e cronologia. Riutilizzare matching Netflix/TMDB esistente; evitare chiamate dirette a `confirmNetflixImport` e `/api/scrobble` perché oggi hanno semantica di completamento e/o sessione live diversa.

La sincronizzazione in foreground è la prima candidata. L'esecuzione autonoma con app chiusa è un requisito ancora da chiarire; non introdurre upload delle sessioni a un server o un cron come scelta implicita.

## Verifiche di questa sessione

Eseguita soltanto la prova DOM in Edge documentata nel riferimento. Nessun progetto Xcode creato, nessuna build iOS, nessuna installazione o modifica al backend. Il piano non dimostra compatibilità iPhone.
