import type { ShelfItem } from "@/lib/home/shelves-rank";
import { HERO_REASON_LABEL, type HeroItem } from "@/lib/home/hero-rank";
import type { RankedItem } from "@/lib/rank/types";
import type { ChartItem } from "@/lib/charts/queries";
import type { SimilarItem } from "@/lib/similar/types";
import type { EntryWithTitle, LibraryItem } from "@/lib/watch/queries";
import type { ContinueItem } from "@/lib/watch/continue";
import type { ContinueCard, HeroCard, LibraryCard, TitleCard } from "./dto";

/** Le sei sorgenti scrivono l'anno in tre modi: stringa, numero, data intera. */
export function annoDa(v: unknown): string | null {
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  if (typeof v === "string" && v.length >= 4) return v.slice(0, 4);
  return null;
}

const VUOTA = {
  backdropPath: null,
  zappScore: null,
  zappVotes: 0,
  affinity: null,
  reason: null,
  providerIds: [] as number[],
};

export function cardFromShelf(i: ShelfItem): TitleCard {
  return {
    ...VUOTA,
    id: i.id,
    mediaType: i.mediaType,
    name: i.title,
    year: annoDa(i.year),
    posterPath: i.posterPath ?? null,
    backdropPath: i.backdropPath ?? null,
    zappScore: i.rating ?? null,
    affinity: i.affinity ?? null,
    reason: i.reason ?? null,
  };
}

export function cardFromRanked(i: RankedItem): TitleCard {
  return {
    ...VUOTA,
    id: i.id,
    mediaType: i.mediaType,
    name: i.title,
    year: annoDa(i.year),
    posterPath: i.posterPath ?? null,
    backdropPath: i.backdropPath ?? null,
    zappScore: i.zappScore ?? null,
    affinity: i.percentuale ?? null,
    reason: i.motivo ?? null,
    providerIds: i.providerIds ?? [],
  };
}

export function cardFromChart(i: ChartItem): TitleCard {
  return {
    ...VUOTA,
    id: i.id,
    mediaType: i.mediaType,
    name: i.title,
    year: annoDa(i.year),
    posterPath: i.posterPath,
    zappScore: i.score,
    zappVotes: i.votes ?? 0,
    providerIds: [i.providerId],
  };
}

export function cardFromSimilar(i: SimilarItem): TitleCard {
  return {
    ...VUOTA,
    id: i.id,
    mediaType: i.mediaType,
    name: i.title,
    year: annoDa(i.year),
    posterPath: i.posterPath,
    reason: i.reason,
  };
}

export function cardFromLibrary(i: LibraryItem): LibraryCard {
  return {
    ...VUOTA,
    id: i.titleId,
    mediaType: i.mediaType,
    name: i.name,
    year: annoDa(i.year),
    posterPath: i.posterPath,
    zappScore: i.zappScore,
    zappVotes: i.zappVotes,
    status: i.status,
    rating: i.rating,
  };
}

export function cardFromEntry(e: EntryWithTitle): TitleCard {
  const t = e.title;
  return {
    ...VUOTA,
    id: e.title_id,
    mediaType: e.media_type,
    name: t?.title ?? "",
    year: annoDa(t?.release_date),
    posterPath: t?.poster_path ?? null,
    backdropPath: t?.backdrop_path ?? null,
    providerIds: (t?.title_providers ?? [])
      .filter((p) => p.kind === "flatrate")
      .map((p) => p.provider_id),
  };
}

export function continueFromItem(
  c: ContinueItem,
  entry: EntryWithTitle | undefined,
  live: boolean,
): ContinueCard {
  return {
    ...(entry
      ? cardFromEntry(entry)
      : {
          ...VUOTA,
          id: c.titleId,
          mediaType: c.mediaType,
          name: c.name,
          year: null,
          posterPath: null,
        }),
    entryId: c.entryId,
    episodeLabel: c.episodeLabel,
    episodeName: c.episodeName,
    shownSeason: c.shownSeason,
    shownEpisode: c.shownEpisode,
    imageUrl: c.imageUrl,
    runtimeLabel: c.runtimeLabel,
    progressPct: c.progressPct,
    resumePositionMs: c.resumePositionMs,
    resumeDurationMs: c.resumeDurationMs,
    providerId: c.providerId,
    live,
  };
}

export function heroFromItem(h: HeroItem): HeroCard {
  return {
    ...VUOTA,
    id: h.id,
    mediaType: h.mediaType,
    name: h.title,
    year: annoDa(h.year),
    posterPath: h.posterPath,
    backdropPath: h.backdropPath,
    // Il numero del motore hero e' un voto mescolato (ZappScore o TMDB, la DTO non
    // li distingue): meglio nessun numero che un TMDB spacciato per ZappScore.
    zappScore: null,
    zappVotes: 0,
    affinity: h.affinity ?? null,
    // Come sul web (HeroCarousel): il motivo del motore vince; senza, un'affinità
    // presente basta a dire "Per te"; altrimenti l'etichetta del ripiego (Novità,
    // Di tendenza, Molto visto...).
    reason:
      h.motivo ?? (h.affinity != null ? "Per te" : (HERO_REASON_LABEL[h.reason] ?? null)),
    overview: h.overview,
  };
}
