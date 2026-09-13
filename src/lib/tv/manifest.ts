import { PROVIDERS } from "@/lib/config";
import type { BecauseSource } from "@/lib/home/shelves-rank";
import type { ShelfRef } from "./dto";

export interface ManifestRail {
  key: string;
  titolo: string;
  dimensione: "persone" | "generi" | "decenni";
}

export interface ManifestInput {
  /** `massa >= MASSA_MINIMA`: la stessa soglia della home web. */
  profiloRicco: boolean;
  rails: ManifestRail[];
  because: BecauseSource[];
  hasWant: boolean;
  platformIds: number[];
}

function railRef(r: ManifestRail): ShelfRef {
  return { key: r.key, title: r.titolo, subtitle: null, layout: "poster" };
}

function becauseRef(b: BecauseSource): ShelfRef {
  return {
    key: `because:${b.mediaType}:${b.titleId}`,
    title: `Perché hai visto ${b.name}`,
    subtitle: null,
    layout: "poster",
  };
}

function platformRef(id: number): ShelfRef {
  return {
    key: `platform:${id}`,
    title: `Novità su ${PROVIDERS[id]?.name ?? String(id)}`,
    subtitle: null,
    layout: "poster",
  };
}

const FORYOU: ShelfRef = {
  key: "foryou",
  title: "Per te",
  subtitle: null,
  layout: "poster",
};
const TOPTEN: ShelfRef = {
  key: "topten",
  title: "Top 10 Netflix",
  subtitle: "Questa settimana",
  layout: "numbered",
};
const WANT: ShelfRef = {
  key: "want",
  title: "Da vedere",
  subtitle: null,
  layout: "poster",
};
const TOPRATED: ShelfRef = {
  key: "toprated",
  title: "I più amati su Zapp",
  subtitle: "ZappScore",
  layout: "poster",
};
const COMINGSOON: ShelfRef = {
  key: "comingsoon",
  title: "In arrivo",
  subtitle: null,
  layout: "backdrop",
};

/**
 * L'ordine degli scaffali della home web (`src/app/(app)/page.tsx`), senza cinema,
 * amici e saghe (fuori dalla v1 TV, spec §13). Le rail personali stanno dove le mette
 * `PersonalRails`: "persone" accanto a "Per te", "generi" e "decenni" dopo "Perché
 * hai visto".
 */
export function buildShelfManifest(input: ManifestInput): ShelfRef[] {
  const persone = input.rails.filter((r) => r.dimensione === "persone").map(railRef);
  const altre = input.rails.filter((r) => r.dimensione !== "persone").map(railRef);
  const perche = input.because.map(becauseRef);
  const want = [...(input.hasWant ? [WANT] : []), ...input.platformIds.map(platformRef)];

  if (input.profiloRicco) {
    return [
      FORYOU,
      ...persone,
      ...perche,
      ...altre,
      TOPTEN,
      ...want,
      TOPRATED,
      COMINGSOON,
    ];
  }
  return [TOPTEN, ...want, FORYOU, ...perche, TOPRATED, COMINGSOON];
}
