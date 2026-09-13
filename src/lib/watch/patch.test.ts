import { describe, expect, it } from "vitest";
import { entryPatch } from "./patch";

const NOW = "2026-09-13T10:00:00.000Z";
const STARTED = "2026-09-01T08:00:00.000Z";

describe("entryPatch", () => {
  describe("want", () => {
    it("senza entry precedente: started_at null, finished_at null", () => {
      expect(entryPatch("want", null, NOW)).toEqual({
        status: "want",
        started_at: null,
        finished_at: null,
        last_watched_at: NOW,
      });
    });

    it("con entry precedente: mantiene started_at", () => {
      expect(entryPatch("want", { started_at: STARTED }, NOW)).toEqual({
        status: "want",
        started_at: STARTED,
        finished_at: null,
        last_watched_at: NOW,
      });
    });
  });

  describe("watching", () => {
    it("senza entry precedente: started_at = now", () => {
      expect(entryPatch("watching", null, NOW)).toEqual({
        status: "watching",
        started_at: NOW,
        finished_at: null,
        last_watched_at: NOW,
      });
    });

    it("con entry precedente: mantiene started_at (riprendi, non ricomincia)", () => {
      expect(entryPatch("watching", { started_at: STARTED }, NOW)).toEqual({
        status: "watching",
        started_at: STARTED,
        finished_at: null,
        last_watched_at: NOW,
      });
    });
  });

  describe("watched", () => {
    it("senza entry precedente: started_at resta null, finished_at = now", () => {
      expect(entryPatch("watched", null, NOW)).toEqual({
        status: "watched",
        started_at: null,
        finished_at: NOW,
        last_watched_at: NOW,
      });
    });

    it("con entry precedente: mantiene started_at, finished_at = now", () => {
      expect(entryPatch("watched", { started_at: STARTED }, NOW)).toEqual({
        status: "watched",
        started_at: STARTED,
        finished_at: NOW,
        last_watched_at: NOW,
      });
    });
  });

  it("restituisce `now` tale e quale in last_watched_at, qualunque azione", () => {
    for (const action of ["want", "watching", "watched"] as const) {
      expect(entryPatch(action, null, NOW).last_watched_at).toBe(NOW);
    }
  });
});
