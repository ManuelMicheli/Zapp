# Fase D dell'algoritmo — home dinamica: piano di implementazione

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** far nascere dalla home uno-tre scaffali che dicono perché esistono ("Ancora con Pedro Pascal", "Perché ami la fantascienza", "Il meglio degli anni 2000"), e ordinare la home in base a quanto Zapp sa dell'utente.

**Architecture:** nessuna fonte di dati nuova. `rails.ts` è puro e decide **quali** scaffali; `getRails` in `engine.ts` li riempie con gli stessi candidati, la stessa affinità e la stessa diversità di "Per te", escludendo ciò che "Per te" ha già mostrato. `PersonalRails` li rende con `ItemShelf`, come tutti gli altri.

**Spec:** `docs/superpowers/specs/2026-09-08-algoritmo-fase-d-home-dinamica-design.md`

## Global Constraints

Gli stessi della fase C (worktree `Zapp-algoritmo`, italiano, `NEXT_DIST_DIR=.next-check` + `git checkout -- tsconfig.json`, `pnpm typecheck && pnpm lint && pnpm test` prima di ogni commit).

---

### Task 1 — ordine e nomi delle categorie *(fatto, commit `55d347e`)*

- [x] L'ordine degli scaffali dipende da `user_taste.massa`: con un profilo pieno "Per te" e "Perché hai visto X" subito dopo "Continua a guardare", altrimenti sotto le classifiche.
- [x] "I più amati di sempre" → **"I meglio votati su Zapp"**, alimentato da `getTopRatedOnZapp` (ZappScore della fase B) invece che da `discoverTopRated` di TMDB.
- [x] Rimosso il codice rimasto senza chiamanti (`getForYouShelf`, `getTopRatedShelves`).

### Task 2 — `rails.ts`, puro

- [x] `buildRails(vector, nomi)`: persone → generi → decenni, soglia 0,55 del massimo, al massimo 3, una sola per dimensione, nessun rail con un titolo a metà.
- [x] `appartiene(spec, candidato)`: per le persone vale solo chi è fra regia e primi quattro interpreti — "Ancora con X" su una particina è una promessa tradita.
- [x] Test: ordine delle dimensioni, regia vs cast nel titolo, una dimensione un rail, soglia, profilo vuoto, genere senza nome italiano.

### Task 3 — `getRails` nel motore

- [x] Stessi candidati e stessa affinità di "Per te" (`getCandidates` è già in `cache()`: nessuna chiamata in più).
- [x] Esclude i titoli già mostrati e i rail si escludono a vicenda.
- [x] Meno di `MIN_RAIL` (6) titoli → il rail non compare.
- [x] Il motivo sotto la copertina **non ripete il titolo dello scaffale**: i contributi si potano prima di `variaMotivi`, che altrimenti li ripesca.

### Task 4 — `PersonalRails` in home

- [x] Sotto "Per te", dentro il ramo del profilo ricco.
- [x] Nella scheda "Tutto" i rail con la stessa chiave (film e serie) si fondono con `mixShelf`.

### Task 5 — verifica coi dati veri

- [x] Build, `next start`, home dell'utente di prova: compaiono "Il meglio degli anni 2010" e "Perché ami azione e avventura", con titoli veri (Roma, Whiplash, The Social Network, Black Mirror), voto e affinità.
- [x] Nessun titolo ripetuto fra "Per te" e i rail.
- [x] Verificato che il motivo non ripeta più il nome dello scaffale.

### Task 6 — documentazione e deploy

- [ ] Sezione in `CLAUDE.md`, commit, `git push origin HEAD:main`.
