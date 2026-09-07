import { describe, expect, it } from "vitest";
import type { TmdbVideo, TmdbVideos } from "@/lib/tmdb/types";
import { computeTrailers, shouldSearch, type TrailerDeps } from "./compute";

const DAY = 24 * 60 * 60 * 1000;
/** Netflix Italia: `italian: true`. */
const NETFLIX_IT = "UCi_T2R1AzOCun4-PI4Or2ng";
/** Netflix globale: `italian: false`, la lingua va confermata. */
const NETFLIX = "UCWOA1ZGywLbqmigxE4Qlvuw";

const noDeps: TrailerDeps = {
  getVideoAuthor: async () => null,
  getVideoDetails: async () => new Map(),
  searchYouTube: async () => null,
};

const deps = (over: Partial<TrailerDeps>): TrailerDeps => ({ ...noDeps, ...over });

function tmdbVideos(list: Partial<TmdbVideo>[]): TmdbVideos {
  return {
    results: list.map((v) => ({
      key: "k",
      site: "YouTube",
      type: "Trailer",
      official: true,
      iso_639_1: null,
      name: "Trailer ufficiale",
      ...v,
    })),
  } as TmdbVideos;
}

const identity = { title: "Silo", mediaType: "tv" } as const;
const fresh = { name: "Silo", searchAt: null, searchTries: 0 };

/** Canale italiano su ogni chiave, col nome del video passato. */
function fromChannel(channelId: string, videoName: string, audio: string | null = null) {
  return deps({
    getVideoAuthor: async () => ({
      authorUrl: `https://www.youtube.com/channel/${channelId}`,
      authorName: undefined,
      title: videoName,
    }),
    getVideoDetails: async (ids) =>
      new Map(
        ids.map((id) => [id, { channelId, audioLanguage: audio, embeddable: true }]),
      ),
    searchYouTube: async () => [],
  });
}

describe("shouldSearch", () => {
  const now = Date.parse("2026-09-07T12:00:00Z");
  it("il primo tentativo si fa subito", () => {
    expect(shouldSearch({ searchAt: null, searchTries: 0, now })).toBe(true);
  });
  it("il secondo aspetta 7 giorni", () => {
    expect(
      shouldSearch({
        searchAt: new Date(now - 3 * DAY).toISOString(),
        searchTries: 1,
        now,
      }),
    ).toBe(false);
    expect(
      shouldSearch({
        searchAt: new Date(now - 8 * DAY).toISOString(),
        searchTries: 1,
        now,
      }),
    ).toBe(true);
  });
  it("il terzo aspetta 30 giorni", () => {
    expect(
      shouldSearch({
        searchAt: new Date(now - 10 * DAY).toISOString(),
        searchTries: 2,
        now,
      }),
    ).toBe(false);
    expect(
      shouldSearch({
        searchAt: new Date(now - 31 * DAY).toISOString(),
        searchTries: 2,
        now,
      }),
    ).toBe(true);
  });
  it("non c'è un quarto tentativo", () => {
    expect(
      shouldSearch({
        searchAt: new Date(now - 400 * DAY).toISOString(),
        searchTries: 3,
        now,
      }),
    ).toBe(false);
  });
});

