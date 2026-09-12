import { describe, expect, it } from "vitest";
import {
  CODICE_TTL_MS,
  generaCodice,
  isCodiceValido,
  normalizzaCodice,
} from "../pairing";

describe("codice di abbinamento", () => {
  it("genera sempre sei cifre, anche con zeri davanti", () => {
    expect(generaCodice(() => 0)).toBe("000000");
    expect(generaCodice(() => 0.999999)).toHaveLength(6);
    expect(generaCodice(() => 0.5)).toMatch(/^[0-9]{6}$/);
  });

  it("accetta solo sei cifre", () => {
    expect(isCodiceValido("482913")).toBe(true);
    expect(isCodiceValido("48291")).toBe(false);
    expect(isCodiceValido("4829133")).toBe(false);
    expect(isCodiceValido("48a913")).toBe(false);
    expect(isCodiceValido(482913)).toBe(false);
    expect(isCodiceValido(null)).toBe(false);
  });

  it("normalizza quello che l'utente scrive davvero", () => {
    expect(normalizzaCodice(" 482 913 ")).toBe("482913");
    expect(normalizzaCodice("482-913")).toBe("482913");
  });

  it("il codice vive dieci minuti", () => {
    expect(CODICE_TTL_MS).toBe(10 * 60 * 1000);
  });
});
