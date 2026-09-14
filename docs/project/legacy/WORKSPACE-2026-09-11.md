# Indice operativo del workspace

> **ROOT CANONICA.** `D:/PROGETTI/Zapp` e' ora sul branch
> `maintenance/project-consolidation`, con base applicativa `fcc0568` e sorgente completa
> combinata. La copia di preparazione resta, in detached HEAD sullo stesso commit,
> in `D:/PROGETTI/Zapp/.claude/worktrees/repository-consolidation`. La release
> `dpl_4zfMVT4hYzpfkq6SYQaCkeXGz1a4`, basata su
> `dpl_4vix6aef94yz3vc57MAWMLAwnGtP`, e' **LIVE e verificata**: include le tre
> modifiche di performance e `src/components/sagas/SagaCard.tsx`. Il deployment
> e' READY, promosso e confermato sull'alias pubblico con manifest remoto
> `590/590`, build riuscita, 895 test in 83 file e sicurezza Playwright `32/32`.

Aggiornato all'11 settembre 2026. Questo documento fotografa il workspace per il
riordino: non autorizza deploy, push, migration o modifiche ai processi in
esecuzione. Lo switch della root e' completato; la build di verifica dalla root
con `NEXT_DIST_DIR=.next-consolidation-check` e' terminata con esito positivo.
Anche typecheck, lint e 895 test in 83 file sono passati dalla root. I tre file
locali sensibili controllati sono rimasti invariati per hash.

Prima di ogni deploy, le altre sessioni devono confrontare l'intero manifest dei
sorgenti con la versione completa, non soltanto i file che intendono cambiare, e
devono mantenere tutte le modifiche concorrenti gia' integrate nel candidato.
La baseline verificata e' descritta da
[`production-source-manifest.json`](production-source-manifest.json); dopo
modifiche intenzionali il confronto deve usare un manifest completo aggiornato,
non pretendere che gli hash storici restino invariati.

Il manifest resta la fotografia immutabile della release LIVE. Il candidato
aggiunge l'export `getSagaMovieMetadata` in `src/lib/tmdb/client.ts` esclusivamente
per mantenere compatibile `scripts/update-saga-metadata.ts`: l'app non lo usa e
questa aggiunta non modifica il suo comportamento runtime.
Anche `.vercelignore` aggiunge esclusivamente i materiali locali `.pnpm-store`,
`.superpowers`, `.vscode` e `.palette-preview.html`: e' un filtro di packaging,
non una modifica dell'app o del manifest storico.

Il checkpoint precedente della root resta nel branch
`archive/root-wip-2026-09-11`, commit `5394dae`. Gli altri lavori unici, le
configurazioni locali e le automazioni restano preservati. `origin/main` non
include ancora la sorgente canonica combinata.
Il file locale `page.html` della root e' stato archiviato senza variazioni in
`artifacts/repository-recovery/archived-root/page.html` (818786 byte); resta un
artefatto di recupero escluso dal repository canonico.

## Quadro verificato

| Gruppo | Conteggio | Significato operativo |
| --- | ---: | --- |
| Worktree registrati | 31 | Stato dopo lo switch canonico e i quattro ritiri verificati. |
| Copie storiche pulite preservate | 22 | Ventuno copie ordinarie piu' `Zapp-home`, mantenuta nel percorso usato da un processo. |
| Worktree ritirati | 4 | Uno rimosso dopo verifica completa; tre deregistrati e archiviati integralmente. |
| Copie non registrate | 1 | `zconn-play-release`, snapshot senza metadati di worktree propri. |

Le copie rimaste conservano percorsi, configurazioni e processi; nessun file e'
stato dichiarato inutile in base al nome.

## Lavoro da conservare

| Percorso | Branch / HEAD | Stato e contenuto da tutelare |
| --- | --- | --- |
| `D:/PROGETTI/Zapp` | `maintenance/project-consolidation` / base applicativa `fcc0568` | Root canonica completa. Il precedente WIP e' preservato nel checkpoint `5394dae`; direzioni profilo, piani, sonda iOS e lavori concorrenti sono presenti. Build root isolata completata con successo. |
| `D:/PROGETTI/Zapp/.claude/worktrees/repository-consolidation` | detached / `fcc0568` | Copia di preparazione conservata sullo stesso commit della root, senza possedere il branch. |
| `D:/PROGETTI/Zapp/.claude/worktrees/zconn-multi` | `feat/zconnection-multi` / `7973b74` | Sporco, 158 voci. E' la copia piu' completa osservata del filone ZConnection multipiattaforma: Disney+, NOW, Prime, live fra amici, playback, migrazioni `0037`-`0039`, probe e test. Conservare anche i piani [multipiattaforma](../../.claude/worktrees/zconn-multi/docs/superpowers/plans/2026-09-10-zconnection-multipiattaforma.md), [live amici](../../.claude/worktrees/zconn-multi/docs/superpowers/plans/2026-09-10-live-amici.md) e [latenza Play](../../.claude/worktrees/zconn-multi/docs/superpowers/plans/2026-09-10-play-latency.md). |
| `D:/PROGETTI/Zapp/.claude/worktrees/zconn-deploy` | `deploy/zconnection` / `7973b74` | Sporco, 24 voci. Fix del progresso ordinato, migrazione `0037`, test e controlli di deploy. Sembra un sottoinsieme del filone multipiattaforma, ma va confrontato prima di qualunque decisione. |
| `D:/PROGETTI/Zapp/.claude/worktrees/zconn-browser` | `feat/zconnection-browser` / `f418bcf` | Pulito, ma 49 commit davanti e 257 dietro `origin/main`; i commit non risultano equivalenti per patch. Conservare fino al confronto con l'implementazione ZConnection presente su main. |
| `D:/PROGETTI/Zapp/.claude/worktrees/zconnection` | `zconnection` / `bbe3548` | Un file temporaneo non tracciato; 8 commit davanti e 386 dietro. E' il primo filone ZConnection del 4-5 settembre e non va scartato senza confronto. |
| `D:/PROGETTI/Zapp-hometab` | `ui/home-type-sticky` / `84f333c` | Sporco, 5 voci; 3 commit davanti. Contiene pillola Home fissa, modifiche a `EmptyState`, immagini e controllo dedicato. |
| `D:/PROGETTI/Zapp-momento` | `feat/momento` / `88d65ec` | Pulito, 1 commit davanti: colori della locandina nel popup della domanda. Verificare l'integrazione. |
| `D:/PROGETTI/Zapp-algoritmo` | `feat/algoritmo-fase-b` / `a4ab87f` | Sporco per `topten-pillole-report.md`; branch a zero commit davanti. Conservare il report. |
| `D:/PROGETTI/Zapp/.claude/worktrees/zconn-play-release` | nessun branch proprio | Copia semplice, non worktree Git. Snapshot del 10 settembre, ore 18:06, con `release-changes.json` e otto file playback. Le versioni differiscono da root e `zconn-multi`; preservare fino al recupero e confronto byte-per-byte. |

