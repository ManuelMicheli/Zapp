# CLAUDE.md

Guida per Claude Code. **Questo file e' un indice: contiene solo cio' che vale per
tutto il progetto.** Il dettaglio di un sottosistema sta in `docs/architecture/`;
apri **solo** la pagina che ti serve, non tutte.

## Come si pubblica (vale per tutte le sessioni)

**Si pubblica solo cio' che sta su `origin/main`. Mai `vercel --prod` da un
worktree.** Su questo progetto lavorano piu' sessioni insieme, ognuna nel suo
albero, e `vercel --prod` spedisce **l'albero intero** da cui parte: chi pubblica
per ultimo cancella dal live il lavoro di tutti gli altri. Il 2026-09-12 e'
successo quattro volte in un'ora (sono sparite le pagine legali e KLIPY, poi
l'import multi-sorgente, poi la rotta `/go/…`), ogni volta senza un errore.

La sequenza, sempre:

```bash
git add -A && git commit          # cio' che non e' in un commit non va online
git fetch origin && git merge origin/main   # prendi il lavoro altrui, non cancellarlo
pnpm typecheck && pnpm lint && pnpm test
node scripts/rilascio.mjs         # controlla, aggiorna origin/main, pubblica, verifica
```

**Il deploy lo fa il push**: il progetto Vercel e' agganciato a GitHub, quindi
`main` che si muove fa partire da sola la build di produzione, che **clona il
repo**. Nessuno spedisce piu' il proprio albero, ed e' per questo che il
problema sparisce alla radice.

`scripts/rilascio.mjs` si rifiuta di pubblicare un albero sporco o che non
contiene gia' `origin/main`, aggiorna `main`, aspetta la build di quel commit e
poi confronta rotte **e pesi** con il deployment precedente: **una rotta sparita
significa che si e' perso il lavoro di un'altra sessione**, e lo script dice come
tornare indietro; una rotta che cambia peso e' solo un "guarda qui" (un
componente condiviso muove anche pagine che non hai toccato). `--prova` esegue
solo i controlli.

Il confronto sulle rotte non vede le modifiche **dentro** una pagina: se un'altra
sessione sta lavorando sulle stesse pagine, avvisala prima (le sessioni vive si
elencano con `ListAgents` e si avvisano con `SendMessage`).

`docs/project/WORKSPACE.md` fotografa il workspace all'11 settembre e **non
descrive piu' cosa sta in produzione**: non usarlo per decidere da dove
pubblicare.

## Project

Zapp: mobile-first PWA (Italian UI, code comments in Italian) to track movies/TV series and show where each title streams in Italy (TMDB `watch/providers`, region IT). Opens the official platform via deep link; never plays content, never scrapes Netflix/Prime/Disney.

Stack: Next.js 15 App Router (Server Components default), TypeScript strict, Tailwind CSS 4 (`@theme` tokens in `src/app/globals.css`, dark only), Framer Motion, Supabase (Postgres + Auth + RLS via `@supabase/ssr`), TMDB API v3, Serwist PWA, pnpm, Vercel. Built in 4 phases; the original specs are `docs/project/phase-prompts/zapp-fase{1..4}-*.md`.

## Commands

