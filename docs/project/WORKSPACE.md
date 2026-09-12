# Indice operativo del workspace

> **LA ROOT NON E' LA SORGENTE DEL LIVE.** Aggiornato il 12 settembre 2026.
> `D:/PROGETTI/Zapp` resta la root di lavoro sul branch
> `maintenance/project-consolidation`, con base applicativa `fcc0568`, e la copia di
> preparazione resta in detached HEAD sullo stesso commit in
> `D:/PROGETTI/Zapp/.claude/worktrees/repository-consolidation`. Ma la root **non e' piu'
> un soprainsieme della produzione**: le pagine legali (`/privacy`, `/termini`,
> `/licenze`, `/addio`) e l'implementazione KLIPY dei commenti non ci sono (di KLIPY la
> root ha solo la documentazione). Il 12 settembre distribuire dalla root ha **cancellato
> KLIPY dal live per circa tre minuti**, fino al `vercel rollback`.
>
> Release LIVE: `dpl_MhRKUxUnCnymFR2SZeYqVxDTBYta`
> (`zapp-cqlo7263t-manuel-michelis-projects.vercel.app`, sull'alias pubblico
> `https://zapp-mu.vercel.app` dal 12 settembre, 17:20). E' `D:/PROGETTI/Zapp-legaldeploy`
> a `4595877` piu' il banner a filo pagina di home e Cerca; verificata con typecheck,
> lint, 928 test in 87 file, build e `scripts/banner-check.mjs` 18/18 sul live.
> Confronto con la release precedente (`dpl_2i1QAD1StGqXtcLG6X8oyHqtamDn`, 16:14):
> nessuna rotta persa, cambiano solo `/search` e `/discover`, cioe' quel che ho toccato.
> **L'albero del live si muove**: la sorgente resta `Zapp-legaldeploy`, ma il suo HEAD
> avanza nel giro di minuti. Prima di distribuire va riletto e il proprio lavoro
> rifondato lì sopra (`git rebase <HEAD di quel worktree>`), sennò si torna indietro.
> Il live **non** ha ancora l'import multi-sorgente: le sue rotte sono `/import/netflix`,
> non `/import/[source]`, che sta nella root.
> La release dell'11 settembre `dpl_4zfMVT4hYzpfkq6SYQaCkeXGz1a4` (manifest remoto `590/590`,
> 895 test in 83 file, sicurezza Playwright `32/32`) resta la baseline storica descritta
> da `production-source-manifest.json`: **non e' piu' il live**, e il manifest non
> descrive piu' la produzione.

Il quadro dei worktree qui sotto fotografa l'11 settembre 2026; il 12 settembre sono
comparsi i quattro alberi di consegna elencati in "Lavoro da conservare"
(`Zapp-commenti`, `Zapp-liste`, `Zapp-legaldeploy`, `Zapp-bannerdeploy`), quindi i
conteggi della tabella sono da rifare. Questo documento fotografa il workspace per il
riordino: non autorizza deploy, push, migration o modifiche ai processi in
esecuzione. Lo switch della root e' completato; la build di verifica dalla root
con `NEXT_DIST_DIR=.next-consolidation-check` e' terminata con esito positivo.
Anche typecheck, lint e 895 test in 83 file sono passati dalla root. I tre file
locali sensibili controllati sono rimasti invariati per hash.

Prima di ogni deploy, le altre sessioni devono confrontare l'intero manifest dei
sorgenti con la versione completa, non soltanto i file che intendono cambiare, e
devono mantenere tutte le modifiche concorrenti gia' integrate nel candidato.
La baseline dell'11 settembre e' descritta da
[`production-source-manifest.json`](production-source-manifest.json); dopo
modifiche intenzionali il confronto deve usare un manifest completo aggiornato,
non pretendere che gli hash storici restino invariati.

**Quel manifest non descrive piu' il live** (vedi l'intestazione), quindi il confronto
con esso non basta: va stabilito ogni volta **da quale albero esce la produzione**.
Procedura, ricavata dall'incidente del 12 settembre:

1. `vercel ls zapp --prod`. Se l'ultimo deploy e' di pochi minuti fa, un'altra sessione
   sta lavorando: il candidato va costruito sul **suo** albero, non sul proprio.
2. Gli URL `zapp-<hash>-…vercel.app` sono protetti — una GET restituisce la pagina di
   login di Vercel, non il file. Il contenuto di un deploy si legge dall'alias pubblico
   `https://zapp-mu.vercel.app` oppure dai suoi log.
3. Per riconoscere l'albero sorgente: estrarre la tabella delle rotte da
   `vercel inspect <url> --logs` (Next la stampa a fine build) e confrontarla con i
   `src/app/**/page.tsx` dei worktree candidati. Le rotte esclusive — le pagine legali,
   `/lists` — dicono subito quale albero e'.
4. Costruire il candidato in un worktree **proprio** sul commit di quell'albero
   (`git worktree add … <sha> --detach`), applicarci il proprio `git diff` con
   `git apply`: se applica pulito, la base e' la stessa. Servono `.vercel/` e
   `.env.local` copiati, e `pnpm install` (~3 minuti).
5. Dopo un `vercel rollback` la produzione resta **appuntata**: un `vercel --prod`
   successivo aliasa solo `zapp-manuel-michelis-projects.vercel.app`. Per riportare
   `zapp-mu.vercel.app` sul nuovo deploy serve `vercel promote <url>`.
6. Controllo finale: `diff` fra le tabelle rotte+peso del proprio deploy e di quello
   dell'altra sessione. Se cambia **solo** la rotta toccata, non si e' cancellato lavoro
   altrui. Sanita' del live senza credenziali: `https://zapp-mu.vercel.app/sw.js`
   contiene l'elenco di precache, quindi `klipy`, `lists` e `(legal)` dicono se quelle
   parti ci sono ancora.

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
| `D:/PROGETTI/Zapp-legaldeploy` | `deploy/conformita-legale` / `b3d0968` | Pulito. **E' l'albero da cui esce la produzione del 12 settembre**: pagine legali, liste condivise e commenti KLIPY insieme. Finche' questi filoni non rientrano nella root, un deploy dalla root li cancella dal live. |
| `D:/PROGETTI/Zapp-bannerdeploy` | `ui/banner-a-filo-pagina` / `0caed3f` su `4595877` | Pulito. Albero della release LIVE `dpl_MhRKUxUnCnymFR2SZeYqVxDTBYta`: `Zapp-legaldeploy` piu' tre commit — banner a filo pagina di home e Cerca, la correzione che lascia sul fondale solo nav e barra di ricerca, e `scripts/banner-check.mjs` (18 controlli). Il branch non e' pushato: conservare finche' non rientra nella sorgente canonica. |
| `D:/PROGETTI/Zapp-commenti` | `deploy/consolidation-commenti` / `70ede88` | Pulito. Filone dei commenti con GIF, meme e sticker KLIPY (`src/lib/comments/klipy.ts`, `MediaPicker.tsx`). Non ha liste ne' pagine legali: e' un sottoinsieme di `Zapp-legaldeploy`, da confrontare prima di scartarlo. |
| `D:/PROGETTI/Zapp-liste` | `deploy/liste-condivise` / `84fed33` | Pulito. Liste condivise piu' i commenti KLIPY, senza le pagine legali. Anche questo sembra un sottoinsieme di `Zapp-legaldeploy`: confrontare, non dedurre dal nome. |

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
