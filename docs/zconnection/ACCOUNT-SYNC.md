# ZConnection: sincronizzazione degli account streaming

Data: 2026-09-10. Stato: prima lettura reale della cronologia verificata in Edge; connettore applicativo e collegamento iOS non implementati.

## Decisione dell'utente

Zapp deve offrire un collegamento proprio alle piattaforme, senza account Trakt e senza dipendere da Younify. Deve comprendere le visioni effettuate nelle app native su iPhone e sulle TV Samsung/LG.

L'utente ha autorizzato esplicitamente lo scraping quando necessario per questo collegamento: «se serve puoi fare scraping, inoltre questo servirebbe anche come collegamento per il telefono». Questa autorizzazione aggiorna il precedente divieto di scraping nel solo ambito della sincronizzazione degli account streaming. Le altre regole di sicurezza, autenticazione, RLS, rate limit e trattamento dei segreti restano valide. La cattura del player dell'estensione esistente resta un flusso distinto.

## Prima prova autorizzata

Verificare Netflix prima di implementare gli altri connettori:

1. Accedere alla pagina ufficiale della cronologia con una sessione e un profilo scelti dall'utente.
2. Osservare una porzione limitata dei dati disponibili: titolo, identificativo del contenuto se presente, data e relativa precisione, episodio e segnali espliciti di completamento/progresso se presenti.
3. Verificare che una visione effettuata su telefono o TV compaia nello stesso profilo. Il dispositivo di origine potrebbe non essere disponibile: non dedurlo.
4. Solo dopo l'osservazione reale, definire l'adapter e una fixture minima anonimizzata. Non inventare URL di API private, selettori, campi o risposte.
5. Ripetere la raccolta per verificare identità stabile, paginazione e deduplicazione prima di abilitare scritture in libreria.

La documentazione Netflix conferma la consultazione e l'esportazione CSV della cronologia per profilo. Non dimostra che ogni record certifichi completamento, durata o punto di ripresa.

## Architettura candidata per iPhone

Preferenza tecnica iniziale: login sul dominio ufficiale in una componente nativa iOS di Zapp, con archivio WebKit persistente dedicato. La compatibilità del login Netflix nella WebView è da provare; l'esistenza dell'API WebKit non la garantisce.

La sessione della piattaforma resta sul dispositivo. A Zapp arrivano soltanto i record normalizzati del profilo selezionato. Non leggere o esportare password, cookie o token attraverso strumenti di diagnostica; non salvare pagine autenticate complete o HAR con segreti nelle fixture. Il browser disponibile nella sessione di sviluppo serve a verificare i dati, non costituisce la soluzione finale per iPhone.

Per una prima versione si propone sincronizzazione all'apertura/ritorno in primo piano, con aggiornamento manuale disponibile. La preferenza dell'utente su questo punto è ancora pendente. iOS decide quando eseguire le attività in background: non promettere polling regolare o aggiornamenti con l'app chiusa per giorni. Una sincronizzazione autonoma lato server sarebbe un'architettura diversa, con custodia delle sessioni e infrastruttura da definire; non è implicitamente inclusa nella proposta locale.

Con questa architettura le TV non devono leggere le altre app: la fonte è la cronologia dell'account. Zapp TV rimane un progetto distinto per la consultazione e l'apertura dei titoli. Nessuna app Samsung/LG di riconoscimento è stata realizzata in questa prova.

## Integrazione con il codice esistente

- Riutilizzare riconoscimento titoli e normalizzazione in `src/lib/import/netflix*.ts`, dopo verifica dei formati effettivi della nuova sorgente.
- Non chiamare automaticamente `confirmNetflixImport` con righe della cronologia appena rilevate: oggi i film importati diventano `watched`; la presenza in cronologia potrebbe attestare solo una visione iniziata.
- Non inviare la cronologia come eventi `playing` a `/api/scrobble`: il flusso esistente alimenta anche sessioni live e non deve mostrare «sta guardando ora» per una visione storica.
- Definire ingestion separata per la cronologia, riusando matching e regole comuni dove pertinenti. Nessuna nuova tabella o migration finché identità degli eventi e semantica dei dati non sono state osservate.
- Proprietà esplicita del collegamento, isolamento tra profili, validazione server, rate limit, deduplicazione, revoca e conservazione dei voti/progressi manuali sono criteri di accettazione.
- Distinguere data della visione da data di sincronizzazione. Date senza ora non diventano un istante esatto; posizione sconosciuta non diventa zero e non sovrascrive una posizione verificata.

