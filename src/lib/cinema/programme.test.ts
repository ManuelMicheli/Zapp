import { describe, expect, it } from "vitest";
import { aggregateByFilm, filmOfTheDay, nextShowing } from "./programme";
import type { Cinema, FilmSummary, Showing } from "./types";

const cinema = (id: number, distanceKm: number, favorite = false): Cinema => ({
  id,
  name: `Cinema ${id}`,
  address: "",
  city: "",
  lat: 0,
  lng: 0,
  distanceKm,
  logoUrl: null,
  favorite,
});
const film = (id: number): FilmSummary => ({
  tmdbId: id,
  sourceFilmId: id,
  title: `Film ${id}`,
  posterPath: null,
  backdropPath: null,
});
const show = (hhmm: string): Showing => ({
  start: `2026-09-07T${hhmm}:00+02:00`,
  end: null,
  format: "standard",
  bookingUrl: "https://example.com",
  bookingLevel: 0,
});

const NOW = new Date("2026-09-07T19:20:00+02:00").getTime();

describe("aggregateByFilm", () => {
  it("un film per riga, conta le sale e tiene la più vicina", () => {
    const out = aggregateByFilm([
      { cinema: cinema(1, 2), films: [{ film: film(10), showings: [show("21:00")] }] },
      {
        cinema: cinema(2, 1),
        films: [
          { film: film(10), showings: [show("20:00")] },
          { film: film(11), showings: [show("22:00")] },
        ],
      },
    ]);
    expect(out.map((e) => [e.film.sourceFilmId, e.cinemaCount, e.cinema.id])).toEqual([
      [10, 2, 2],
      [11, 1, 2],
    ]);
    expect(out[0].showings.map((s) => s.start)).toEqual([show("20:00").start]);
  });

  it("preferisce la sala preferita a quella più vicina", () => {
    const out = aggregateByFilm([
      {
        cinema: cinema(1, 2, true),
        films: [{ film: film(10), showings: [show("21:00")] }],
      },
      { cinema: cinema(2, 1), films: [{ film: film(10), showings: [show("20:00")] }] },
    ]);
    expect(out[0].cinema.id).toBe(1);
  });

  it("ordina per numero di sale, a parità per ordine di arrivo", () => {
    const out = aggregateByFilm([
      {
        cinema: cinema(1, 1),
        films: [
          { film: film(10), showings: [show("21:00")] },
          { film: film(11), showings: [show("21:00")] },
        ],
      },
      { cinema: cinema(2, 2), films: [{ film: film(11), showings: [show("21:00")] }] },
    ]);
    expect(out.map((e) => e.film.sourceFilmId)).toEqual([11, 10]);
  });
});

describe("nextShowing", () => {
  it("il primo spettacolo futuro fra tutte le sale, con la sua sala", () => {
    const pick = nextShowing(
      [
        { cinema: cinema(1, 2), showings: [show("17:30"), show("21:15")] },
        { cinema: cinema(2, 1), showings: [show("19:45"), show("22:00")] },
      ],
      NOW,
    );
    expect(pick?.cinema.id).toBe(2);
    expect(pick?.showing.start).toBe(show("19:45").start);
  });

  it("null se non resta nulla oggi", () => {
    expect(nextShowing([{ cinema: cinema(1, 1), showings: [show("17:30")] }], NOW)).toBe(
      null,
    );
  });
});

describe("filmOfTheDay", () => {
  it("il film dato in più sale che ha ancora uno spettacolo, col prossimo orario", () => {
    const entries = aggregateByFilm([
      {
        cinema: cinema(1, 1),
        films: [
          { film: film(10), showings: [show("15:00")] },
          { film: film(11), showings: [show("20:00")] },
        ],
      },
      {
        cinema: cinema(2, 2),
        films: [
          { film: film(10), showings: [show("16:00")] },
          { film: film(12), showings: [show("22:00")] },
        ],
      },
    ]);
    const pick = filmOfTheDay(entries, NOW);
    expect(pick?.entry.film.sourceFilmId).toBe(11);
    expect(pick?.next.start).toBe(show("20:00").start);
    expect(pick?.othersToday).toBe(1);
  });

  it("null senza spettacoli futuri", () => {
    const entries = aggregateByFilm([
      { cinema: cinema(1, 1), films: [{ film: film(10), showings: [show("15:00")] }] },
    ]);
    expect(filmOfTheDay(entries, NOW)).toBe(null);
  });
});
