# Riordino conservativo del repository

**Obiettivo:** rendere riconoscibile e riproducibile la versione di Zapp ripristinata, conservando tutto il lavoro non pubblicato.

**Coordinamento:** Astra decide e rivede; GPT-5.6 Sol esegue incarichi circoscritti. Nessuna promessa di risparmio non misurato.

**Vincoli dell'utente:** nessuna modifica visiva; non cambiare automazioni, processi o attivita importanti ancora da completare. Nessun deploy, push, migration o modifica di servizi durante il riordino.

## Stato urgente

Il riordino e' stato interrotto in modo esplicito e autorizzato dall'ultima
richiesta per ripristinare subito la versione corretta del sito e applicarvi le
nuove modifiche. La root non e' stata consolidata: contiene 410 file contro i
590 della fonte completa e non deve essere usata per un deploy.

La versione completa combinata e' nel worktree
`D:/PROGETTI/Zapp/.claude/worktrees/repository-consolidation`. La release
`dpl_4zfMVT4hYzpfkq6SYQaCkeXGz1a4`, basata sul deploy corretto
`dpl_4vix6aef94yz3vc57MAWMLAwnGtP`, include le tre modifiche di performance e
il solo delta `src/components/sagas/SagaCard.tsx`. La release e' **LIVE e
verificata**: deployment READY e promosso, alias pubblico confermato, build
riuscita, 895 test in 83 file, sicurezza Playwright `32/32` e manifest remoto
`590/590` con hash esatti.

Qualunque altra sessione che prepari un deploy deve confrontare il manifest
completo dei sorgenti, non solo il proprio delta, e mantenere le modifiche
concorrenti gia' presenti nella versione combinata.

## Fonte verificata

- Produzione ripristinata: `dpl_FhNSYFHXQhuc8qgrpbKaZXy9wwLF`, 10 settembre 2026 ore 21:54 Europe/Rome.
- Il deploy non ha `gitSource`; i sorgenti pubblicati e i relativi SHA1 sono recuperabili tramite l'API Vercel di sola lettura.
- La root iniziale e su `feat/cinema-vicino`, HEAD `26b4725`, con lavoro locale non registrato. `origin/main` da solo non rappresenta il deploy.

## Passaggi e criteri di accettazione

- [ ] Inventariare worktree, rami, copie temporanee e lavoro unico. Non classificare come inutile un file dal solo nome o dalla data.
- [ ] Confrontare i sorgenti del deploy con le copie locali tramite hash, senza stampare segreti.
- [ ] Salvare uno snapshot verificato del lavoro locale e dei riferimenti Git prima di sostituire qualsiasi sorgente.
- [ ] Ricostruire una base locale canonica dai sorgenti esatti del deploy, con provenienza e differenze documentate. Il lavoro non pubblicato resta recuperabile e indicizzato.
- [ ] Conservare percorsi di strumenti, automazioni e worktree attivi. Riordinare solo materiali di verifica e copie dimostrate ridondanti, senza invalidare riferimenti operativi.
- [ ] Aggiungere un indice operativo unico con versione di riferimento, collocazione del lavoro aperto e materiali archiviati.
- [ ] Verificare hash di sorgenti/asset pubblicati, conservazione dei file protetti, stato Git e controlli del progetto pertinenti. Nessun successo dichiarato su verifiche non eseguite.

## Confini di modifica

- `src/`, asset e configurazione runtime: solo recupero fedele della produzione, mai redesign o nuova funzionalita.
- `supabase/`, job, script operativi, estensioni/probe, piani e specifiche: preservazione; nessuna esecuzione di job o migration.
- Credenziali e configurazioni locali: rimangono locali, non entrano nei commit o nei report.
- Repository remoto e produzione: sola lettura.

## Registro decisioni

- 2026-09-11: non usare un reset a `origin/main`: perderebbe modifiche pubblicate dopo l'ultimo commit remoto.
- 2026-09-11: non spostare in blocco i worktree: percorsi esistenti possono essere usati da strumenti e attivita ancora aperte.
- 2026-09-11: interruzione urgente del riordino autorizzata dall'ultima richiesta; il consolidamento della root resta da eseguire dopo la stabilizzazione della release.
- 2026-09-11: esito urgente completato; `dpl_4zfMVT4hYzpfkq6SYQaCkeXGz1a4` e' LIVE e verificato. La root resta non consolidata e non va usata per deploy.
