import { describe, expect, it } from "vitest";
import { isSurface, parseSignal, signalAttr, targetFromHref } from "./surfaces";

describe("signalAttr / parseSignal", () => {
  it("fa il giro completo con la posizione", () => {
    const attr = signalAttr("movie", 603, "home-top10", 3);
    expect(attr).toBe("movie:603:home-top10:3");
    expect(parseSignal(attr)).toEqual({
      mediaType: "movie",
      titleId: 603,
      surface: "home-top10",
      position: 3,
    });
  });

  it("fa il giro completo senza posizione", () => {
    const attr = signalAttr("tv", 1396, "search");
    expect(attr).toBe("tv:1396:search:");
    expect(parseSignal(attr)).toEqual({
      mediaType: "tv",
      titleId: 1396,
      surface: "search",
      position: null,
    });
  });

  it("rifiuta una superficie che non è nell'elenco", () => {
    expect(parseSignal("movie:603:home-inventata:1")).toBeNull();
  });

  it("rifiuta un id che non è un numero", () => {
    expect(parseSignal("movie:abc:search:1")).toBeNull();
  });

  it("rifiuta un media_type diverso da movie|tv", () => {
    expect(parseSignal("persona:603:search:1")).toBeNull();
  });

  it("rifiuta stringhe vuote, nulle o con troppi pezzi", () => {
    expect(parseSignal(null)).toBeNull();
    expect(parseSignal(undefined)).toBeNull();
    expect(parseSignal("")).toBeNull();
    expect(parseSignal("movie:603:search:1:extra")).toBeNull();
  });

  it("isSurface riconosce solo i nomi dell'elenco", () => {
    expect(isSurface("home-continua")).toBe(true);
    expect(isSurface("home-continua-bis")).toBe(false);
  });
});

describe("targetFromHref", () => {
  it("legge tipo e id dalla scheda titolo", () => {
    expect(targetFromHref("/title/movie/603")).toEqual({
      mediaType: "movie",
      titleId: 603,
    });
    expect(targetFromHref("/title/tv/1396/season/2")).toEqual({
      mediaType: "tv",
      titleId: 1396,
    });
  });

  it("torna null su qualunque altro href", () => {
    expect(targetFromHref("/library")).toBeNull();
    expect(targetFromHref("/title/persona/5")).toBeNull();
    expect(targetFromHref(undefined)).toBeNull();
  });
});
