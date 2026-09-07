/**
 * Le superfici da cui può arrivare un segnale. È un **elenco chiuso** apposta: il
 * motore di ranking (fase C) deve poter pesare "l'ha ignorato in home" diversamente
 * da "l'ha ignorato in ricerca", e con stringhe libere non saprebbe mai quali esistono.
 *
 * Aggiungere una superficie qui è gratis; scriverne una a mano in un componente no:
 * `parseSignal` la scarta e l'evento non arriva mai.
 */
export const SURFACES = [
  "home-hero",
  "home-continua",
  "home-top10",
  "home-provider",
  "home-salita",
  "home-consigli",
  "home-perche",
  "home-amati",
  "home-libreria",
  "discover",
  "search",
  "library",
  "title-simili",
  "profile",
  "friends",
] as const;

export type Surface = (typeof SURFACES)[number];

const SET = new Set<string>(SURFACES);

export function isSurface(value: string): value is Surface {
  return SET.has(value);
}

export interface SignalTarget {
  mediaType: "movie" | "tv";
  titleId: number;
  surface: Surface;
  /** Posizione nello scaffale, da 0. `null` dove non ha senso. */
  position: number | null;
}

/** L'attributo che una copertina espone: `movie:603:home-top10:3`. */
export function signalAttr(
  mediaType: "movie" | "tv",
  titleId: number,
  surface: Surface,
  position?: number | null,
): string {
  return `${mediaType}:${titleId}:${surface}:${position ?? ""}`;
}

/** Legge l'attributo. Qualunque cosa storta torna `null`: mai un evento inventato. */
export function parseSignal(raw: string | null | undefined): SignalTarget | null {
  if (!raw) return null;
  const parts = raw.split(":");
  if (parts.length !== 4) return null;
  const [mediaType, id, surface, position] = parts;
  if (mediaType !== "movie" && mediaType !== "tv") return null;
  if (!/^\d+$/.test(id)) return null;
  if (!isSurface(surface)) return null;
  if (position !== "" && !/^\d+$/.test(position)) return null;
  return {
    mediaType,
    titleId: Number(id),
    surface,
    position: position === "" ? null : Number(position),
  };
}

/**
 * Legge `mediaType` e id dall'href di una scheda titolo (`/title/movie/603`).
 * Serve alle card che ricevono solo l'href e non i due campi separati.
 */
export function targetFromHref(
  href: string | undefined | null,
): { mediaType: "movie" | "tv"; titleId: number } | null {
  if (!href) return null;
  const m = /^\/title\/(movie|tv)\/(\d+)/.exec(href);
  if (!m) return null;
  return { mediaType: m[1] as "movie" | "tv", titleId: Number(m[2]) };
}
