import { describe, expect, it } from "vitest";
import {
  compareByTier,
  prettyVenueName,
  shortVenueName,
  venueGeocodeQueries,
  venueTier,
} from "./rank";

describe("venueTier", () => {
  it("le grandi catene sono livello 1", () => {
    for (const n of [
      "Uci Cinemas Milanofiori",
      "UCI Cinemas Bicocca",
      "The Space Cinema Rozzano",
      "Gloria Notorious Cinemas",
      "Notorious Cinemas Merlata Bloom",
    ]) {
      expect(venueTier(n), n).toBe(1);
    }
  });

  it("multisala e catene regionali sono livello 2", () => {
    for (const n of [
      "Cinelandia Certosa",
      "Multiplex Arcadia",
      "Arcadia Multiplex",
      "Ducale Multisala",
      "Le Giraffe Multiplex",
      "CINEMA Movie Planet",
      "Anteo Palazzo del Cinema",
      "CINEMA CityLife Anteo",
    ]) {
      expect(venueTier(n), n).toBe(2);
    }
  });

  it("le sale indipendenti sono livello 3", () => {
    for (const n of [
      "CINEMA Beltrade",
      "Cinema Godard - Fondazione Prada",
      "Splendor di",
    ]) {
      expect(venueTier(n), n).toBe(3);
    }
  });

  it('"Lucia" non diventa UCI', () => {
    expect(venueTier("Cinema Lucia")).toBe(3);
  });
});

describe("prettyVenueName", () => {
  it("aggiunge il comune ai nomi di sola catena", () => {
    expect(prettyVenueName("The Space Cinema", "Rozzano")).toBe(
      "The Space Cinema Rozzano",
    );
    expect(prettyVenueName("Uci Cinemas", "Pioltello")).toBe("UCI Cinemas Pioltello");
    expect(prettyVenueName("Notorious Cinemas", "Sesto San Giovanni")).toBe(
      "Notorious Cinemas Sesto San Giovanni",
    );
  });

  it("non ripete il comune già nel nome e lascia i nomi propri", () => {
    expect(prettyVenueName("Uci Cinemas Bicocca", "Milano")).toBe("UCI Cinemas Bicocca");
    expect(prettyVenueName("Gloria Notorious Cinemas", "Milano")).toBe(
      "Gloria Notorious Cinemas",
    );
    expect(prettyVenueName("Cinelandia  Certosa", "Milano")).toBe("Cinelandia Certosa");
    expect(prettyVenueName("CINEMA Eliseo", "Milano")).toBe("Cinema Eliseo");
  });
});

describe("shortVenueName", () => {
  it("toglie la parola di catena, lascia le sale 'Cinema X'", () => {
    expect(shortVenueName("UCI Cinemas Bicocca")).toBe("UCI Bicocca");
    expect(shortVenueName("The Space Cinema Rozzano")).toBe("The Space Rozzano");
    expect(shortVenueName("Gloria Notorious Cinemas")).toBe("Gloria Notorious");
    expect(shortVenueName("Cinema Beltrade")).toBe("Cinema Beltrade");
  });
});

describe("venueGeocodeQueries", () => {
  it("prova prima 'Cinema <parte distintiva>, comune' poi la sola parte distintiva", () => {
    expect(venueGeocodeQueries("Notorious Cinemas Merlata Bloom", "Milano")).toEqual([
      "Cinema Merlata Bloom, Milano",
      "Merlata Bloom, Milano",
    ]);
    expect(venueGeocodeQueries("Multisala Troisi", "San Donato Milanese")).toEqual([
      "Cinema Troisi, San Donato Milanese",
      "Troisi, San Donato Milanese",
    ]);
  });

  it("senza parte distintiva usa il nome intero col comune", () => {
    expect(venueGeocodeQueries("Multisala", "Arese")).toEqual(["Multisala, Arese"]);
  });
});

describe("compareByTier", () => {
  it("livello prima della distanza", () => {
    const list = [
      { name: "CINEMA Beltrade", distanceKm: 0.5 },
      { name: "Ducale Multisala", distanceKm: 1 },
      { name: "UCI Cinemas Bicocca", distanceKm: 7 },
      { name: "Gloria Notorious Cinemas", distanceKm: 2 },
    ];
    expect([...list].sort(compareByTier).map((c) => c.name)).toEqual([
      "Gloria Notorious Cinemas",
      "UCI Cinemas Bicocca",
      "Ducale Multisala",
      "CINEMA Beltrade",
    ]);
  });
});
