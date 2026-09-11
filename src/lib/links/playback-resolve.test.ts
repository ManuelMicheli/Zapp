import { beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const post = vi.hoisted(() => vi.fn());
vi.mock("./justwatch", () => ({ jwPost: post }));
import { resolvePlayback } from "./playback-resolve";

const title = {
  id: 66732,
  media_type: "tv" as const,
  title: "Stranger Things",
  original_title: null,
};
const offer = {
  package: { packageId: 8 },
  deeplinkURL: "https://www.netflix.com/watch/80077369",
};
const search = {
  data: {
    popularTitles: {
      edges: [
        {
          node: {
            content: { externalIds: { tmdbId: "66732" } },
            seasons: [{ id: "tss62569", content: { seasonNumber: 1 } }],
          },
        },
      ],
    },
  },
};
const season = {
  data: {
    node: {
      content: { seasonNumber: 1 },
      episodes: [
        {
          content: { episodeNumber: 1 },
          offers: [{ ...offer, deeplinkURL: "https://www.netflix.com/watch/80077368" }],
        },
        { content: { episodeNumber: 2 }, offers: [offer] },
      ],
    },
  },
};
beforeEach(() => post.mockReset());
it("risolve solo la serie TMDB, stagione ed episodio richiesti", async () => {
  post.mockResolvedValueOnce(search).mockResolvedValueOnce(season);
  expect(await resolvePlayback(title, 8, 1, 2)).toBe(
    "https://www.netflix.com/watch/80077369",
  );
  expect(post.mock.calls[1][1]).toEqual({ id: "tss62569" });
});
it("un omonimo TMDB diverso non viene aperto", async () => {
  post.mockResolvedValueOnce(search);
  expect(await resolvePlayback({ ...title, id: 99 }, 8, 1, 2)).toBeNull();
  expect(post).toHaveBeenCalledTimes(1);
});
it("non ripiega sul primo episodio quando quello richiesto manca", async () => {
  post.mockResolvedValueOnce(search).mockResolvedValueOnce(season);
  expect(await resolvePlayback(title, 8, 1, 9)).toBeNull();
});
it("scarta una stagione diversa restituita dalla sorgente", async () => {
  post
    .mockResolvedValueOnce(search)
    .mockResolvedValueOnce({
      data: { node: { ...season.data.node, content: { seasonNumber: 2 } } },
    });
  expect(await resolvePlayback(title, 8, 1, 2)).toBeNull();
});
it("non usa risposte GraphQL parziali in errore", async () => {
  post.mockResolvedValueOnce({ ...search, errors: [{ message: "timeout" }] });
  expect(await resolvePlayback(title, 8, 1, 2)).toBeNull();
});
it("senza episodio completo non effettua ricerche", async () => {
  expect(await resolvePlayback(title, 8, null, 2)).toBeNull();
  expect(post).not.toHaveBeenCalled();
});
it.each([337, 39])("consulta le offerte episodio per il provider %s", async (providerId) => {
  post.mockResolvedValueOnce(search).mockResolvedValueOnce(season);
  await resolvePlayback(title, providerId, 1, 2);
  expect(post).toHaveBeenCalledTimes(2);
});
