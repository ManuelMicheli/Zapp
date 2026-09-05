import { describe, expect, it } from "vitest";
import {
  normalizeTitle,
  parseNetflixTitle,
  parseSeasonNumber,
  pickBestMatch,
  queryVariants,
  titleSimilarity,
} from "./netflix-title";

describe("normalizeTitle", () => {
  it("minuscole, accenti, punteggiatura, articolo iniziale", () => {
    expect(normalizeTitle("Élite")).toBe("elite");
    expect(normalizeTitle("The Crown")).toBe("crown");
    expect(normalizeTitle("La casa di carta")).toBe("casa di carta");
    expect(normalizeTitle("Brooklyn Nine-Nine")).toBe("brooklyn nine nine");
  });
  it("toglie parentesi, apostrofi e suffissi generici", () => {
    expect(normalizeTitle("Hunter x Hunter (2011)")).toBe("hunter x hunter");
    expect(normalizeTitle("The Office (U.S.)")).toBe("office");
    expect(normalizeTitle("Marvel's Daredevil")).toBe("marvels daredevil");
    expect(normalizeTitle("Sonic - Il film")).toBe("sonic");
    expect(normalizeTitle("Bird Box: The Movie")).toBe("bird box");
  });
  it("non svuota mai un titolo che è solo un articolo o un suffisso", () => {
    expect(normalizeTitle("Il film")).toBe("film");
    expect(normalizeTitle("The")).toBe("the");
  });
});

describe("titleSimilarity", () => {
  it("1 per titoli uguali dopo normalizzazione", () => {
    expect(titleSimilarity("Marvel's Daredevil", "Marvel's Daredevil")).toBe(1);
    expect(titleSimilarity("Hunter x Hunter (2011)", "Hunter x Hunter")).toBe(1);
  });
  it("alta per differenze minime", () => {
    expect(titleSimilarity("Marvel - Daredevil", "Marvel's Daredevil")).toBeGreaterThan(
      0.85,
    );
    expect(titleSimilarity("Tokyo Revengers", "Tokyo Revenger")).toBeGreaterThan(0.85);
  });
  it("0.9 quando il titolo TMDB è il titolo Netflix più un sottotitolo", () => {
    expect(titleSimilarity("Sonic", "Sonic - Il film")).toBe(1); // suffisso generico
    expect(titleSimilarity("Jumanji", "Jumanji - Benvenuti nella giungla")).toBe(0.9);
  });
  it("0.88 quando Netflix antepone la saga e TMDB no", () => {
    expect(
      titleSimilarity(
        "Pirati dei Caraibi - La maledizione della prima luna",
        "La maledizione della prima luna",
      ),
    ).toBe(0.88);
    expect(
      titleSimilarity("Star Wars: L'Impero colpisce ancora", "L'Impero colpisce ancora"),
    ).toBe(0.88);
    // una sola parola: troppo facile che sia il titolo di un episodio
    expect(titleSimilarity("Dark: Segreti", "Segreti")).toBeLessThan(0.85);
  });
  it("il prefisso da solo prende anche serie derivate: il ripiego serie esige 1", () => {
    expect(titleSimilarity("Star Wars", "Star Wars: The Clone Wars")).toBe(0.9);
  });
  it("bassa quando il titolo Netflix ha un sottotitolo che TMDB non ha", () => {
    expect(
      titleSimilarity("Ritorno al futuro - Parte II", "Ritorno al futuro"),
    ).toBeLessThan(0.85);
  });
  it("bassa per titoli diversi", () => {
    expect(titleSimilarity("Dark", "Dark Matter")).toBeLessThan(0.85);
    expect(titleSimilarity("Lupin", "Lupin III")).toBeLessThan(0.85);
  });
});

describe("parseSeasonNumber", () => {
  it("numeri, romani e ordinali", () => {
    expect(parseSeasonNumber("Stagione 3")).toBe(3);
    expect(parseSeasonNumber("Parte 2")).toBe(2);
    expect(parseSeasonNumber("Volume II")).toBe(2);
    expect(parseSeasonNumber("Stranger Things 4")).toBe(4);
    expect(parseSeasonNumber("Stagione uno")).toBe(1);
    expect(parseSeasonNumber("Season Two")).toBe(2);
    expect(parseSeasonNumber("Miniserie")).toBe(1);
    expect(parseSeasonNumber("Limited Series")).toBe(1);
  });
  it("null quando non c'è un numero", () => {
    expect(parseSeasonNumber("Stagione finale")).toBeNull();
    expect(parseSeasonNumber("Acqua")).toBeNull();
  });
});

