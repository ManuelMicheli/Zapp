import "server-only";

import { unstable_cache } from "next/cache";
import sharp from "sharp";
import { PROVIDER_BRAND, providerLogoUrl } from "@/lib/config";
import { dominantColor } from "./palette";

/** Il logo del provider non cambia: 30 giorni, come la palette delle locandine. */
const REVALIDATE_S = 30 * 24 * 60 * 60;
/** Logo senza colore (bianco/nero, tipo Apple TV): grigio, mai un colore inventato. */
const NEUTRAL = "#9CA3AF";

function toHex([r, g, b]: [number, number, number]): string {
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

/**
 * Colore del logo TMDB `w92` (~3 KB): il logo di un servizio è quasi sempre un
 * riquadro pieno del colore del marchio, quindi la tinta dominante *è* il marchio.
 * Serve alla lista "Dove guardarlo", dove ogni servizio deve avere la sua sfumatura
 * anche se non è fra i pochi in `PROVIDER_BRAND` (i canali Amazon sono decine).
 */
async function computeLogoBrand(logoPath: string): Promise<string> {
  try {
    const res = await fetch(providerLogoUrl(logoPath)!, {
      next: { revalidate: REVALIDATE_S },
    });
    if (!res.ok) return NEUTRAL;
    const { data, info } = await sharp(Buffer.from(await res.arrayBuffer()))
      .resize({ width: 40 })
      .flatten({ background: "#000000" })
      .raw()
      .toBuffer({ resolveWithObject: true });
    const color = dominantColor(data, info.channels);
    return color ? toHex(color) : NEUTRAL;
  } catch (error) {
    console.warn(`[provider-brand] ${logoPath}:`, error);
    return NEUTRAL;
  }
}

const cachedLogoBrand = unstable_cache(computeLogoBrand, ["provider-brand"], {
  revalidate: REVALIDATE_S,
});

/**
 * Colore del marchio di un servizio: prima la mappa scritta a mano
 * (`PROVIDER_BRAND`, i marchi che conosciamo), poi il colore del logo. Ritorna
 * sempre un colore: nella lista dei servizi nessuna riga resta senza sfumatura.
 */
export async function getProviderBrand(
  providerId: number,
  logoPath: string | null,
): Promise<string> {
  const known = PROVIDER_BRAND[providerId];
  if (known) return known;
  if (!logoPath) return NEUTRAL;
  try {
    return await cachedLogoBrand(logoPath);
  } catch {
    return NEUTRAL;
  }
}
