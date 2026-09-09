import { describe, expect, it } from "vitest";
import { providerForPackage, SUPPORTED_PROVIDERS } from "@/lib/scrobble/platforms";

describe("providerForPackage", () => {
  it("mappa i package Netflix su 8", () => {
    expect(providerForPackage("com.netflix.ninja")).toBe(8);
    expect(providerForPackage("com.netflix.mediaclient")).toBe(8);
  });
  it("mappa Prime, Disney+ e NOW", () => {
    expect(providerForPackage("com.amazon.avod")).toBe(119);
    expect(providerForPackage("com.amazon.firebat")).toBe(119);
    expect(providerForPackage("com.disney.disneyplus")).toBe(337);
    expect(providerForPackage("com.nowtv.it")).toBe(39);
  });
  it("ignora package sconosciuti", () => {
    expect(providerForPackage("com.spotify.tv.android")).toBeNull();
    expect(providerForPackage("")).toBeNull();
  });
  it("espone i provider supportati", () => {
    expect([...SUPPORTED_PROVIDERS]).toEqual([8, 119, 337, 39]);
  });
});
