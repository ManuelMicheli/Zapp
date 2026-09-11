# Disney+ — sonda 0.2.4: comandi del player

I JSON 0.2.3 identificano Agents of S.H.I.E.L.D. e Ultimatum Alla Terra.
Il cambio manuale episodi 14 → 15 è confermato dall'utente. Mancano ancora
stagione/episodio letti dal player e un clock assoluto verificato; il video
espone durata infinita e il suo tempo si reimposta dopo i seek.

La 0.2.4 verifica il componente `disney-web-player-ui` già visto nelle sonde:
legge eventuali Shadow DOM aperti e i testi/indicatori ARIA visibili dei comandi.
Non modifica il player e non salva visioni su Zapp.

1. Estrarre `artifacts/zconnection-sonda-disney-0.2.4.zip` e sostituire i file
   della **Sonda ZConnection** già caricata, non dell'estensione operativa.
2. Ricaricare la sonda dalla pagina Estensioni; verificare **0.2.4**.
   Ricaricare anche Disney+. Conservare i vecchi JSON, poi **Azzera → Disney+ → Avvia**.
3. Per 45–60 secondi: mostrare titolo e comandi, mettere in pausa, fare un seek,
   aprire il selettore episodi e passare al successivo. Mostrare nuovamente
   i comandi e lasciare la pausa per qualche secondo. **Ferma → Esporta JSON**.
4. Ripetere brevemente su un film, con comandi visibili e un seek.

Indicare stagione/episodi scelti e il tempo mostrato sullo schermo alla pausa.
Salvare i JSON in artifacts e comunicarne il percorso. Non occorre ripetere
autoplay e gli altri casi della matrice finché non troviamo questi campi.
