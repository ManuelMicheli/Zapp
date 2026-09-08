"use client";

import { HERO_REASON_LABEL, type HeroItem } from "@/lib/home/hero-rank";
import { BannerCarousel, type BannerItem } from "./BannerCarousel";
import { useHomeType } from "./HomeType";

/**
 * Carosello in testa alla home: un titolo alla volta della scheda scelta in testata
 * (Tutto / Film / Serie TV, `HomeTypeProvider`). La forma del banner e lo scorrimento
 * stanno in `BannerCarousel`, condivisi con la fila del momento; qui restano solo la
 * scelta della scheda e la pillola del motivo.
 */
export function HeroCarousel({
  movie,
  tv,
  all,
}: {
  movie: HeroItem[];
  tv: HeroItem[];
  all: HeroItem[];
}) {
  const tab = useHomeType()?.type ?? "movie";
  const items = tab === "all" ? all : tab === "movie" ? movie : tv;

  return (
    <BannerCarousel
      items={items.map(toBanner)}
      label="In evidenza"
      resetKey={tab}
      priority
    />
  );
}

function toBanner(item: HeroItem): BannerItem {
  return {
    id: item.id,
    mediaType: item.mediaType,
    title: item.title,
    posterPath: item.posterPath,
    backdropPath: item.backdropPath,
    overview: item.overview,
    year: item.year,
    voteAverage: item.voteAverage,
    chip: item.affinity != null ? "Per te" : HERO_REASON_LABEL[item.reason],
  };
}
