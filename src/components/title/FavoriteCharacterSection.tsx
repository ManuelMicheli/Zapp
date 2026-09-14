import { getViewer } from "@/lib/auth/viewer";
import { getSeriesCast } from "@/lib/characters/cast";
import { getCharacterPortraits } from "@/lib/characters/portraits";
import { getCharacterVotes } from "@/lib/characters/queries";
import type { TmdbCastMember } from "@/lib/tmdb/types";
import { FavoriteCharacter } from "./FavoriteCharacter";

/**
 * Legge cast votabile (aggregate_credits, cache 7 giorni), voti (con la
 * sessione) e ritratti (TVmaze → AniList → TMDB) e rende la sezione. Solo
 * serie: sui film non esiste una fonte di immagini dei personaggi (scelta
 * utente 2026-09-14). Da sloggato non c'è. Dietro un `Suspense` a fallback
 * nullo: compare quando i dati ci sono. `fallbackCast` è il cast di
 * `titles.raw`, usato se TMDB non risponde.
 */
export async function FavoriteCharacterSection({
  fallbackCast,
  tvId,
}: {
  fallbackCast: TmdbCastMember[];
  tvId: number;
}) {
  const viewer = await getViewer();
  if (!viewer) return null;
  const [votes, series] = await Promise.all([
    getCharacterVotes(viewer.id, tvId, "tv"),
    getSeriesCast(tvId),
  ]);
  const cast = series.cast.length > 0 ? series.cast : fallbackCast;
  if (cast.length === 0) return null;
  const portraits = await getCharacterPortraits(tvId, { ...series, cast });
  return (
    <FavoriteCharacter
      cast={cast}
      portraits={Object.fromEntries(portraits)}
      votes={votes}
      titleId={tvId}
    />
  );
}
