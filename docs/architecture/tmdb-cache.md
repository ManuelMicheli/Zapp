# TMDB and the local cache

- `src/lib/tmdb/client.ts`: typed fetchers, Next `fetch` revalidate per endpoint, `language=it-IT`. **In front of the throttle (15 req/s) sits an in-process memo keyed by URL** (same TTL as `revalidate`, dedupes in-flight calls): without it every render (home, search, the nav prefetch of five tabs) queued 10–15 cached calls behind the limiter and search/library showed 10 s TTFB (375 `tmdbFetch` per navigation round, now 19). `getMovie`/`getTv` use one `append_to_response` call (credits, videos, recommendations, external_ids, watch/providers) with `include_video_language=it,en,null` (also `getSeason`): without it TMDB returns Italian videos only and most titles lose their trailer. `TITLE_CACHE_EPOCH` in `src/lib/config.ts`: bump it whenever the shape of `titles.raw` changes, so title pages (`requireFull`) refetch older rows once.
- `src/lib/tmdb/cache.ts` `getOrFetchTitle(id, mediaType, {requireFull})`: reads `titles` + `title_providers` in parallel (7-day TTL via `fetched_at`, `TITLE_CACHE_TTL_MS` in `src/lib/config.ts`); on miss/stale it fetches TMDB and upserts with the service client. **Never call it per search result or per list row**: it is the title-page fetch. Falls back to stale rows if TMDB fails. `requireFull` forces a refetch when `raw` lacks `credits` (rows saved before phase 2).
- `src/lib/tmdb/get-title.ts` wraps it in React `cache()` so `generateMetadata` and the page share one fetch.
- `src/lib/tmdb/mappers.ts` converts TMDB payloads to `titles`/`title_providers` insert rows and search items. `titles.raw` stores the full TMDB JSON; `src/lib/watch/episodes.ts` derives season/episode progress from `raw.seasons` (skips season 0 and unaired seasons).
- **Images bypass the Vercel optimizer.** `next.config.ts` sets `images.loader: "custom"` with
  `src/lib/image-loader.ts`: for `image.tmdb.org` URLs it rewrites the size segment to the
  smallest TMDB size (`w92…w1280`, else `original`) that covers each srcset width; other URLs
  (Supabase avatars, already resized to 512px on upload; local assets) pass through untouched.
  Reason: on the Vercel Hobby plan the optimized-image quota runs out and `/_next/image`
  answers `402 OPTIMIZED_IMAGE_REQUEST_PAYMENT_REQUIRED`, so every `<Image>` broke
  (2026-09-05). `quality` on `<Image>` is ignored by the loader.
- `src/lib/config.ts` is the single source for region/language, image URL helpers and `PROVIDERS` (TMDB provider id → name, search URL template, optional title URL template + Wikidata property).

