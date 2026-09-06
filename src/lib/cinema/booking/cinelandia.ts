// Cinelandia: pagina film WordPress `https://www.cinelandia.it/<slug>/` con gli orari
// di tutte le sedi (livello 1). Lo slug si conferma con la WP REST pubblica.

import { CINELANDIA_BASE } from "@/lib/config";
import type { ChainLinks } from "./types";

export interface CinelandiaPage {
  id: number;
  slug: string;
}

/** Slug candidato dal titolo TMDB ("Coyote vs. Acme" → "coyote-vs-acme"). */
export function cinelandiaSlug(title: string): string {
  return title
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function buildCinelandiaLinks(pages: CinelandiaPage[], slug: string): ChainLinks {
  const found = pages.some((p) => p.slug === slug);
  return {
    byTime: new Map(),
    fallback: found ? { url: `${CINELANDIA_BASE}/${slug}/`, level: 1 } : null,
  };
}
