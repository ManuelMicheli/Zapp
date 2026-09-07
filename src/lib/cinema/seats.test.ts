import { describe, expect, it } from "vitest";
import { cleanSeatInput, parseHall, parseSeats } from "./seats";

describe("parseSeats", () => {
  it("legge la coppia fila/posto scritta per esteso", () => {
    expect(parseSeats("Sala 5 Fila G Posto 12 Ingresso ore 21:00")).toEqual({
      seats: ["Fila G · Posto 12"],
      hall: "Sala 5",
    });
  });

  it("regge i due punti, i trattini e le maiuscole", () => {
    expect(parseSeats("SALA: 3\nFILA: G - POSTO: 12").seats).toEqual([
      "Fila G · Posto 12",
    ]);
  });

  it("prende più biglietti dallo stesso PDF, senza doppioni", () => {
    const text = "Fila G Posto 12 ... Fila G Posto 13 ... Fila G Posto 12";
    expect(parseSeats(text).seats).toEqual(["Fila G · Posto 12", "Fila G · Posto 13"]);
  });

  it("ripiega sul solo posto quando la fila non c'è", () => {
    expect(parseSeats("Posti: G12, G13").seats).toEqual(["Posto G12", "Posto G13"]);
    expect(parseSeats("Poltrona F7").seats).toEqual(["Posto F7"]);
  });

  it("senza posti riconoscibili non inventa niente", () => {
    expect(parseSeats("Biglietto valido solo per lo spettacolo indicato")).toEqual({
      seats: [],
      hall: null,
    });
    expect(parseSeats(null).seats).toEqual([]);
  });
});

describe("parseHall", () => {
  it("legge il nome della sala", () => {
    expect(parseHall("Sala Rossa")).toBe("Sala Rossa");
    expect(parseHall("sala 3 - IMAX")).toBe("Sala 3");
  });

  it("non scambia per sala le parole di contorno", () => {
    expect(parseHall("sala di proiezione n. 2")).toBe(null);
    expect(parseHall("Nessuna indicazione")).toBe(null);
  });

  it("salta la parola ripetuta dei biglietti Notorious", () => {
    expect(parseHall("Sala: SALA 1, Settore: PLATEA")).toBe("Sala 1");
  });
});

describe("biglietto Notorious vero", () => {
  // testo estratto dal PDF ticket@home (una pagina per posto)
  const TEXT =
    "P: 2 / 3 O: NM32657668 UN FILM MINECRAFT Data: 03/04/2025 - 21:45 " +
    "Sala: SALA 1, Settore: PLATEA, Fila: E, Posto: 13 Biglietto: INTERO";

  it("legge sala e posto", () => {
    expect(parseSeats(TEXT)).toEqual({ seats: ["Fila E · Posto 13"], hall: "Sala 1" });
  });
});

describe("cleanSeatInput", () => {
  it("spezza quello che scrive l'utente e toglie i doppioni", () => {
    expect(cleanSeatInput("G12, G13\nG12")).toEqual(["G12", "G13"]);
    expect(cleanSeatInput("  ")).toEqual([]);
  });
});
