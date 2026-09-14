import "server-only";
import { TMDB_IMAGE_BASE } from "@/lib/config";
import { getPersonTaggedImages } from "@/lib/tmdb/client";
import type { TmdbCastMember } from "@/lib/tmdb/types";
import { getAnilistCharacters } from "./anilist";
import { getTvmazeCast } from "./tvmaze";
import { matchPortraits, type CharacterPortrait } from "./match";
import type { SeriesCast } from "./cast";

/** Quante persone senza ritratto si provano ancora su TMDB (una chiamata l'una). */
const TAGGED_MAX = 8;

/**
 * Un ritratto per ogni personaggio votabile, da tre fonti in cascata: ogni
 * fonte riempie solo i buchi lasciati dalla precedente.
 *
 * 1. TVmaze (serie occidentali: copertura quasi totale);
 * 2. AniList, solo per gli anime (TVmaze ne ha pochi: Death Note 5 su 11);
 * 3. i "tagged images" di TMDB della persona su questa serie (pochi, ma gratis).
 *
 * Chi resta senza ritratto si mostra comunque, con una card di riserva: ogni
 * personaggio principale dev'essere votabile.
 */
export async function getCharacterPortraits(
  tvId: number,
  series: SeriesCast,
): Promise<Map<number, CharacterPortrait>> {
  const cast = series.cast;
  let portraits = new Map<number, CharacterPortrait>();

  const [tvmaze, anilist] = await Promise.all([
    series.imdbId ? getTvmazeCast(series.imdbId) : Promise.resolve([]),
    series.isAnime
      ? getAnilistCharacters(series.name, series.originalName)
      : Promise.resolve([]),
  ]);
  // per gli anime AniList è la fonte più completa: passa per prima
  const ordered = series.isAnime ? [anilist, tvmaze] : [tvmaze, anilist];
  for (const source of ordered) portraits = matchPortraits(cast, source, portraits);

  const missing = cast.filter((m) => !portraits.has(m.id)).slice(0, TAGGED_MAX);
  if (missing.length > 0) {
    const tagged = await Promise.all(missing.map((m) => taggedPortrait(m, tvId)));
    for (const p of tagged) if (p) portraits.set(p.personId, p);
  }
  return portraits;
}

/** Il fotogramma taggato di questa persona su questa serie, se TMDB ne ha uno. */
async function taggedPortrait(
  member: TmdbCastMember,
  tvId: number,
): Promise<CharacterPortrait | null> {
  try {
    const { results } = await getPersonTaggedImages(member.id);
    const here = results.filter(
      (r) =>
        r.media?.id === tvId || (r.media_type === "episode" && r.media?.show_id === tvId),
    );
    // meglio un'immagine verticale (un profilo taggato) di un fotogramma largo
    const best =
      here.find((r) => (r.aspect_ratio ?? 2) < 1) ??
      here.find((r) => r.image_type === "backdrop") ??
      here[0];
    return best
      ? { personId: member.id, image: `${TMDB_IMAGE_BASE}/w780${best.file_path}` }
      : null;
  } catch {
    return null;
  }
}
