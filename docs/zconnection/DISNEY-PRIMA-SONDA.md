# Disney+ — prima raccolta reale

Data: 10 settembre 2026. Base: `.claude/worktrees/zconn-multi`, ZConnection 1.2.0.

Disney+ è riconosciuto dalla sonda 0.2.2, ma non è attivo nel salvataggio Zapp.
Il pacchetto `artifacts/zconnection-sonda-disney-0.2.2.zip` contiene la sonda
esistente, senza modifiche al codice: la versione resta 0.2.2 per consentire di
ricondurre ogni JSON alla cattura effettiva. Non è un aggiornamento di ZConnection.

## Avvio

1. Estrarre lo ZIP. Se la sonda 0.2.2 è già installata, basta usare quella.
   Altrimenti caricare la cartella con `manifest.json` tramite **Carica estensione
   non pacchettizzata** in `chrome://extensions` o `edge://extensions`.
2. Tenere attiva una sola copia della sonda. Conservare eventuali vecchie raccolte
   con **Esporta JSON**, poi **Azzera** prima di iniziare Disney+.
3. Aprire Disney+ e ricaricare la pagina. Nel popup **Sonda ZConnection** scegliere
   **Disney+**, quindi **Avvia**. Verificare che aumenti il numero dei campioni.
4. Eseguire le prove sotto, poi **Ferma → Esporta JSON** per ogni raccolta.
   Azzerare soltanto dopo avere conservato l'esportazione.

## Primo giro: tre JSON separati

- **Catalogo e film:** osservare una preview o trailer, poi avviare un film.
  Lasciare apparire e sparire i comandi; pausa, ripresa, seek avanti e indietro.
  Bastano 2–3 minuti di registrazione, senza guardare il film intero.
- **Serie:** scegliere una stagione successiva alla prima; tenere visibili titolo
  e numero episodio, poi nascondere i comandi. Provare pausa, ripresa e cambio
  episodio dal selettore; restare sul nuovo episodio per almeno 20 secondi.
- **Autoplay:** andare vicino alla fine di un episodio e lasciare partire il
  successivo automaticamente. Conservare campioni prima e dopo il passaggio.
  Se compaiono pubblicità, lasciarne registrare inizio e fine.

Annotare per ciascun JSON: titolo scelto, stagione/episodio, lingua del player,
piano con o senza pubblicità e operazioni compiute. Non servono credenziali.
Se il contatore resta a zero, esportare comunque e annotare la pagina e il browser.

Salvare i file `zconnection-probe-disney-*.json` in `D:/PROGETTI/Zapp/artifacts/`
oppure indicare la cartella di download. Le esportazioni contengono soltanto i
campi previsti dalla sonda; non esportare risposte di autenticazione o dump di rete.

## Analisi e passaggio successivo

Ispezionare conteggio e perdite, URL, MediaSession, candidati DOM, identità dei
video, durata e posizione e ordine delle transizioni. I selettori generici sono
candidati diagnostici, non prove che il titolo sia quello del contenuto corrente.
Se i testi mancano, approfondire la sonda sulla base del JSON osservato, come per
Prime e NOW. Creare fixture reali, test di regressione e solo dopo l'adapter.

Il collaudo completo richiede anche un secondo film e una seconda serie, reload,
uscita dal player, eventuali annunci e controllo dell'arrivo in libreria Zapp.
Non dichiarare superate varianti non osservate.

## Verifica locale di questa consegna

27 test Node superati: sonda generale, sonda NOW e cattura/trasporto Netflix.
Browser collegati alla sessione: nessuno. Nessun JSON Disney+ trovato in artifacts
o nei Download al momento della preparazione. Le prove sul player Disney+ sono
quindi pendenti; nessun adapter Disney+ o deploy è stato eseguito.
