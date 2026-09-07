import { describe, expect, it } from "vitest";
import { videoContradictsTitle, videoMatchesTitle, workName } from "./match";

const movie = (title: string, originalTitle?: string) =>
  ({ title, originalTitle, mediaType: "movie" }) as const;
const tv = (title: string, season?: number) =>
  ({ title, mediaType: "tv", season }) as const;

describe("workName", () => {
  it("toglie etichette, canale e coda promozionale", () => {
    expect(workName("ONE PIECE | Trailer ufficiale | Netflix")).toBe("ONE PIECE");
    expect(workName("SILO — Trailer ufficiale | Apple TV+")).toBe("SILO");
    expect(
      workName(
        "I Pinguini di Madagascar | Teaser Trailer Ufficiale Italiano | Dal 27 Novembre al cinema",
      ),
    ).toBe("I Pinguini di Madagascar");
    expect(workName("Il Padrino 50° anniversario | Trailer | Eagle Pictures")).toBe(
      "Il Padrino",
    );
  });

  it("tiene il sottotitolo vero", () => {
    expect(workName("El Camino: Il film di Breaking Bad | Trailer ufficiale")).toBe(
      "El Camino: Il film di Breaking Bad",
    );
    expect(workName("Zathura - Un'avventura spaziale - Trailer italiano")).toBe(
      "Zathura: Un'avventura spaziale",
    );
  });

  it("non lascia nulla quando il nome è solo un'etichetta", () => {
    expect(workName("Trailer ufficiale")).toBe("");
    expect(workName("Trailer Ufficiale Italiano")).toBe("");
  });
});

describe("videoMatchesTitle — i casi sbagliati trovati in produzione", () => {
  const cases: [string, ReturnType<typeof movie> | ReturnType<typeof tv>][] = [
    ["SCAPPA - GET OUT - Trailer italiano ufficiale", tv("Prison Break")],
    ["SCAPPA - GET OUT - Trailer italiano ufficiale", tv("Il giardiniere")],
    [
      "Il Cavaliere Oscuro - Il Ritorno | Primo trailer italiano ufficiale",
      movie("Batman Begins"),
    ],
    ["I MOLTI SANTI DEL NEW JERSEY – Trailer Ufficiale Italiano", tv("I Soprano")],
    [
      "El Camino: Il film di Breaking Bad | Trailer ufficiale | Netflix Italia",
      tv("Breaking Bad"),
    ],
    [
      "Peaky Blinders: The Immortal Man | Trailer ufficiale | Netflix Italia",
      tv("Peaky Blinders"),
    ],
    [
      "Madagascar 3: Ricercati in Europa - Trailer italiano ufficiale",
      movie("Madagascar"),
    ],
    [
      "Chernobyl | 40 anni dalla catastrofe del 26 aprile 1986 | Trailer Ufficiale | Sky Italia",
      tv("Chernobyl"),
    ],
    ["Super Market | Trailer Ufficiale | Prime Video", tv("Superstore")],
  ];
  it.each(cases)("scarta %s", (video, id) => {
    expect(videoMatchesTitle(video, id)).toBe(false);
  });
});

describe("videoMatchesTitle — accettazioni", () => {
  it("accetta il trailer del titolo, anche con edizione o maiuscole diverse", () => {
    expect(
      videoMatchesTitle(
        "Il Padrino 50° anniversario | Trailer | Eagle Pictures",
        movie("Il padrino"),
      ),
    ).toBe(true);
    expect(videoMatchesTitle("SILO — Trailer ufficiale | Apple TV+", tv("Silo"))).toBe(
      true,
    );
    expect(
      videoMatchesTitle("ONE PIECE | Trailer ufficiale | Netflix", tv("One Piece")),
    ).toBe(true);
  });

  it("accetta sul titolo originale quando il video non usa quello italiano", () => {
    expect(
      videoMatchesTitle(
        "Inception - Trailer ufficiale italiano",
        movie("Inception", "Inception"),
      ),
    ).toBe(true);
  });

  it("tiene il sottotitolo del titolo quando c'è da entrambe le parti", () => {
    expect(
      videoMatchesTitle(
        "Zathura - Un'avventura spaziale - Trailer italiano",
        movie("Zathura - Un'avventura spaziale"),
      ),
    ).toBe(true);
  });
});

describe("videoMatchesTitle — stagioni", () => {
  const video =
    "House Of The Dragon | Stagione 3 | Teaser Trailer Ufficiale | Sky Italia";
  it("accetta la stagione richiesta", () => {
    expect(videoMatchesTitle(video, tv("House of the Dragon", 3))).toBe(true);
  });
  it("scarta un'altra stagione", () => {
    expect(videoMatchesTitle(video, tv("House of the Dragon", 1))).toBe(false);
  });
  it("sulla scheda della serie un trailer di stagione va bene", () => {
    expect(videoMatchesTitle(video, tv("House of the Dragon"))).toBe(true);
  });
});

describe("videoContradictsTitle", () => {
  it("un nome generico non smentisce nulla", () => {
    expect(videoContradictsTitle("Trailer ufficiale", movie("Il robot selvaggio"))).toBe(
      false,
    );
  });
  it("un nome d'opera estraneo smentisce", () => {
    expect(videoContradictsTitle("Wicked | Trailer ufficiale", movie("Oceania"))).toBe(
      true,
    );
  });
  it("non smentisce una parte di saga dello stesso titolo", () => {
    expect(
      videoContradictsTitle("Dune | Trailer ufficiale", movie("Dune - Parte due")),
    ).toBe(false);
  });
});
