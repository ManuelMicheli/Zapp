import { describe, expect, it } from "vitest";
import {
  comuneLabel,
  findComune,
  normalizeComune,
  provinceSlugForSigla,
  searchComuni,
} from "./comuni";

describe("searchComuni", () => {
  it("trova il comune scritto per intero", () => {
    const [first] = searchComuni("ossona");
    expect(first).toMatchObject({ name: "Ossona", sigla: "MI" });
    expect(first.lat).toBeGreaterThan(45);
    expect(first.lng).toBeGreaterThan(8);
  });
  it("mette davanti chi comincia col testo scritto, dal più popoloso", () => {
    const names = searchComuni("mila").map((c) => c.name);
    expect(names[0]).toBe("Milano");
    // Milano (1,2 mln) prima di Milazzo (32.000)
    expect(names.indexOf("Milano")).toBeLessThan(names.indexOf("Milazzo"));
  });
  it("trova anche i nomi composti scritti a metà", () => {
    const names = searchComuni("borromeo").map((c) => c.name);
    expect(names).toContain("Peschiera Borromeo");
  });
  it("ignora accenti, apostrofi e maiuscole", () => {
    expect(searchComuni("SANT'ANGELO LODIGIANO")[0]).toMatchObject({
      name: "Sant'Angelo Lodigiano",
      sigla: "LO",
    });
    expect(searchComuni("forli")[0].name).toBe("Forlì");
  });
  it("con meno di due lettere non cerca", () => {
    expect(searchComuni("m")).toEqual([]);
    expect(searchComuni(" ")).toEqual([]);
  });
  it("torna al massimo `limit` risultati", () => {
    expect(searchComuni("san", 5)).toHaveLength(5);
  });
  it("nessun risultato per un nome inventato", () => {
    expect(searchComuni("pincopallino")).toEqual([]);
  });
});

describe("findComune", () => {
  it("distingue i comuni omonimi con la sigla", () => {
    const a = findComune("Peschiera Borromeo", "MI");
    expect(a?.sigla).toBe("MI");
    const b = findComune("Livo", "TN");
    const c = findComune("Livo", "CO");
    expect(b?.sigla).toBe("TN");
    expect(c?.sigla).toBe("CO");
    expect(b?.lat).not.toBe(c?.lat);
  });
  it("null se il comune non esiste", () => {
    expect(findComune("Pincopallino", "MI")).toBeNull();
  });
});

describe("provincia", () => {
  it("dà lo slug MyMovies dalla sigla", () => {
    expect(provinceSlugForSigla("MI")).toBe("milano");
    expect(provinceSlugForSigla("mb")).toBe("monzabrianza");
    expect(provinceSlugForSigla("FC")).toBe("forlicesena");
  });
  it("null dove MyMovies non ha la provincia (Sud Sardegna)", () => {
    expect(provinceSlugForSigla("SU")).toBeNull();
  });
  it("etichetta 'Nome, SIGLA'", () => {
    expect(comuneLabel(findComune("Ossona", "MI")!)).toBe("Ossona, MI");
  });
  it("normalizza i nomi", () => {
    expect(normalizeComune("Sant'Angelo Lodigiano")).toBe("sant angelo lodigiano");
  });
});
