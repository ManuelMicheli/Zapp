import { describe, expect, it } from "vitest";
import { parsePrimeMedia } from "../providers/prime";

describe("Prime: metadati osservati nel round 2", () => {
  it("legge i campi separati e conserva i numeri dichiarati dal provider", () => {
    expect(
      parsePrimeMedia({ titleText: "Reacher", detailText: "S4 E2 Lotta in gabbia" }),
    ).toMatchObject({
      kind: "tv",
      title: "Reacher",
      season: 4,
      episode: 2,
      episodeName: "Lotta in gabbia",
    });
    expect(
      parsePrimeMedia({ titleText: "Reacher", detailText: "S4 E3 Un piccolo passo" }),
    ).toMatchObject({ season: 4, episode: 3, episodeName: "Un piccolo passo" });
  });
  it("il solo titolo e una ipotesi film da verificare; i dettagli malformati si scartano", () => {
    expect(
      parsePrimeMedia({ titleText: "Come un tuono", detailText: null }),
    ).toMatchObject({ kind: "movie", season: null, episode: null });
    expect(
      parsePrimeMedia({ titleText: "", detailText: "S4 E2 Lotta in gabbia" }),
    ).toBeNull();
    expect(
      parsePrimeMedia({ titleText: "Reacher", detailText: "Episodio successivo S4 E3" }),
    ).toBeNull();
    expect(parsePrimeMedia({ titleText: "Reacher", detailText: "S0 E0" })).toBeNull();
  });
});
