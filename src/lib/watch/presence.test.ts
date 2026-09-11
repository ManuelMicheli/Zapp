import { describe, expect, it } from "vitest";
import { presenceState, visiblePresence } from "./presence";

const now = Date.parse("2026-09-10T12:00:00Z");
const sample = { state: "playing", at: "2026-09-10T11:59:30Z" };
describe("presenza realmente recente", () => {
  it("distingue riproduzione e pausa, senza usare lo stato della libreria", () => {
    expect(presenceState(sample, now)).toBe("playing");
    expect(presenceState({ ...sample, state: "paused" }, now)).toBe("paused");
    expect(presenceState({ ...sample, state: "stopped" }, now)).toBe(null);
  });
  it("spegne dati vecchi, non validi e provenienti dal futuro", () => {
    expect(presenceState(sample, now + 60_000)).toBe(null);
    expect(presenceState({ ...sample, at: "errore" }, now)).toBe(null);
    expect(presenceState(sample, now - 31_000)).toBe(null);
  });
  it("mantiene persone distinte sullo stesso titolo e sceglie l'ultima per utente", () => {
    const rows = [
      { ...sample, userId: "a", titleId: 1 },
      { ...sample, userId: "b", titleId: 1 },
      { ...sample, userId: "a", titleId: 2, at: "2026-09-10T11:59:45Z" },
    ];
    expect(visiblePresence(rows, now).map((s) => [s.userId, s.titleId])).toEqual([
      ["a", 2],
      ["b", 1],
    ]);
  });
  it("uno stop nuovo non fa riapparire la vecchia riproduzione", () => {
    expect(
      visiblePresence(
        [
          { ...sample, userId: "a" },
          { ...sample, userId: "a", state: "stopped", at: "2026-09-10T11:59:45Z" },
        ],
        now,
      ),
    ).toEqual([]);
  });
});
