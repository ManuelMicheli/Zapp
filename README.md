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

## Note di schema

- `profiles.username` è NOT NULL: il trigger `handle_new_user` assegna un placeholder `user_<hex>` alla registrazione; l'onboarding lo sostituisce e valorizza `onboarding_completed_at`. Finché è `null`, il layout protetto redirige a `/onboarding`.
- `titles` / `title_providers` sono la cache locale di TMDB (TTL 7 giorni, `fetched_at`): scrivibili solo con service role.

## Attribuzione

**This product uses the TMDB API but is not endorsed or certified by TMDB.**

L'attribuzione è mostrata nel footer del profilo, come richiesto dai [termini TMDB](https://www.themoviedb.org/api-terms-of-use).
