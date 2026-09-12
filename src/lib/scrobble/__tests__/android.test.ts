import { describe, expect, it } from "vitest";
import {
  type AndroidEvent,
  isAndroidEvent,
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
    expect(
      parseAndroidEvent(evento({ package: "com.netflix.ninja", title: null })),
    ).toBeNull();
    expect(
      parseAndroidEvent(evento({ package: "com.amazon.firebat", title: null })),
    ).toBeNull();
  });

  it("tace su un package fuori elenco", () => {
    expect(parseAndroidEvent(evento({ package: "com.spotify.tv.android" }))).toBeNull();
  });
});

describe("soglia anti-anteprima", () => {
  it("accetta una riproduzione vera", () => {
    expect(
      riproduzioneVera({
        position_ms: 249_755,
        duration_ms: 2_772_000,
        state: "playing",
      }),
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

describe("forma dell'evento della TV", () => {
  it("accetta un evento vero della sonda", () => {
    expect(isAndroidEvent(evento({}))).toBe(true);
  });

  it("accetta titolo e durata assenti (Netflix, Prime, Apple TV)", () => {
    expect(isAndroidEvent(evento({ title: null, duration_ms: null }))).toBe(true);
  });

  it("scarta ciò che non è un oggetto", () => {
    expect(isAndroidEvent(null)).toBe(false);
    expect(isAndroidEvent("playing")).toBe(false);
    expect(isAndroidEvent([])).toBe(false);
  });

  it("scarta uno stato che il server non conosce", () => {
    expect(isAndroidEvent(evento({ state: "buffering" as never }))).toBe(false);
  });

  it("scarta una data che non si legge", () => {
    expect(isAndroidEvent(evento({ at: "ieri sera" }))).toBe(false);
  });

  it("scarta un titolo smisurato", () => {
    // Il titolo finisce in una query TMDB e in un .ilike(): lo stesso tetto
    // che vale per il browser vale per la TV.
    expect(isAndroidEvent(evento({ title: "a".repeat(501) }))).toBe(false);
  });

  it("scarta un package smisurato", () => {
    expect(isAndroidEvent(evento({ package: "com." + "a".repeat(300) }))).toBe(false);
  });

  it("scarta minutaggi impossibili", () => {
    expect(isAndroidEvent(evento({ position_ms: -1 }))).toBe(false);
    expect(isAndroidEvent(evento({ position_ms: Number.NaN }))).toBe(false);
    expect(isAndroidEvent(evento({ duration_ms: 0 }))).toBe(false);
  });

  it("scarta un id che non è una stringa breve", () => {
    expect(isAndroidEvent(evento({ id: "x".repeat(101) }))).toBe(false);
    expect(isAndroidEvent(evento({ id: 1 as never }))).toBe(false);
  });
});