```bash
pnpm dev          # next dev --turbopack (service worker disabled in dev)
pnpm build        # production build, also generates public/sw.js
pnpm typecheck    # tsc --noEmit
pnpm lint         # eslint (flat config, next/core-web-vitals + next/typescript)
pnpm format       # prettier on src/**/*.{ts,tsx,css}

# DB
supabase db push                                                        # apply supabase/migrations/*
supabase gen types typescript --project-id <REF> > src/types/database.ts # regenerate after every migration

# Manual provider link override (source='manual', never overwritten by the resolver)
pnpm tsx scripts/set-link.ts <movie|tv> <tmdb_id> <provider_id> <https url>

# Manual cinema ticket link override (source='manual', never overwritten by the resolver)
pnpm tsx scripts/set-cinema-link.ts <cinema_id> <https url>

# Catalogo nazionale delle sale (riempie cinema_venues; lento di proposito, 0,7 s a richiesta)
pnpm tsx --env-file=.env.local scripts/warm-cinema-venues.ts [slug provincia…]

# Generi della home: liste curate e collaudo
pnpm tsx --conditions=react-server --env-file=.env.local scripts/build-genre-picks.ts  # rigenera src/data/genre-picks.json
pnpm tsx --conditions=react-server scripts/genre-dump.ts <user_id> [chiave…]           # stampa le liste, per leggerle
BASE=http://localhost:3401 node --env-file=.env.local scripts/genre-check.mjs          # verifica in browser (istanza avviata)

# Trailer
pnpm tsx scripts/backfill-trailers.ts --searches 80  # riempie title_trailers rispettando la quota YouTube
pnpm tsx scripts/audit-trailers.ts                   # verifica che ogni trailer salvato sia del suo titolo
pnpm tsx scripts/refresh-trailer-frames.ts           # rimisura le bande nere dei trailer salvati

pnpm test         # vitest, solo funzioni pure (src/**/*.test.ts)

# Banco di prova di scala (genera 500 utenti finti e si ripulisce da solo).
# select jsonb_pretty(public.bench_scale(250, 300, 7));   -- via MCP execute_sql
# Dopo una serie di corse: vacuum (full, analyze) public.watch_entries, ...
```

Vitest copre solo le funzioni pure di `src/lib/cinema/`, di `src/lib/import/` (`netflix-{title,rows,proposals}.ts`), di `src/lib/trailers/` (`channels.ts`, `match.ts`, `compute.ts`, `rank.ts`, `frame-bars.ts`, `stored.ts`) di `src/lib/genres/catalog.ts`, di `src/lib/tmdb/backdrops.ts` e di `src/lib/colors/dominant.ts`; il resto si verifica con `pnpm typecheck && pnpm lint && pnpm build`.

Env vars: see `.env.example`. `TMDB_API_READ_ACCESS_TOKEN` and `SUPABASE_SERVICE_ROLE_KEY` are server-only; code throws if they are missing or still start with `INSERISCI`.

## Hard rules (from the phase specs)

- No TMDB calls from the client. Everything goes through `src/lib/tmdb/client.ts` (`server-only`) or the allowlisted proxy `src/app/api/tmdb/[...path]/route.ts`.
- No external UI libraries (no shadcn). Primitives are hand-written in `src/components/ui/`.
- No `localStorage` for user data.
- Fonts are self-hosted (`public/fonts`, `next/font/local`). CSP in `next.config.ts` allows only self, Supabase host, and `image.tmdb.org`; adding a third-party origin requires editing the CSP.
- Service-role client is only for system data (TMDB cache writes, link resolver) and for system reads of that cache on public routes (`getWallPosters` falls back to `titles` when TMDB is down). Never for user data, never exposed to the client.

## Mappa dei sottosistemi

Una riga per pagina: leggi la riga, apri il file solo se tocchi quell'area.

