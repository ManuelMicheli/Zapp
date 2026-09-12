import type { NextConfig } from "next";
import withSerwistInit from "@serwist/next";

const withSerwist = withSerwistInit({
  swSrc: "src/app/sw.ts",
  swDest: "public/sw.js",
  disable: process.env.NODE_ENV === "development",
  /**
   * Il precache e' un elenco di cose da scaricare, e il service worker le scarica
   * **subito dopo la prima schermata**: sono byte che gareggiano con la pagina che
   * l'utente sta guardando, sulla stessa rete.
   *
   * Il default (tutto `public/`) ci portava dentro pdf.js: il worker (1236 KB), il
   * fallback JBIG2 (142 KB) e il wasm (102 KB) — 1,48 MB, il 78% del precache di
   * `public/`, per una cosa che serve solo a chi carica il PDF di un biglietto del
   * cinema. Ora l'elenco e' esplicito: font, icone PWA e della nav, avatar
   * predefiniti, marchi delle catene. pdf.js resta servito da noi (la CSP vuole
   * `worker-src 'self'`) e viene scaricato quando lo si apre davvero.
   *
   * Aggiungendo una cartella a `public/` che deve stare offline, va aggiunta qui.
   */
  globPublicPatterns: ["fonts/**", "icons/**", "avatars/**", "cinema/**"],
});

const SUPABASE_HOST = (() => {
  try {
    return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").origin;
  } catch {
    return "";
  }
})();

// CSP: solo self + Supabase (API/storage) + immagini TMDB. Unica terza parte:
// il player YouTube (youtube-nocookie) per il trailer in sottofondo.
//
// `script-src` tiene `'unsafe-inline'` di proposito. L'alternativa e' il nonce
// per richiesta, che pero' in App Router obbliga ogni pagina a rendersi
// dinamicamente (il nonce non puo' stare in un HTML prerenderizzato): sparirebbe
// il rendering statico su cui poggiano prefetch, `staleTimes` e le aperture
// istantanee. Il rischio che copre e' basso qui: nessun `dangerouslySetInnerHTML`
// in tutta l'app, nessun HTML scritto dagli utenti, nessun `eval`. Le altre
// direttive sono strette apposta per compensare.
// Catalogo commenti: API e media diretti secondo i requisiti KLIPY.
const KLIPY_MEDIA =
  "https://static.klipy.com https://static1.klipy.com https://static2.klipy.com https://static.klipy.co";
const CSP = [
  "default-src 'self'",
  "frame-src https://www.youtube-nocookie.com",
  // inline richiesto dal runtime Next; wasm-unsafe-eval dal decodificatore JBIG2 di
  // pdf.js (QR dei biglietti): sotto CSP il browser rifiuta di istanziare il WebAssembly
  "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob: https://image.tmdb.org ${SUPABASE_HOST} ${KLIPY_MEDIA}`,
  // image.tmdb.org anche in connect-src: la CSP vale pure per sw.js, e il service worker
  // fa `fetch` dei poster (cache-first). Senza, ogni <img> TMDB fallisce appena il SW e' attivo.
  `connect-src 'self' ${SUPABASE_HOST} wss://${SUPABASE_HOST.replace("https://", "")} https://image.tmdb.org https://api.klipy.com ${KLIPY_MEDIA}`,
  "font-src 'self'",
  // Niente plugin, niente <object>/<embed>: sono la via piu' vecchia per far
  // eseguire qualcosa partendo da un file caricato.
  "object-src 'none'",
  // Service worker (Serwist) e worker di pdf.js, entrambi serviti da noi.
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  "media-src 'self' blob:",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "upgrade-insecure-requests",
].join("; ");

/**
 * Le intestazioni dei due file `.well-known`: identiche per entrambi, HSTS
 * compreso (la regola generale li esclude, ma l'HSTS deve valere lo stesso).
 */
