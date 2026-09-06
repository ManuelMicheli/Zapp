import { describe, expect, it } from "vitest";
import {
  nearestCinemaId,
  nextFreePosition,
  orderCinemas,
  orderShowtimes,
} from "./favorites";
import type { Cinema, CinemaShowtimes } from "./types";

function cinema(id: number, distanceKm: number): Cinema {
  return {
    id,
    name: `Cinema ${id}`,
    address: "",
    city: "",
    lat: 0,
    lng: 0,
    distanceKm,
    logoUrl: null,
  };
}

describe("orderCinemas", () => {
  it("mette i preferiti in testa nell'ordine scelto, poi il resto per distanza", () => {
    const list = [cinema(1, 0.5), cinema(2, 1), cinema(3, 2), cinema(4, 3)];
    const out = orderCinemas(list, [4, 2]);
    expect(out.map((c) => c.id)).toEqual([4, 2, 1, 3]);
    expect(out.map((c) => c.favorite)).toEqual([true, true, false, false]);
  });

  it("ignora i preferiti assenti dalla lista", () => {
    const list = [cinema(1, 0.5), cinema(2, 1)];
    expect(orderCinemas(list, [99, 2]).map((c) => c.id)).toEqual([2, 1]);
  });

  it("senza preferiti lascia l'ordine per distanza", () => {
    const list = [cinema(2, 1), cinema(1, 0.5)];
    const out = orderCinemas(list, []);
    expect(out.map((c) => c.id)).toEqual([1, 2]);
    expect(out.every((c) => c.favorite === false)).toBe(true);
  });
});

describe("orderShowtimes", () => {
  it("riordina per cinema e marca il preferito", () => {
    const items: CinemaShowtimes[] = [
      { cinema: cinema(1, 0.5), showings: [] },
      { cinema: cinema(2, 1), showings: [] },
    ];
    const out = orderShowtimes(items, [2]);
    expect(out.map((i) => i.cinema.id)).toEqual([2, 1]);
    expect(out[0].cinema.favorite).toBe(true);
    expect(out[1].cinema.favorite).toBe(false);
  });
});

describe("nearestCinemaId", () => {
  it("è il cinema con la distanza minima, non il primo", () => {
    expect(nearestCinemaId([cinema(4, 3), cinema(1, 0.5), cinema(2, 1)])).toBe(1);
  });

  it("null su lista vuota", () => {
    expect(nearestCinemaId([])).toBeNull();
  });
});

describe("nextFreePosition", () => {
  it("prende il primo buco fra 1 e 3", () => {
    expect(nextFreePosition([])).toBe(1);
    expect(nextFreePosition([1, 3])).toBe(2);
    expect(nextFreePosition([1, 2])).toBe(3);
  });

  it("null quando i tre posti sono occupati", () => {
    expect(nextFreePosition([1, 2, 3])).toBeNull();
  });
});
