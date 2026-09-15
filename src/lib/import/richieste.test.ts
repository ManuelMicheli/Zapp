import { describe, expect, it } from "vitest";
import { prossimoPromemoria, stimaArrivo, type RichiestaPromemoria } from "./richieste";

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

describe("prossimoPromemoria", () => {
  const APERTA: RichiestaPromemoria = {
    state: "requested",
    expectedAt: "2026-09-15",
    remindedAt: null,
    secondRemindedAt: null,
  };

  it("nessun promemoria prima della data attesa", () => {
    expect(
      prossimoPromemoria(APERTA, "2026-09-14", new Date("2026-09-14T00:00:00Z")),
    ).toBe(null);
  });

  it("il primo il giorno stesso dell'arrivo atteso, e anche dopo", () => {
    expect(
      prossimoPromemoria(APERTA, "2026-09-15", new Date("2026-09-15T00:00:00Z")),
    ).toBe("primo");
    expect(
      prossimoPromemoria(APERTA, "2026-09-20", new Date("2026-09-20T00:00:00Z")),
    ).toBe("primo");
  });

  it("niente secondo promemoria prima di sette giorni dal primo", () => {
    const doposemplice: RichiestaPromemoria = {
      ...APERTA,
      remindedAt: "2026-09-15T09:00:00.000Z",
    };
    expect(
      prossimoPromemoria(doposemplice, "2026-09-21", new Date("2026-09-21T09:00:00Z")),
    ).toBe(null);
  });

  it("il secondo esattamente sette giorni dopo il primo", () => {
    const dopoPrimo: RichiestaPromemoria = {
      ...APERTA,
      remindedAt: "2026-09-15T09:00:00.000Z",
    };
    expect(
      prossimoPromemoria(dopoPrimo, "2026-09-22", new Date("2026-09-22T09:00:00Z")),
    ).toBe("secondo");
  });

  it("mai un terzo: dopo il secondo la funzione resta zitta per sempre", () => {
    const dopoEntrambi: RichiestaPromemoria = {
      ...APERTA,
      remindedAt: "2026-09-15T09:00:00.000Z",
      secondRemindedAt: "2026-09-22T09:00:00.000Z",
    };
    expect(
      prossimoPromemoria(dopoEntrambi, "2026-10-15", new Date("2026-10-15T09:00:00Z")),
    ).toBe(null);
  });

  it("importata o abbandonata: mai un promemoria", () => {
    expect(
      prossimoPromemoria(
        { ...APERTA, state: "imported" },
        "2026-09-20",
        new Date("2026-09-20T00:00:00Z"),
      ),
    ).toBe(null);
    expect(
      prossimoPromemoria(
        { ...APERTA, state: "dismissed" },
        "2026-09-20",
        new Date("2026-09-20T00:00:00Z"),
      ),
    ).toBe(null);
  });
});
