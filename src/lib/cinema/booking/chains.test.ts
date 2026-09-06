import { describe, expect, it } from "vitest";
import notoriousCinemas from "./__fixtures__/notorious-cinemas.json";
import notoriousSched from "./__fixtures__/notorious-scheduling.json";
import theSpaceCinemas from "./__fixtures__/thespace-cinemas.json";
import theSpaceFilms from "./__fixtures__/thespace-films.json";
import uciMovies from "./__fixtures__/uci-movies.json";
import uciProgramming from "./__fixtures__/uci-programming.json";
import uciTheatres from "./__fixtures__/uci-theatres.json";
import { buildCinelandiaLinks, cinelandiaSlug } from "./cinelandia";
import {
  buildNotoriousLinks,
  pickNotoriousCinema,
  pickNotoriousEvent,
  type NotoriousScheduling,
} from "./notorious";
import {
  buildTheSpaceLinks,
  pickTheSpaceCinema,
  pickTheSpaceFilm,
  type TheSpaceCinemas,
} from "./thespace";
import type { BookingQuery } from "./types";
import {
  buildUciLinks,
  flattenUciPerformances,
  pickUciMovie,
  pickUciTheatre,
} from "./uci";

const coyote: BookingQuery = {
  cinema: { id: 1, name: "UCI Cinemas Bicocca", lat: 45.5218, lng: 9.2161 },
  film: { title: "Coyote vs. Acme", originalTitle: "Coyote vs. Acme" },
  date: "2026-09-06",
  times: ["20:20", "22:15", "23:59"],
};

describe("UCI", () => {
  it("riconosce il cinema dalle coordinate", () => {
    expect(pickUciTheatre(uciTheatres.data, coyote.cinema)?.slug).toBe(
      "uci-cinemas-bicocca-milano",
    );
    // lontano e con un altro nome: nessun match (il nome da solo salva solo i casi
    // con coordinate assenti)
    expect(
      pickUciTheatre(uciTheatres.data, {
        ...coyote.cinema,
        name: "UCI Cinemas Lontano",
        lat: 45.46,
        lng: 9.19,
      }),
    ).toBeNull();
  });

  it("riconosce il film dal titolo", () => {
    expect(pickUciMovie(uciMovies.data, coyote.film)?.slug).toBe("coyote-vs-acme");
    expect(
      pickUciMovie(uciMovies.data, { title: "Un film inesistente", originalTitle: null }),
    ).toBeNull();
  });

  it("link livello 2 per gli orari presenti, livello 1 per il resto", () => {
    const theatre = pickUciTheatre(uciTheatres.data, coyote.cinema)!;
    const perfs = flattenUciPerformances(uciProgramming.data[0].screens);
    expect(perfs).toHaveLength(3);
    const links = buildUciLinks(theatre, perfs, coyote);
    expect(links.byTime.get("20:20")).toEqual({
      url: "https://ucicinemas.it/movies/coyote-vs-acme/acquista/5068/9797/1007876",
      level: 2,
    });
    expect(links.byTime.get("22:15")?.url).toContain("/acquista/5068/9797/1007904");
    expect(links.byTime.has("23:59")).toBe(false);
    expect(links.fallback).toEqual({
      url: "https://ucicinemas.it/cinema/uci-cinemas-bicocca-milano",
      level: 1,
    });
  });

  it("senza programmazione resta solo la pagina del cinema", () => {
    const theatre = pickUciTheatre(uciTheatres.data, coyote.cinema)!;
    const links = buildUciLinks(theatre, [], coyote);
    expect(links.byTime.size).toBe(0);
    expect(links.fallback?.level).toBe(1);
  });
});

describe("Notorious", () => {
  const q: BookingQuery = {
    ...coyote,
    cinema: {
      id: 2,
      name: "Notorious Cinemas Sesto San Giovanni",
      lat: 45.53,
      lng: 9.24,
    },
    times: ["19:45", "21:50", "10:00"],
  };
  const sched = notoriousSched as NotoriousScheduling;

  it("riconosce cinema ed evento dai nomi", () => {
    expect(pickNotoriousCinema(notoriousCinemas, q.cinema.name)?.IDWEBTIC).toBe("5446");
    expect(pickNotoriousCinema(notoriousCinemas, "Cinema Anteo")).toBeNull();
    expect(pickNotoriousEvent(sched.DS.Scheduling.Events, q.film)?.EventId).toBe(2809);
  });

  it("frame scelta posti per l'orario del giorno richiesto", () => {
    const event = pickNotoriousEvent(sched.DS.Scheduling.Events, q.film)!;
    const links = buildNotoriousLinks("5446", event, q);
    expect(links.byTime.get("19:45")).toEqual({
      url: "https://www.notoriouscinemas.it/generic/seatsframe.php?sc=5446&sp=126732#seatsframe",
      level: 2,
    });
    expect(links.byTime.get("21:50")?.url).toContain("sp=126559");
    expect(links.byTime.has("10:00")).toBe(false);
    expect(links.fallback).toBeNull();
  });
});

describe("The Space", () => {
  const groups = (theSpaceCinemas as TheSpaceCinemas).result;

  it("riconosce la sede dal token e il film dallo slug", () => {
    expect(pickTheSpaceCinema(groups, "The Space Cinema Rozzano")?.cinemaId).toBe("1020");
    expect(pickTheSpaceCinema(groups, "The Space Cinema Odeon")).toBeNull();
    expect(pickTheSpaceFilm(theSpaceFilms.result, coyote.film)?.filmId).toBe(
      "HO00003783",
    );
  });

  it("pagina film nel cinema, altrimenti la programmazione della sede", () => {
    const cinema = pickTheSpaceCinema(groups, "The Space Cinema Rozzano")!;
    const film = pickTheSpaceFilm(theSpaceFilms.result, coyote.film);
    expect(buildTheSpaceLinks(cinema, film).fallback).toEqual({
      url: "https://www.thespacecinema.it/cinema/rozzano/film/coyote-vs-acme",
      level: 1,
    });
    expect(buildTheSpaceLinks(cinema, null).fallback?.url).toBe(
      "https://www.thespacecinema.it/cinema/rozzano/al-cinema",
    );
  });
});

describe("Cinelandia", () => {
  it("slug dal titolo e link solo se la pagina esiste", () => {
    expect(cinelandiaSlug("Coyote vs. Acme")).toBe("coyote-vs-acme");
    expect(
      buildCinelandiaLinks([{ id: 6243, slug: "coyote-vs-acme" }], "coyote-vs-acme")
        .fallback,
    ).toEqual({ url: "https://www.cinelandia.it/coyote-vs-acme/", level: 1 });
    expect(buildCinelandiaLinks([], "coyote-vs-acme").fallback).toBeNull();
  });
});
