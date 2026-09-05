import type { ImageLoaderProps } from "next/image";

// Loader di next/image (next.config `images.loaderFile`): le immagini NON passano
// dall'ottimizzatore di Vercel. Sul piano Hobby la quota di immagini ottimizzate si
// esaurisce e /_next/image risponde 402 OPTIMIZED_IMAGE_REQUEST_PAYMENT_REQUIRED:
// ogni poster, foto del cast e fondale diventava un'immagine rotta. Il CDN TMDB serve
// già ogni taglia (w92…w1280, original) per qualunque tipo di immagine, quindi per
// ogni larghezza dello srcset chiediamo direttamente la taglia più piccola che la
// copre. Gli altri URL (avatar Supabase, già ridotti a 512px al caricamento; asset
// locali) passano intatti.
const TMDB_PREFIX = "https://image.tmdb.org/t/p/";
const TMDB_WIDTHS = [92, 154, 185, 300, 342, 500, 780, 1280] as const;

/** Taglia TMDB più piccola con larghezza ≥ `width`; oltre 1280 l'originale. */
export function tmdbSizeFor(width: number): string {
  const size = TMDB_WIDTHS.find((w) => w >= width);
  return size ? `w${size}` : "original";
}

export default function imageLoader({ src, width }: ImageLoaderProps): string {
  if (!src.startsWith(TMDB_PREFIX)) return src;
  const rest = src.slice(TMDB_PREFIX.length);
  const slash = rest.indexOf("/");
  if (slash < 0) return src;
  return `${TMDB_PREFIX}${tmdbSizeFor(width)}${rest.slice(slash)}`;
}
