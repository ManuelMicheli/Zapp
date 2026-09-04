import { describe, expect, it } from "vitest";
import { chainFor, googleTicketsUrl } from "./chains";

describe("chains", () => {
  it("riconosce le catene dal nome del cinema", () => {
    expect(chainFor("UCI Cinemas Bicocca")?.name).toBe("UCI Cinemas");
    expect(chainFor("The Space Cinema Odeon")?.name).toBe("The Space Cinema");
    expect(chainFor("Notorious Cinemas Sesto")?.name).toBe("Notorious Cinemas");
    expect(chainFor("Cinelandia Arosio")?.name).toBe("Cinelandia");
    expect(chainFor("Anteo Palazzo del Cinema")).toBeNull();
  });

  it("costruisce la ricerca Google dei biglietti", () => {
    expect(googleTicketsUrl("Anteo Palazzo del Cinema", "Dune: Parte Due")).toBe(
      "https://www.google.com/search?q=Anteo%20Palazzo%20del%20Cinema%20Dune%3A%20Parte%20Due%20biglietti",
    );
  });
});
