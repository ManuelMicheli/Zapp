import { describe, expect, it } from "vitest";
import { chunk, nascondiToken, parseTickets, tokensToDelete } from "./tickets";

describe("chunk", () => {
  it("elenco vuoto, nessun lotto", () => {
    expect(chunk([], 100)).toEqual([]);
  });

  it("multiplo esatto", () => {
    expect(chunk([1, 2, 3, 4], 2)).toEqual([
      [1, 2],
      [3, 4],
    ]);
  });

  it("con il resto", () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });

  it("lotto più grande dell'elenco", () => {
    expect(chunk([1, 2], 100)).toEqual([[1, 2]]);
  });
});

describe("parseTickets", () => {
  const inviati = [{ tokenId: "t1" }, { tokenId: "t2" }];

  it("risposta buona: un biglietto per token, nell'ordine dell'invio", () => {
    const risposta = {
      data: [
        { status: "ok", id: "BIG-1" },
        { status: "ok", id: "BIG-2" },
      ],
    };
    expect(parseTickets(risposta, inviati)).toEqual([
      { ticketId: "BIG-1", tokenId: "t1" },
      { ticketId: "BIG-2", tokenId: "t2" },
    ]);
  });

  it("errore in cima alla risposta: nessun biglietto", () => {
    const risposta = {
      errors: [{ code: "PUSH_TOO_MANY_NOTIFICATIONS", message: "troppi messaggi" }],
    };
    expect(parseTickets(risposta, inviati)).toEqual({ error: "troppi messaggi" });
  });

  it("un biglietto in errore porta il motivo e nessun id", () => {
    const risposta = {
      data: [
        { status: "ok", id: "BIG-1" },
        {
          status: "error",
          message: "«ExponentPushToken[x]» non è registrato",
          details: { error: "DeviceNotRegistered" },
        },
      ],
    };
    expect(parseTickets(risposta, inviati)).toEqual([
      { ticketId: "BIG-1", tokenId: "t1" },
      { ticketId: "", tokenId: "t2", errore: "DeviceNotRegistered" },
    ]);
  });

  it("un errore senza details resta un errore, col messaggio come motivo", () => {
    const risposta = { data: [{ status: "error", message: "boh" }] };
    expect(parseTickets(risposta, [{ tokenId: "t1" }])).toEqual([
      { ticketId: "", tokenId: "t1", errore: "boh" },
    ]);
  });

  it("risposta che non è un oggetto, o senza data", () => {
    expect(parseTickets(null, inviati)).toHaveProperty("error");
    expect(parseTickets("ops", inviati)).toHaveProperty("error");
    expect(parseTickets({ data: "no" }, inviati)).toHaveProperty("error");
  });

  it("lunghezza diversa dall'invio: non si indovina l'accoppiamento", () => {
    expect(
      parseTickets({ data: [{ status: "ok", id: "BIG-1" }] }, inviati),
    ).toHaveProperty("error");
  });

  it("il token non esce mai dai messaggi di errore", () => {
    // Risposta vera di Expo a un token inventato (prova del 2026-09-13).
    const risposta = {
      data: [
        {
          status: "error",
          message: '"ExponentPushToken[abc123]" is not a valid Expo push token',
        },
      ],
    };
    const esito = parseTickets(risposta, [{ tokenId: "t1" }]);
    expect(esito).toEqual([
      {
        ticketId: "",
        tokenId: "t1",
        errore: '"ExponentPushToken[…]" is not a valid Expo push token',
      },
    ]);
  });
});

describe("nascondiToken", () => {
  it("cancella il contenuto delle parentesi, in tutte e due le forme", () => {
    expect(nascondiToken("ExponentPushToken[xYz-1] e ExpoPushToken[QQ]")).toBe(
      "ExponentPushToken[…] e ExpoPushToken[…]",
    );
  });

  it("lascia stare un testo che non contiene token", () => {
    expect(nascondiToken("PUSH_TOO_MANY_NOTIFICATIONS")).toBe(
      "PUSH_TOO_MANY_NOTIFICATIONS",
    );
  });
});

describe("tokensToDelete", () => {
  it("solo le ricevute con DeviceNotRegistered", () => {
    const ricevute = {
      data: {
        "BIG-1": { status: "ok" },
        "BIG-2": { status: "error", details: { error: "MessageRateExceeded" } },
        "BIG-3": { status: "error", details: { error: "DeviceNotRegistered" } },
      },
    };
    expect(tokensToDelete(ricevute)).toEqual(["BIG-3"]);
  });

  it("nessuna ricevuta da buttare", () => {
    expect(tokensToDelete({ data: { "BIG-1": { status: "ok" } } })).toEqual([]);
  });

  it("input che non è un oggetto: elenco vuoto, mai un'eccezione", () => {
    expect(tokensToDelete(null)).toEqual([]);
    expect(tokensToDelete("ops")).toEqual([]);
    expect(tokensToDelete({ data: [] })).toEqual([]);
    expect(tokensToDelete({ data: { "BIG-1": null } })).toEqual([]);
  });
});
