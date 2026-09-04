import { describe, expect, it } from "vitest";
import {
  cellKey,
  directionsUrl,
  distanceKm,
  formatDistance,
  isValidLatLng,
  labelFromAddress,
  milesToKm,
  roundToCell,
  walkingMinutes,
} from "./geo";

describe("geo", () => {
  it("valida le coordinate", () => {
    expect(isValidLatLng(45.46, 9.19)).toBe(true);
    expect(isValidLatLng(91, 0)).toBe(false);
    expect(isValidLatLng(0, 181)).toBe(false);
    expect(isValidLatLng(Number.NaN, 0)).toBe(false);
  });

  it("arrotonda alla cella di 3 decimali", () => {
    expect(roundToCell({ lat: 45.46421, lng: 9.19163 })).toEqual({
      lat: 45.464,
      lng: 9.192,
    });
    expect(cellKey({ lat: 45.46421, lng: 9.19163 })).toBe("45.464,9.192");
  });

  it("converte miglia in km", () => {
    expect(milesToKm(1)).toBeCloseTo(1.609, 3);
  });

  it("calcola la distanza haversine (Duomo → Bicocca ≈ 6,6 km)", () => {
    const km = distanceKm({ lat: 45.4642, lng: 9.19 }, { lat: 45.5228, lng: 9.2131 });
    expect(km).toBeGreaterThan(6.3);
    expect(km).toBeLessThan(6.9);
  });

  it("formatta la distanza all'italiana", () => {
    expect(formatDistance(0.85)).toBe("850 m");
    expect(formatDistance(1.234)).toBe("1,2 km");
    expect(formatDistance(12.6)).toBe("13 km");
  });

  it("stima i minuti a piedi a 5 km/h", () => {
    expect(walkingMinutes(1.25)).toBe(15);
    expect(walkingMinutes(0.1)).toBe(1);
  });

  it("costruisce il link indicazioni", () => {
    expect(directionsUrl({ lat: 45.5, lng: 9.2 }, false)).toBe(
      "https://maps.google.com/?q=45.5,9.2",
    );
    expect(directionsUrl({ lat: 45.5, lng: 9.2 }, true)).toBe(
      "https://maps.apple.com/?daddr=45.5,9.2",
    );
  });

  it("compone l'etichetta da un indirizzo Nominatim", () => {
    expect(labelFromAddress({ suburb: "Porta Romana", city: "Milano" })).toBe(
      "Porta Romana, Milano",
    );
    expect(labelFromAddress({ town: "Monza" })).toBe("Monza");
    expect(labelFromAddress({ quarter: "Centro", village: "Erba" })).toBe("Centro, Erba");
    expect(labelFromAddress({})).toBeNull();
  });
});
