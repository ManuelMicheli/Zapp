import "server-only";

import { TMDB_IMAGE_BASE } from "@/lib/config";
import { getEpisodeImages } from "./client";
import type { TmdbSeasonDetails } from "./types";

/** Quanti episodi interrogare per trovare il fotogramma più definito. */
const CANDIDATES = 3;
/** Sotto questa larghezza un fotogramma non regge un banner desktop. */
const MIN_WIDTH = 1280;

/**
 * Sfondo del banner stagione: il fotogramma più largo (spesso 3840px) fra
 * quelli dei primi episodi della stagione. Il dettaglio stagione non riporta
 * le dimensioni, quindi si passa dagli `/images` dei singoli episodi (cache
 * 7 giorni). A parità di larghezza vince il voto della community. Se le
 * chiamate falliscono si torna al primo `still_path` disponibile.
 */
export async function pickSeasonStill(
  tvId: number,
  season: TmdbSeasonDetails,
): Promise<string | null> {
  const withStill = season.episodes.filter((e) => e.still_path);
  if (withStill.length === 0) return null;
  const fallback = withStill[0].still_path!;

  const results = await Promise.all(
    withStill
      .slice(0, CANDIDATES)
      .map((e) =>
        getEpisodeImages(tvId, season.season_number, e.episode_number).catch(() => null),
      ),
  );
  const stills = results.flatMap((r) => r?.stills ?? []);
  if (stills.length === 0) return `${TMDB_IMAGE_BASE}/original${fallback}`;

  const best = stills.reduce((a, b) =>
    b.width > a.width || (b.width === a.width && b.vote_average > a.vote_average) ? b : a,
  );
  const chosen = best.width >= MIN_WIDTH ? best.file_path : fallback;
  return `${TMDB_IMAGE_BASE}/original${chosen}`;
}
