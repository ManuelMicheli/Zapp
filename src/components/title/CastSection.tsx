import { getViewer } from "@/lib/auth/viewer";
import { getCharacterVotes } from "@/lib/characters/queries";
import { getFavoritePeople } from "@/lib/people/queries";
import type { TmdbCastMember } from "@/lib/tmdb/types";
import { CastRow } from "./CastRow";

/**
 * Cast con i cuori degli attori preferiti e il grafico dei personaggi. Legge
 * entrambi con la sessione; da sloggato passa `votes` nullo e nessun preferito, e
 * `CastRow` resta il solo elenco. Sta dietro un `Suspense` il cui fallback e' il
 * cast nudo, cosi' l'elenco non aspetta il DB.
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
  const [votes, preferiti] = viewer
    ? await Promise.all([
        getCharacterVotes(viewer.id, titleId, mediaType),
        getFavoritePeople(viewer.id),
      ])
    : [null, []];
  return (
    <CastRow cast={cast} votes={votes} preferiti={preferiti.map((p) => p.personId)} />
  );
}
