# Riordino conservativo del repository

**Obiettivo:** rendere riconoscibile e riproducibile la versione di Zapp ripristinata, conservando tutto il lavoro non pubblicato.

**Coordinamento:** Astra decide e rivede; GPT-5.6 Sol esegue incarichi circoscritti. Nessuna promessa di risparmio non misurato.

**Vincoli dell'utente:** nessuna modifica visiva; non cambiare automazioni, processi o attivita importanti ancora da completare. Nessun deploy, push, migration o modifica di servizi durante il riordino.

## Stato urgente

Il riordino e' stato interrotto in modo esplicito e autorizzato dall'ultima
richiesta per ripristinare subito la versione corretta del sito e applicarvi le
nuove modifiche. Lo switch conservativo e' ora completato: la root e' sul branch
`maintenance/project-consolidation`, commit `fcc0568`. Nessun deploy e'
autorizzato; la build di verifica dalla root con output isolato e' riuscita.

La versione completa combinata e' ora nella root; il worktree
`D:/PROGETTI/Zapp/.claude/worktrees/repository-consolidation` resta in detached
HEAD sul medesimo commit. La release
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

- [x] Inventariare worktree, rami, copie temporanee e lavoro unico. Non classificare come inutile un file dal solo nome o dalla data.
- [x] Confrontare i sorgenti del deploy con le copie locali tramite hash, senza stampare segreti.
- [x] Salvare uno snapshot verificato del lavoro locale e dei riferimenti Git prima di sostituire qualsiasi sorgente.
- [x] Ricostruire una base locale canonica dai sorgenti esatti del deploy, con provenienza e differenze documentate. Il lavoro non pubblicato resta recuperabile e indicizzato.
- [x] Conservare percorsi di strumenti, automazioni e worktree attivi. Riordinare solo materiali di verifica e copie dimostrate ridondanti, senza invalidare riferimenti operativi.
- [x] Aggiungere un indice operativo unico con versione di riferimento, collocazione del lavoro aperto e materiali archiviati.
- [x] Verificare hash di sorgenti e file protetti, stato Git, build root isolata,
  typecheck, lint e test finali coordinati.

## Confini di modifica

- `src/`, asset e configurazione runtime: solo recupero fedele della produzione, mai redesign o nuova funzionalita.
- `supabase/`, job, script operativi, estensioni/probe, piani e specifiche: preservazione; nessuna esecuzione di job o migration.
- Credenziali e configurazioni locali: rimangono locali, non entrano nei commit o nei report.
- Repository remoto e produzione: sola lettura.

## Registro decisioni

- 2026-09-11: non usare un reset a `origin/main`: perderebbe modifiche pubblicate dopo l'ultimo commit remoto.
- 2026-09-11: non spostare in blocco i worktree: percorsi esistenti possono essere usati da strumenti e attivita ancora aperte.
- 2026-09-11: interruzione urgente del riordino autorizzata dall'ultima richiesta; il consolidamento della root resta da eseguire dopo la stabilizzazione della release.
- 2026-09-11: esito urgente completato; `dpl_4zfMVT4hYzpfkq6SYQaCkeXGz1a4` e' LIVE e verificato. In questa fase la root era ancora non consolidata.
- 2026-09-11: checkpoint root creato in `5394dae`; sorgente canonica registrata in `7d68d3a` con compatibilita' tooling in `fcc0568`.
- 2026-09-11: root commutata senza reset su `maintenance/project-consolidation`; build root isolata riuscita, remoto e produzione non modificati.
- 2026-09-11: 31 worktree registrati; `Zapp-importfix` rimosso dopo verifica e `Zapp-banner`, `Zapp-nav`, `Zapp-palette` archiviati integralmente. Gli altri lavori e processi restano preservati.
- 2026-09-11: verifiche root finali riuscite: build isolata, typecheck, lint e 895 test in 83 file; tre file locali sensibili invariati per hash.
