import { getViewer } from "@/lib/auth/viewer";
import { getCharacterVotes } from "@/lib/characters/queries";
import { matchPortraits } from "@/lib/characters/match";
import { getTvmazeCast } from "@/lib/characters/tvmaze";
import type { TmdbCastMember } from "@/lib/tmdb/types";
import { FavoriteCharacter } from "./FavoriteCharacter";

/**
 * Legge i voti (con la sessione) e i ritratti dei personaggi (TVmaze, cache 7
 * giorni) e rende la sezione. Solo serie: sui film non esiste una fonte di
 * immagini dei personaggi (scelta utente 2026-09-14). Da sloggato non c'è.
 * Dietro un `Suspense` a fallback nullo: compare quando i dati ci sono.
 */
export async function FavoriteCharacterSection({
  cast,
  tvId,
}: {
  cast: TmdbCastMember[];
  tvId: number;
}) {
  const viewer = await getViewer();
  if (!viewer) return null;
  const [votes, tvmaze] = await Promise.all([
    getCharacterVotes(viewer.id, tvId, "tv"),
    getTvmazeCast(tvId),
  ]);
  const portraits = matchPortraits(cast, tvmaze);
  if (portraits.size === 0) return null;
  return (
    <FavoriteCharacter
      cast={cast}
      portraits={Object.fromEntries(portraits)}
      votes={votes}
      titleId={tvId}
    />
  );
}
