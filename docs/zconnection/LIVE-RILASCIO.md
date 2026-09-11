# Live ZConnection ? rilascio 10 settembre 2026

Pubblicato su https://zapp-mu.vercel.app.
Deployment finale: `dpl_8WtxnL2dR31y9Qt9QJumoQtdspDe`, URL https://zapp-gii2qz53j-manuel-michelis-projects.vercel.app, stato READY.
Sorgenti completi: `D:/PROGETTI/Zapp/.claude/worktrees/zconn-multi` (ramo `feat/zconnection-multi`, cambi locali non committati). Il confronto SHA-1 con tutti i sorgenti produttivi Vercel non rileva differenze.

## Comportamento
- Copertina Continua: badge Ora con tre barrette animate; pausa statica; barra che raggiunge il nuovo minutaggio misurato con transizione.
- Home amici: visioni live prima degli altri titoli; amici distinti anche sullo stesso titolo.
- Profilo amico: Sta guardando ora / Visione in pausa con episodio, piattaforma e progresso.
- Tre battiti mancanti (90 secondi) spengono il live. Nessuna notifica nuova e nessun progresso stimato salvato.
- RLS: solo proprietario/amici autorizzati, titoli privati e blocchi rispettati. Dispositivi con pi? membri attivi non attribuiti a una persona.
- PWA: endpoint live NetworkOnly, vecchie risposte live rimosse dalla cache all'attivazione.

## Integrazione
Preservati ultimi aggiornamenti ZConnection Netflix/Prime/NOW, Play episodio, logo piattaforma, guida installazione, ZIP1.2.0 e avviso importazioneNetflix. ZIP verificato identico ai file extension/. Il download, come /devices, richiede accesso.
Migration0038_watching_now e0039_watching_now_members applicate; tipi rigenerati. Non rilanciare db push globale da altri rami.

## Verifiche
- 852 Vitest, 55 test Node dell'estensione, typecheck, lint, build locale e Vercel: passati.
- SQL transazionale con rollback: amicizia, estranei, privacy, blocco, pausa/stop/scadenza, eventi vecchi, dispositivi condivisi; advisors senza rilievi sui nuovi oggetti.
- Browser con componenti reali e API sintetica: mobile/desktop, due amici stesso titolo, pausa, scadenza offline, reduced-motion. Service worker reale: nessuna risposta live da cache, anche preesistente.
- Produzione: login200; API watching/scrobble senza sessione/token401; pagine e download protetti; 34/34 controlli sicurezza, rendering e CSP passati.
- Non ? stata eseguita una visione su un account streaming reale: le prove di player usano le fixture gi? acquisite dall'agente precedente.

## Aggiornamento posizione indicatore
Il badge Ora ora sta in alto a destra e sostituisce il Play durante playing. In pausa/scadenza il Play ricompare. Anche i badge amici sono a destra. Verificato nel browser sul componente ContinueCard reale (assenza Play durante live, posizione, ritorno in pausa/scadenza), typecheck, lint, build e smoke produzione. Deploy `dpl_A5BGLgmbZhVJkpGaRJJzKofX5bsD`, alias https://zapp-mu.vercel.app.
