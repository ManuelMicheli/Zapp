import { describe, expect, it } from "vitest";
import { chartSeasonNumber, cleanChartTitle } from "./clean";

describe("cleanChartTitle", () => {
  it("tiene il nome della serie, non quello della stagione", () => {
    expect(cleanChartTitle("Outer Banks", "Outer Banks: Season 5")).toBe("Outer Banks");
  });

  it("toglie la coda di stagione finita nel titolo dello show", () => {
    expect(cleanChartTitle("Outer Banks: Season 5", "Outer Banks: Season 5")).toBe(
      "Outer Banks",
    );
    expect(cleanChartTitle("Squid Game: Part 2", "Squid Game: Part 2")).toBe(
      "Squid Game",
    );
    expect(cleanChartTitle("Kaos: Volume 2", "Kaos: Volume 2")).toBe("Kaos");
    expect(cleanChartTitle("Mare Fuori: Stagione 4", "Mare Fuori: Stagione 4")).toBe(
      "Mare Fuori",
    );
    expect(
      cleanChartTitle("Bridgerton: Limited Series", "Bridgerton: Limited Series"),
    ).toBe("Bridgerton");
  });

  it("su una riga film non tocca mai i due punti: sono parte del nome", () => {
    // `season_title` nullo = riga Films: "Kill Bill: Volume 1" è il titolo, non una parte
    expect(cleanChartTitle("Kill Bill: Volume 1", null)).toBe("Kill Bill: Volume 1");
    expect(cleanChartTitle("Blade Runner: 2049", null)).toBe("Blade Runner: 2049");
    expect(cleanChartTitle("Mission: Impossible", null)).toBe("Mission: Impossible");
  });

  it("non svuota mai il titolo", () => {
    expect(cleanChartTitle("Season 2", "Season 2")).toBe("Season 2");
  });

  it("toglie gli spazi di troppo", () => {
    expect(cleanChartTitle("  The Beekeeper  ", null)).toBe("The Beekeeper");
  });
});

describe("chartSeasonNumber", () => {
  it("legge il numero di stagione", () => {
    expect(chartSeasonNumber("Outer Banks: Season 5")).toBe(5);
    expect(chartSeasonNumber("Mare Fuori: Stagione 4")).toBe(4);
  });

  it("una miniserie non ha numero", () => {
    expect(chartSeasonNumber("I Will Find You: Limited Series")).toBeNull();
    expect(chartSeasonNumber(null)).toBeNull();
    expect(chartSeasonNumber("Outer Banks")).toBeNull();
  });
});
