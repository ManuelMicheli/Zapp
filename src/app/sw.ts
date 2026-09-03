import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import { CacheFirst, ExpirationPlugin, Serwist } from "serwist";
import { defaultCache } from "@serwist/next/worker";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: [
    {
      // Poster e loghi TMDB: cache-first, cambiano di rado
      matcher: ({ url }) => url.hostname === "image.tmdb.org",
      handler: new CacheFirst({
        cacheName: "tmdb-images",
        plugins: [
          new ExpirationPlugin({
            maxEntries: 300,
            maxAgeSeconds: 30 * 24 * 60 * 60,
          }),
        ],
      }),
    },
    // Il resto: strategia di default Serwist (network-first per pagine)
    ...defaultCache,
  ],
});

serwist.addEventListeners();
