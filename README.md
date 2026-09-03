# Zapp ⚡

Web app mobile-first (PWA) per tracciare film e serie TV su tutte le piattaforme streaming. Zapp mostra su quale piattaforma è disponibile ogni titolo in Italia e apre l'app ufficiale con un deep link. Non riproduce contenuti.

**Stack:** Next.js 15 (App Router, Server Components), TypeScript strict, Tailwind CSS 4, Framer Motion, Supabase (Postgres + Auth + RLS), TMDB API v3, Serwist (PWA), deploy su Vercel.

## Setup locale

1. **Dipendenze**

   ```bash
   pnpm install
   ```

2. **Variabili d'ambiente** — copia `.env.example` in `.env.local` e compila:

   | Variabile | Dove trovarla |
   |---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | Supabase Dashboard → Project Settings → API |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase Dashboard → Project Settings → API Keys (anon) |
   | `SUPABASE_SERVICE_ROLE_KEY` | Supabase Dashboard → Project Settings → API Keys (service_role, **mai** nel client) |
   | `TMDB_API_READ_ACCESS_TOKEN` | vedi sotto |
   | `NEXT_PUBLIC_APP_URL` | `http://localhost:3000` in locale |

3. **Token TMDB**
   - Crea un account su [themoviedb.org](https://www.themoviedb.org/signup)
   - Vai su [Impostazioni → API](https://www.themoviedb.org/settings/api) e richiedi una API key (uso personale/developer)
   - Copia il **API Read Access Token** (il token lungo `eyJ…`, non la API key v3) in `TMDB_API_READ_ACCESS_TOKEN`
   - Il token resta solo lato server: tutte le chiamate TMDB passano dal proxy `/api/tmdb` o da funzioni server-only

4. **Migration** — le migration sono in `supabase/migrations/`. Con la [CLI Supabase](https://supabase.com/docs/guides/local-development):

   ```bash
   supabase link --project-ref <PROJECT_REF>
   supabase db push
   ```

   In alternativa incolla il contenuto di `supabase/migrations/0001_init.sql` nel SQL Editor del dashboard.

5. **Tipi database** — rigenerali dopo ogni migration:

   ```bash
   supabase gen types typescript --project-id <PROJECT_REF> > src/types/database.ts
   ```

6. **Auth Google (opzionale)** — Dashboard Supabase → Authentication → Providers → Google: inserisci Client ID/Secret di un progetto Google Cloud OAuth con redirect `https://<PROJECT_REF>.supabase.co/auth/v1/callback`.

7. **Avvio**

   ```bash
   pnpm dev
   ```

## Comandi qualità

```bash
pnpm typecheck   # tsc --noEmit
pnpm lint        # eslint
pnpm build       # build di produzione (genera anche il service worker)
```

## Override manuale dei link piattaforma

I link diretti alle piattaforme sono risolti in cascata: `manual` → `wikidata` → `search`. Per forzare un URL (mai sovrascritto dal resolver):

```bash
pnpm tsx scripts/set-link.ts <movie|tv> <tmdb_id> <provider_id> <url>
# esempio: Netflix (provider 8) per Il Trono di Spade
pnpm tsx scripts/set-link.ts tv 1399 8 https://www.netflix.com/title/70305903
```

ID provider principali: Netflix 8, Prime Video 119, Disney+ 337, Apple TV+ 350, NOW 39, Paramount+ 531, RaiPlay 222, Discovery+ 524, Mediaset Infinity 359 (da verificare).

## Import da Netflix

`/import/netflix`: carica `NetflixViewingHistory.csv` (Account → Profilo → Attività di visione → "Scarica tutto"). Il CSV è elaborato in memoria e mai salvato; i titoli sono riconosciuti su TMDB (matching per titolo normalizzato) e proposti in una pagina di revisione prima di qualsiasi scrittura. Le entry esistenti con voto o progresso più avanzato non vengono mai degradate. Viene registrata solo una riga aggregata in `imports` (fonte, righe, riconosciuti).

## Social (Fase 4)

- **Amicizie**: richiesta → accettazione; `are_friends()` (SECURITY DEFINER) è usata da tutte le policy RLS. Il blocco elimina la relazione e rende invisibili ricerca, profilo e liste in entrambe le direzioni.
- **Feed**: cronologico, per cursore, aggregato lato query (episodi stesso giorno → una riga; `finished`+`rated` entro 10 minuti → una riga). Le `activities` sono popolate **solo da trigger**; l'import Netflix passa dalla RPC `import_watch_entries` che imposta `zapp.skip_activities` per la transazione.
- **Scelta layout**: 5 tab nella bottom nav (Home, Cerca, Libreria, Amici, Profilo). Su 360px ogni tab ha ~72px, sopra il minimo touch di 48px: nessuna necessità di spostare Profilo nell'avatar.
- **Rate limit**: in-memory di default; con `UPSTASH_REDIS_REST_URL`/`TOKEN` passa a Upstash (consigliato su Vercel multi-istanza). Limiti: ricerca utenti 20/min, recensioni 10/h, commenti 30/h, consigli 30/h.

### Moderazione

3 segnalazioni distinte nascondono automaticamente una recensione (filtro `report_count < 3` in query). Revisione manuale via SQL:

```sql
-- contenuti nascosti in attesa di revisione
select r.id, r.body, p.username, count(distinct rp.reporter_id) as segnalazioni
from reviews r
join profiles p on p.id = r.user_id
join reports rp on rp.target_type = 'review' and rp.target_id = r.id
group by r.id, r.body, p.username
having count(distinct rp.reporter_id) >= 3;

-- per riabilitare: delete from reports where target_type='review' and target_id='<id>';
-- per rimuovere:   delete from reviews where id = '<id>';
```

## Note di schema

- `profiles.username` è NOT NULL: il trigger `handle_new_user` assegna un placeholder `user_<hex>` alla registrazione; l'onboarding lo sostituisce e valorizza `onboarding_completed_at`. Finché è `null`, il layout protetto redirige a `/onboarding`.
- `titles` / `title_providers` sono la cache locale di TMDB (TTL 7 giorni, `fetched_at`): scrivibili solo con service role.

## Attribuzione

**This product uses the TMDB API but is not endorsed or certified by TMDB.**

L'attribuzione è mostrata nel footer del profilo, come richiesto dai [termini TMDB](https://www.themoviedb.org/api-terms-of-use).
