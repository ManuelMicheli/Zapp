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
 * Video YouTube riproducibili come fondale della scheda (`CinematicBackdrop`), in
 * ordine di preferenza: prima i trailer, poi i teaser; a parità di tipo italiano,
 * inglese, altro; gli ufficiali prima dei caricamenti di terzi. Tutta la lista serve
 * al fondale: se YouTube rifiuta l'embed del primo (capita ai trailer italiani di
 * Sky/HBO, errore 150) si passa al successivo. I video arrivano da TMDB con
 * `include_video_language=it,en,null`, quindi c'è quasi sempre qualcosa.
 */
export function rankTrailers(videos: TmdbVideos | undefined): TmdbVideo[] {
  const list = (videos?.results ?? []).filter((v) => v.site === "YouTube" && v.key);
  const ranked: TmdbVideo[] = [];
  for (const type of TYPE_ORDER) {
    const candidates = list.filter((v) => v.type === type);
    candidates.sort(
      (a, b) =>
        languageRank(a) - languageRank(b) || Number(b.official) - Number(a.official),
    );
    ranked.push(...candidates);
  }
  return ranked;
}

/** Primo candidato di `rankTrailers`: mai un link a YouTube, solo fondale. */
export function findTrailer(videos: TmdbVideos | undefined): TmdbVideo | null {
  return rankTrailers(videos)[0] ?? null;
}
