# Prime Video — seconda raccolta mirata

La prima registrazione è stata analizzata: 210 campioni, titoli e tempi presenti,
ma nessun numero di stagione/episodio. Prime mantiene inoltre più video, inclusi
video nascosti con i tempi della visione precedente. Il salvataggio non è ancora attivato.

## Aggiornare la sonda

1. Estrarre `D:/PROGETTI/Zapp/artifacts/zconnection-sonda-prime-0.2.0.zip` **nella
   stessa cartella** caricata per la sonda precedente, sostituendone i file.
2. In `chrome://extensions` o `edge://extensions`, premere **Ricarica** sulla
   **Sonda ZConnection**. Non occorre modificare l'estensione Zapp/Netflix.
3. Ricaricare anche la pagina Prime Video. Nel popup azzerare la vecchia raccolta
   (il primo JSON è già conservato), scegliere Prime Video e premere **Avvia**.

## Prova da fare, solo su Prime

1. Aprire una serie, per esempio Reacher, e annotare stagione/episodio scelti.
2. Durante la riproduzione muovere il mouse per mostrare i comandi e lasciarli
   visibili per qualche secondo. Mettere in pausa e aprire il pannello degli episodi.
3. Selezionare l'episodio successivo; mostrare ancora i comandi, poi pausa e ripresa.
4. Uscire dal player e lasciare brevemente apparire l'anteprima della pagina.
5. Avviare un film e mostrare i comandi. Se compaiono annunci, includerli e segnalarli.
6. Premere **Ferma**, poi **Esporta JSON**, e indicare dove è stato salvato il file,
   insieme ai numeri di stagione/episodio provati.

La nuova sonda registra la struttura e le etichette vicine al titolo, oltre al video
che genera ogni evento. Continua a funzionare soltanto in locale e non scrive su Zapp.
Non occorre ripetere ora Disney+ o NOW.
