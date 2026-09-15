import { describe, expect, it } from "vitest";
import { stimaArrivo } from "./richieste";

describe("stimaArrivo", () => {
  it("sposta la data dei giorni tipici della piattaforma", () => {
    expect(stimaArrivo("2026-09-15", "apple-tv")).toBe("2026-09-22");
    expect(stimaArrivo("2026-09-15", "prime-video")).toBe("2026-09-20");
    expect(stimaArrivo("2026-09-15", "disney-plus")).toBe("2026-10-15");
  });

  it("attraversa il cambio di mese e di anno", () => {
    expect(stimaArrivo("2026-12-28", "apple-tv")).toBe("2027-01-04");
  });

  it("una piattaforma senza attesa nota vale trenta giorni", () => {
    expect(stimaArrivo("2026-09-15", "pippo")).toBe("2026-10-15");
  });
});
