# Disney+ — sonda 0.2.5

L'ultimo JSON contiene 161 campioni senza perdite. Il componente dei comandi ha
una root aperta, ma la 0.2.4 non esporta i suoi nodi. Questa versione aggiunge
struttura, motivi di esclusione e attraversamento degli slot per localizzare
il punto preciso. Non salva visioni su Zapp.

1. Sostituire i file della **Sonda ZConnection** con quelli dello ZIP 0.2.5.
2. Ricaricare la sonda dalla pagina Estensioni e ricaricare Disney+.
3. Conservare i vecchi JSON, **Azzera → Disney+ → Avvia**.
4. Bastano **30–45 secondi su una serie**: comandi visibili, pausa, apertura del
   pannello episodi. Lasciarlo aperto qualche secondo.
5. **Ferma → Esporta JSON**, poi indicare il percorso del file.

Non occorre ripetere anche il film. Verificare che il JSON riporti `probeVersion`
0.2.5. Il pacchetto contiene la sonda, non l'estensione operativa ZConnection.
