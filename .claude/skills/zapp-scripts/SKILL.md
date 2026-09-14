---
name: zapp-scripts
description: Script di manutenzione di Zapp (link manuali provider/cinema, catalogo sale, generi curati, trailer, banco di prova di scala). Usa quando devi lanciare o rigenerare dati con gli script in scripts/ o il bench_scale su Supabase.
---

# Script di manutenzione

Tutti i comandi si lanciano dalla radice del repo. Le override `source='manual'` non vengono mai
sovrascritte dal resolver.

```bash
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

# Banco di prova di scala (genera 500 utenti finti e si ripulisce da solo).
# select jsonb_pretty(public.bench_scale(250, 300, 7));   -- via MCP execute_sql
# Dopo una serie di corse: vacuum (full, analyze) public.watch_entries, ...
```

Dettagli per sottosistema: `docs/architecture/genres.md`, `docs/architecture/cinema.md`,
`docs/architecture/title-page.md` (trailer), `docs/architecture/scale.md` (bench).
