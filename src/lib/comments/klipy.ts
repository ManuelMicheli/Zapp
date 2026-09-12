import { isCommentMedia, isMediaUrl, type CommentMedia, type MediaKind } from "./content";

const PATHS = { gif: "gifs", meme: "static-memes", sticker: "stickers" } as const;
export function klipyUrl(
  key: string,
  kind: MediaKind,
  query: string,
  page: number,
): string {
  const params = new URLSearchParams({
    page: String(page),
    per_page: "24",
    locale: "it",
    content_filter: "high",
  });
  if (query.trim()) params.set("q", query.trim().slice(0, 100));
  return `https://api.klipy.com/api/v1/${encodeURIComponent(key)}/${PATHS[kind]}/${query.trim() ? "search" : "trending"}?${params}`;
}

function object(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {};
}

/** Le risposte restano nell'ordine del fornitore. Non scartare silenziosamente righe. */
export function parseKlipyPage(
  payload: unknown,
  kind: MediaKind,
): { items: CommentMedia[]; hasNext: boolean } {
  const root = object(payload),
    data = object(root.data);
  if (root.result !== true || !Array.isArray(data.data))
    throw new Error("Catalogo non disponibile");
  const items = data.data.map((raw: unknown) => {
    const item = object(raw),
      file = object(item.file);
    // L'integrazione richiede Ads disattivati nel Partner Panel.
    if (item.type === "ad") throw new Error("Configurazione catalogo non supportata");
    const formats = kind === "meme" ? ["webp", "jpg", "png", "jpeg"] : ["gif", "webp"];
    let rendition: Record<string, unknown> = {};
    for (const size of ["hd", "md", "sm", "xs"]) {
      for (const format of formats) {
        const candidate = object(object(file[size])[format]);
        if (isMediaUrl(candidate.url)) {
          rendition = candidate;
          break;
        }
      }
      if (rendition.url) break;
    }
    // La miniatura e' la stessa immagine nella resa piu' piccola disponibile: la
    // griglia del selettore ne mostra ventiquattro alla volta, larghe 44 pixel, e
    // senza questa scaricava ventiquattro GIF in qualita' piena. Va dal piccolo al
    // grande, cioe' all'incontrario rispetto all'originale qui sopra.
    let thumbnailUrl: string | null = null;
    for (const size of ["xs", "sm", "md"]) {
      for (const format of formats) {
        const candidate = object(object(file[size])[format]);
        if (isMediaUrl(candidate.url) && candidate.url !== rendition.url) {
          thumbnailUrl = candidate.url;
          break;
        }
      }
      if (thumbnailUrl) break;
    }
    let previewUrl: string | null = null;
    for (const size of ["sm", "md", "hd", "xs"]) {
      const sized = object(file[size]);
      const still = object(sized.jpg ?? sized.png ?? sized.jpeg);
      if (isMediaUrl(still.url)) {
        previewUrl = still.url;
        break;
      }
    }
    const result = {
      kind,
      slug: item.slug,
      title: typeof item.title === "string" ? item.title.slice(0, 120) : "",
      url: rendition.url,
      thumbnailUrl,
      previewUrl,
      width: rendition.width,
      height: rendition.height,
    };
    if (!isCommentMedia(result)) throw new Error("Formato catalogo non supportato");
    return result;
  });
  return { items, hasNext: data.has_next === true };
}

/** Best effort dopo la pubblicazione; nessun dato identificativo dell'account Zapp. */
export async function registerMediaShare(media: CommentMedia): Promise<void> {
  const key = process.env.NEXT_PUBLIC_KLIPY_API_KEY;
  if (!key) return;
  try {
    await fetch(
      `https://api.klipy.com/api/v1/${encodeURIComponent(key)}/${PATHS[media.kind]}/share/${encodeURIComponent(media.slug)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
        cache: "no-store",
        credentials: "omit",
        signal: AbortSignal.timeout(5000),
      },
    );
  } catch {
    /* Il commento è già salvato: la telemetria non blocca l'invio. */
  }
}
