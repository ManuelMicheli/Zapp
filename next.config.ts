import type { NextConfig } from "next";
import withSerwistInit from "@serwist/next";

const withSerwist = withSerwistInit({
  swSrc: "src/app/sw.ts",
  swDest: "public/sw.js",
  disable: process.env.NODE_ENV === "development",
});

const SUPABASE_HOST = (() => {
  try {
    return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").origin;
  } catch {
    return "";
  }
})();

// CSP: solo self + Supabase (API/storage) + immagini TMDB. Unica terza parte:
// il player YouTube (youtube-nocookie) per il trailer di stagione in sottofondo.
const CSP = [
  "default-src 'self'",
  "frame-src https://www.youtube-nocookie.com",
  "script-src 'self' 'unsafe-inline'", // inline richiesto dal runtime Next
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob: https://image.tmdb.org ${SUPABASE_HOST}`,
  // image.tmdb.org anche in connect-src: la CSP vale pure per sw.js, e il service worker
  // fa `fetch` dei poster (cache-first). Senza, ogni <img> TMDB fallisce appena il SW è attivo.
  `connect-src 'self' ${SUPABASE_HOST} wss://${SUPABASE_HOST.replace("https://", "")} https://image.tmdb.org`,
  "font-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

const nextConfig: NextConfig = {
  experimental: {
    // Router cache lato client: una pagina dinamica già vista riapre dalla memoria
    // per 30 s (tocco istantaneo su nav e "indietro"); le parti statiche prefetchate
    // restano 5 min. Le mutazioni chiamano comunque revalidatePath/router.refresh.
    staleTimes: { dynamic: 30, static: 300 },
  },
  headers: async () => [
    {
      source: "/(.*)",
      headers: [
        { key: "Content-Security-Policy", value: CSP },
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "X-Frame-Options", value: "DENY" },
        {
          key: "Permissions-Policy",
          value: "camera=(), microphone=(), geolocation=(self)",
        },
      ],
    },
  ],
  images: {
    // Niente ottimizzatore Vercel (quota Hobby → 402 e immagini rotte): il loader
    // chiede al CDN TMDB la taglia giusta per ogni larghezza. Vedi src/lib/image-loader.ts.
    loader: "custom",
    loaderFile: "./src/lib/image-loader.ts",
    remotePatterns: [
      {
        protocol: "https",
        hostname: "image.tmdb.org",
        pathname: "/t/p/**",
      },
      {
        protocol: "https",
        hostname: "*.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
    ],
  },
};

export default withSerwist(nextConfig);
