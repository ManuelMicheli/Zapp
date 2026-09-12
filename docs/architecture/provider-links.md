# Provider deep links

**Every provider button must open the exact title page on the platform, never a search or a home.** `src/lib/links/resolve.ts` `resolveProviderLinks(title, providerIds)` (batch; `resolveProviderLink` is the single-provider wrapper): cascade `manual` → `justwatch` → `wikidata` (via `titles.external_ids.wikidata_id`, 3 s timeout, configured providers only) → `search` URL (configured providers only). `src/lib/links/justwatch.ts` `getJustWatchOffers(title)` (React `cache()`, one GraphQL call per title, 4 s timeout, Next fetch cache 1 d): searches `apis.justwatch.com` by `title` then `original_title`, keeps the result whose `tmdbId` matches, and maps IT web offers by `packageId` (= TMDB `provider_id`) to a cleaned `standardWebURL` (tracking params stripped, HBO Max forced to `/it/it/`, "with ASL" variants penalised, home URLs discarded). Result persisted in `title_provider_links` (`justwatch`/`wikidata` TTL 30 d, `search` retried daily, `manual` never overwritten; migration 0006 adds the `justwatch` source). Where a link is not in cache yet (home "Continua", library) use `providerHref()` from `src/lib/links/go.ts`: it returns the cached direct URL or `/go/[mediaType]/[id]/[providerId]` (`src/app/go/.../route.ts`), which resolves on the fly and 302-redirects. `ProviderButton` shows "Apri" only for direct links (`direct` prop), "Cerca" for search fallbacks.

- **Il link deve aprire l'app, non il sito** (2026-09-09, segnalazione utente su
  Disney+): quasi tutte le piattaforme reindirizzano da sole il browser sulla
  propria app, Disney+ no — `disneyplus.com/browse/entity-…` resta nel browser.
  Ogni link verso una piattaforma passa da `AppLink` (`src/components/ui/AppLink.tsx`,
  client) invece che da un `<a target="_blank">` a mano: `ProviderButton`,
  `ContinueCard`, i due link "Continua su" di `TitleActionsBar` e `PlatformLauncher`.
  Le regole stanno in `src/lib/links/native-app.ts` (puro, Vitest): `NATIVE_APPS`
  elenca **solo** le piattaforme che vanno forzate (oggi Disney+, pacchetto
  `com.disney.disneyplus`), per tutte le altre `AppLink` è il link di prima.
  Su **Android** si va a `intent://<host><path>#Intent;scheme=https;package=…;S.browser_fallback_url=<url>;end`:
  Chrome consegna all'app senza passare dalla verifica degli App Links e chi non
  ce l'ha finisce sul sito (il ripiego va **codificato**: un `;` o un `&` crudo
  romperebbe la grammatica dell'intent). Su **iOS** l'universal link esiste già
  (l'AASA di Disney+ dichiara `/browse/*`), ma dentro la PWA in standalone
  `target="_blank"` apre una scheda del browser in-app, che all'app nativa non
  cede mai: si naviga **top-level** sullo stesso URL. Un href relativo (`/go/…`,
  che risolve al volo) resta un link normale: la destinazione non si conosce
  ancora. Per aggiungere una piattaforma a `NATIVE_APPS` va prima verificato che
  il suo link https resti davvero nel browser.

