import { describe, expect, it } from "vitest";
import { parseEventsBody } from "./events";

const SESSIONE = "3f1a6b3e-2d0e-4a1b-9c5e-7c3a1b2d4e5f";

function corpo(events: unknown[], sessionId: string = SESSIONE) {
  return { sessionId, events };
}

const evento = {
  kind: "impression",
  titleId: 603,
  mediaType: "movie",
  surface: "home-top10",
  position: 3,
  at: "2026-09-07T12:00:00.000Z",
};

describe("parseEventsBody", () => {
  it("accetta un corpo valido", () => {
    const out = parseEventsBody(corpo([evento]));
    expect(out?.sessionId).toBe(SESSIONE);
    expect(out?.events).toHaveLength(1);
    expect(out?.events[0].titleId).toBe(603);
  });

  it("rifiuta un sessionId che non è un uuid", () => {
    expect(parseEventsBody(corpo([evento], "pippo"))).toBeNull();
  });

  it("rifiuta i tipi che scrive solo il server", () => {
    expect(parseEventsBody(corpo([{ ...evento, kind: "library_add" }]))).toBeNull();
    expect(parseEventsBody(corpo([{ ...evento, kind: "rate" }]))).toBeNull();
  });

  it("rifiuta una superficie inventata", () => {
    expect(parseEventsBody(corpo([{ ...evento, surface: "home-nuova" }]))).toBeNull();
  });

  it("rifiuta un lotto più lungo del massimo", () => {
    expect(parseEventsBody(corpo(Array(101).fill(evento)))).toBeNull();
  });

  it("rifiuta un corpo senza eventi", () => {
    expect(parseEventsBody(corpo([]))).toBeNull();
    expect(parseEventsBody({ sessionId: SESSIONE })).toBeNull();
    expect(parseEventsBody(null)).toBeNull();
    expect(parseEventsBody("stringa")).toBeNull();
  });

  it("accetta position nulla e la tiene nulla", () => {
    const out = parseEventsBody(corpo([{ ...evento, position: null }]));
    expect(out?.events[0].position).toBeNull();
  });

  it("rifiuta una data non valida", () => {
    expect(parseEventsBody(corpo([{ ...evento, at: "ieri" }]))).toBeNull();
  });

  it("rifiuta un id che non è un intero positivo", () => {
    expect(parseEventsBody(corpo([{ ...evento, titleId: 0 }]))).toBeNull();
    expect(parseEventsBody(corpo([{ ...evento, titleId: "603" }]))).toBeNull();
  });
});
