import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import { CacheFirst, ExpirationPlugin, NetworkOnly, Serwist } from "serwist";
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
      // Le tendenze e i media KLIPY devono arrivare direttamente dal fornitore.
      matcher: ({ url }) => url.hostname === "api.klipy.com" || ["static.klipy.com", "static1.klipy.com", "static2.klipy.com", "static.klipy.co"].includes(url.hostname),
      handler: new NetworkOnly(),
    },
    {
      // Il default cachea anche le API no-store: il live deve usare solo la rete.
      matcher: ({ url, sameOrigin }) => sameOrigin && url.pathname === "/api/watching",
      handler: new NetworkOnly({ networkTimeoutSeconds: 10 }),
    },
    {
      // Il redirect Play puo' richiedere il fallback esterno: mai cachearlo e
      // non troncarlo col timeout breve usato dal polling live.
      matcher: ({ url, sameOrigin }) => sameOrigin && url.pathname.startsWith("/play/"),
      handler: new NetworkOnly(),
    },
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

// Elimina le vecchie risposte dinamiche eventualmente salvate dalla PWA.
self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    for (const name of await caches.keys()) {
      const cache = await caches.open(name);
      for (const request of await cache.keys()) {
        const url = new URL(request.url);
        if (
          url.origin === self.location.origin &&
          (url.pathname === "/api/watching" || url.pathname.startsWith("/play/"))
        )
          await cache.delete(request);
      }
    }
  })());
});

serwist.addEventListeners();
