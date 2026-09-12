/** Formato versionato nel body: mantiene compatibili schema, RLS e commenti esistenti. */
const PREFIX = "[zapp-media:1]";
export const COMMENT_LIMIT = 2000;
export const MEDIA_HOSTS = [
  "static.klipy.com",
  "static1.klipy.com",
  "static2.klipy.com",
  "static.klipy.co",
] as const;
export type MediaKind = "gif" | "meme" | "sticker";
export interface CommentMedia {
  kind: MediaKind;
  slug: string;
  title: string;
  url: string;
  previewUrl: string | null;
  width: number;
  height: number;
  /**
   * La stessa immagine nella resa piu' piccola del catalogo, per la griglia del
   * selettore. **Non finisce nel commento**: `encodeComment` riscrive campo per
   * campo e questo non e' fra quelli, perche' chi legge il commento vede
   * l'originale. Serve solo a non scaricare ventiquattro GIF in qualita' piena
   * per mostrarne ventiquattro larghe 44 pixel. Assente quando il catalogo offre
   * una sola resa.
   */
  thumbnailUrl?: string | null;
}

export function isMediaUrl(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 600) return false;
  try {
    const u = new URL(value);
    return (
      u.protocol === "https:" &&
      !u.username &&
      !u.password &&
      !u.port &&
      MEDIA_HOSTS.some((h) => h === u.hostname) &&
      /\.(gif|webp|png|jpe?g)$/i.test(u.pathname)
    );
  } catch {
    return false;
  }
}

export function isCommentMedia(value: unknown): value is CommentMedia {
  if (!value || typeof value !== "object") return false;
  const m = value as Record<string, unknown>;
  return (
    ["gif", "meme", "sticker"].includes(m.kind as string) &&
    typeof m.slug === "string" &&
    /^[a-zA-Z0-9_-]{1,180}$/.test(m.slug) &&
    typeof m.title === "string" &&
    m.title.length <= 120 &&
    isMediaUrl(m.url) &&
    (m.previewUrl === null ||
      (isMediaUrl(m.previewUrl) && /\.(png|jpe?g)(\?|$)/i.test(m.previewUrl))) &&
    // Facoltativa: un payload che non la porta resta valido (i commenti gia'
    // salvati non ce l'hanno). Se c'e', vale la stessa regola dell'originale.
    (m.thumbnailUrl === undefined ||
      m.thumbnailUrl === null ||
      isMediaUrl(m.thumbnailUrl)) &&
    typeof m.width === "number" &&
    Number.isInteger(m.width) &&
    m.width > 0 &&
    m.width <= 10000 &&
    typeof m.height === "number" &&
    Number.isInteger(m.height) &&
    m.height > 0 &&
    m.height <= 10000
  );
}

export function encodeComment(text: string, media: CommentMedia | null): string {
  if (!media) return text;
  // Riscrive campo per campo: nessuna proprietà arbitraria del client viene conservata.
  const { kind, slug, title, url, previewUrl, width, height } = media;
  return (
    PREFIX +
    JSON.stringify({ text, media: { kind, slug, title, url, previewUrl, width, height } })
  );
}

function parse(body: string): { text: string; media: CommentMedia } | null {
  try {
    const v: unknown = JSON.parse(body.slice(PREFIX.length));
    if (!v || typeof v !== "object") return null;
    const value = v as Record<string, unknown>;
    return typeof value.text === "string" && isCommentMedia(value.media)
      ? { text: value.text, media: value.media }
      : null;
  } catch {
    return null;
  }
}

export function isCommentBody(body: unknown): body is string {
  if (typeof body !== "string" || !body.trim() || body.length > COMMENT_LIMIT)
    return false;
  return !body.startsWith(PREFIX) || parse(body) !== null;
}

export function decodeComment(body: string): {
  text: string;
  media: CommentMedia | null;
} {
  if (!body.startsWith(PREFIX)) return { text: body, media: null };
  return (
    (body.length <= COMMENT_LIMIT && parse(body)) || {
      text: "Allegato non disponibile",
      media: null,
    }
  );
}