const WELL_KNOWN_HEADERS = [
  { key: "Content-Type", value: "application/json" },
  { key: "Cross-Origin-Resource-Policy", value: "cross-origin" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Cache-Control", value: "public, max-age=3600" },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
];

const nextConfig: NextConfig = {
  // Cartella di build: due `next build` nello stesso `.next` si rompono a vicenda
  // (sessioni parallele sullo stesso albero). Con NEXT_DIST_DIR una verifica può
  // costruire per conto suo senza toccare la build di nessun altro.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  experimental: {
    // Router cache lato client: una pagina dinamica già vista riapre dalla memoria
    // per 30 s (tocco istantaneo su nav e "indietro"); le parti statiche prefetchate
    // restano 5 min. Le mutazioni chiamano comunque revalidatePath/router.refresh.
    staleTimes: { dynamic: 30, static: 300 },
    // Corpo massimo di una Server Action. Il default di Next e' 1 MB, cioe' meno
    // di quello che la pagina di import promette (5MB, `MAX_FILE_BYTES` in
    // src/app/(app)/import/limits.ts): oltre il MB la richiesta non arriva
    // nemmeno alla action, la promise si rifiuta e l'utente legge "Connessione
    // interrotta" invece del motivo vero. Il mega in piu' del tetto dichiarato
    // copre le intestazioni del multipart, che contano anche loro nel corpo.
    serverActions: { bodySizeLimit: "6mb" },
  },
  headers: async () => [
    {
      // Il logo delle email di autenticazione, e nient'altro. Lo scarica il
      // client di posta da un'altra origine: la CORP `same-origin` del resto
      // dell'app lo farebbe sparire (ERR_BLOCKED_BY_RESPONSE.NotSameOrigin nei
      // client che rendono con WebKit; Gmail passa dal suo proxy e non se ne
      // accorge). Sono file pubblici, non risposte dell'app: l'eccezione costa
      // nulla, ma resta scritta su una cartella sola.
      source: "/email/(.*)",
      headers: [
        { key: "Cross-Origin-Resource-Policy", value: "cross-origin" },
        { key: "X-Content-Type-Options", value: "nosniff" },
      ],
    },
    // I due file di associazione delle app native (app link Android,
    // universal link iOS): li leggono Google e Apple, non un browser con la
    // nostra sessione, quindi vanno serviti come JSON puro, senza CSP e senza
    // CORP same-origin. **Un percorso esatto per file, non `/.well-known/(.*)`**:
    // quella forma promette `Content-Type: application/json` a qualunque file
    // finisca in quella cartella un domani (una verifica di dominio, un
    // `security.txt`), che JSON non è. `apple-app-site-association` resta qui
    // anche adesso che il file non c'è: il giorno in cui lo si aggiunge (vedi
    // docs/architecture/mobile.md) deve già arrivare con le intestazioni giuste.
    {
      source: "/.well-known/assetlinks.json",
      headers: WELL_KNOWN_HEADERS,
    },
    {
      source: "/.well-known/apple-app-site-association",
      headers: WELL_KNOWN_HEADERS,
    },
    {
      // Tutto il resto. Le immagini delle email e i file .well-known sono
      // esclusi qui sopra: due regole che si sovrappongono darebbero due
      // `Cross-Origin-Resource-Policy` diverse sulla stessa risposta.
      source: "/((?!email/|\\.well-known/).*)",
      headers: [
        { key: "Content-Security-Policy", value: CSP },
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "X-Frame-Options", value: "DENY" },
        {
          // Due anni, sottodomini compresi: dopo la prima visita il browser non
          // prova nemmeno a parlare in chiaro, quindi non c'e' la richiesta http
          // iniziale su cui intercettare il cookie di sessione.
          key: "Strict-Transport-Security",
          value: "max-age=63072000; includeSubDomains; preload",
        },
        {
          // Le finestre aperte da noi (piattaforme, biglietterie) restano in un
          // gruppo di contesti a parte: non possono toccare `window.opener`.
          key: "Cross-Origin-Opener-Policy",
          value: "same-origin",
        },
        {
          // Nessun altro sito puo' includere le nostre risposte come risorsa.
          key: "Cross-Origin-Resource-Policy",
          value: "same-origin",
        },
        { key: "X-Permitted-Cross-Domain-Policies", value: "none" },
        { key: "X-DNS-Prefetch-Control", value: "off" },
        {
          // L'elenco e' una lista chiusa: tutto cio' che non serve resta spento,
          // cosi' una terza parte in un iframe non puo' chiederlo per noi.
          key: "Permissions-Policy",
          value: [
            "accelerometer=()",
            // Il trailer di sottofondo e' un iframe youtube-nocookie: senza
            // nominarlo qui, una Permissions-Policy che si limita a `self`
            // toglierebbe autoplay e schermo intero proprio al player.
            'autoplay=(self "https://www.youtube-nocookie.com")',
            "camera=()",
            "display-capture=()",
            'encrypted-media=(self "https://www.youtube-nocookie.com")',
            'fullscreen=(self "https://www.youtube-nocookie.com")',
            "geolocation=(self)",
            "gyroscope=()",
            "interest-cohort=()",
            "magnetometer=()",
            "microphone=()",
            "payment=()",
            "usb=()",
          ].join(", "),
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
