import { getViewer } from "@/lib/auth/viewer";
import { getCharacterVotes } from "@/lib/characters/queries";
import type { TmdbCastMember } from "@/lib/tmdb/types";
import { CastRow } from "./CastRow";

/**
 * Cast più il voto del personaggio preferito. Legge i conteggi con la sessione;
 * da sloggato passa `votes` nullo e `CastRow` resta il solo elenco. Sta dietro un
 * `Suspense` il cui fallback è il cast senza voti, così l'elenco non aspetta il DB.
 */
export async function CastSection({
  cast,
  titleId,
  mediaType,
}: {
  cast: TmdbCastMember[];
  titleId: number;
  mediaType: "movie" | "tv";
}) {
  const viewer = await getViewer();
  const votes = viewer ? await getCharacterVotes(viewer.id, titleId, mediaType) : null;
  return <CastRow cast={cast} votes={votes} titleId={titleId} mediaType={mediaType} />;
}
