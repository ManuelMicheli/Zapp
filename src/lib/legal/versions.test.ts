import { describe, expect, it } from "vitest";
import { consensiMancanti, haConsenso, VERSIONI, type RigaConsenso } from "./versions";

const riga = (
  kind: RigaConsenso["kind"],
  version: string,
  revoked_at: string | null = null,
): RigaConsenso => ({ kind, version, granted_at: "2026-09-12T10:00:00Z", revoked_at });

describe("consensiMancanti", () => {
  it("senza righe mancano tutti e due gli obbligatori", () => {
    expect(consensiMancanti([])).toEqual(["terms", "privacy"]);
  });

  it("con entrambi gli obbligatori alla versione corrente non manca niente", () => {
    const righe = [riga("terms", VERSIONI.terms), riga("privacy", VERSIONI.privacy)];
    expect(consensiMancanti(righe)).toEqual([]);
  });

  it("una versione vecchia non vale: il testo accettato era un altro", () => {
    const righe = [riga("terms", "2020-01-01"), riga("privacy", VERSIONI.privacy)];
    expect(consensiMancanti(righe)).toEqual(["terms"]);
  });

  it("una riga revocata non vale", () => {
    const righe = [
      riga("terms", VERSIONI.terms, "2026-09-13T10:00:00Z"),
      riga("privacy", VERSIONI.privacy),
    ];
    expect(consensiMancanti(righe)).toEqual(["terms"]);
  });

  it("revocata e poi riconcessa vale: conta la riga attiva, non la storia", () => {
    const righe = [
      riga("terms", VERSIONI.terms, "2026-09-13T10:00:00Z"),
      riga("terms", VERSIONI.terms),
      riga("privacy", VERSIONI.privacy),
    ];
    expect(consensiMancanti(righe)).toEqual([]);
  });

  it("i facoltativi non entrano mai fra i mancanti", () => {
    const righe = [riga("terms", VERSIONI.terms), riga("privacy", VERSIONI.privacy)];
    expect(consensiMancanti(righe)).not.toContain("personalization");
    expect(consensiMancanti(righe)).not.toContain("scrobble");
  });
});

describe("haConsenso", () => {
  it("è falso per un facoltativo mai concesso", () => {
    expect(haConsenso([], "scrobble")).toBe(false);
  });

  it("è vero per un facoltativo attivo alla versione corrente", () => {
    expect(haConsenso([riga("scrobble", VERSIONI.scrobble)], "scrobble")).toBe(true);
  });

  it("è falso se la versione del facoltativo è vecchia", () => {
    expect(haConsenso([riga("scrobble", "0")], "scrobble")).toBe(false);
  });
});
