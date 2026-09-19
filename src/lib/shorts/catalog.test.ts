import { describe, expect, it } from "vitest";
import {
  SHORT_FILMS,
  SHORT_GENERI,
  cardDi,
  copertinaUrl,
  durataLabel,
  filtraShorts,
  linguaLabel,
  shortById,
  shortBySlug,
  shortsSimili,
  visualizzazioniLabel,
} from "./catalog";

describe("il file del catalogo", () => {
  it("non ha slug né id ripetuti: sono le due chiavi della sezione", () => {
    expect(SHORT_FILMS.length).toBeGreaterThan(300);
    expect(new Set(SHORT_FILMS.map((c) => c.slug)).size).toBe(SHORT_FILMS.length);
    expect(new Set(SHORT_FILMS.map((c) => c.youtubeId)).size).toBe(SHORT_FILMS.length);
  });

  it("ha id YouTube della forma giusta: sono la chiave in short_film_entries", () => {
    // Stesso `check` della migration 0064: se qui passasse qualcosa di diverso, il
    // database rifiuterebbe la riga davanti all'utente invece che qui.
    for (const corto of SHORT_FILMS) {
      expect(corto.youtubeId).toMatch(/^[A-Za-z0-9_-]{11}$/);
    }
  });

  it("ha titolo, trama, genere e durata per ognuno", () => {
    for (const corto of SHORT_FILMS) {
      expect(corto.titolo.trim()).not.toBe("");
      expect(corto.trama.trim().length).toBeGreaterThan(30);
      expect(SHORT_GENERI).toContain(corto.genere);
      expect(corto.durata).toBeGreaterThan(60);
      expect(corto.anno).toBeGreaterThan(1900);
    }
  });

  it("ha una quota italiana vera: la classifica pura ne avrebbe quattro in cima", () => {
    expect(SHORT_FILMS.filter((c) => c.lingua === "it").length).toBeGreaterThanOrEqual(
      30,
    );
  });

  it("è ordinato per fama dentro ciascuna delle due lingue", () => {
    for (const lingua of ["en", "it"] as const) {
      const viste = SHORT_FILMS.filter((c) => c.lingua === lingua).map(
        (c) => c.visualizzazioni,
      );
      expect([...viste].sort((a, b) => b - a)).toEqual(viste);
    }
  });
});

describe("cardDi", () => {
  it("toglie i campi che il client non deve ricevere", () => {
    // La griglia filtra nel browser: se la card portasse la trama, il payload della
    // pagina conterrebbe **tutte** le trame del catalogo per mostrarne una sola.
    const card = cardDi(SHORT_FILMS[0]) as Record<string, unknown>;
    for (const campo of ["trama", "canale", "canaleId", "visualizzazioni"]) {
      expect(card).not.toHaveProperty(campo);
    }
    expect(card.slug).toBe(SHORT_FILMS[0].slug);
    expect(card.youtubeId).toBe(SHORT_FILMS[0].youtubeId);
  });
});

describe("shortBySlug / shortById", () => {
  it("trovano lo stesso corto dalle due chiavi", () => {
    const primo = SHORT_FILMS[0];
    expect(shortBySlug(primo.slug)).toBe(primo);
    expect(shortById(primo.youtubeId)).toBe(primo);
  });

  it("tornano null per una chiave che non c'è", () => {
    expect(shortBySlug("questo-non-esiste")).toBeNull();
    expect(shortById("xxxxxxxxxxx")).toBeNull();
  });
});

describe("filtraShorts", () => {
  it("senza filtri torna tutto", () => {
    expect(filtraShorts(SHORT_FILMS, {})).toHaveLength(SHORT_FILMS.length);
  });

  it("filtra per genere", () => {
    const horror = filtraShorts(SHORT_FILMS, { genere: "Horror" });
    expect(horror.length).toBeGreaterThan(0);
    expect(horror.every((c) => c.genere === "Horror")).toBe(true);
  });

  it("tiene i corti senza dialoghi fuori dalle due lingue", () => {
    // Un corto muto non è "in inglese" perché il cartello finale è in inglese:
    // metterlo lì direbbe all'utente una cosa falsa.
    const muti = filtraShorts(SHORT_FILMS, { lingua: "muto" });
    expect(muti.length).toBeGreaterThan(0);
    expect(muti.every((c) => c.senzaDialoghi)).toBe(true);
    for (const lingua of ["it", "en"]) {
      expect(filtraShorts(SHORT_FILMS, { lingua }).some((c) => c.senzaDialoghi)).toBe(
        false,
      );
    }
  });

  it("incrocia lingua e genere", () => {
    const italiani = filtraShorts(SHORT_FILMS, { lingua: "it", genere: "Dramma" });
    expect(italiani.every((c) => c.lingua === "it" && c.genere === "Dramma")).toBe(true);
  });
});

describe("shortsSimili", () => {
  it("non propone il corto stesso e parte dal suo genere", () => {
    const corto = SHORT_FILMS[0];
    const simili = shortsSimili(corto, 5);
    expect(simili).toHaveLength(5);
    expect(simili.some((c) => c.slug === corto.slug)).toBe(false);
    expect(simili[0].genere).toBe(corto.genere);
  });
});

describe("le etichette", () => {
  it("arrotondano la durata ai minuti", () => {
    expect(durataLabel(245)).toBe("4 min");
    expect(durataLabel(1463)).toBe("24 min");
    // Mai "0 min": sotto il minuto resta 1.
    expect(durataLabel(20)).toBe("1 min");
  });

  it("accorciano le visualizzazioni con la virgola italiana", () => {
    expect(visualizzazioniLabel(555_847_251)).toBe("556 mln");
    expect(visualizzazioniLabel(5_558_564)).toBe("5,6 mln");
    expect(visualizzazioniLabel(212_477)).toBe("212 mila");
    expect(visualizzazioniLabel(840)).toBe("840");
  });

  it("dicono «Senza dialoghi» prima della lingua", () => {
    const muto = SHORT_FILMS.find((c) => c.senzaDialoghi)!;
    expect(linguaLabel(muto)).toBe("Senza dialoghi");
    const italiano = SHORT_FILMS.find((c) => c.lingua === "it" && !c.senzaDialoghi)!;
    expect(linguaLabel(italiano)).toBe("Italiano");
  });

  it("scelgono la copertina che esiste davvero", () => {
    const hd = SHORT_FILMS.find((c) => c.copertinaHd)!;
    const sd = SHORT_FILMS.find((c) => !c.copertinaHd)!;
    expect(copertinaUrl(hd)).toBe(
      `https://i.ytimg.com/vi/${hd.youtubeId}/maxresdefault.jpg`,
    );
    expect(copertinaUrl(sd)).toBe(`https://i.ytimg.com/vi/${sd.youtubeId}/hqdefault.jpg`);
  });
});
