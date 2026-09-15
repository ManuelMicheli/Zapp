# ZConnection 1.3.4 - sincronizzazione Zapp

Questa versione mantiene la cattura di Netflix, Prime Video, NOW e Disney+ e
invia un segnale alle schede Zapp aperte quando il server conferma un nuovo
evento applicato. La pagina aggiorna i propri dati; il segnale non contiene dati
utente. Le schede Zapp gia' aperte vengono adottate dopo installazione o avvio
del browser. Il riconoscimento Disney dipende dal player reale e va verificato
nel browser; le fixture automatiche non coprono ogni titolo.

Per aggiornare, sostituire i file nella cartella ZConnection gia caricata e
premere Ricarica nella pagina Estensioni. Ricaricare le schede dei servizi di
streaming se il browser lo richiede; non rimuovere l'estensione, per conservare
il collegamento esistente.

---

# ZConnection 1.3.2 - prestazioni e Disney+

La versione 1.3.2 riduce scansioni DOM, messaggi interni e aggiornamenti del
popup quando non cambiano dati. Il riconoscimento attivo resta a un campione al
secondo, anche con scheda nascosta; pausa, seek, autoplay, cambio episodio e
heartbeat ogni 30 secondi conservano il comportamento della 1.3.1.

Questa e l'estensione operativa: Netflix, Prime Video, NOW e Disney+ nel medesimo
collegamento Zapp. Disney e stato verificato sul player italiano senza pubblicita.
Le varianti con annunci restano non collaudate. Non e la sonda diagnostica.

Per aggiornare, sostituire i file nella cartella ZConnection gia caricata, premere
Ricarica nella pagina Estensioni e autorizzare Disney+ se il browser lo richiede.
Non rimuovere l'estensione: si conserva il collegamento esistente. Ricaricare
Disney+ e disattivare le sonde. Aprire il popup e verificare il titolo e il minuto.

Film, pausa/ripresa, seek e autoplay sono verificati in replay delle sonde.
Il server verifica gli episodi su TMDB. Bleach Thousand-Year Blood War corrisponde
alla stagione 2 TMDB. Made in Korea ha nomi episodio mancanti nel catalogo:
le corrispondenze osservate degli episodi 1?3 sono esplicite; altri episodi privi
di nomi verificabili possono restare non riconosciuti.

L'arrivo nella propria libreria con questa versione va verificato dopo il
ricaricamento: i test automatici non sostituiscono il collaudo del browser utente.

---

# ZConnection 1.2.0 - Netflix, Prime Video e NOW

## NOW: aggiornamento 1.2.0

NOW è integrato nel pacchetto. Backend pubblicato e verificato Ready su
https://zapp-mu.vercel.app il 10 settembre 2026.
Deploy NOW: dpl_4nLyJqrP7tqm8tGYmhEEtKUsx3KF.
Un backend precedente non cancella gli eventi NOW dalla coda: il salvataggio
richiede il backend aggiornato. Le funzionalità Netflix e Prime sono conservate.

Per aggiornare: sostituisci i file nella cartella dell'estensione operativa già
caricata, premi Ricarica su ZConnection nella pagina Estensioni, autorizza
NOW se richiesto e ricarica NOW. Non rimuovere l'estensione: conserva il
collegamento esistente a Zapp. Le sonde diagnostiche possono essere disattivate.

Il popup mostra NOW, titolo/episodio e minuto del contenuto; gli annunci
osservati nelle sonde sono esclusi. Il minuto proviene dall'orologio del player,
che differisce da quello grezzo del video. Il backend verifica titoli ed episodi
su TMDB e aggiorna la stessa libreria già usata da Netflix e Prime.
Il collaudo finale nel browser dell'utente resta necessario dopo aggiornamento.

Le note sotto documentano la precedente consegna Prime 1.1.1.

## Stato di questa consegna

Backend pubblicato e verificato su https://zapp-mu.vercel.app.
Backend 1.1.1 pubblicato: dpl_Dqcs4fR5xvkQacsEvxAbFwPvwurQ.
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
- 811 test app; test estensione e build produzione passati.

## Limiti del primo rilascio Prime

Supporta il player Prime Video sui domini primevideo.com e www.primevideo.com,
nel percorso /detail/. Amazon.it e altri percorsi non sono abilitati senza prove.
Serie: nome episodio univoco nel catalogo TMDB; massimo 20 stagioni esaminate.
Film: confronto del titolo italiano/originale e dei sottotitoli, come Netflix.
Una serie dal nome soltanto simile non blocca un film identificato con maggiore
precisione. Veri omonimi e seguiti numerati restano distinti.
I titoli non verificabili non sono salvati automaticamente come un'altra opera.
Resta da eseguire il collaudo nel browser dell'utente dopo installazione; la sonda
0.2 contiene serie, mentre il percorso film usa evidenze del primo giro.
Pubblicita' e transizioni a durata identica non hanno ancora una registrazione dedicata.

Il popup riceve misure locali ogni secondo e interpola la barra fra le misure;
il backend riceve heartbeat ogni 30 secondi e gli eventi di pausa/seek/cambio stato.
La home usa le ultime misure salvate, senza aggiungere secondi non confermati.

Disney+ non è incluso. NOW è aggiunto dalla versione 1.2.0 descritta sopra.


## Correzioni 1.1.1

Spider-Man: Homecoming non viene piu' scartato per il risultato TV Spider-Man.
Il titolo viene confrontato anche con il nome originale e i sottotitoli usati
dal distributore. La correzione di abbinamento e' lato server e vale anche per
l'estensione 1.1.0; pausa/ripresa invia subito una nuova rilevazione.
Aggiorna comunque a 1.1.1 per evitare blocchi quando Prime aggiunge dopo il titolo
il dettaglio dell'episodio o lo nasconde temporaneamente durante la visione.
