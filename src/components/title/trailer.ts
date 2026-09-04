import type { TmdbVideo, TmdbVideos } from "@/lib/tmdb/types";

/** Ordine di preferenza dei tipi di video usabili come fondale. */
const TYPE_ORDER = ["Trailer", "Teaser"] as const;

/** Ordine di preferenza della lingua: italiano, inglese, poi il resto. */
function languageRank(video: TmdbVideo): number {
  const lang = video.iso_639_1 ?? null;
  if (lang === "it") return 0;
  if (lang === "en") return 1;
  return 2;
}

/**
 * Video YouTube da riprodurre come fondale della scheda (`CinematicBackdrop`), muto
 * e in loop come su Netflix: mai un link a YouTube. Sceglie il trailer, altrimenti
 * il teaser; a parità di tipo preferisce l'italiano, poi l'inglese, e gli ufficiali
 * prima dei caricamenti di terzi. I video arrivano da TMDB con
 * `include_video_language=it,en,null`, quindi c'è quasi sempre qualcosa.
 */
export function findTrailer(videos: TmdbVideos | undefined): TmdbVideo | null {
  const list = (videos?.results ?? []).filter((v) => v.site === "YouTube" && v.key);
  for (const type of TYPE_ORDER) {
    const candidates = list.filter((v) => v.type === type);
    if (candidates.length === 0) continue;
    candidates.sort(
      (a, b) =>
        languageRank(a) - languageRank(b) || Number(b.official) - Number(a.official),
    );
    return candidates[0];
  }
  return null;
}
