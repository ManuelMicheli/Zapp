import { zipSync, strToU8 } from "fflate";
import { describe, expect, it } from "vitest";
import { unzipSources } from "./archive";

describe("unzipSources", () => {
  it("estrae solo csv e json, scartando il resto", () => {
    const zip = zipSync({
      "letterboxd/watched.csv": strToU8("Name,Year\nDune,2021\n"),
      "letterboxd/profile.jpg": strToU8("non un csv"),
      "letterboxd/ratings.csv": strToU8("Name,Rating\nDune,4\n"),
    });
    const files = unzipSources(zip);
    expect(files.map((f) => f.name).sort()).toEqual(["ratings.csv", "watched.csv"]);
    expect(files.find((f) => f.name === "watched.csv")?.text).toContain("Dune");
  });

  it("si ferma quando il decompresso supera il tetto", () => {
    const zip = zipSync({ "grande.csv": strToU8("x".repeat(11 * 1024 * 1024)) });
    expect(() => unzipSources(zip)).toThrow(/troppo grande/i);
  });
});
