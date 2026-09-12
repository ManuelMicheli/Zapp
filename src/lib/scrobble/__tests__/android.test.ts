import { describe, expect, it } from "vitest";
import {
  type AndroidEvent,
  parseAndroidEvent,
  riproduzioneVera,
  siteFromPackage,
} from "../android";

function evento(parti: Partial<AndroidEvent>): AndroidEvent {
  return {
    id: "1",
    at: "2026-09-12T13:38:51.000Z",
    package: "com.nowtv.it",
    state: "playing",
    position_ms: 249_755,
    duration_ms: 2_772_000,
    title: "Al Britani",
    ...parti,
  };
}

describe("package -> piattaforma", () => {
  it("riconosce i package visti sulla Fire TV", () => {
    expect(siteFromPackage("com.nowtv.it")).toBe("now");
    expect(siteFromPackage("com.disney.disneyplus")).toBe("disney");
    expect(siteFromPackage("com.netflix.ninja")).toBe("netflix");
    expect(siteFromPackage("com.amazon.firebat")).toBe("prime");
  });

  it("ignora tutto il resto", () => {
    expect(siteFromPackage("com.spotify.tv.android")).toBeNull();
    expect(siteFromPackage("com.amazon.firetv.youtube")).toBeNull();
  });
});

describe("metadati Android -> titolo", () => {
  it("legge il titolo di NOW", () => {
    const parsed = parseAndroidEvent(evento({}));
    expect(parsed?.title).toBe("Al Britani");
    // Senza dettaglio il parser di NOW deduce "movie": è un'ipotesi, non un
    // fatto, e la ribalta `matchTitle` provando l'altro tipo.
    expect(parsed?.kind).toBe("movie");
  });

  it("legge il titolo di Disney+", () => {
    const parsed = parseAndroidEvent(
      evento({
        package: "com.disney.disneyplus",
        title: "Big Hero 6",
        duration_ms: 6_557_000,
        position_ms: 98_335,
      }),
    );
    expect(parsed?.title).toBe("Big Hero 6");
  });

  it("tace dove i metadati non ci sono", () => {
    // Netflix, Prime e Apple TV su Fire OS danno metadata:size=0: il titolo
    // per loro lo dichiara Zapp lanciandolo (Piano 2), non si indovina qui.
    expect(parseAndroidEvent(evento({ package: "com.netflix.ninja", title: null }))).toBeNull();
    expect(parseAndroidEvent(evento({ package: "com.amazon.firebat", title: null }))).toBeNull();
  });

  it("tace su un package fuori elenco", () => {
    expect(parseAndroidEvent(evento({ package: "com.spotify.tv.android" }))).toBeNull();
  });
});

describe("soglia anti-anteprima", () => {
  it("accetta una riproduzione vera", () => {
    expect(
      riproduzioneVera({ position_ms: 249_755, duration_ms: 2_772_000, state: "playing" }),
    ).toBe(true);
  });

  it("scarta l'anteprima del catalogo", () => {
    // Netflix e Prime riproducono le anteprime come sessioni vere: playing,
    // posizione che avanza da zero. Sotto i due minuti non si scrive niente.
    expect(
      riproduzioneVera({ position_ms: 8_257, duration_ms: null, state: "playing" }),
    ).toBe(false);
  });

  it("scarta una clip breve anche se è andata avanti", () => {
    expect(
      riproduzioneVera({ position_ms: 130_000, duration_ms: 180_000, state: "playing" }),
    ).toBe(false);
  });

  it("non conta ciò che non sta suonando", () => {
    expect(
      riproduzioneVera({ position_ms: 249_755, duration_ms: 2_772_000, state: "paused" }),
    ).toBe(false);
  });
});
