import { describe, expect, it } from "vitest";
import { bestByName, bestByToken, dateOf, hhmm, nearestVenue } from "./match";

describe("nearestVenue", () => {
  const venues = [
    { name: "Bicocca", lat: 45.5218, lng: 9.2161 },
    { name: "Arezzo", lat: 43.479, lng: 11.8696 },
  ];

  it("prende il cinema entro il raggio", () => {
    expect(nearestVenue(venues, { lat: 45.5215, lng: 9.2165 })?.name).toBe("Bicocca");
  });

  it("null se il più vicino è oltre il raggio", () => {
    expect(nearestVenue(venues, { lat: 45.46, lng: 9.19 })).toBeNull();
  });

  it("accetta coordinate come stringhe e ignora quelle non valide", () => {
    const list = [
      { name: "S", lat: "45.5218", lng: "9.2161" },
      { name: "X", lat: null, lng: "9" },
    ];
    expect(nearestVenue(list, { lat: 45.5218, lng: 9.2161 })?.name).toBe("S");
    expect(nearestVenue([], { lat: 0, lng: 0 })).toBeNull();
  });
});

describe("bestByName", () => {
  const films = [
    { t: "Oceania" },
    { t: "Coyote vs ACME" },
    { t: "Cinemamma - Coyote Vs Acme" },
  ];

  it("sceglie il titolo uguale dopo normalizzazione", () => {
    expect(bestByName(films, (f) => f.t, "Coyote vs. Acme")?.t).toBe("Coyote vs ACME");
  });

  it("null sotto soglia", () => {
    expect(bestByName(films, (f) => f.t, "Spider-Man: Brand New Day")).toBeNull();
  });

  it("confronta anche i nomi alternativi", () => {
    const list = [{ names: ["Moana 2", "Oceania 2"] }];
    expect(bestByName(list, (f) => f.names, "Oceania 2")).toBe(list[0]);
  });
});

describe("bestByToken", () => {
  const cinemas = [
    { cinemaName: "Rozzano", fullName: "Rozzano, Milano, The Space " },
    { cinemaName: "Vimercate", fullName: "Milano Vimercate" },
  ];

  it("trova il cinema il cui token compare nel nome MyMovies", () => {
    expect(
      bestByToken(cinemas, (c) => c.cinemaName, "The Space Cinema Rozzano")?.cinemaName,
    ).toBe("Rozzano");
  });

  it("null se nessun token compare", () => {
    expect(
      bestByToken(cinemas, (c) => c.cinemaName, "The Space Cinema Odeon"),
    ).toBeNull();
  });
});

describe("hhmm / dateOf", () => {
  it("estrae ore e minuti da ISO, da 'YYYY-MM-DD HH:MM:SS' e da 'HH:MM'", () => {
    expect(hhmm("2026-09-06T21:15:00+02:00")).toBe("21:15");
    expect(hhmm("2026-09-06 20:20:00")).toBe("20:20");
    expect(hhmm("9:05")).toBe("09:05");
    expect(hhmm("boh")).toBeNull();
  });

  it("estrae il giorno", () => {
    expect(dateOf("2026-09-07T00:00:00")).toBe("2026-09-07");
    expect(dateOf("2026-09-06 20:20:00")).toBe("2026-09-06");
    expect(dateOf("x")).toBeNull();
  });
});
