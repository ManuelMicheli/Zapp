# Workspace operativo

Aggiornato al 14 settembre 2026. Questo documento descrive lo stato corrente da
usare per il lavoro quotidiano. Le fotografie dettagliate
[`dell'11 settembre`](legacy/WORKSPACE-2026-09-11.md) e
[`del 12 settembre`](legacy/WORKSPACE-2026-09-12.md) sono conservate come riferimenti
storici: non descrivono la root o la produzione attuali.

## Sorgente canonica e root corrente

- La sorgente applicativa online corrente e' il commit
  `06a5eae713bb9589dd0084deb76fb4c519cdc7d1`, deployment Vercel
  `dpl_7kGSyZYjwRhjksjmD1moFyeUi7zW`.
- La baseline iniziale era `7f1218e`; durante il riordino altre sessioni hanno
  pubblicato prima `84ab390` e poi `06a5eae`. Questo riordino non ha eseguito push o
  deploy. Le letture dei live e i log sono conservati negli artefatti del riordino.
- La root `D:/PROGETTI/Zapp` lavora sul branch locale
  `maintenance/root-cleanup-2026-09-14`, aggiornato alla sorgente live corrente. Le sole
  aggiunte deliberate del riordino sono documentazione e tooling locale preservato;
  ogni modifica applicativa successiva deve essere riconoscibile nel diff.
- `main` locale, la base della root e `origin/main` coincidono con `06a5eae`.

| Worktree | Conteggio finale |
| --- | ---: |
| Registrati all'inizio | 45 |
| Archiviati integralmente e deregistrati | 23 |
| Mantenuti | 22 |

I 22 worktree mantenuti comprendono la root, 14 alberi recenti o attivi e 7 alberi
sporchi o con contenuto unico. I 23 ritirati hanno copie amministrative e directory conservate integralmente;
i loro 22 branch sono sotto `archive/retired-2026-09-14/` (uno era detached HEAD); la verifica non ha rilevato
archivi, puntatori o configurazioni mancanti, ne' differenze negli SHA dei branch.
L'esito completo e' in
`artifacts/root-cleanup-2026-09-14/retire-worktrees-execution.json`.

La verifica finale su `06a5eae` ha confermato runtime e `tsconfig` identici al
live, typecheck e lint riusciti, 1215 test su 113 file e build completa di 42 pagine.
Il report e' in
`artifacts/root-cleanup-2026-09-14/root-builds/validation-report-final06.json`.
Gli hash di `.env.local` e `.vercel/project.json` sono rimasti invariati. Sei cache
precedenti, per 2,48 GB complessivi, sono state archiviate; anche la cache della
verifica fallita e' conservata negli artefatti. La build riuscita usa
`.next-root-cleanup-final06`. Due tentativi sulla cache riutilizzata avevano dato
un errore interno di Next; la verifica in una cartella pulita e' riuscita senza
modifiche applicative. I log dei tentativi restano disponibili.

## Regole operative

1. Prima di riordini, integrazioni o rilasci leggere `CLAUDE.md` e confrontare
   l'intero albero, non soltanto i file interessati. Per questo riordino il confronto
   autoritativo e' il commit live corrente fissato sopra; i vecchi
   manifest sono storici.
2. Pubblicare esclusivamente tramite il flusso di `origin/main` descritto in
   `CLAUDE.md`. Non eseguire deploy di produzione dalla root o da un worktree.
3. Preservare modifiche concorrenti, configurazioni locali e processi attivi prima
   di spostare branch o worktree. Il nome di un ramo o di una directory non prova che
   il suo contenuto sia integrato.
4. Usare un branch o worktree dedicato per il nuovo lavoro. Tenere `main` locale come
   riferimento leggibile della sorgente live.

## Recupero della root precedente

Lo stato completo della root precedente al riordino e' conservato nel branch locale
`archive/root-before-cleanup-2026-09-14`, checkpoint
`afe1a815cf4c549de6fc02065a4d9b6f93802c86`. Il commit conserva 150 percorsi; lo
snapshot di preservazione contiene 251 elementi e il suo hash e' stato verificato.
Inventario ed esito sono in
`artifacts/root-cleanup-2026-09-14/root-preservation.json` e
`artifacts/root-cleanup-2026-09-14/root-preservation.md`. Un bundle completo dei
riferimenti Git precedenti al ritiro e' conservato in
`artifacts/root-cleanup-2026-09-14/repository-before-retirement.bundle`.
Il precedente branch `maintenance/project-consolidation` e' conservato come ulteriore
ancora in `archive/project-consolidation-2026-09-14` al commit `a56b99e`; il checkpoint
`afe1a81` resta il riferimento autoritativo per recuperare lo stato sporco completo.

Per ispezionare o recuperare senza alterare la root corrente:

```bash
git show archive/root-before-cleanup-2026-09-14:<percorso>
git diff maintenance/root-cleanup-2026-09-14..archive/root-before-cleanup-2026-09-14 -- <percorso>
git worktree add -b recovery/root-2026-09-14 ../Zapp-root-recovery archive/root-before-cleanup-2026-09-14
```

Il terzo comando crea una copia separata per il recupero. Verificare li' i file e
committare l'eventuale recupero su un nuovo branch; non usare reset o comandi di
pulizia come procedura predefinita.

Le revisioni locali dell'estensione presenti nella vecchia root sono nel checkpoint
di archivio. Non sono state portate nel runtime corrente, che segue intenzionalmente
la baseline live.

### Commit esclusivi della vecchia root

| Commit | Esito verificato |
| --- | --- |
| `b0f39c3` | Contenuto equivalente a `aed1916`, gia' presente in `feat/attori-preferiti`. |
| `a56b99e` | Contenuto equivalente a `ae6f4fb`, gia' presente in `feat/attori-preferiti`. |
| `a059b35` | Modifica HomeType superata dall'implementazione piu' recente del commit live. |

Questi commit restano recuperabili nel checkpoint. Nessuno dei tre e' stato applicato
al runtime durante il riordino.

## Stato storico

Gli elenchi, i conteggi, i deployment e le procedure riportati nei documenti dell'11
e del 12 settembre sono fotografie immutabili di quei controlli. Consultarli per audit
e provenienza, poi verificare ogni affermazione contro lo stato Git corrente prima di
agire. Le vecchie procedure di deploy sono state superate dalle regole canoniche in
`CLAUDE.md`.
