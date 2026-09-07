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
  it("YouTube in ogni lingua; Trailer prima dei Teaser, italiani prima, ufficiali prima", () => {
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
    expect(out.map((v) => v.key)).toEqual(["official", "fan", "en", "nolang", "teaser"]);
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

/** Opzioni della ricerca: chi deve essere il video, più eventuali extra. */
const of = (title: string, extra: Record<string, unknown> = {}) => ({
  identity: { title, mediaType: "movie" as const },
  ...extra,
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
      of("Dune - Parte Due"),
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
      of("Film"),
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
      of("Stranger Things"),
    );
    expect(out.map((r) => r.id)).toEqual(["it", "sub"]);
  });
  it("film: scarta video pubblicati oltre due anni prima dell'uscita", () => {
    const out = rankSearchResults(
      [
        item("old", "Dune | Trailer Ufficiale", WARNER.id, "2021-08-01"),
        item("ok", "Dune | Trailer Ufficiale", WARNER.id, "2023-12-01"),
      ],
      of("Dune", { releaseDate: "2024-02-28" }),
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
      { identity: { title: "Serie", mediaType: "tv" as const, season: 2 } },
    );
    expect(out.map((r) => r.id)).toEqual(["s2", "s2b"]);
  });
});

describe("isItalianForChannel con lingua audio YouTube", () => {
  it("canale globale: passa se YouTube dichiara l'audio italiano", () => {
    expect(isItalianForChannel(video({ iso_639_1: null }), NETFLIX, "it")).toBe(true);
    expect(isItalianForChannel(video({ iso_639_1: null }), NETFLIX, "it-IT")).toBe(true);
    expect(isItalianForChannel(video({ iso_639_1: null }), NETFLIX, "en")).toBe(false);
    expect(isItalianForChannel(video({ iso_639_1: null }), NETFLIX, null)).toBe(false);
  });
});

describe("rankSearchResults: lingua audio e live action", () => {
  it("canale globale: passa anche con audio italiano dichiarato da YouTube", () => {
    const out = rankSearchResults(
      [
        {
          ...item("audio-it", "One Piece | Official Trailer", NETFLIX.id),
          audioLanguage: "it",
        },
        {
          ...item("audio-en", "One Piece | Official Trailer", NETFLIX.id),
          audioLanguage: "en",
        },
        item("no-audio", "One Piece | Official Trailer", NETFLIX.id),
      ],
      of("One Piece"),
    );
    expect(out.map((r) => r.id)).toEqual(["audio-it"]);
  });
  it('"live action" resta un trailer, "live" da solo no', () => {
    expect(
      rankSearchResults(
        [item("la", "One Piece: Live Action | Trailer ufficiale")],
        of("One Piece: Live Action"),
      ).map((r) => r.id),
    ).toEqual(["la"]);
    expect(
      rankSearchResults(
        [item("la2", "Lilo & Stitch live-action | Trailer")],
        of("Lilo & Stitch live-action"),
      ).map((r) => r.id),
    ).toEqual(["la2"]);
    expect(
      rankSearchResults(
        [item("live", "Film | Trailer | Live dal red carpet")],
        of("Film"),
      ),
    ).toEqual([]);
  });
});

describe("rankTmdbCandidates con il ripiego inglese", () => {
  it("mette gli italiani prima, poi gli inglesi, poi i senza lingua", () => {
    const videos = {
      results: [
        video({ key: "en", iso_639_1: "en" }),
        video({ key: "no", iso_639_1: null }),
        video({ key: "it", iso_639_1: "it" }),
      ],
    };
    expect(rankTmdbCandidates(videos).map((v) => v.key)).toEqual(["it", "en", "no"]);
  });

  it("continua a scartare quel che non è YouTube", () => {
    const videos = { results: [video({ key: "v", site: "Vimeo", iso_639_1: "it" })] };
    expect(rankTmdbCandidates(videos)).toEqual([]);
  });
});

describe("rankSearchResults: la verifica del titolo", () => {
  it("scarta il trailer di un'altra opera dallo stesso canale ufficiale", () => {
    const out = rankSearchResults(
      [
        item(
          "elcamino",
          "El Camino: Il film di Breaking Bad | Trailer ufficiale",
          NETFLIX.id,
        ),
      ],
      { identity: { title: "Breaking Bad", mediaType: "tv" as const } },
    );
    expect(out).toEqual([]);
  });

  it("tiene il trailer del titolo", () => {
    const out = rankSearchResults(
      [item("ok", "Breaking Bad | Trailer ufficiale italiano", NETFLIX.id)],
      { identity: { title: "Breaking Bad", mediaType: "tv" as const } },
    );
    expect(out.map((r) => r.id)).toEqual(["ok"]);
  });
});
