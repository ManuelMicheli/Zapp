import { describe, expect, it } from "vitest";
import { parseNowMedia } from "../providers/now";

describe("NOW: metadati osservati nella sonda 0.2.2", () => {
  it("conserva titolo e numeri del provider senza confonderli con una validazione TMDB", () => {
    expect(
      parseNowMedia({
        titleText: "The Last of Us",
        detailText: "S1 E1: Quando sei perso nell'oscurità",
      }),
    ).toMatchObject({
      kind: "tv",
      title: "The Last of Us",
      season: 1,
      episode: 1,
      episodeName: "Quando sei perso nell'oscurità",
    });
  });
  it("il titolo senza dettaglio resta un candidato film da verificare sul server", () => {
    expect(
      parseNowMedia({ titleText: "Un film Minecraft", detailText: null }),
    ).toMatchObject({
      kind: "movie",
      title: "Un film Minecraft",
      season: null,
      episode: null,
    });
  });
  it("rifiuta titoli vuoti, dettagli parziali, prossimi episodi e numeri fuori formato", () => {
    for (const detailText of [
      "",
      "S1",
      "S0 E1: Nome",
      "S1 E0: Nome",
      "S1 E1:",
      "Prossimo episodio S1 E2: Infetti",
    ])
      expect(parseNowMedia({ titleText: "The Last of Us", detailText })).toBeNull();
    expect(parseNowMedia({ titleText: "", detailText: null })).toBeNull();
    expect(parseNowMedia({ titleText: "a".repeat(501), detailText: null })).toBeNull();
  });
});
