import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";

const inter = localFont({
  src: "../../public/fonts/inter-var.woff2",
  display: "swap",
  weight: "100 900",
});

export const metadata: Metadata = {
  title: {
    default: "Zapp",
    template: "%s · Zapp",
  },
  description:
    "Traccia film e serie TV su tutte le piattaforme streaming. Scopri dove guardare ogni titolo in Italia.",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Zapp",
  },
};

export const viewport: Viewport = {
  themeColor: "#000000",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

/**
 * Origini di cui apriamo la connessione prima ancora di sapere quale immagine
 * serve. Praticamente ogni schermata dell'app mostra locandine o fondali di
 * `image.tmdb.org` e foto profilo dallo storage Supabase: senza `preconnect` la
 * prima immagine di ogni visita paga DNS + TCP + TLS (su rete mobile sono
 * facilmente 200–300 ms) *dopo* essere stata scoperta nell'HTML. Con il
 * preconnect quel giro parte insieme al documento.
 *
 * `X-DNS-Prefetch-Control: off` in `next.config.ts` non c'entra e resta com'è:
 * spegne il prefetch DNS *speculativo* dei link, non i preconnect dichiarati.
 */
const PRECONNECT = [
  "https://image.tmdb.org",
  (() => {
    try {
      return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").origin;
    } catch {
      return "";
    }
  })(),
].filter(Boolean);

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="it">
      <head>
        {PRECONNECT.map((href) => (
          // niente `crossOrigin`: le locandine sono `<img>` senza CORS e una
          // preconnessione "anonymous" aprirebbe un socket diverso da quello che
          // servirà davvero, cioè lavoro sprecato invece che tempo guadagnato
          <link key={href} rel="preconnect" href={href} />
        ))}
      </head>
      <body className={`${inter.className} antialiased`}>{children}</body>
    </html>
  );
}
