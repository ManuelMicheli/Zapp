# Riordino locale della root — piano del 14 settembre 2026

## Obiettivo

Rendere `D:/PROGETTI/Zapp` una root pulita basata sulla sorgente applicativa del sito
online, mantenendo recuperabile ogni lavoro locale precedente. Il riordino non deve
modificare GitHub, Vercel, il database o il comportamento dell'applicazione.

Sorgente live verificata all'inizio del riordino: deployment Vercel
`dpl_4QeR4jmZsjWw6D3y8NiPgsY2Tv5U`, costruito dal commit
`7f1218e74370cb0ed476788b22d5bdf8ef836a23` di `main`.

Durante il lavoro altre sessioni hanno pubblicato prima `84ab390` e poi il discendente
`06a5eae713bb9589dd0084deb76fb4c519cdc7d1`, deployment
`dpl_7kGSyZYjwRhjksjmD1moFyeUi7zW`. Il riordino non ha eseguito push o deploy; la root
ha adottato il live piu' recente e deve verificarlo prima della chiusura.

## Vincoli

- Nessun push, deploy o migration.
- Nessun reset distruttivo e nessuna cancellazione di lavoro senza una copia
  verificata e recuperabile.
- `main` locale e `origin/main` devono restare identici alla sorgente live.
- I worktree attivi o con lavoro aperto restano nei loro percorsi.
- Astra dirige e verifica; GPT-5.6 Sol esegue i compiti circoscritti.

## Procedura

1. Inventariare branch, worktree, processi, file tracciati e non tracciati; registrare
   hash e configurazioni locali sensibili senza esporne il contenuto.
2. Creare uno snapshot byte per byte della root sporca e verificarne l'integrita'.
3. Committare l'intero stato precedente sul branch locale
   `archive/root-before-cleanup-2026-09-14` e registrarne lo SHA.
4. Documentare che i commit root esclusivi `b0f39c3` e `a56b99e` corrispondono alle
   copie `aed1916` e `ae6f4fb` gia' presenti in `feat/attori-preferiti`, mentre il
   cambiamento HomeType di `a059b35` e' superato dal codice piu' recente di `main`.
5. Portare `main` locale al commit live con un fast-forward, poi creare da quella base
   il branch locale `maintenance/root-cleanup-2026-09-14` per la root.
6. Ripristinare dal checkpoint soltanto il tooling locale richiesto
   `.claude/skills/zapp-scripts`; aggiungere la documentazione di questo riordino.
7. Archiviare integralmente soltanto i worktree storici puliti, integrati e senza
   evidenza di utilizzo. Tenere separati e invariati i worktree attivi o con lavoro
   aperto; preservare i branch di recupero.
8. Conservare senza modifiche le fotografie precedenti di `WORKSPACE.md` in
   `docs/project/legacy/WORKSPACE-2026-09-11.md` e
   `docs/project/legacy/WORKSPACE-2026-09-12.md`; sostituire WORKSPACE e ROOT-NOTES
   con riferimenti correnti e aggiornare AGENTS alla preferenza Astra/Sol.
9. Verificare identita' completa dei file applicativi con il commit live, integrita'
   dei backup, root pulita, riferimenti e conteggi finali. Eseguire typecheck, lint,
   test e build locali appropriati senza pubblicare.

## Criteri di completamento

- Lo stato pre-riordino e' raggiungibile tramite branch e checkpoint documentati.
- Tutti i file del runtime nella root coincidono esattamente con il commit live; le
  sole differenze del riordino sono documentazione e la skill locale `zapp-scripts`.
- `main` locale coincide con `origin/main` e con il commit live.
- WORKSPACE distingue chiaramente stato corrente e fotografia storica e offre un
  percorso di recupero che non parte da operazioni distruttive.
- I conteggi finali di worktree mantenuti, archiviati e aperti concordano con
  l'inventario; i processi attivi e il deployment online non sono stati modificati.

## Esito di preservazione

Il checkpoint della root precedente e' il commit
`afe1a815cf4c549de6fc02065a4d9b6f93802c86` sul branch
`archive/root-before-cleanup-2026-09-14`. Conserva 150 percorsi. Lo snapshot contiene
251 elementi e il suo hash e' stato verificato nei report
`artifacts/root-cleanup-2026-09-14/root-preservation.{json,md}`. Le revisioni locali
dell'estensione sono rimaste nell'archivio e non sono state applicate al runtime
basato sulla sorgente live.

Il bundle completo dei riferimenti Git precedenti al ritiro e' stato creato e
verificato con esito positivo.

La verifica finale della root sul live `06a5eae` ha confermato:

- differenza zero dei file runtime rispetto al commit live;
- `pnpm typecheck` e `pnpm lint` conclusi con codice 0;
- 1215 test superati su 1215, in 113 file;
- build conclusa con codice 0 e 42 pagine su 42;
- `tsconfig.json` identico al live;
- hash invariati per `.env.local` e `.vercel/project.json`;
- sei cache locali, 2,48 GB complessivi, archiviate fuori dalla sorgente.

L'esito completo e' in
`artifacts/root-cleanup-2026-09-14/root-builds/validation-report-final06.json`. La
verifica precedente sulla baseline iniziale `7f1218e` resta negli artefatti come
traccia storica.

Il ritiro e' partito da 45 worktree registrati: 23 worktree storici sono stati
archiviati integralmente e deregistrati, 22 sono rimasti registrati. Per ciascun ramo
ritirato sono state verificate copia amministrativa, archivio conservato integralmente, puntatore e
identita' dello SHA; nessun controllo ha rilevato differenze. I branch sono preservati
nel namespace `archive/retired-2026-09-14/`. Il report e' in
`artifacts/root-cleanup-2026-09-14/retire-worktrees-execution.json`.

Il branch `maintenance/project-consolidation` e' stato rinominato
`archive/project-consolidation-2026-09-14`, preservando `a56b99e` come ancora
aggiuntiva. `main` locale, la base della root e `origin/main` coincidono con il live
`06a5eae`.
