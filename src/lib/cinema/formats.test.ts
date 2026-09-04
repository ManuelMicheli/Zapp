import { describe, expect, it } from "vitest";
import { formatLabel, normalizeFormat } from "./formats";

describe("formats", () => {
  it("normalizza le chiavi MovieGlu", () => {
    expect(normalizeFormat("Standard")).toBe("standard");
    expect(normalizeFormat("3D")).toBe("3d");
    expect(normalizeFormat("IMAX")).toBe("imax");
    expect(normalizeFormat("IMAX 3D")).toBe("imax3d");
    expect(normalizeFormat("4DX")).toBe("4dx");
  });

  it("etichetta solo i formati speciali", () => {
    expect(formatLabel("standard")).toBeNull();
    expect(formatLabel("3d")).toBe("3D");
    expect(formatLabel("imax")).toBe("IMAX");
    expect(formatLabel("imax3d")).toBe("IMAX 3D");
    expect(formatLabel("4dx")).toBe("4DX");
  });
});
