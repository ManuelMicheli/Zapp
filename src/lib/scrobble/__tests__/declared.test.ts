import { describe, expect, it } from "vitest";
import { dichiarazioneValida, FINESTRA_MS } from "../declared";

const base = {
  titleId: 1,
  mediaType: "movie" as const,
  deliveredAt: "2026-09-13T20:00:00.000Z",
  lastPositionMs: null,
  lastSeenAt: null,
};
const t = (min: number) =>
  new Date(Date.parse(base.deliveredAt) + min * 60_000).toISOString();

describe("dichiarazioneValida", () => {
  it("vale nella finestra dopo la consegna", () => {
    expect(dichiarazioneValida(base, 0, t(1))).toBe(true);
    expect(dichiarazioneValida(base, 0, t(29))).toBe(true);
    expect(dichiarazioneValida(base, 0, t(31))).toBe(false);
  });
  it("ogni evento attribuito la tiene in vita", () => {
    const viva = { ...base, lastPositionMs: 1_800_000, lastSeenAt: t(29) };
    expect(dichiarazioneValida(viva, 1_830_000, t(58))).toBe(true);
    expect(dichiarazioneValida(viva, 1_830_000, t(60))).toBe(false);
  });
  it("una posizione che riparte da zero e' un altro titolo", () => {
    const viva = { ...base, lastPositionMs: 1_800_000, lastSeenAt: t(10) };
    expect(dichiarazioneValida(viva, 0, t(11))).toBe(false);
    // ma un riavvolgimento di poco resta lo stesso titolo
    expect(dichiarazioneValida(viva, 1_500_000, t(11))).toBe(true);
  });
  it("la finestra e' di trenta minuti", () => {
    expect(FINESTRA_MS).toBe(30 * 60 * 1000);
  });
});