## Copie storiche pulite

Questi 22 worktree sono puliti e a zero commit davanti alla copia locale di
`origin/main`. I commit risultano integrati, ma le directory non sono state
spostate o rimosse per non alterare percorsi e processi attivi.

| Percorso | Branch | HEAD |
| --- | --- | --- |
| `D:/PROGETTI/Zapp-cinemabanner` | `ui/cinema-film-banner` | `d54e593` |
| `D:/PROGETTI/Zapp-deploy` | `ui/chicca-bianca` | `92f5059` |
| `D:/PROGETTI/Zapp-domanda` | `deploy/domanda-card` | `6cc1986` |
| `D:/PROGETTI/Zapp-generi` | `feat/generi` | `ea6764a` |
| `D:/PROGETTI/Zapp-home` | `feat/home-mobile-banner` | `793f535` |
| `D:/PROGETTI/Zapp-import` | `fix/netflix-import-chunks` | `0d27dba` |
| `D:/PROGETTI/Zapp-matching` | `feat/netflix-matching` | `ecafa68` |
| `D:/PROGETTI/Zapp-perf` | `perf/instant` | `2119750` |
| `D:/PROGETTI/Zapp-provincia` | `ui/domanda-backdrop` | `b18f4b2` |
| `D:/PROGETTI/Zapp-punteggio` | `feat/punteggio-card` | `d49cff0` |
| `D:/PROGETTI/Zapp-quality` | `deploy/auth-branding` | `aeb2e96` |
| `D:/PROGETTI/Zapp-ricerche` | `deploy/disney-app` | `18f023f` |
| `D:/PROGETTI/Zapp-scale` | `perf/multi-utente` | `f695835` |
| `D:/PROGETTI/Zapp-security` | `security/hardening` | `9438bb0` |
| `D:/PROGETTI/Zapp-simili` | `feat/gusto-unico` | `c7d3e43` |
| `D:/PROGETTI/Zapp-subs` | `fix/trailer-captions` | `349e7d9` |
| `D:/PROGETTI/Zapp-testata` | `ui/testata-icone` | `ad1fc85` |
| `D:/PROGETTI/Zapp-tickets` | `qr-fix-main` | `ac219dc` |
| `D:/PROGETTI/Zapp-trailer` | `trailer-controls` | `a4ff187` |
| `D:/PROGETTI/Zapp-trailerfix` | `feat/trailer-match` | `457a912` |
| `D:/PROGETTI/Zapp-trailerit` | `feat/trailer-italiani` | `c7d3e43` |
| `D:/PROGETTI/Zapp-trailers` | `feat/trailers-db-first` | `dea0bd5` |

## Worktree ritirati

- `Zapp-importfix`: rimosso completamente dopo verifica della sua integrazione.
- `Zapp-banner`, `Zapp-nav` e `Zapp-palette`: deregistrati e archiviati
  integralmente sotto `artifacts/repository-recovery/retired-worktrees/`.
- I vecchi percorsi dei quattro worktree sono assenti; i branch sono preservati
  e il controllo campione ha confermato 9 hash su 9.

## Riferimenti esterni e processi

- Produzione di riferimento: deployment `dpl_FhNSYFHXQhuc8qgrpbKaZXy9wwLF`,
  creato il 10 settembre alle 21:54. Non espone `gitSource`; il contenuto verra'
  recuperato byte-per-byte prima di stabilire la sorgente definitiva.
- I processi `startup-release`, incluso il server baseline sulla porta `3431` e
  la candidate build, sono attivi e devono restare intatti.
- Ogni confronto futuro deve preservare le modifiche altrui e verificare il
  contenuto effettivo: nome del branch o della directory, da solo, non dimostra
  che una copia sia superflua.
