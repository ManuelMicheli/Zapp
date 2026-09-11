# Disney+ — seconda sonda 0.2.3

Il primo JSON è stato analizzato: 138 campioni senza perdite, ma mancano titolo,
episodio e durata. Il testo raccolto appartiene al pannello privacy. La nuova
sonda cerca testi e indicatori temporali vicino al video e distingue una durata
infinita da una non disponibile. Il salvataggio Disney+ in Zapp resta disabilitato.

1. Estrarre `artifacts/zconnection-sonda-disney-0.2.3.zip`.
2. Sostituire i file nella cartella della **Sonda ZConnection** già caricata,
   quindi premere **Ricarica** in `chrome://extensions` o `edge://extensions`.
   Non sostituire la cartella dell'estensione operativa ZConnection 1.2.0.
   In alternativa caricare la nuova cartella e disattivare la vecchia sonda.
3. Verificare versione **0.2.3** e ricaricare Disney+. Conservare il vecchio JSON,
   poi **Azzera**, selezionare **Disney+** e premere **Avvia**.
4. Registrare per 60–90 secondi una serie: mostrare titolo e comandi, mettere in
   pausa, riprendere, aprire il selettore episodi e passare al successivo.
   Mostrare di nuovo i comandi. **Ferma → Esporta JSON**.
5. Dopo avere conservato il file, azzerare e ripetere per un film, con pausa e seek.
   Se compaiono annunci o errori di riproduzione, annotarli.

Indicare i titoli e, per la serie, stagione ed episodi provati. Salvare i JSON
in `D:/PROGETTI/Zapp/artifacts/` e comunicarne il percorso.

Il popup mostra ricezione, assenza video, segnale scaduto o errore. Anche con
zero campioni esportare il JSON: include lo stato Disney. Le sonde raccolgono
solo localmente e non segnano visioni su Zapp.

Verificati 62 test Node, comprese le regressioni Netflix, Prime e NOW.
Il funzionamento sul player reale della versione 0.2.3 richiede questa raccolta.
