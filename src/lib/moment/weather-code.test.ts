import { describe, expect, it } from "vitest";
import { cella, etichettaMeteo, meteoDa, type Osservazione } from "./weather-code";

const o = (p: Partial<Osservazione>): Osservazione => ({
  code: 0,
  temperatura: 18,
  precipitazione: 0,
  nuvole: 10,
  ...p,
});

describe("meteoDa", () => {
  it("piove solo se sta davvero cadendo qualcosa", () => {
    expect(meteoDa(o({ code: 61, precipitazione: 0.4 }))).toBe("pioggia");
    expect(meteoDa(o({ code: 95, precipitazione: 2 }))).toBe("pioggia");
    expect(meteoDa(o({ code: 73, precipitazione: 0.6, temperatura: -1 }))).toBe("neve");
  });

  it("il caso di Ossona: codice 'rovesci' con zero millimetri e trenta gradi", () => {
    // 2026-09-08, weather_code 80 e precipitation 0.0: la fila diceva "piove" mentre
    // fuori c'era il sole. Adesso comanda la misura.
    expect(meteoDa(o({ code: 80, temperatura: 30.8, precipitazione: 0 }))).toBe("caldo");
    expect(etichettaMeteo(o({ code: 80, temperatura: 30.8, precipitazione: 0 }))).toBe(
      "31° e sereno",
    );
  });

  it("senza pioggia decide il termometro", () => {
    expect(meteoDa(o({ temperatura: 31 }))).toBe("caldo");
    expect(meteoDa(o({ temperatura: 2 }))).toBe("freddo");
    expect(meteoDa(o({ temperatura: 18 }))).toBe("sereno");
    expect(meteoDa(o({ temperatura: null }))).toBe("sereno");
  });

  it("la pioggia batte il termometro, ma solo quando cade davvero", () => {
    expect(meteoDa(o({ code: 61, temperatura: 30, precipitazione: 1 }))).toBe("pioggia");
    expect(meteoDa(o({ code: 61, temperatura: 30, precipitazione: 0 }))).toBe("caldo");
  });

  it("un codice che non è un numero non inventa un meteo", () => {
    expect(meteoDa(o({ code: Number.NaN }))).toBeNull();
  });
});

describe("etichettaMeteo", () => {
  it("i gradi ci sono sempre, così l'incoerenza si vede", () => {
    expect(etichettaMeteo(o({ temperatura: 12.4, precipitazione: 0.8, code: 61 }))).toBe(
      "12° e piove",
    );
    expect(etichettaMeteo(o({ temperatura: -2, precipitazione: 1, code: 73 }))).toBe(
      "-2° e nevica",
    );
    expect(etichettaMeteo(o({ temperatura: 19, nuvole: 90 }))).toBe("19° e nuvoloso");
    expect(etichettaMeteo(o({ temperatura: 19, nuvole: 10 }))).toBe("19° e sereno");
  });

  it("senza temperatura non si racconta niente", () => {
    expect(etichettaMeteo(o({ temperatura: null }))).toBeNull();
  });
});

describe("cella", () => {
  it("arrotonda a 0,1 gradi, cioè a ~11 km", () => {
    expect(cella(45.4642)).toBe(45.5);
    expect(cella(9.19)).toBe(9.2);
    // due punti della stessa città cadono nella stessa cella: una chiamata sola
    expect(cella(45.47)).toBe(cella(45.462));
  });
});
