// Cinelandia: 12 multisala, biglietteria Webtic. Livello 2 = acquisto dello spettacolo
// sul frame Webtic (login Webtic), livello 1 = pagina evento Webtic con gli orari;
// se la programmazione non risponde, la pagina film WordPress
// `https://www.cinelandia.it/<slug>/` (orari di tutte le sedi, confermata via WP REST).

import { CINELANDIA_BASE } from "@/lib/config";
import { bestByToken } from "./match";
import type { ChainLinks } from "./types";

/**
 * Sedi Cinelandia con l'id Webtic (`localId`), dai link "PRENOTA" delle pagine
 * `cinema-cinelandia-<città>` (2026-09-06). `token` = parole che devono comparire nel
 * nome MyMovies ("Cinelandia Certosa", "Cinelandia Multiplex Como").
 */
export const CINELANDIA_VENUES: { localId: number; token: string }[] = [
  { localId: 5343, token: "Como" },
  { localId: 5868, token: "Certosa" },
  { localId: 5309, token: "Aosta" },
  { localId: 5395, token: "Arosio" },
  { localId: 5300, token: "Asti" },
  { localId: 5316, token: "Borgo" },
  { localId: 5687, token: "Busto" },
  { localId: 5296, token: "Casale" },
  { localId: 5314, token: "Cuneo" },
  { localId: 5297, token: "Gallarate" },
  { localId: 5302, token: "Pieve" },
  { localId: 5303, token: "Verbania" },
];

export function pickCinelandiaVenue(
  name: string,
): { localId: number; token: string } | null {
  return bestByToken(CINELANDIA_VENUES, (v) => v.token, name);
}

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

/** Ripiego: pagina film WordPress, solo se la WP REST conferma lo slug. */
export function buildCinelandiaPageLinks(
  pages: CinelandiaPage[],
  slug: string,
): ChainLinks {
  const found = pages.some((p) => p.slug === slug);
  return {
    byTime: new Map(),
    fallback: found ? { url: `${CINELANDIA_BASE}/${slug}/`, level: 1 } : null,
  };
}