describe("computeTrailers — la scala", () => {
  it("gradino 1: il trailer italiano di TMDB da canale ufficiale vince", async () => {
    const videos = tmdbVideos([
      { key: "IT", iso_639_1: "it" },
      { key: "EN", iso_639_1: "en" },
    ]);
    const result = await computeTrailers(
      { ...fresh, videos, identity },
      deps({
        getVideoAuthor: async () => ({
          authorUrl: "https://www.youtube.com/@netflixitalia",
          authorName: "Netflix Italia",
          title: "Silo | Trailer ufficiale",
        }),
        getVideoDetails: async (ids) =>
          new Map(
            ids.map((id) => [
              id,
              { channelId: NETFLIX_IT, audioLanguage: null, embeddable: true },
            ]),
          ),
        searchYouTube: async () => {
          throw new Error("non deve cercare");
        },
      }),
    );
    expect(result).toMatchObject({
      keys: ["IT"],
      lang: "it",
      source: "tmdb",
      searched: false,
    });
  });

  it("gradino 2: senza italiano su TMDB, la ricerca italiana batte l'inglese", async () => {
    const videos = tmdbVideos([{ key: "EN", iso_639_1: "en" }]);
    const result = await computeTrailers(
      { ...fresh, videos, identity },
      deps({
        getVideoAuthor: async () => ({
          authorUrl: "https://www.youtube.com/@Netflix",
          authorName: "Netflix",
          title: "Silo | Official Trailer",
        }),
        getVideoDetails: async (ids) =>
          new Map(
            ids.map((id) => [
              id,
              { channelId: NETFLIX, audioLanguage: "en", embeddable: true },
            ]),
          ),
        searchYouTube: async () => [
          {
            id: "TROVATO",
            title: "Silo | Trailer ufficiale | Netflix Italia",
            channelId: NETFLIX_IT,
            publishedAt: "2024-01-01T00:00:00Z",
          },
        ],
      }),
    );
    expect(result).toMatchObject({
      keys: ["TROVATO"],
      lang: "it",
      source: "youtube",
      searched: true,
    });
  });

  it("gradino 3: ricerca a vuoto, resta l'inglese etichettato", async () => {
    const videos = tmdbVideos([{ key: "EN", iso_639_1: "en" }]);
    const result = await computeTrailers(
      { ...fresh, videos, identity },
      fromChannel(NETFLIX, "Silo | Official Trailer", "en"),
    );
    expect(result).toMatchObject({
      keys: ["EN"],
      lang: "en",
      source: "tmdb",
      searched: true,
    });
  });

  it("la ricerca non parte se i tentativi sono finiti", async () => {
    const result = await computeTrailers(
      {
        ...fresh,
        searchTries: 3,
        searchAt: "2020-01-01T00:00:00Z",
        videos: tmdbVideos([]),
        identity,
      },
      deps({
        searchYouTube: async () => {
          throw new Error("non deve cercare");
        },
      }),
    );
    expect(result).toMatchObject({ keys: [], source: "none", searched: false });
  });

  it("scarta un video TMDB palesemente di un'altra opera", async () => {
    const videos = tmdbVideos([{ key: "X", iso_639_1: "it" }]);
    const result = await computeTrailers(
      {
        ...fresh,
        name: "Oceania",
        videos,
        identity: { title: "Oceania", mediaType: "movie" },
      },
      fromChannel(NETFLIX_IT, "Wicked | Trailer ufficiale"),
    );
    expect(result?.keys).not.toContain("X");
  });

  it("scarta un video che YouTube non lascia incorporare", async () => {
    const videos = tmdbVideos([{ key: "NOEMBED", iso_639_1: "it" }]);
    const result = await computeTrailers(
      { ...fresh, videos, identity },
      deps({
        getVideoAuthor: async () => ({
          authorUrl: "https://www.youtube.com/@netflixitalia",
          authorName: "Netflix Italia",
          title: "Silo | Trailer ufficiale",
        }),
        getVideoDetails: async (ids) =>
          new Map(
            ids.map((id) => [
              id,
              { channelId: NETFLIX_IT, audioLanguage: null, embeddable: false },
            ]),
          ),
        searchYouTube: async () => [],
      }),
    );
    expect(result).toMatchObject({ keys: [], source: "none" });
  });

  it("scarta un canale che non è in allowlist", async () => {
    const videos = tmdbVideos([{ key: "FAN", iso_639_1: "it" }]);
    const result = await computeTrailers(
      { ...fresh, videos, identity },
      deps({
        getVideoAuthor: async () => ({
          authorUrl: "https://www.youtube.com/@MrMovieItalia",
          authorName: "Mr. Movie Italia",
          title: "Silo | Trailer ITA",
        }),
        searchYouTube: async () => [],
      }),
    );
    expect(result).toMatchObject({ keys: [], source: "none" });
  });

  it("ricerca fallita per quota: null, il chiamante tiene la riga vecchia", async () => {
    const result = await computeTrailers(
      { ...fresh, videos: tmdbVideos([]), identity },
      deps({ searchYouTube: async () => null }),
    );
    expect(result).toBeNull();
  });

  it("quota finita ma un inglese in mano: si usa quello, senza contare il tentativo", async () => {
    const videos = tmdbVideos([{ key: "EN", iso_639_1: "en" }]);
    const result = await computeTrailers(
      { ...fresh, videos, identity },
      deps({
        getVideoAuthor: async () => ({
          authorUrl: "https://www.youtube.com/@Netflix",
          authorName: "Netflix",
          title: "Silo | Official Trailer",
        }),
        getVideoDetails: async (ids) =>
          new Map(
            ids.map((id) => [
              id,
              { channelId: NETFLIX, audioLanguage: "en", embeddable: true },
            ]),
          ),
        searchYouTube: async () => null,
      }),
    );
    expect(result).toMatchObject({ keys: ["EN"], lang: "en", searched: false });
  });
});