Il tree principale contiene molti lavori preesistenti. I sorgenti ZConnection si trovano anche nei worktree `.claude/worktrees/zconn-*`; prima di integrare codice va riconciliata la base realmente distribuita. Nessun worktree produttivo è stato modificato in questa ricognizione.

## Evidenze iniziali e blocchi superati

- Letti parser CSV, azione di conferma import, tipi/API scrobble e note di rilascio live. Individuata la separazione necessaria tra cronologia, completamento e sessione live.
- Strumento browser: `cua.getState()` ha restituito `apps: []`, `browsers: []`; `cua.getBrowser({url: "https://www.netflix.com/viewingactivity"})` ha risposto `No browser is available`.
- Nessuna cronologia autenticata osservata; nessun account collegato; nessuna prova di visione da iPhone o TV eseguita. Non presentare il connettore come funzionante.
- Per proseguire la prova reale serve un browser accessibile agli strumenti con Netflix aperto e il profilo corretto; l'utente effettua l'eventuale accesso direttamente sul sito. Non chiedere credenziali in chat.
- Nessun codice applicativo, permesso, dato remoto o deployment modificato. Nessun test applicativo eseguito: il risultato corrente è questo documento di ricognizione.

## Aggiornamento: prova reale in Edge

Il browser è stato collegato dall'utente. Chrome richiedeva il login; su indicazione esplicita dell'utente si è passati a Edge, già autenticato. Il blocco «nessun browser disponibile» è quindi superato.

La pagina ufficiale `https://www.netflix.com/viewingactivity` è stata letta sul profilo già attivo, senza cambiare profilo. Raccolta limitata a un campione, nessuna esportazione completa dell'account e nessuna scrittura in Zapp.

### Risultati osservati

| Verifica | Risultato |
|---|---|
| Lingua della pagina | `document.documentElement.lang = it` |
| Prima pagina | 20 righe |
| Un clic su «Mostra altri» | 70 righe complessive, quindi 50 aggiunte in questa prova |
| Prefisso dopo paginazione | Le prime 20 righe coincidono esattamente con la prima lettura |
| Identificativi nel campione | 70 URL `/title/<numero>` distinti; titoli e link presenti su tutte le righe |
| Ricarica della pagina | Di nuovo 20 righe, identiche alla prima lettura |
| Metadati delle righe | Data visibile, titolo esteso, URL del contenuto |
| Episodi | Osservati URL distinti tra episodi della stessa serie |
| Data | Testo localizzato giorno/mese/anno a due cifre; nessuna ora mostrata. Non riutilizzare il default mese/giorno del CSV per il DOM italiano |
| Progresso/completamento | Non esposti nella struttura delle righe ispezionate; nessun `progress`, `role=progressbar` o `time` nelle 70 righe |

Non dedurre da 70 identificativi unici che tutta la cronologia conservi o elimini le revisioni dello stesso contenuto. Deduplicazione degli eventi di visione e trattamento delle rewatch restano da validare. La stabilità della prima pagina non dimostra ancora una sincronizzazione incrementale corretta in presenza di nuovi eventi.

### Contratto DOM osservato

- Riga: `li.retableRow[data-uia="activity-row"]`.
- Data: `.col.date`, testo visibile.
- Titolo: `.col.title a`, testo visibile; `href` relativo `/title/<numero>`.
- Colonne successive: segnalazione problema e rimozione dalla cronologia, da ignorare nella raccolta.
- Profilo: nome corrente visibile nel pulsante `#profileSelector` e nella testata. Il nome non è una chiave stabile sufficiente per isolare profili omonimi: associazione persistente ancora da progettare.

Esempio minimo anonimizzato, derivato dalla struttura osservata (contenuto, data e ID sostituiti; non è una nuova cattura):

```html
<li class="retableRow" data-uia="activity-row">
  <div class="col date nowrap">10/9/26</div>
  <div class="col title"><a href="/title/12345678">Serie dimostrativa: Stagione 1: "Episodio dimostrativo"</a></div>
</li>
```

### Prossime prove necessarie

1. Confrontare una visione da iPhone o TV indicata dall'utente con il campione. Il dispositivo di origine non compare nella pagina: la provenienza va confermata dall'utente.
2. Provare lettura e autenticazione nell'ambiente iOS scelto. Edge sul PC prova la sorgente DOM, non la compatibilità iPhone.
3. Verificare eventuali fonti aggiuntive per posizione e completamento senza attribuire quei campi alla cronologia attuale.
4. Definire identità persistente del profilo, comportamento al cambio account/profilo, data e rewatch prima di qualsiasi ingestion automatica.