| Pagina | Quando serve |
| --- | --- |
| [legal.md](docs/architecture/legal.md) | Consensi, documenti pubblici, cancellazione ed export, obblighi DSA. |
| [security.md](docs/architecture/security.md) | RLS, policy, Server Actions, rate limit, header. **Da leggere prima di toccare DB o azioni.** |
| [scale.md](docs/architecture/scale.md) | Policy performanti, indici, quote di terzi, `titles.raw` snello. |
| [auth-routing.md](docs/architecture/auth-routing.md) | Middleware, `getViewer()`, i tre client Supabase, budget di latenza. |
| [tmdb-cache.md](docs/architecture/tmdb-cache.md) | `tmdb/client.ts`, `getOrFetchTitle`, mapper, loader immagini. |
| [recommendations.md](docs/architecture/recommendations.md) | "Simili" e "Perche hai visto X": segnali, candidati, punteggio. |
| [algorithm.md](docs/architecture/algorithm.md) | Le cinque fasi A-E: segnali utente, ZappScore, ranking, home dinamica, segnale sociale. |
| [provider-links.md](docs/architecture/provider-links.md) | Deep link alle piattaforme, cascata del resolver, `AppLink`/app native. |
| [watch-tracking.md](docs/architecture/watch-tracking.md) | `watch_entries`, ordine cronologico, query di lista, navigazione istantanea. |
| [social.md](docs/architecture/social.md) | Amicizie, recensioni, feed, notifiche, import Netflix, avatar. |
| [home.md](docs/architecture/home.md) | Carosello, Film/Serie TV, "Continua a guardare", momento contestuale, muro, anteprima hover. |
| [routes.md](docs/architecture/routes.md) | Route group, ricerca, ricerche recenti. |
| [cinema.md](docs/architecture/cinema.md) | Sorgenti orari, sale, biglietteria, biglietti in app, copertura nazionale. |
| [zconnection.md](docs/architecture/zconnection.md) | Estensione MV3, scrobble, riconoscimento titolo, popup. |
| [lists-comments.md](docs/architecture/lists-comments.md) | Liste condivise, link-consiglio, commenti sui titoli (KLIPY, moderazione), Play diretto. |
| [daily-question.md](docs/architecture/daily-question.md) | Domanda del giorno, podio, popup. |
| [genres.md](docs/architecture/genres.md) | Pillole "Per genere", catalogo curato. |
| [easter-eggs.md](docs/architecture/easter-eggs.md) | Le chicche (citazioni fra film e serie). |
| [ui-foundations.md](docs/architecture/ui-foundations.md) | Token, `.glass`, icone, marchio, regola backdrop. |
| [ui-navigation.md](docs/architecture/ui-navigation.md) | `TopNav`, testate, indietro/briciole, `Sheet`, desktop/tablet. |
| [title-page.md](docs/architecture/title-page.md) | Scheda titolo, pagina stagione, fondale cinematico, trailer. |

## PWA

`src/app/sw.ts` (Serwist) precaches the build and cache-firsts `image.tmdb.org`; compiled to `public/sw.js` by `pnpm build` (gitignored). `src/app/manifest.ts` generates the manifest.

## Conventions

- Path alias `@/*` → `src/*`. Server-only modules start with `import "server-only"`.
- Files under `src/lib/**/actions.ts` are Server Actions (`"use server"`); `queries.ts` are server-only reads. Client components sit next to their page (e.g. `LibraryGrid.tsx`, `ImportClient.tsx`).
- After adding a migration, regenerate `src/types/database.ts`; the `Tables<>`/`Enums<>` helpers from that file are used everywhere for row types.
- Prettier: double quotes, trailing commas, printWidth 90.
- TMDB attribution ("This product uses the TMDB API but is not endorsed or certified by TMDB.") must remain visible in the profile footer.
- **Build in parallelo**: `next.config.ts` legge `NEXT_DIST_DIR` (default `.next`), così
  una verifica può costruire in una cartella propria senza rompere la build di un'altra
  sessione sullo stesso albero: `NEXT_DIST_DIR=.next-check pnpm build && NEXT_DIST_DIR=.next-check pnpm exec next start -p 3399`.
  Le cartelle `.next-*` sono ignorate da git e da eslint.

## Igiene del repository

- **Un fatto sta in un posto solo.** Una regola generale va qui; il dettaglio di un
  sottosistema va nella sua pagina di `docs/architecture/`. Non duplicare: un fatto
  scritto due volte diverge alla prima modifica.
- **Quando cambi comportamento, aggiorna la pagina di quel sottosistema**, non questo
  file. Questo file cambia solo se cambia una regola valida per tutto il progetto o se
  nasce un sottosistema nuovo (una riga in tabella + una pagina).
- **Scrivi qui solo cio' che il codice non dice**: perche' una scelta e' stata fatta,
  cosa e' gia' stato provato e non funziona, quali trappole sono costate tempo. La
  struttura del codice si legge dal codice.
- **Fuori dal repo** stanno build di verifica (`.next-*`), copie di lavoro, patch e
  materiale di recupero: sono in `.gitignore`, non vanno aggiunti con `git add -f`.
- **Niente file sparsi nella radice.** Documenti in `docs/`, script in `scripts/`,
  asset serviti in `public/`, materiale di progetto in `docs/project/`.
