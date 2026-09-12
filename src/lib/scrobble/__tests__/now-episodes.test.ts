import { describe, expect, it } from "vitest";
import { normalizzaNome, risolviEpisodioNow, type IndiceNow } from "../providers/now-episodes";

/** Un indice piccolo, scritto a mano: i test non devono leggere il file vero. */
const INDICE: IndiceNow = {
  "al britani": [{ s: 254701, n: 1, e: 1, d: 46 }],
  // Lo stesso nome due volte nella stessa serie, stagioni diverse.
  pilot: [
    { s: 100, n: 1, e: 1, d: 42 },
    { s: 100, n: 2, e: 1, d: 58 },
  ],
  // Lo stesso nome in due serie diverse, durate diverse.
  ritorno: [
    { s: 200, n: 1, e: 3, d: 30 },
    { s: 300, n: 4, e: 2, d: 55 },
  ],
  // Durata sconosciuta su TMDB.
  "senza durata": [{ s: 400, n: 1, e: 7, d: null }],
};

describe("nome di episodio -> serie (NOW)", () => {
  it("riconosce l'episodio misurato sulla Fire TV", () => {
    // 2.772.000 ms = 46,2 minuti; TMDB dice 46.
    expect(risolviEpisodioNow("Al Britani", 2_772_000, INDICE)).toEqual({
      titleId: 254701,
      season: 1,
      episode: 1,
    });
  });

  it("ignora accenti, maiuscole e punteggiatura", () => {
    expect(risolviEpisodioNow("al  britani!", 2_772_000, INDICE)?.titleId).toBe(254701);
    expect(normalizzaNome("È già Perché")).toBe("e gia perche");
  });

  it("senza durata accetta un nome che sta in un posto solo", () => {
    expect(risolviEpisodioNow("Al Britani", null, INDICE)).toEqual({
      titleId: 254701,
      season: 1,
      episode: 1,
    });
  });

  it("con la durata sceglie fra due episodi della stessa serie", () => {
    expect(risolviEpisodioNow("Pilot", 58 * 60_000, INDICE)).toEqual({
      titleId: 100,
      season: 2,
      episode: 1,
    });
  });

  it("senza durata NON sceglie fra due episodi: meglio niente di un episodio a caso", () => {
    expect(risolviEpisodioNow("Pilot", null, INDICE)).toBeNull();
  });

  it("con la durata distingue due serie diverse", () => {
    expect(risolviEpisodioNow("Ritorno", 55 * 60_000, INDICE)?.titleId).toBe(300);
    expect(risolviEpisodioNow("Ritorno", 30 * 60_000, INDICE)?.titleId).toBe(200);
  });

  it("una durata che non somiglia a nessuna non indovina", () => {
    expect(risolviEpisodioNow("Ritorno", 120 * 60_000, INDICE)).toBeNull();
  });

  it("la durata decide solo quando ci sono piu' candidati", () => {
    // Un nome che nel catalogo NOW sta in un posto solo lo identifica da se':
    // la durata non viene nemmeno guardata. Le durate di TMDB sono spesso
    // approssimate o assenti, e le sigle allungano lo stream — pretenderle
    // uguali costerebbe corrispondenze vere senza evitare nessun errore.
    expect(risolviEpisodioNow("Al Britani", 41 * 60_000, INDICE)?.titleId).toBe(254701);
    // Fra due candidati, invece, due minuti di scarto sono il massimo.
    expect(risolviEpisodioNow("Ritorno", 56 * 60_000, INDICE)?.titleId).toBe(300);
    expect(risolviEpisodioNow("Ritorno", 58 * 60_000, INDICE)).toBeNull();
  });

  it("un episodio la cui durata TMDB non conosce resta valido se il nome è unico", () => {
    expect(risolviEpisodioNow("Senza durata", 61 * 60_000, INDICE)?.episode).toBe(7);
  });

  it("un nome che non c'è non inventa niente", () => {
    expect(risolviEpisodioNow("Un titolo mai visto", 2_772_000, INDICE)).toBeNull();
    expect(risolviEpisodioNow("", 2_772_000, INDICE)).toBeNull();
  });
});
