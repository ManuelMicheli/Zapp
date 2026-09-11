import { describe, expect, it } from "vitest";
import { SAGAS, getSaga, orderedMovies, BOND_ACTORS } from "./catalog";

describe("saghe", () => {
  it("mantiene tutti i film senza duplicati nei due ordinamenti", () => {
    expect(SAGAS).toHaveLength(7);
    for (const saga of SAGAS) {
      const release = orderedMovies(saga, "release");
      const timeline = orderedMovies(saga, "timeline");
      expect(new Set(release.map((m) => m.id)).size).toBe(release.length);
      expect((saga.timelineIds ?? []).every((id) => saga.movieIds.includes(id))).toBe(true);
      expect(new Set(saga.timelineIds ?? []).size).toBe(saga.timelineIds?.length ?? 0);
      expect(timeline.map((m) => m.id).sort()).toEqual(release.map((m) => m.id).sort());
      expect(release.every((m) => m.title && m.releaseDate && m.posterPath)).toBe(true);
    }
  });

  it("segue la guida Star Wars, con Clone Wars e gli spin-off al posto giusto", () => {
    const saga = getSaga("star-wars")!;
    expect(orderedMovies(saga, "release")[0].id).toBe(11);
    expect(
      orderedMovies(saga, "timeline")
        .slice(0, 9)
        .map((m) => m.id),
    ).toEqual([1893, 1894, 12180, 1895, 348350, 330459, 11, 1891, 1892]);
    expect(orderedMovies(saga, "timeline")[9].title).toContain("Mandalorian");
  });

  it("Marvel inizia da Iron Man per uscita e Captain America per cronologia", () => {
    const saga = getSaga("marvel")!;
    expect(orderedMovies(saga, "release")[0].id).toBe(1726);
    expect(orderedMovies(saga, "timeline")[0].id).toBe(1771);
    expect(
      orderedMovies(saga, "timeline").findIndex((m) => m.id === 497698),
    ).toBeLessThan(orderedMovies(saga, "timeline").findIndex((m) => m.id === 284054));
  });

  it("Tokyo Drift viene dopo Fast & Furious 6 nella storia", () => {
    const ids = orderedMovies(getSaga("fast-furious")!, "timeline").map((m) => m.id);
    expect(ids.indexOf(9615)).toBe(ids.indexOf(82992) + 1);
  });

  it("suddivide i 25 Bond ufficiali fra sei attori senza perdere il ritorno di Connery", () => {
    const saga = getSaga("james-bond")!;
    expect(saga.movies).toHaveLength(25);
    expect(
      BOND_ACTORS.map((actor) => orderedMovies(saga, "actor", actor).length),
    ).toEqual([6, 1, 7, 2, 4, 5]);
    expect(orderedMovies(saga, "actor", "Daniel Craig").map((m) => m.id)).toEqual([
      36557, 10764, 37724, 206647, 370172,
    ]);
    expect(orderedMovies(saga, "actor", "Sean Connery").at(-1)?.id).toBe(681);
  });

  it("uno slug non valido non trova una saga", () => {
    expect(getSaga("non-esiste")).toBeUndefined();
  });
});
