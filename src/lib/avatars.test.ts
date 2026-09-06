import { describe, expect, it } from "vitest";
import {
  avatarBackgroundCss,
  normalizeHexColor,
  parseAvatarBackground,
  parsePresetAvatar,
  presetAvatarId,
  presetAvatarUrl,
} from "./avatars";

describe("normalizeHexColor", () => {
  it("accetta #rrggbb, anche senza # e maiuscolo", () => {
    expect(normalizeHexColor("#1D4ED8")).toBe("#1d4ed8");
    expect(normalizeHexColor("1d4ed8")).toBe("#1d4ed8");
  });
  it("rifiuta forme corte, nomi e input vuoti", () => {
    expect(normalizeHexColor("#fff")).toBeNull();
    expect(normalizeHexColor("red")).toBeNull();
    expect(normalizeHexColor("")).toBeNull();
    expect(normalizeHexColor(null)).toBeNull();
  });
});

describe("parseAvatarBackground", () => {
  it("pieno senza `to`, sfumatura con `to`", () => {
    expect(parseAvatarBackground({ from: "#000000" })).toEqual({ from: "#000000" });
    expect(parseAvatarBackground({ from: "#000000", to: "" })).toEqual({
      from: "#000000",
    });
    expect(parseAvatarBackground({ from: "#ff0000", to: "#0000FF" })).toEqual({
      from: "#ff0000",
      to: "#0000ff",
    });
  });
  it("`to` non valido → null (non si scarta in silenzio)", () => {
    expect(parseAvatarBackground({ from: "#ff0000", to: "blu" })).toBeNull();
    expect(parseAvatarBackground({ from: "nero" })).toBeNull();
    expect(parseAvatarBackground("x")).toBeNull();
  });
});

describe("avatarBackgroundCss", () => {
  it("colore pieno o gradiente diagonale", () => {
    expect(avatarBackgroundCss({ from: "#000000" })).toBe("#000000");
    expect(avatarBackgroundCss({ from: "#ff0000", to: "#0000ff" })).toBe(
      "linear-gradient(135deg, #ff0000 0%, #0000ff 100%)",
    );
  });
});

describe("presetAvatarUrl / parsePresetAvatar", () => {
  it("andata e ritorno del colore pieno", () => {
    const url = presetAvatarUrl("batman", { from: "#1d4ed8" });
    expect(url).toBe("/avatars/batman.png?bg=1d4ed8");
    expect(parsePresetAvatar(url)).toEqual({ id: "batman", bg: { from: "#1d4ed8" } });
  });
  it("andata e ritorno della sfumatura", () => {
    const url = presetAvatarUrl("joker", { from: "#7c3aed", to: "#db2777" });
    expect(url).toBe("/avatars/joker.png?bg=7c3aed&bg2=db2777");
    expect(parsePresetAvatar(url)).toEqual({
      id: "joker",
      bg: { from: "#7c3aed", to: "#db2777" },
    });
  });
  it("URL legacy senza query → sfondo nero", () => {
    expect(parsePresetAvatar("/avatars/batman.png")).toEqual({
      id: "batman",
      bg: { from: "#000000" },
    });
  });
  it("query non valida → sfondo nero; id sconosciuto o foto → null", () => {
    expect(parsePresetAvatar("/avatars/batman.png?bg=zzz")?.bg).toEqual({
      from: "#000000",
    });
    expect(parsePresetAvatar("/avatars/hulk.png?bg=000000")).toBeNull();
    expect(
      parsePresetAvatar(
        "https://x.supabase.co/storage/v1/object/public/avatars/u/a.webp",
      ),
    ).toBeNull();
    expect(parsePresetAvatar(null)).toBeNull();
  });
  it("presetAvatarId ignora la query", () => {
    expect(presetAvatarId("/avatars/flash.png?bg=ff0000&bg2=0000ff")).toBe("flash");
  });
});
