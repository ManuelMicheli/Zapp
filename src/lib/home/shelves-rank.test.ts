import { describe, expect, it } from "vitest";
import {
  cleanShelf,
  daysSinceEpoch,
  pickBecauseSources,
  releaseLabel,
  rotatingGenreId,
  type ShelfItem,
  type WatchedLike,
} from "./shelves-rank";

function entry(
  id: number,
  media: "movie" | "tv",
  name: string | null = `Titolo ${id}`,
): WatchedLike {
  return { title_id: id, media_type: media, title: name ? { title: name } : null };
}

function item(id: number, media: "movie" | "tv" = "movie"): ShelfItem {
  return {
    id,
    mediaType: media,
    title: `T${id}`,
    posterPath: `/p${id}.jpg`,
    year: "2026",
  };
}

describe("pickBecauseSources", () => {
  const entries = [entry(1, "tv"), entry(2, "movie"), entry(3, "movie")];

  it("prende gli ultimi del tipo chiesto, dal più recente", () => {
    expect(pickBecauseSources(entries, "movie").map((s) => s.titleId)).toEqual([2, 3]);
    expect(pickBecauseSources(entries, "tv").map((s) => s.titleId)).toEqual([1]);
  });

  it("per 'Tutto' prende gli ultimi in assoluto", () => {
    expect(pickBecauseSources(entries, "all").map((s) => s.titleId)).toEqual([1, 2, 3]);
  });

  it("si ferma a cinque", () => {
    const many = Array.from({ length: 9 }, (_, i) => entry(i + 1, "movie"));
    expect(pickBecauseSources(many, "movie")).toHaveLength(5);
  });

  it("un titolo rivisto non torna due volte", () => {
    const out = pickBecauseSources([entry(4, "movie"), entry(4, "movie")], "movie");
    expect(out.map((s) => s.titleId)).toEqual([4]);
  });

  it("salta le righe senza titolo in cache", () => {
    expect(
      pickBecauseSources([entry(9, "movie", null), entry(2, "movie")], "movie").map(
        (s) => s.titleId,
      ),
    ).toEqual([2]);
  });

  it("senza entry del tipo torna una lista vuota", () => {
    expect(pickBecauseSources([entry(1, "tv")], "movie")).toEqual([]);
  });
});

describe("cleanShelf", () => {
  it("toglie doppioni e titoli già in libreria", () => {
    const out = cleanShelf([item(1), item(1), item(2), item(3)], new Set(["movie-2"]));
    expect(out.map((i) => i.id)).toEqual([1, 3]);
  });

  it("film e serie con lo stesso id non sono lo stesso titolo", () => {
    const out = cleanShelf([item(7, "movie"), item(7, "tv")]);
    expect(out).toHaveLength(2);
  });

  it("taglia a size", () => {
    expect(cleanShelf([item(1), item(2), item(3)], new Set(), 2)).toHaveLength(2);
  });
});

describe("rotatingGenreId", () => {
  it("ruota sui generi al passare dei giorni", () => {
    expect(rotatingGenreId([18, 35], 0)).toBe(18);
    expect(rotatingGenreId([18, 35], 1)).toBe(35);
    expect(rotatingGenreId([18, 35], 2)).toBe(18);
  });

  it("senza generi torna null", () => {
    expect(rotatingGenreId([], 3)).toBeNull();
  });

  it("è stabile dentro la stessa giornata", () => {
    const day = daysSinceEpoch(new Date("2026-09-07T23:00:00Z"));
    expect(daysSinceEpoch(new Date("2026-09-07T01:00:00Z"))).toBe(day);
  });
});

describe("releaseLabel", () => {
  const now = new Date("2026-09-07T12:00:00");

  it("nell'anno in corso non ripete l'anno", () => {
    expect(releaseLabel("2026-03-12", now)).toBe("12 marzo");
  });

  it("in un altro anno lo mostra", () => {
    expect(releaseLabel("2027-03-12", now)).toBe("12 marzo 2027");
  });

  it("data mancante o illeggibile torna null", () => {
    expect(releaseLabel(null, now)).toBeNull();
    expect(releaseLabel("boh", now)).toBeNull();
  });
});
