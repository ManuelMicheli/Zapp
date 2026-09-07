import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { latestWeek, parseTudumRow, type TudumRow } from "./netflix-parse";

const fixture = readFileSync(
  fileURLToPath(new URL("./__fixtures__/tudum-countries.tsv", import.meta.url)),
  "utf8",
);

function rowsOf(text: string): TudumRow[] {
  return text
    .split("\n")
    .map((l) => parseTudumRow(l))
    .filter((r): r is TudumRow => r !== null);
}

describe("parseTudumRow", () => {
  it("legge una riga film", () => {
    const rows = rowsOf(fixture);
    expect(rows).toContainEqual({
      countryIso2: "IT",
      week: "2026-08-23",
      category: "Films",
      rank: 1,
      showTitle: "The Beekeeper",
      seasonTitle: null,
      weeksInTop10: 2,
    });
  });

  it("tiene il titolo di stagione quando c'è", () => {
    const rows = rowsOf(fixture);
    const outerBanks = rows.find((r) => r.showTitle === "Outer Banks");
    expect(outerBanks?.seasonTitle).toBe("Outer Banks: Season 5");
    expect(outerBanks?.category).toBe("TV");
  });

  it("tratta N/A come assenza di stagione", () => {
    const rows = rowsOf(fixture);
    expect(rows.find((r) => r.showTitle === "Facing El Chapo")?.seasonTitle).toBeNull();
  });

  it("salta l'intestazione e le righe rotte", () => {
    expect(parseTudumRow("country_name\tcountry_iso2\tweek")).toBeNull();
    expect(parseTudumRow("")).toBeNull();
    expect(parseTudumRow("Italy\tIT\t2026-08-23\tFilms")).toBeNull();
    expect(parseTudumRow("Italy\tIT\t2026-08-23\tPodcast\t1\tX\tN/A\t1")).toBeNull();
    expect(parseTudumRow("Italy\tIT\t2026-08-23\tFilms\tuno\tX\tN/A\t1")).toBeNull();
  });

  it("accetta le settimane cumulative mancanti", () => {
    const rows = rowsOf(fixture);
    expect(rows.find((r) => r.showTitle === "Senza settimane")?.weeksInTop10).toBeNull();
  });
});

describe("latestWeek", () => {
  it("prende la settimana più recente", () => {
    expect(latestWeek(rowsOf(fixture))).toBe("2026-08-23");
  });

  it("senza righe non inventa una data", () => {
    expect(latestWeek([])).toBeNull();
  });
});
