import { describe, expect, it } from "vitest";
import { matchFilmByImdb } from "./films";
import type { MgFilm } from "./types";

const films: MgFilm[] = [
  { film_id: 1, film_name: "A", imdb_title_id: "tt0000001" },
  { film_id: 2, film_name: "B", imdb_title_id: "tt0000002", imdb_id: 2 },
  { film_id: 3, film_name: "C", imdb_id: 3 },
];

describe("matchFilmByImdb", () => {
  it("trova per imdb_title_id", () => {
    expect(matchFilmByImdb(films, "tt0000002")?.film_id).toBe(2);
  });
  it("ripiega sull'imdb_id numerico (campo deprecato)", () => {
    expect(matchFilmByImdb(films, "tt0000003")?.film_id).toBe(3);
  });
  it("null senza match o senza id", () => {
    expect(matchFilmByImdb(films, "tt9999999")).toBeNull();
    expect(matchFilmByImdb(films, null)).toBeNull();
  });
});
