import { describe, expect, it } from "vitest";
import { slimRaw } from "./slim-raw";

describe("slimRaw", () => {
  it("butta le offerte, che sono gia' in title_providers", () => {
    const out = slimRaw({ id: 1, "watch/providers": { results: { IT: {} } } });
    expect(out["watch/providers"]).toBeUndefined();
    expect(out.id).toBe(1);
  });

  it("butta le immagini: la galleria non esiste piu'", () => {
    expect(slimRaw({ images: { backdrops: [{}] } }).images).toBeUndefined();
  });

  it("tiene i primi 30 del cast, nell'ordine di TMDB", () => {
    const cast = Array.from({ length: 60 }, (_, i) => ({ id: i, name: `A${i}` }));
    const out = slimRaw({ credits: { cast, crew: [] } }) as {
      credits: { cast: { name: string }[] };
    };
    expect(out.credits.cast).toHaveLength(30);
    expect(out.credits.cast[0].name).toBe("A0");
    expect(out.credits.cast[29].name).toBe("A29");
  });

  it("del crew tiene solo i mestieri che il codice legge", () => {
    const crew = [
      { job: "Director", name: "R" },
      { job: "Screenplay", name: "S" },
      { job: "Writer", name: "W" },
      { job: "Story", name: "T" },
      { job: "Novel", name: "N" },
      { job: "Best Boy", name: "X" },
      { job: "Executive Producer", name: "P" },
    ];
    const out = slimRaw({ credits: { cast: [], crew } }) as {
      credits: { crew: { name: string }[] };
    };
    expect(out.credits.crew.map((c) => c.name)).toEqual(["R", "S", "W", "T", "N"]);
  });

  it("tiene i primi 12 consigli e il resto della busta", () => {
    const results = Array.from({ length: 20 }, (_, i) => ({ id: i }));
    const out = slimRaw({ recommendations: { page: 1, results } }) as {
      recommendations: { page: number; results: unknown[] };
    };
    expect(out.recommendations.results).toHaveLength(12);
    expect(out.recommendations.page).toBe(1);
  });

  it("delle uscite e dei divieti tiene solo l'Italia", () => {
    const out = slimRaw({
      release_dates: { results: [{ iso_3166_1: "US" }, { iso_3166_1: "IT" }] },
      content_ratings: { results: [{ iso_3166_1: "FR" }, { iso_3166_1: "IT" }] },
    }) as {
      release_dates: { results: { iso_3166_1: string }[] };
      content_ratings: { results: { iso_3166_1: string }[] };
    };
    expect(out.release_dates.results).toEqual([{ iso_3166_1: "IT" }]);
    expect(out.content_ratings.results).toEqual([{ iso_3166_1: "IT" }]);
  });

  it("lascia intatto quello che non conosce", () => {
    // `seasons` in particolare: titles.seasons e' una colonna generata da
    // raw->'seasons' (migration 0010), toglierla romperebbe il progresso serie.
    const out = slimRaw({
      seasons: [{ season_number: 1 }],
      videos: { results: [1] },
      keywords: { keywords: [{ id: 9, name: "spazio" }] },
    });
    expect(out.seasons).toEqual([{ season_number: 1 }]);
    expect(out.videos).toEqual({ results: [1] });
    expect(out.keywords).toEqual({ keywords: [{ id: 9, name: "spazio" }] });
  });

  it("non altera l'oggetto ricevuto", () => {
    const dentro = { "watch/providers": {}, credits: { cast: [{ id: 1 }], crew: [] } };
    slimRaw(dentro);
    expect(dentro["watch/providers"]).toBeDefined();
  });

  it("regge un payload senza nessuna di quelle chiavi", () => {
    expect(slimRaw({ id: 7 })).toEqual({ id: 7 });
  });

  it("regge chiavi presenti ma di forma inattesa", () => {
    const out = slimRaw({
      credits: null,
      recommendations: "boh",
      release_dates: 42,
    });
    expect(out.credits).toBeNull();
    expect(out.recommendations).toBe("boh");
    expect(out.release_dates).toBe(42);
  });
});
