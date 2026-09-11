# ZConnection 1.1.0 - Netflix e Prime Video

## Stato di questa consegna

Backend pubblicato e verificato su https://zapp-mu.vercel.app.
Deployment Vercel: dpl_6x7EsPq3353ZDNv7C9mp6RWvbQnQ, stato READY.
Include riconoscimento/salvataggio Prime e linea del tempo nella home.
Per usare Prime occorre aggiornare l'estensione nel browser come indicato sotto.
Il collaudo finale della riproduzione reale nel browser dell'utente resta da fare.

## Aggiornamento nel browser

1. Estrai questo ZIP nella cartella di ZConnection gia' caricata nel browser,
   sostituendo i file della versione precedente. E' l'estensione operativa,
   non la sonda diagnostica.
2. Apri chrome://extensions (oppure edge://extensions), premi Ricarica su
   ZConnection e accetta l'accesso aggiuntivo a Prime Video se richiesto.
   Non rimuovere l'estensione: il collegamento gia' salvato va conservato.
3. Ricarica la scheda Prime Video e avvia un film o episodio. Se il browser
   limita l'accesso al clic, usa Attiva il riconoscimento automatico nel popup.
4. Il popup mostra Prime Video, titolo e posizione. Copertina e conferma
   arrivano dal server dopo riconoscimento e scrittura effettiva.
5. In Zapp, Continua a guardare mostra sulla copertina posizione e durata totale.

Un solo collegamento a Zapp vale per Netflix e Prime. Se il dispositivo non e'
collegato, apri Zapp > Profilo > Dispositivi e collega questo browser.

## Cosa e' verificato

- Replay dei 109 campioni della sonda Prime 0.2, transizione E2/E3, seek e uscita.
- Corrispondenze reali TMDB: Reacher / Lotta in gabbia e Un piccolo passo;
  ricerca esatta disponibile per Come un tuono.
- Ingest autenticato e RPC remota per film/serie, prove con dati sintetici
  in transazione annullata; nessun dato utente reale modificato.
- Popup Chromium con dati simulati, barra home del componente reale su mobile/desktop.
- 805 test app; test estensione e build produzione passati.

## Limiti del primo rilascio Prime

Supporta il player Prime Video sui domini primevideo.com e www.primevideo.com,
nel percorso /detail/. Amazon.it e altri percorsi non sono abilitati senza prove.
Serie: nome episodio univoco nel catalogo TMDB; massimo 20 stagioni esaminate.
Film: corrispondenza esatta del titolo e nessun candidato TV ambiguo.
I titoli non verificabili non sono salvati automaticamente come un'altra opera.
Resta da eseguire il collaudo nel browser dell'utente dopo installazione; la sonda
0.2 contiene serie, mentre il percorso film usa evidenze del primo giro.
Pubblicita' e transizioni a durata identica non hanno ancora una registrazione dedicata.

Il popup riceve misure locali ogni secondo e interpola la barra fra le misure;
il backend riceve heartbeat ogni 30 secondi e gli eventi di pausa/seek/cambio stato.
La home usa le ultime misure salvate, senza aggiungere secondi non confermati.

NOW e Disney+ non sono inclusi in questa consegna. L'altro agente mantiene NOW.
