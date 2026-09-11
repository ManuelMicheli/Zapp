import { expect, it } from "vitest";
import { parseDisneyMedia } from "../providers/disney";
import { disneyCatalogMatch, disneyKnownEpisode } from "../providers/disney-catalog";
it("Disney pulisce solo il marchio e conserva il formato episodio osservato", () => {
  expect(
    parseDisneyMedia({ titleText: "Spider-Man™: Homecoming", detailText: null }),
  ).toMatchObject({ kind: "movie", title: "Spider-Man: Homecoming" });
  expect(
    parseDisneyMedia({
      titleText: "Made in Korea",
      detailText: "S1:E2 Le unghie del cane",
    }),
  ).toMatchObject({
    kind: "tv",
    season: 1,
    episode: 2,
    episodeName: "Le unghie del cane",
  });
  expect(
    parseDisneyMedia({ titleText: "Made in Korea", detailText: "Prossimo S1:E2 Nome" }),
  ).toBeNull();
});
it("alias esatti e corrispondenze episodio non autorizzano titoli simili o numeri diversi", () => {
  const media = parseDisneyMedia({
    titleText: "Made in Korea",
    detailText: "S1:E2 Le unghie del cane",
  })!;
  expect(disneyCatalogMatch(media)).toEqual({ titleId: 246473, mediaType: "tv" });
  expect(
    disneyCatalogMatch({ ...media, title: "Made in Korea: The K-Pop Experience" }),
  ).toBeNull();
  expect(disneyKnownEpisode(media, 246473)).toEqual({ season: 1, episode: 2 });
  expect(disneyKnownEpisode({ ...media, episode: 3 }, 246473)).toBeNull();
  expect(disneyKnownEpisode(media, 260681)).toBeNull();
  const bleach = { ...media, title: "BLEACH: Thousand-Year Blood War" };
  expect(disneyCatalogMatch(bleach)).toEqual({ titleId: 30984, mediaType: "tv" });
  expect(disneyKnownEpisode(bleach, 30984)).toBeNull();
});
