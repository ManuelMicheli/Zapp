# ZConnection — raccolta delle sonde

Implementazione in corso nel ramo `feat/zconnection-multi`, worktree
`D:/PROGETTI/Zapp/.claude/worktrees/zconn-multi`.

La sonda unica è pronta per raccogliere dati reali da Netflix, Prime Video, Disney+
e NOW. Riconosce automaticamente il sito; il selettore nel popup serve solo a
limitare la registrazione diagnostica. Non invia dati a Zapp e non segna visioni.

## Come usarla

1. Estrarre `D:/PROGETTI/Zapp/artifacts/zconnection-sonda-0.1.0.zip` in una cartella.
2. In `chrome://extensions` o `edge://extensions`, attivare **Modalità sviluppatore**,
   premere **Carica estensione non pacchettizzata** e scegliere la cartella estratta
   che contiene `manifest.json`.
3. Aprire Prime Video con il proprio account e ricaricare la pagina. Aprire il popup
   **Sonda ZConnection**, scegliere **Prime Video** e premere **Avvia**.
4. Provare un film e una serie: play, pausa, ripresa, seek, cambio episodio. Includere
   catalogo/anteprime e pubblicità, se presenti. Bastano raccolte di 10–15 minuti
   per il primo giro; il collaudo completo richiederà poi gli altri casi del piano.
5. Premere **Ferma**, poi **Esporta JSON**. Il file arriva nei download del browser.
6. Dopo aver conservato il JSON, azzerare e ripetere per Disney+ e NOW.
7. Comunicare la cartella dove sono salvati i JSON per procedere con l'analisi.

Non servono password, cookie o accesso al tuo account da parte del server Zapp.
La cartella estratta contiene anche `README.md` con i dettagli e i limiti della sonda.

## Cosa è già verificato

- Base Netflix preservata: 8 test dell'estensione passano.
- Sonda: 6 test su pacchetto, dominio, sanitizzazione, coda, avvio/arresto e reiniezione.
- Applicazione: 785 test Vitest, controllo TypeScript, lint completo e build di produzione passati.
- Sito e URL devono corrispondere nel riconoscimento server.
- Le piattaforme senza fixture non possono ancora scrivere attraverso percorsi ipotizzati.

Le prove automatiche non certificano i player reali. Non sono ancora disponibili
fixture Prime/Disney+/NOW; nessun adapter aggiuntivo è stato attivato o distribuito.
Il browser collegato agli strumenti di questa sessione non è disponibile, quindi
la raccolta reale richiede i JSON locali. Nessuna migrazione è stata applicata.