Prova eseguita con letture DOM e un solo caricamento aggiuntivo, poi ricarica. Il banner cookie è stato rifiutato; nessuna attività nascosta/eliminata, nessuna riproduzione avviata, nessun file della cronologia scaricato. I record reali del campione non sono stati salvati nel repository. Nessun test o build dell'app eseguito perché nessun codice applicativo è cambiato.

## Priorità aggiornata: collegamento delle app native da telefono

L'utente ha indicato come priorità il collegamento di Zapp alle piattaforme per le visioni nelle app native del telefono. Il lavoro su app TV e riconoscimento locale Samsung/LG è fuori dalla prossima fase.

### Caso reale confermato

L'utente ha dichiarato una visione nell'app Netflix su iPhone: VINLAND SAGA, stagione 1 episodio 2, interrotta intorno a 10:40. Alla successiva lettura in Edge:

- La prima riga della cronologia è diventata S1:E2, URL contenuto `/title/81249836`. Nella prima lettura precedente risultava soltanto S1:E1.
- Aprendo il link del contenuto dalla cronologia, Netflix ha mostrato la scheda serie `/title/81249833`, con episodio corrente S1:E2 e collegamento «Riprendi» verso `/watch/81249836`.
- La scheda mostrava «10 di 25min» e il `progress.titleCard-progress` dell'episodio 2 esponeva `max="1"`, `value="0.4249667994687915"` (circa 42,5%). Il confronto è coerente con quanto dichiarato dall'utente, ma non prova un timestamp esatto a 10:40: la durata testuale è arrotondata.
- Non è stato premuto Riprendi e non è stata avviata la riproduzione dell'episodio dal PC. La scheda può riprodurre anteprime proprie; non usarle come eventi di visione.

Conclusione limitata: è provato il passaggio della visione dichiarata da iPhone alla cronologia e al progresso visualizzato nel browser dello stesso profilo. Non sono ancora provati login WebView iOS, raccolta automatica iOS, invio e scrittura della libreria Zapp, né aggiornamento con app chiusa.

Gli ID Netflix della serie e dell'episodio sono distinti e non sono ID TMDB. Non attribuire all'episodio l'ID della serie dopo il redirect. Il segnale di progresso viene dalla scheda del titolo e non dalla pagina di cronologia; assenza di barra non certifica completamento.

### Forma della prima prova iOS

Una componente nativa iOS di Zapp, inizialmente diagnostica e separata dalla produzione, apre il sito ufficiale Netflix in `WKWebView`, usa un `WKWebsiteDataStore` dedicato e legge i soli campi DOM verificati. L'accesso effettuato nell'app Netflix non è una credenziale disponibile a Zapp: l'utente deve accedere nel collegamento Zapp quando richiesto.

Prima uscita: mostrare sul telefono profilo, titolo/episodio e progresso osservato, con precisione dichiarata e senza scritture remote. Passaggio successivo: ingestion Zapp autenticata dopo verifica dell'identità del profilo e delle regole di aggiornamento. Questo separa il rischio di accesso iOS da quello di alterare la libreria.

È stata chiesta all'utente la disponibilità di un Mac con Xcode e dell'account Apple Developer, necessari a definire una prova reale e la distribuzione sul suo iPhone. Risposta ancora pendente. Non presentare una build iOS come eseguita da questa sessione Windows.

Aggiornamento 2026-09-11: l'utente ha solo iPhone. La prima prova passa a Expo Go, che include `react-native-webview`, evitando la necessità di un Mac personale e di una build nativa personalizzata. Questo verifica l'accesso WebView sul telefono; non consegna un'app Zapp autonoma e non dimostra persistenza delle sessioni o background. Per il prototipo si usa una sessione incognito locale e si conserva il risultato solo in memoria. Lo sviluppo è affidato a GPT-5.6 Sol con coordinamento/revisione Astra, come richiesto dall'utente. Piano aggiornato in `docs/superpowers/plans/2026-09-10-zconnection-ios-account-probe.md`.

## Fonti consultate

- Netflix, cronologia per profilo ed esportazione: https://help.netflix.com/en/node/101917
- Apple/WebKit, archivi persistenti per profilo: https://webkit.org/blog/14423/building-profiles-with-new-webkit-api/
- Apple, pianificazione del background: https://developer.apple.com/documentation/backgroundtasks/choosing-background-strategies-for-your-app
- Younify, funzioni pubblicamente descritte (riferimento funzionale, non documentazione dei connettori interni): https://www.younify.tv/product/developer-sdk/
