import { describe, expect, it } from "vitest";
import { azioniPer } from "./azioni";

describe("azioniPer", () => {
  it("mette per prime le piattaforme che si importano subito", () => {
    const { subito, attesa } = azioniPer(["disney-plus", "netflix"]);
    expect(subito.map((a) => a.key)).toEqual(["netflix"]);
    expect(attesa.map((a) => a.key)).toEqual(["disney-plus"]);
  });

  it("Netflix manda alla pagina della cronologia, non a un modulo", () => {
    const [netflix] = azioniPer(["netflix"]).subito;
    expect(netflix.href).toContain("netflix.com/viewingactivity");
    expect(netflix.esterno).toBe(true);
    expect(netflix.caricaSlug).toBe("netflix");
  });

  it("NOW non ha un portale: si chiede per email", () => {
    const [now] = azioniPer(["now"]).attesa;
    expect(now.href?.startsWith("mailto:privacy@sky.it")).toBe(true);
  });

  it("le piattaforme senza export non ricevono una card finta", () => {
    const { subito, attesa, senzaStrada } = azioniPer(["raiplay", "hbo-max"]);
    expect(subito).toEqual([]);
    expect(attesa).toEqual([]);
    expect(senzaStrada).toEqual(["RaiPlay", "HBO Max"]);
  });

  it("ignora le chiavi che non esistono", () => {
    expect(azioniPer(["pippo"])).toEqual({ subito: [], attesa: [], senzaStrada: [] });
  });
});
