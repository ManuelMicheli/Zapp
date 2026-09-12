# Auth and routing

- `src/middleware.ts` → `updateSession` in `src/lib/supabase/middleware.ts`: refreshes the session cookie, redirects unauthenticated users to `/login` (public paths: `/login`, `/signup`, `/auth/*`). Do not put logic between `createServerClient` and `getClaims()`.
- **Auth reads are local.** The project signs JWTs with ES256 (asymmetric keys), so `supabase.auth.getClaims()` verifies the token against the cached JWKS without a round trip. `src/lib/auth/viewer.ts`: `getViewer()` (id + email) and `getViewerProfile()` (adds `onboarding_completed_at`), both in React `cache()` → one read per request shared by layout, pages and Suspense sections. **Every read path uses `getViewer()`; `getUser()` stays only in Server Actions and route handlers that write.**
- `src/app/(app)/layout.tsx` calls `getViewerProfile()` and redirects to `/onboarding` until `profiles.onboarding_completed_at` is set. The `handle_new_user` trigger assigns a placeholder `user_<hex>` username at signup; onboarding replaces it. The layout also mounts `ImportProvider` + `ImportChip` (see Social).
- **Latency budget.** Vercel functions run in `fra1` (`vercel.json` `regions`), next to Supabase `eu-central-1`: a DB round trip costs ~5 ms instead of the ~100 ms measured with the default `iad1` (`X-Vercel-Id: fra1::iad1::…`, 2026-09-05). Keep it that way: never add a sequential await that is not needed, prefer `Promise.all`.
- Three Supabase clients in `src/lib/supabase/`: `client.ts` (browser), `server.ts` `createClient()` (cookie-bound, RLS on) and `createServiceClient()` (bypasses RLS).
- **Il marchio nell'autenticazione sta fuori dal codice** (2026-09-09): il nome e
  l'icona nella schermata "Scegli un account" di Google si impostano nella Google
  Cloud Console (Branding), non in Supabase; sotto al nome Google scrive comunque il
  dominio del callback (`<ref>.supabase.co`), che sparisce solo con un Custom Domain
  Supabase. Le sei email di autenticazione le genera `scripts/auth-emails.mjs` (file
  in `docs/auth/email-templates/`, caricabili con `--push` e un Personal Access
  Token); il mittente "Zapp" richiede un SMTP proprio. Istruzioni in
  `docs/auth/README.md`. La testata e' il **muro di locandine come GIF**
  (`scripts/email-wall.mjs` rende in Chrome la geometria di `PosterWall` fotogramma
  per fotogramma e impacchetta con ffmpeg: nelle email non esistono ne' animazioni
  CSS ne' JavaScript), e sotto non c'e' nessuna card: testo e bottone stanno sul
  fondo, come nel foglio di login. **Le immagini stanno in `public/email/`**, la sola
  cartella con `Cross-Origin-Resource-Policy: cross-origin` in `next.config.ts`: col
  `same-origin` di tutto il resto un client di posta che rende in WebKit le scarta, e
  la regola generale la esclude con un lookahead perche' due regole sovrapposte
  manderebbero due CORP diverse.

