# Disney+ — sonda 0.2.6

Trovati i campi della serie e il tempo del contenuto attraverso gli slot dei
comandi Disney. La 0.2.5 ha saturato la quota e perso 44 campioni iniziali;
questa versione riduce la diagnostica ripetuta conservando i dati utili.

1. Aggiornare la **Sonda ZConnection** con i file dello ZIP 0.2.6.
2. Ricaricare sonda e pagina Disney+. Conservare i vecchi JSON, poi azzerare.
3. **Film:** Avvia, riprodurre per circa un minuto con comandi visibili,
   pausa/ripresa e seek. Ferma ed esporta. Annotare il tempo mostrato in pausa.
4. Dopo esportazione e azzeramento, **autoplay serie:** andare vicino alla fine
   di un episodio e lasciar partire il successivo automaticamente; mostrare
   i comandi prima e dopo. Ferma ed esporta in un JSON separato.

Se ci sono pubblicità, includerne una e annotarlo. Specificare stagione ed
episodi del passaggio automatico. Disney resta disabilitato nel salvataggio
Zapp: queste prove completano le evidenze per l'adapter.
