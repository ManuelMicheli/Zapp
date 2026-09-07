# Fase C dell'algoritmo — motore di ranking: piano di implementazione

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** dare a ogni titolo candidato un'affinità 0-100 per l'utente che guarda, con un motivo in italiano, una lista diversificata e nessuna percentuale inventata quando il profilo è povero.

**Architecture:** cinque moduli in `src/lib/rank/`, tre puri (vettore, affinità + diversità, spiegazione) e due server (candidati, motore). Nessuna tabella nuova: si legge `user_taste` (fase A), `title_ratings` e `title_charts` (fase B), `titles` e `title_providers` (cache TMDB). La sola cosa che cambia in pagina è lo scaffale "Per te" della home.

**Tech Stack:** TypeScript strict, Vitest per le funzioni pure, Supabase (sola lettura), TMDB `discover` già in cache Next.

**Spec:** `docs/superpowers/specs/2026-09-07-algoritmo-fase-c-ranking-design.md`

## Global Constraints

- Worktree `D:/PROGETTI/Zapp-algoritmo`. Mai toccare il tree condiviso `D:/PROGETTI/Zapp`.
- Italiano in UI e commenti. Nessuna stringa inglese visibile: i nomi dei generi da `getGenres`, dei provider da `PROVIDERS`.
- Nessuna migration. Nessuna lettura di `titles.raw` per liste di candidati.
- `PosterCard.affinity` e `PosterCard.reason` esistono già: non cambiare la loro forma.
- Prima di ogni commit: `pnpm typecheck && pnpm lint && pnpm test`.
- Build isolata: `NEXT_DIST_DIR=.next-check pnpm build`, e poi `git checkout -- tsconfig.json` (Next lo riscrive).
- Attribuzione dei commit come nel piano della fase A.

---

### Task 1: tipi e vettore di gusto (`types.ts`, `vector.ts`)

**Files:** create `src/lib/rank/types.ts`, `src/lib/rank/vector.ts`, `src/lib/rank/vector.test.ts`

**Interfaces prodotte:**
- `RankCandidate { id, mediaType, title, posterPath, year, genreIds, runtime, originalLanguage, providerIds, people, zappScore, voteAverage, voteCount }`
- `TasteVector { generi, decenni, provider, persone, tipo, runtime, lingua: Map<string, number>; fiducia: number; abbastanza: boolean }`
- `MASSA_PIENA = 60`, `MASSA_MINIMA = 20`
- `toTasteVector(row: Tables<"user_taste"> | null): TasteVector`

**Test:** la dimensione più alta vale 1; i negativi restano negativi; una riga assente dà un vettore vuoto con `fiducia` 0 e `abbastanza` false; `massa` 60+ dà `fiducia` 1; `massa` 20 dà `abbastanza` true.

### Task 2: affinità (`affinity.ts`)

**Interfaces prodotte:** `Contributo { dimensione, chiave, valore }`, `affinity(v: TasteVector, c: RankCandidate): { punteggio, percentuale, contributi }`

**Test:** gusto alto batte gusto basso a parità di qualità; qualità mancante vale 0,6; con `fiducia` 0 due candidati di gusto opposto ma stessa qualità hanno lo stesso punteggio; le dimensioni assenti rinormalizzano i pesi (un titolo senza durata non è punito); `percentuale` è `null` se `!abbastanza`.

### Task 3: diversità e spiegazione (`diversity.ts`, `explain.ts`)

**Interfaces prodotte:** `diversify(items, { size })`, `explain(contributi, nomi, qualita)`

**Test diversità:** tetto 3 per genere, 4 per provider, 2 per persona; gli scartati riempiono la coda se la lista non arriva a `size`; lista già corta resta intera. **Test spiegazione:** un ramo per dimensione, il ripiego "Molto amato su Zapp" solo con qualità alta, `null` quando non c'è niente da dire.

### Task 4: candidati (`candidates.ts`)

Server. Quattro fonti unite e deduplicate (classifiche, meglio votati, `discoverByGenre` sui 3 generi di testa, `discoverNewOnStreaming` sui provider di testa), esclusione della libreria, soglia voti 50/20, metadati da `titles` con colonne esplicite più i campi che `discover` già restituisce.

### Task 5: motore (`engine.ts`) e scaffale "Per te"

`getRankedForYou(type, limit)` in React `cache()`. `ForYouShelf` e `ItemShelf` passano `affinity` e `reason` a `PosterCard`; `ShelfItem` cresce di due campi opzionali.

### Task 6: collaudo con i dati veri e documentazione

`scripts/rank-dump.ts`, confronto fra due utenti diversi, utente nuovo senza percentuali, build + Playwright sulla home, sezione in `CLAUDE.md`, push.
