import { describe, expect, it } from "vitest";
import { azioniPer, cardsAttesa, type RichiestaStato } from "./azioni";

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

function richiesta(
  overrides: Partial<RichiestaStato> & { platformKey: string },
): RichiestaStato {
  return {
    requestedAt: "2026-09-15",
    expectedAt: "2026-09-22",
    state: "requested",
    ...overrides,
  };
}

describe("cardsAttesa", () => {
  it("una piattaforma senza richiesta resta 'da fare'", () => {
    const [card] = cardsAttesa(["disney-plus"], []);
    expect(card.stato).toBe("da-fare");
    expect(card.richiestaIl).toBeNull();
    expect(card.arrivoAtteso).toBeNull();
  });

  it("con una richiesta aperta diventa 'richiesta' e porta la data giusta", () => {
    const [card] = cardsAttesa(
      ["disney-plus"],
      [
        richiesta({
          platformKey: "disney-plus",
          requestedAt: "2026-09-15",
          expectedAt: "2026-10-15",
        }),
      ],
    );
    expect(card.stato).toBe("richiesta");
    expect(card.richiestaIl).toBe("2026-09-15");
    expect(card.arrivoAtteso).toBe("2026-10-15");
  });

  it("una importata finisce in fondo", () => {
    // Ordine naturale (per quanto ci mettono) di ["apple-tv", "disney-plus"] è
    // [apple-tv, disney-plus]: se apple-tv è importata deve scendere in fondo.
    const cards = cardsAttesa(
      ["apple-tv", "disney-plus"],
      [richiesta({ platformKey: "apple-tv", state: "imported" })],
    );
    expect(cards.map((c) => c.key)).toEqual(["disney-plus", "apple-tv"]);
    expect(cards[1].stato).toBe("importata");
  });

  it("l'ordine complessivo mette prima quelle che si fanno subito", () => {
    // Ordine naturale di ["now", "prime-video", "apple-tv"] è
    // [prime-video, apple-tv, now]: prime-video importata scivola in fondo,
    // le altre due (ancora da fare/in attesa) restano davanti.
    const cards = cardsAttesa(
      ["now", "prime-video", "apple-tv"],
      [richiesta({ platformKey: "prime-video", state: "imported" })],
    );
    expect(cards.map((c) => c.key)).toEqual(["apple-tv", "now", "prime-video"]);
    expect(cards.map((c) => c.stato)).toEqual(["da-fare", "da-fare", "importata"]);
  });

  it("una piattaforma non dichiarata non compare anche se ha una richiesta", () => {
    const cards = cardsAttesa(["disney-plus"], [richiesta({ platformKey: "now" })]);
    expect(cards.map((c) => c.key)).toEqual(["disney-plus"]);
  });

  it("due righe per la stessa piattaforma: vince quella 'requested'", () => {
    // L'indice unico vale solo sulle aperte: dopo una `dismissed` può nascere
    // una seconda riga 'requested' per la stessa piattaforma. Non deve
    // dipendere dall'ordine in cui arrivano le due righe.
    const vecchia = richiesta({
      platformKey: "disney-plus",
      state: "dismissed",
      expectedAt: "2026-09-20",
    });
    const nuova = richiesta({
      platformKey: "disney-plus",
      state: "requested",
      expectedAt: "2026-10-20",
    });

    const [primaVecchia] = cardsAttesa(["disney-plus"], [vecchia, nuova]);
    expect(primaVecchia.stato).toBe("richiesta");
    expect(primaVecchia.arrivoAtteso).toBe("2026-10-20");

    const [primaNuova] = cardsAttesa(["disney-plus"], [nuova, vecchia]);
    expect(primaNuova.stato).toBe("richiesta");
    expect(primaNuova.arrivoAtteso).toBe("2026-10-20");
  });
});