describe("parseNetflixTitle", () => {
  it("Show: Stagione N: Episodio", () => {
    expect(parseNetflixTitle("The Witcher: Stagione 1: L'inizio della fine")).toEqual({
      kind: "episode",
      show: "The Witcher",
      altShow: null,
      seasonLabel: "Stagione 1",
      seasonNumber: 1,
      episode: "L'inizio della fine",
      episodeNumber: null,
    });
  });
  it("show con i due punti nel nome", () => {
    const p = parseNetflixTitle("Star Trek: Discovery: Stagione 2: Fratello");
    expect(p.kind).toBe("episode");
    if (p.kind !== "episode") return;
    expect(p.show).toBe("Star Trek: Discovery");
    expect(p.seasonNumber).toBe(2);
  });
  it("Parte, Volume, Libro, Serie, Miniserie", () => {
    expect(parseNetflixTitle("La casa di carta: Parte 5: Episodio 3")).toMatchObject({
      show: "La casa di carta",
      seasonNumber: 5,
      episodeNumber: 3,
    });
    expect(parseNetflixTitle("Sherlock: Serie 1: Uno studio in rosa")).toMatchObject({
      show: "Sherlock",
      seasonNumber: 1,
    });
    expect(
      parseNetflixTitle(
        "Avatar - La leggenda di Aang: Libro 1: Acqua: Il ragazzo nell'iceberg",
      ),
    ).toMatchObject({
      show: "Avatar - La leggenda di Aang",
      seasonNumber: 1,
      episode: "Acqua: Il ragazzo nell'iceberg",
    });
    expect(
      parseNetflixTitle("La regina degli scacchi: Miniserie: Aperture"),
    ).toMatchObject({
      show: "La regina degli scacchi",
      seasonNumber: 1,
    });
    expect(parseNetflixTitle("Lupin: Parte 1: Capitolo 1")).toMatchObject({
      show: "Lupin",
      seasonNumber: 1,
      episodeNumber: 1,
    });
  });
  it("stagione con nome proprio (senza parola chiave)", () => {
    expect(
      parseNetflixTitle(
        "Stranger Things: Stranger Things 4: Capitolo uno: Il club Hellfire",
      ),
    ).toMatchObject({
      kind: "episode",
      show: "Stranger Things",
      altShow: "Stranger Things: Stranger Things 4",
      seasonLabel: "Stranger Things 4",
      seasonNumber: 4,
      episodeNumber: 1,
    });
    expect(parseNetflixTitle("Baki: Il torneo del più forte: Episodio 2")).toMatchObject({
      show: "Baki",
      altShow: "Baki: Il torneo del più forte",
      seasonNumber: null,
      episodeNumber: 2,
    });
  });
  it("due parti: singolo con prefisso per il ripiego serie", () => {
    expect(parseNetflixTitle("Our Planet: Un unico pianeta")).toEqual({
      kind: "single",
      title: "Our Planet: Un unico pianeta",
      prefix: "Our Planet",
      episode: "Un unico pianeta",
    });
  });
  it("una parte: singolo senza prefisso", () => {
    expect(parseNetflixTitle("Interstellar")).toEqual({
      kind: "single",
      title: "Interstellar",
      prefix: null,
      episode: null,
    });
  });
  it("la parola chiave nell'ultima parte non è una stagione", () => {
    // "Parte 1" qui è il titolo del film, non una stagione
    expect(parseNetflixTitle("Kill Bill: Volume 1")).toMatchObject({ kind: "single" });
  });
});

describe("queryVariants", () => {
  it("titolo intero, poi senza sottotitolo, senza parentesi, dedup", () => {
    expect(queryVariants("Jumanji - Benvenuti nella giungla")).toEqual([
      "Jumanji - Benvenuti nella giungla",
      "Jumanji",
      "Benvenuti nella giungla",
    ]);
    expect(queryVariants("Hunter x Hunter (2011)")).toEqual([
      "Hunter x Hunter (2011)",
      "Hunter x Hunter",
    ]);
    expect(queryVariants("Spider-Man: Un nuovo universo")).toEqual([
      "Spider-Man: Un nuovo universo",
      "Spider-Man",
      "Un nuovo universo",
    ]);
    // sottotitolo di una parola: mai da solo
    expect(queryVariants("Dark: Segreti")).toEqual(["Dark: Segreti", "Dark"]);
    expect(queryVariants("Dark")).toEqual(["Dark"]);
  });
});

describe("pickBestMatch", () => {
  const results = [
    { id: 1, names: ["Ritorno al futuro - Parte II", "Back to the Future Part II"] },
    { id: 2, names: ["Ritorno al futuro", "Back to the Future"] },
    { id: 3, names: ["Ritorno al futuro - Parte III"] },
  ];
  it("preferisce il match esatto anche se non è il primo", () => {
    expect(pickBestMatch("Ritorno al futuro", results)?.item.id).toBe(2);
  });
  it("confronta anche il titolo originale", () => {
    expect(pickBestMatch("Back to the Future Part II", results)?.item.id).toBe(1);
  });
  it("a parità di punteggio vince l'ordine TMDB", () => {
    const r = [
      { id: 10, names: ["Dark"] },
      { id: 11, names: ["Dark"] },
    ];
    expect(pickBestMatch("Dark", r)?.item.id).toBe(10);
  });
  it("null sotto soglia", () => {
    expect(pickBestMatch("Dark", results)).toBeNull();
  });
  it("segnala i match non esatti", () => {
    const r = [{ id: 5, names: ["Marvel's Daredevil"] }];
    expect(pickBestMatch("Marvel - Daredevil", r)).toMatchObject({ exact: false });
    expect(pickBestMatch("Marvel's Daredevil", r)).toMatchObject({ exact: true });
  });
});
