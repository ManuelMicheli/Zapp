import { describe, expect, it } from "vitest";
import { buildPodium, cleanReason, topReason, REASON_MAX_LENGTH } from "./rank";

const titles = [
  {
    titleId: 1,
    mediaType: "movie" as const,
    title: "Arrival",
    posterPath: "/a.jpg",
    backdropPath: "/ab.jpg",
  },
  {
    titleId: 2,
    mediaType: "movie" as const,
    title: "Sin City",
    posterPath: "/s.jpg",
    backdropPath: null,
  },
  {
    titleId: 3,
    mediaType: "tv" as const,
    title: "Dark",
    posterPath: "/d.jpg",
    backdropPath: "/db.jpg",
  },
  {
    titleId: 4,
    mediaType: "tv" as const,
    title: "Fringe",
    posterPath: null,
    backdropPath: null,
  },
];

describe("buildPodium", () => {
  it("ordina per voti e numera le posizioni", () => {
    const podium = buildPodium(
      [
        { titleId: 2, mediaType: "movie", votes: 3, firstAt: "2026-09-07T10:00:00Z" },
        { titleId: 1, mediaType: "movie", votes: 9, firstAt: "2026-09-07T11:00:00Z" },
        { titleId: 3, mediaType: "tv", votes: 5, firstAt: "2026-09-07T09:00:00Z" },
      ],
      titles,
    );
    expect(podium.map((p) => [p.position, p.title, p.votes])).toEqual([
      [1, "Arrival", 9],
      [2, "Dark", 5],
      [3, "Sin City", 3],
    ]);
  });

  it("a parità di voti vince chi è stato scelto per primo", () => {
    const podium = buildPodium(
      [
        { titleId: 1, mediaType: "movie", votes: 4, firstAt: "2026-09-07T20:00:00Z" },
        { titleId: 3, mediaType: "tv", votes: 4, firstAt: "2026-09-07T08:00:00Z" },
      ],
      titles,
    );
    expect(podium.map((p) => p.title)).toEqual(["Dark", "Arrival"]);
  });

  it("non confonde un film e una serie con lo stesso id", () => {
    const podium = buildPodium(
      [
        { titleId: 1, mediaType: "movie", votes: 2, firstAt: "2026-09-07T08:00:00Z" },
        { titleId: 1, mediaType: "tv", votes: 7, firstAt: "2026-09-07T09:00:00Z" },
      ],
      [
        ...titles,
        {
          titleId: 1,
          mediaType: "tv" as const,
          title: "Arrival (serie)",
          posterPath: null,
          backdropPath: null,
        },
      ],
    );
    expect(podium.map((p) => p.title)).toEqual(["Arrival (serie)", "Arrival"]);
  });

  it("taglia a tre gradini e ne mostra meno se i titoli sono meno", () => {
    const counts = [1, 2, 3, 4].map((titleId, i) => ({
      titleId,
      mediaType: (titleId > 2 ? "tv" : "movie") as "movie" | "tv",
      votes: 10 - i,
      firstAt: "2026-09-07T08:00:00Z",
    }));
    expect(buildPodium(counts, titles)).toHaveLength(3);
    expect(buildPodium(counts.slice(0, 1), titles)).toHaveLength(1);
    expect(buildPodium([], titles)).toEqual([]);
  });

  it("scarta le righe di cui manca il titolo in cache", () => {
    const podium = buildPodium(
      [{ titleId: 99, mediaType: "movie", votes: 12, firstAt: "2026-09-07T08:00:00Z" }],
      titles,
    );
    expect(podium).toEqual([]);
  });
});

describe("topReason", () => {
  const answers = [
    {
      titleId: 1,
      mediaType: "movie" as const,
      reason: null,
      createdAt: "2026-09-07T07:00:00Z",
      authorName: "Ada",
      authorAvatar: null,
    },
    {
      titleId: 1,
      mediaType: "movie" as const,
      reason: "   ",
      createdAt: "2026-09-07T08:00:00Z",
      authorName: "Bea",
      authorAvatar: null,
    },
    {
      titleId: 1,
      mediaType: "movie" as const,
      reason: "Mi ha rotto il cuore",
      createdAt: "2026-09-07T09:00:00Z",
      authorName: "Cin",
      authorAvatar: "/avatars/01.png",
    },
    {
      titleId: 1,
      mediaType: "movie" as const,
      reason: "Anche a me",
      createdAt: "2026-09-07T10:00:00Z",
      authorName: "Dan",
      authorAvatar: null,
    },
    {
      titleId: 3,
      mediaType: "tv" as const,
      reason: "Altro titolo",
      createdAt: "2026-09-07T06:00:00Z",
      authorName: "Eva",
      authorAvatar: null,
    },
  ];

  it("prende il primo motivo scritto sul titolo vincitore", () => {
    expect(topReason(answers, { titleId: 1, mediaType: "movie" })?.authorName).toBe("Cin");
  });

  it("non c'è vincitore o non ci sono motivi: null", () => {
    expect(topReason(answers, undefined)).toBeNull();
    expect(topReason(answers, { titleId: 4, mediaType: "tv" })).toBeNull();
  });
});

describe("cleanReason", () => {
  it("toglie spazi e a capo di troppo", () => {
    expect(cleanReason("  ciao   \n  mondo ")).toBe("ciao mondo");
  });

  it("vuoto o non stringa: null", () => {
    expect(cleanReason("   ")).toBeNull();
    expect(cleanReason(undefined)).toBeNull();
    expect(cleanReason(42)).toBeNull();
  });

  it("taglia a 140 caratteri", () => {
    const long = "a".repeat(200);
    expect(cleanReason(long)).toHaveLength(REASON_MAX_LENGTH);
  });
});
