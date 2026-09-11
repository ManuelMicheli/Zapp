import { describe, expect, it } from "vitest";
import { parseMedia, stableKey } from "@/lib/scrobble/parse";

describe("parseMedia", () => {
  it("riconosce S4:E1 nel dettaglio", () => {
    const r = parseMedia("Stranger Things", "S4:E1 Il club Hellfire");
    expect(r.kind).toBe("tv");
    expect(r.title).toBe("Stranger Things");
    expect(r.season).toBe(4);
    expect(r.episode).toBe(1);
    expect(r.episodeName).toBe("Il club Hellfire");
  });

  it("riconosce le altre forme di stagione ed episodio", () => {
    expect(parseMedia("X", "S02E04")).toMatchObject({ season: 2, episode: 4 });
    expect(parseMedia("X", "S2 E4")).toMatchObject({ season: 2, episode: 4 });
    expect(parseMedia("X", "T2 E4")).toMatchObject({ season: 2, episode: 4 });
    expect(parseMedia("X", "2x04")).toMatchObject({ season: 2, episode: 4 });
    expect(parseMedia("X", "Stagione 2: Episodio 4")).toMatchObject({
      season: 2,
      episode: 4,
    });
    expect(parseMedia("X", "Season 2: Episode 4")).toMatchObject({
      season: 2,
      episode: 4,
    });
  });

  it("accetta un episodio senza stagione", () => {
    const r = parseMedia("Boris", "Episodio 7 - Il commissario");
    expect(r.kind).toBe("tv");
    expect(r.season).toBeNull();
    expect(r.episode).toBe(7);
    expect(r.episodeName).toBe("Il commissario");
  });

  it("senza dettaglio e' un film", () => {
    const r = parseMedia("Il caso Spotlight", null);
    expect(r.kind).toBe("movie");
    expect(r.title).toBe("Il caso Spotlight");
    expect(r.season).toBeNull();
    expect(r.episode).toBeNull();
  });

  it("un dettaglio senza numeri e' il nome dell'episodio", () => {
    const r = parseMedia("Black Mirror", "San Junipero");
    expect(r.kind).toBe("tv");
    expect(r.episodeName).toBe("San Junipero");
    expect(r.episode).toBeNull();
  });

  it("senza titolo e' unknown e non si manda niente", () => {
    expect(parseMedia(null, null).kind).toBe("unknown");
    expect(parseMedia("   ", null).kind).toBe("unknown");
  });

  it("toglie gli spazi e i separatori di troppo", () => {
    expect(parseMedia("  Dark  ", "S1:E2 — Bugie").episodeName).toBe("Bugie");
  });

  // Formati aggiuntivi gia' coperti dallo spike Android (2026-09-04), tenuti
  // perche' il nucleo delle regex e' condiviso e vale la pena non perderli.
  it("stagione ed episodio uniti da un trattino lungo nel dettaglio", () => {
    expect(parseMedia("The Boys", "2x04 - Lo stato delle cose")).toMatchObject({
      kind: "tv",
      season: 2,
      episode: 4,
    });
  });

  it("titolo con anno fra parentesi resta cosi' com'e' (nessuna estrazione qui)", () => {
    const r = parseMedia("Interstellar (2014)", null);
    expect(r.kind).toBe("movie");
    expect(r.title).toBe("Interstellar (2014)");
  });

  // Quirk del DOM di Netflix (fixture 2026-09-09): il residuo dopo aver tolto
  // l'h4 da `[data-uia="video-title"]` è "E23Episodio 23", senza spazio fra il
  // codice e il nome.
  it("riconosce l'episodio incollato al nome, senza spazio ('E23Episodio 23')", () => {
    const r = parseMedia("Hajime no Ippo: The Fighting!", "E23Episodio 23");
    expect(r.kind).toBe("tv");
    expect(r.season).toBeNull();
    expect(r.episode).toBe(23);
    expect(r.episodeName).toBe("Episodio 23");
  });

  // Stesso pannello di pausa di Netflix: il nome dell'episodio è fra virgolette.
  it("toglie le virgolette che avvolgono il nome dell'episodio", () => {
    const r = parseMedia("Hajime no Ippo: The Fighting!", 'S1:E23 "Episodio 23"');
    expect(r.season).toBe(1);
    expect(r.episode).toBe(23);
    expect(r.episodeName).toBe("Episodio 23");
  });
});

describe("stableKey", () => {
  it("e' stabile e distingue", () => {
    expect(stableKey(["netflix", "Dark", 1, 2])).toBe(
      stableKey(["netflix", "Dark", 1, 2]),
    );
    expect(stableKey(["netflix", "Dark", 1, 2])).not.toBe(
      stableKey(["netflix", "Dark", 1, 3]),
    );
  });

  it("chiavi uguali per lo stesso episodio, diverse per un altro", () => {
    const a = parseMedia("Dark", "S2:E4").key;
    const b = parseMedia("Dark", "S2:E4").key;
    const c = parseMedia("Dark", "S2:E5").key;
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });
});

it("riconosce il codice episodio anche senza nome dopo E5", () => {
  expect(parseMedia("Una miniserie", "E5", "tv")).toMatchObject({
    kind: "tv",
    episode: 5,
  });
});
