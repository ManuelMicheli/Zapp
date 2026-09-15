import { describe, expect, it } from "vitest";
import { splitTitolo } from "./titolo";

describe("splitTitolo", () => {
  it("legge SxxExx", () => {
    expect(splitTitolo("The Bear S02E05")).toEqual({
      show: "The Bear",
      season: 2,
      episode: 5,
      episodeTitle: null,
    });
  });

  it("legge 1x03", () => {
    expect(splitTitolo("Dark 1x03")).toMatchObject({
      show: "Dark",
      season: 1,
      episode: 3,
    });
  });

  it("legge la forma italiana con il nome dell'episodio", () => {
    expect(splitTitolo("Stranger Things: Stagione 1: Episodio 3 - Holly, Jolly")).toEqual({
      show: "Stranger Things",
      season: 1,
      episode: 3,
      episodeTitle: "Holly, Jolly",
    });
  });

  it("legge la forma inglese", () => {
    expect(splitTitolo("The Office: Season 3, Episode 12")).toMatchObject({
      show: "The Office",
      season: 3,
      episode: 12,
    });
  });

  it("legge l'episodio senza stagione", () => {
    expect(splitTitolo("Boris - Ep. 4")).toMatchObject({
      show: "Boris",
      season: null,
      episode: 4,
    });
  });

  it("lascia stare un film", () => {
    expect(splitTitolo("Blade Runner 2049")).toEqual({
      show: "Blade Runner 2049",
      season: null,
      episode: null,
      episodeTitle: null,
    });
  });

  it("non scambia per episodio un numero del titolo", () => {
    expect(splitTitolo("Ocean's 11")).toMatchObject({ season: null, episode: null });
  });
});
