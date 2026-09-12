import { describe, expect, it } from "vitest";
import { dichiarazioneValida, type Dichiarazione } from "../declared";

const BASE: Dichiarazione = {
  titleId: 603,
  mediaType: "movie",
  deliveredAt: "2026-09-12T20:00:00.000Z",
  lastPositionMs: null,
  lastSeenAt: null,
};

const fra = (min: number) =>
  new Date(Date.parse(BASE.deliveredAt) + min * 60_000).toISOString();

describe("quando un lancio da' ancora il nome a cio' che la TV riferisce", () => {
  it("la prima sessione dopo il lancio vale", () => {
    expect(dichiarazioneValida(BASE, 130_000, fra(3))).toBe(true);
  });

  it("lanci e vai a cena: dopo mezz'ora senza riprodurre nulla, cade", () => {
    expect(dichiarazioneValida(BASE, 130_000, fra(31))).toBe(false);
  });

  it("mentre guardi resta valida, un battito dopo l'altro", () => {
    const d = { ...BASE, lastPositionMs: 1_200_000, lastSeenAt: fra(20) };
    expect(dichiarazioneValida(d, 1_230_000, fra(20.5))).toBe(true);
  });

  it("ti alzi e torni dopo venti minuti: e' ancora quel film", () => {
    const d = { ...BASE, lastPositionMs: 1_200_000, lastSeenAt: fra(20) };
    expect(dichiarazioneValida(d, 1_260_000, fra(40))).toBe(true);
  });

  it("torni dopo un'ora: non sappiamo piu' cosa stai guardando", () => {
    const d = { ...BASE, lastPositionMs: 1_200_000, lastSeenAt: fra(20) };
    expect(dichiarazioneValida(d, 1_260_000, fra(85))).toBe(false);
  });

  it("un riavvolgimento resta legittimo", () => {
    // Dieci minuti indietro per rivedere una scena: succede.
    const d = { ...BASE, lastPositionMs: 1_800_000, lastSeenAt: fra(30) };
    expect(dichiarazioneValida(d, 1_200_000, fra(31))).toBe(true);
  });

  it("da un'ora a trenta secondi hai cambiato titolo", () => {
    const d = { ...BASE, lastPositionMs: 3_600_000, lastSeenAt: fra(60) };
    expect(dichiarazioneValida(d, 30_000, fra(61))).toBe(false);
  });

  it("ma ricominciare da capo un film appena iniziato non e' un cambio", () => {
    // Eravamo a 5 minuti: tornare a 30 secondi e' un riavvolgimento, non un
    // titolo nuovo. La regola guarda entrambi i lati, non solo la posizione nuova.
    const d = { ...BASE, lastPositionMs: 300_000, lastSeenAt: fra(5) };
    expect(dichiarazioneValida(d, 30_000, fra(6))).toBe(true);
  });
});
