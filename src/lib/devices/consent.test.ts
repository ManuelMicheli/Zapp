import { describe, expect, it } from "vitest";
import { parseCorpoConsenso } from "./consent";

const UUID = "3f2504e0-4f89-11d3-9a0c-0305e82c3301";

describe("parseCorpoConsenso", () => {
  it("accetta un corpo conforme", () => {
    expect(parseCorpoConsenso({ code: "012345", phone_device_id: UUID })).toEqual({
      code: "012345",
      phoneDeviceId: UUID,
    });
  });

  it("rifiuta un codice che non e' di sei cifre", () => {
    expect(parseCorpoConsenso({ code: "12345", phone_device_id: UUID })).toBeNull();
    expect(parseCorpoConsenso({ code: "abcdef", phone_device_id: UUID })).toBeNull();
  });

  it("rifiuta un device_id che non e' un uuid", () => {
    expect(parseCorpoConsenso({ code: "012345", phone_device_id: "no" })).toBeNull();
  });

  it("rifiuta quello che non e' un oggetto", () => {
    expect(parseCorpoConsenso(null)).toBeNull();
    expect(parseCorpoConsenso("012345")).toBeNull();
    expect(parseCorpoConsenso([])).toBeNull();
  });
});
