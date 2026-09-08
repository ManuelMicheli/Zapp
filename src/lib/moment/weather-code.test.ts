import { describe, expect, it } from "vitest";
import { cella, meteoFromWmo } from "./weather-code";

describe("meteoFromWmo", () => {
  it("riconosce pioggia, neve e sereno dai codici WMO", () => {
    expect(meteoFromWmo(61, 15)).toBe("pioggia"); // pioggia debole
    expect(meteoFromWmo(80, 15)).toBe("pioggia"); // rovesci
    expect(meteoFromWmo(95, 15)).toBe("pioggia"); // temporale
    expect(meteoFromWmo(73, -1)).toBe("neve");
    expect(meteoFromWmo(0, 15)).toBe("sereno");
    expect(meteoFromWmo(45, 15)).toBe("sereno"); // nebbia
  });

  it("la pioggia batte il termometro", () => {
    // 3 °C con la pioggia è una giornata di pioggia, non una giornata fredda
    expect(meteoFromWmo(61, 3)).toBe("pioggia");
    expect(meteoFromWmo(71, 30)).toBe("neve");
  });

  it("la temperatura corregge solo il sereno", () => {
    expect(meteoFromWmo(1, 31)).toBe("caldo");
    expect(meteoFromWmo(1, 2)).toBe("freddo");
    expect(meteoFromWmo(1, null)).toBe("sereno");
  });

  it("un codice che non conosce non inventa un meteo", () => {
    expect(meteoFromWmo(120, 15)).toBeNull();
    expect(meteoFromWmo(Number.NaN, 15)).toBeNull();
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
