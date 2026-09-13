import { describe, expect, it } from "vitest";
import { parseBearer, parseDeviceId } from "./headers";

describe("parseBearer", () => {
  const TOKEN = "eyJhbGciOiJFUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjMifQ.c2lnbmF0dXJh";

  it("estrae il token dopo Bearer", () => {
    expect(parseBearer(`Bearer ${TOKEN}`)).toBe(TOKEN);
  });
  it("rifiuta schema diverso, vuoto o troppo corto", () => {
    expect(parseBearer("Basic abc")).toBeNull();
    expect(parseBearer(null)).toBeNull();
    expect(parseBearer("Bearer ")).toBeNull();
    expect(parseBearer("Bearer short")).toBeNull();
    expect(parseBearer("Bearer 0123456789012345678")).toBeNull();
  });
  it("tollera spazi attorno", () => {
    expect(parseBearer(`  Bearer   ${TOKEN}  `)).toBe(TOKEN);
  });
  it("rifiuta token di 19 caratteri", () => {
    const TOKEN_SHORT = "0123456789012345678";
    expect(TOKEN_SHORT.length).toBe(19);
    expect(parseBearer(`Bearer ${TOKEN_SHORT}`)).toBeNull();
  });
  it("accetta token di 20 caratteri", () => {
    const TOKEN_20 = "01234567890123456789";
    expect(TOKEN_20.length).toBe(20);
    expect(parseBearer(`Bearer ${TOKEN_20}`)).toBe(TOKEN_20);
  });
});

describe("parseDeviceId", () => {
  it("accetta un uuid", () => {
    const id = "3b241101-e2bb-4255-8caf-4136c566a962";
    expect(parseDeviceId(id)).toBe(id);
    expect(parseDeviceId(id.toUpperCase())).toBe(id);
  });
  it("rifiuta tutto il resto", () => {
    expect(parseDeviceId(null)).toBeNull();
    expect(parseDeviceId("")).toBeNull();
    expect(parseDeviceId("non-un-uuid")).toBeNull();
  });
});
