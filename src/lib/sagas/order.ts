import type { SagaDefinition } from "./definitions";

export interface SagaMovie {
  id: number;
  title: string;
  releaseDate: string;
  posterPath: string | null;
  backdropPath: string | null;
}
export type Saga = SagaDefinition & { movies: SagaMovie[] };
export type SagaOrder = "release" | "timeline" | "actor";

/** I titoli senza collocazione verificata restano in fondo, in ordine di uscita. */
export function orderedMovies(saga: Saga, order: SagaOrder, actor?: string): SagaMovie[] {
  const movies = [...saga.movies].sort(
    (a, b) => a.releaseDate.localeCompare(b.releaseDate) || a.id - b.id,
  );
  if (order === "actor" && actor && saga.actors) {
    const ids = new Set(saga.actors[actor] ?? []);
    return movies.filter((movie) => ids.has(movie.id));
  }
  if (order === "timeline" && saga.timelineIds) {
    const positions = new Map(saga.timelineIds.map((id, index) => [id, index]));
    return movies.sort(
      (a, b) =>
        (positions.get(a.id) ?? Infinity) - (positions.get(b.id) ?? Infinity) ||
        a.releaseDate.localeCompare(b.releaseDate),
    );
  }
  return movies;
}
