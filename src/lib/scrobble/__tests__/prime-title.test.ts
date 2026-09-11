import { describe, expect, it } from "vitest";
import { primeTitleScore, primeTvConflict } from "../providers/prime-title";
describe("Prime: confronto dei titoli come Netflix e scelta del tipo piu preciso", () => {
  it("il titolo completo del film batte il nome generico della serie", () => {
    const movie = primeTitleScore("Spider-Man: Homecoming", "Spider-Man: Homecoming");
    const tv = primeTitleScore("Spider-Man: Homecoming", "Spider-Man");
    expect(movie).toBe(1);
    expect(tv).toBeLessThan(movie);
    expect(primeTvConflict(movie, tv)).toBe(false);
  });
  it("accetta sottotitoli distributore e nome originale", () => {
    expect(
      primeTitleScore("Hajime no Ippo: The Fighting!", "Hajime no Ippo"),
    ).toBeGreaterThanOrEqual(0.85);
    expect(
      primeTitleScore(
        "The Place Beyond the Pines",
        "Come un tuono",
        "The Place Beyond the Pines",
      ),
    ).toBe(1);
    expect(
      primeTitleScore(
        "Pirati dei Caraibi - La maledizione della prima luna",
        "La maledizione della prima luna",
      ),
    ).toBeGreaterThanOrEqual(0.85);
  });
  it("non confonde seguiti numerati e film dal nome diverso", () => {
    expect(primeTitleScore("Mission: Impossible 3", "Mission: Impossible 2")).toBe(0);
    expect(primeTitleScore("Ritorno al futuro - Parte II", "Ritorno al futuro")).toBe(0);
    expect(
      primeTitleScore("Spider-Man: Homecoming", "Spider-Man: Far From Home"),
    ).toBeLessThan(0.85);
  });
  it("un vero omonimo o una scelta troppo vicina rimane ambigua", () => {
    expect(primeTvConflict(1, 1)).toBe(true);
    expect(primeTvConflict(0.89, 0.88)).toBe(true);
    expect(primeTvConflict(0.9, 0.5)).toBe(false);
  });
});
