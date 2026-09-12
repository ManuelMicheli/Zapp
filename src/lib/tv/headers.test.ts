import { describe, expect, it } from "vitest";
import { parseBearer, parseDeviceId } from "./headers";

describe("parseBearer", () => {
  it("estrae il token dopo Bearer", () => {
    expect(parseBearer("Bearer abc.def.ghi")).toBe("abc.def.ghi");
  });
  it("rifiuta schema diverso, vuoto o troppo corto", () => {
    expect(parseBearer("Basic abc")).toBeNull();
    expect(parseBearer(null)).toBeNull();
    expect(parseBearer("Bearer ")).toBeNull();
    expect(parseBearer("Bearer short")).toBeNull();
  });
  it("tollera spazi attorno", () => {
    expect(parseBearer("  Bearer   abc.def.ghi  ")).toBe("abc.def.ghi");
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
