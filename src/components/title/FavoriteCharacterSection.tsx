import { getViewer } from "@/lib/auth/viewer";
import { getCharacterVotes } from "@/lib/characters/queries";
import type { TmdbCastMember } from "@/lib/tmdb/types";
import { FavoriteCharacter } from "./FavoriteCharacter";

/**
 * Legge i voti del personaggio preferito con la sessione e rende la sezione;
 * da sloggato non c'è (come `TitleReviews`). Sta dietro un `Suspense` a
 * fallback nullo: la sezione compare quando il DB risponde, il resto no.
 */
export async function FavoriteCharacterSection({
  cast,
  titleId,
  mediaType,
}: {
  cast: TmdbCastMember[];
  titleId: number;
  mediaType: "movie" | "tv";
}) {
  const viewer = await getViewer();
  if (!viewer) return null;
  const votes = await getCharacterVotes(viewer.id, titleId, mediaType);
  return (
    <FavoriteCharacter
      cast={cast}
      votes={votes}
      titleId={titleId}
      mediaType={mediaType}
    />
  );
}
