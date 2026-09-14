import { getViewer } from "@/lib/auth/viewer";
import { getFavoritePeople } from "@/lib/people/queries";
import type { TmdbCastMember } from "@/lib/tmdb/types";
import { CastRow } from "./CastRow";

/**
 * Involucro server del cast: legge chi sono le persone gia' preferite dal viewer
 * e le passa a `CastRow`. Serve solo per questo: senza un involucro server, il
 * cuore di ogni riga richiederebbe una query per riga. Da sloggato non c'e'
 * nessun preferito, e `CastRow` resta il solo elenco.
 */
export async function CastSection({ cast }: { cast: TmdbCastMember[] }) {
  const viewer = await getViewer();
  const preferiti = viewer ? await getFavoritePeople(viewer.id) : [];
  return <CastRow cast={cast} preferiti={preferiti.map((p) => p.personId)} />;
}
