import { describe, expect, it } from "vitest";
import type { TmdbVideo } from "@/lib/tmdb/types";
import { isItalianForChannel, rankSearchResults, rankTmdbCandidates } from "./rank";
import type { OfficialChannel } from "./channels";

const WARNER: OfficialChannel = {
  id: "UCIQ5iN8wzGkKyXJeX6eR50Q",
  handle: "warnerbrositalia",
  name: "Warner Bros. Italia",
  italian: true,
};
const NETFLIX: OfficialChannel = {
  id: "UCWOA1ZGywLbqmigxE4Qlvuw",
  handle: "Netflix",
  name: "Netflix",
  italian: false,
};

function video(over: Partial<TmdbVideo>): TmdbVideo {
  return {
    key: "k",
    iso_639_1: "it",
    site: "YouTube",
    type: "Trailer",
    official: true,
    name: "Trailer",
    ...over,
  };
}

describe("rankTmdbCandidates", () => {
  it("tiene solo YouTube in italiano o senza lingua; Trailer prima dei Teaser, ufficiali prima", () => {
    const out = rankTmdbCandidates({
      results: [
        video({ key: "en", iso_639_1: "en" }),
        video({ key: "vimeo", site: "Vimeo" }),
        video({ key: "teaser", type: "Teaser" }),
        video({ key: "fan", official: false }),
        video({ key: "clip", type: "Clip" }),
        video({ key: "nolang", iso_639_1: null }),
        video({ key: "official" }),
      ],
    });
    expect(out.map((v) => v.key)).toEqual(["official", "nolang", "fan", "teaser"]);
  });
  it("lista vuota senza video", () => {
    expect(rankTmdbCandidates(undefined)).toEqual([]);
  });
});

describe("isItalianForChannel", () => {
  it("canale italiano: basta che TMDB non dica un'altra lingua", () => {
    expect(isItalianForChannel(video({ iso_639_1: "it" }), WARNER)).toBe(true);
    expect(isItalianForChannel(video({ iso_639_1: null }), WARNER)).toBe(true);
    expect(isItalianForChannel(video({ iso_639_1: "en" }), WARNER)).toBe(false);
  });
  it("canale globale: serve la lingua italiana esplicita", () => {
    expect(isItalianForChannel(video({ iso_639_1: "it" }), NETFLIX)).toBe(true);
    expect(isItalianForChannel(video({ iso_639_1: null }), NETFLIX)).toBe(false);
  });
});

const item = (
  id: string,
  title: string,
  channelId = WARNER.id,
  publishedAt = "2024-01-10",
) => ({
  id,
  title,
  channelId,
  publishedAt,
});

describe("rankSearchResults", () => {
  it("scarta canali non ufficiali e video che non sono trailer/teaser", () => {
    const out = rankSearchResults(
      [
        item("a", "Dune - Parte Due | Clip ufficiale"),
        item("b", "Dune - Parte Due | Trailer Ufficiale", "UCfan"),
        item("c", "Dune - Parte Due | Featurette"),
        item("d", "Dune - Parte Due | Spot 30''"),
        item("e", "Dune - Parte Due | Trailer Ufficiale"),
        item("f", "Dune - Parte Due | Teaser Trailer"),
        item("g", "Dune - Parte Due | Intervista al cast"),
      ],
      {},
    );
    expect(out.map((r) => r.id)).toEqual(["e", "f"]);
  });
  it('"trailer ufficiale" > trailer > teaser, a parità ordine YouTube', () => {
    const out = rankSearchResults(
      [
        item("teaser", "Film | Teaser"),
        item("trailer2", "Film | Trailer 2"),
        item("official", "Film | Trailer Ufficiale"),
        item("trailer1", "Film | Trailer"),
      ],
      {},
    );
    expect(out.map((r) => r.id)).toEqual(["official", "trailer2", "trailer1", "teaser"]);
  });
  it("canale globale: accetta solo titoli che dichiarano l'italiano", () => {
    const out = rankSearchResults(
      [
        item("en", "Stranger Things | Official Trailer", NETFLIX.id),
        item("it", "Stranger Things | Trailer ufficiale italiano", NETFLIX.id),
        item("sub", "Stranger Things | Trailer (sub ita)", NETFLIX.id),
      ],
      {},
    );
    expect(out.map((r) => r.id)).toEqual(["it", "sub"]);
  });
  it("film: scarta video pubblicati oltre due anni prima dell'uscita", () => {
    const out = rankSearchResults(
      [
        item("old", "Dune | Trailer Ufficiale", WARNER.id, "2021-08-01"),
        item("ok", "Dune | Trailer Ufficiale", WARNER.id, "2023-12-01"),
      ],
      { releaseDate: "2024-02-28" },
    );
    expect(out.map((r) => r.id)).toEqual(["ok"]);
  });
  it("stagione: tiene solo i video che la nominano", () => {
    const out = rankSearchResults(
      [
        item("s1", "Serie | Stagione 1 | Trailer"),
        item("s2", "Serie | Trailer ufficiale stagione 2"),
        item("s2b", "Serie - Season 2 | Trailer"),
        item("gen", "Serie | Trailer ufficiale"),
      ],
      { season: 2 },
    );
    expect(out.map((r) => r.id)).toEqual(["s2", "s2b"]);
  });
});
