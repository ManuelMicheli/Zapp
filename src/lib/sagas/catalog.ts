import movies from "./movies.json";
import { SAGA_DEFINITIONS } from "./definitions";
import type { Saga } from "./order";

export { BOND_ACTORS } from "./definitions";
export { orderedMovies } from "./order";

const byId = new Map(movies.map((movie) => [movie.id, movie]));
export const SAGAS: Saga[] = SAGA_DEFINITIONS.map((definition) => ({
  ...definition,
  movies: definition.movieIds.map((id) => {
    const movie = byId.get(id);
    if (!movie) throw new Error(`Metadati saga mancanti: ${definition.slug}/${id}`);
    return movie;
  }),
}));

export function getSaga(slug: string) {
  return SAGAS.find((saga) => saga.slug === slug);
}
