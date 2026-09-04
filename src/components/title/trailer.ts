import type { TmdbVideo, TmdbVideos } from "@/lib/tmdb/types";

/** Ordine di preferenza dei tipi di video usabili come fondale. */
const TYPE_ORDER = ["Trailer", "Teaser"] as const;

function isYouTube(video: TmdbVideo): boolean {
  return video.site === "YouTube" && Boolean(video.key);
}

function isItalian(video: TmdbVideo): boolean {
  return video.iso_639_1 === "it";
}

/** Ufficiali prima dei caricamenti di terzi. */
function byOfficial(a: TmdbVideo, b: TmdbVideo): number {
  return Number(b.official) - Number(a.official);
}

/** Trailer poi teaser, ufficiali prima. */
function pickByType(list: TmdbVideo[]): TmdbVideo[] {
  const ranked: TmdbVideo[] = [];
  for (const type of TYPE_ORDER) {
    ranked.push(...list.filter((v) => v.type === type).sort(byOfficial));
  }
  return ranked;
}

/**
 * Video YouTube riproducibili come fondale della scheda (`CinematicBackdrop`).
 *
 * Regola lingua: se esiste almeno un trailer/teaser italiano si usano **solo** quelli
 * (mai un salto all'inglese se YouTube rifiuta l'embed di uno IT). L'inglese (e poi
 * il resto) entra in lista solo quando TMDB non ha proprio nessun candidato italiano.
 * A parità: Trailer → Teaser, ufficiali prima. I video arrivano con
 * `include_video_language=it,en,null`.
 */
export function rankTrailers(videos: TmdbVideos | undefined): TmdbVideo[] {
  const list = (videos?.results ?? []).filter(isYouTube);

  const italian = pickByType(list.filter(isItalian));
  if (italian.length > 0) return italian;

  const english = pickByType(list.filter((v) => v.iso_639_1 === "en"));
  if (english.length > 0) return english;

  return pickByType(list.filter((v) => v.iso_639_1 !== "en"));
}

/** Primo candidato di `rankTrailers`: mai un link a YouTube, solo fondale. */
export function findTrailer(videos: TmdbVideos | undefined): TmdbVideo | null {
  return rankTrailers(videos)[0] ?? null;
}
