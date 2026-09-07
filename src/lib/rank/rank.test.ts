import { describe, expect, it } from "vitest";
import { affinity, qualitaDi } from "./affinity";
import { diversify } from "./diversity";
import { explain, nomeGenere, variaMotivi } from "./explain";
import { consigliabile, nomeLeggibile } from "./filters";
import { appartiene, buildRails, type RailSpec } from "./rails";
import { MASSA_MINIMA, MASSA_PIENA, toTasteVector } from "./vector";
import type { Contributo, RankCandidate, RankedItem } from "./types";
import type { Tables } from "@/types/database";

function riga(patch: Partial<Tables<"user_taste">> = {}): Tables<"user_taste"> {
  return {
    user_id: "u",
    generi: {},
    decenni: {},
    provider: {},
    persone: {},
    tipo: {},
    runtime: {},
    lingua: {},
    novita: 0,
    massa: MASSA_PIENA,
    eventi_contati: 0,
    updated_at: "2026-09-07T00:00:00Z",
    ...patch,
  } as Tables<"user_taste">;
}

function candidato(patch: Partial<RankCandidate> = {}): RankCandidate {
  return {
    id: 1,
    mediaType: "movie",
    title: "Titolo",
    posterPath: "/p.jpg",
    year: "2020",
    genreIds: [28],
    runtime: 120,
    originalLanguage: "en",
    providerIds: [8],
    people: [],
    zappScore: 7,
    voteAverage: 7,
    voteCount: 500,
    ...patch,
  };
}

describe("toTasteVector", () => {
  it("normalizza sul massimo, non sulla somma", () => {
    const v = toTasteVector(riga({ generi: { "28": 0.4, "35": 0.2 } }));
    expect(v.generi.get("28")).toBeCloseTo(1, 5);
    expect(v.generi.get("35")).toBeCloseTo(0.5, 5);
  });

  it("i rifiuti restano negativi", () => {
    const v = toTasteVector(riga({ generi: { "28": 0.4, "27": -0.2 } }));
    expect(v.generi.get("27")).toBeCloseTo(-0.5, 5);
  });

  it("una riga assente dà un vettore vuoto e senza fiducia", () => {
    const v = toTasteVector(null);
    expect(v.generi.size).toBe(0);
    expect(v.fiducia).toBe(0);
    expect(v.abbastanza).toBe(false);
  });

  it("la fiducia sale con la massa e si ferma a 1", () => {
    expect(toTasteVector(riga({ massa: 0 })).fiducia).toBe(0);
    expect(toTasteVector(riga({ massa: MASSA_PIENA / 2 })).fiducia).toBeCloseTo(0.5, 5);
    expect(toTasteVector(riga({ massa: MASSA_PIENA * 10 })).fiducia).toBe(1);
  });

  it("la percentuale si mostra solo dalla massa minima in su", () => {
    expect(toTasteVector(riga({ massa: MASSA_MINIMA - 1 })).abbastanza).toBe(false);
    expect(toTasteVector(riga({ massa: MASSA_MINIMA })).abbastanza).toBe(true);
  });
});

describe("qualitaDi", () => {
  it("lo ZappScore è su 0-10, come il voto TMDB", () => {
    // title_ratings.zapp_score vale 9.2 per il titolo più alto del catalogo, non 92:
    // trattarlo come 0-100 divideva per dieci la qualità di ogni candidato preso dal
    // database, e la lista restava plausibile lo stesso. Questo test è lì per quello.
    expect(qualitaDi(candidato({ zappScore: 9, voteAverage: 5 }))).toBeCloseTo(0.9, 5);
    expect(qualitaDi(candidato({ zappScore: 10 }))).toBeCloseTo(1, 5);
  });

  it("ricade sul voto TMDB", () => {
    expect(qualitaDi(candidato({ zappScore: null, voteAverage: 8 }))).toBeCloseTo(0.8, 5);
  });

  it("senza voti resta neutra: né premiato né punito", () => {
    expect(qualitaDi(candidato({ zappScore: null, voteAverage: null }))).toBeCloseTo(
      0.6,
      5,
    );
  });
});

describe("affinity", () => {
  const profilo = toTasteVector(
    riga({ generi: { "28": 0.5, "27": -0.3 }, provider: { "8": 0.4 } }),
  );

  it("il gusto alto batte il gusto basso a parità di qualità", () => {
    const amato = affinity(profilo, candidato({ genreIds: [28] }));
    const odiato = affinity(profilo, candidato({ genreIds: [27] }));
    expect(amato.punteggio).toBeGreaterThan(odiato.punteggio);
  });

  it("a parità di gusto vince la qualità", () => {
    const alto = affinity(profilo, candidato({ zappScore: 9.2 }));
    const basso = affinity(profilo, candidato({ zappScore: 4 }));
    expect(alto.punteggio).toBeGreaterThan(basso.punteggio);
  });

  it("senza fiducia il gusto non sposta più niente", () => {
    const cieco = toTasteVector(riga({ generi: { "28": 0.5, "27": -0.3 }, massa: 0 }));
    const a = affinity(cieco, candidato({ genreIds: [28] }));
    const b = affinity(cieco, candidato({ genreIds: [27] }));
    expect(a.punteggio).toBeCloseTo(b.punteggio, 10);
  });

  it("una dimensione che il titolo non ha non lo punisce", () => {
    const conDurata = affinity(profilo, candidato({ runtime: 120 }));
    const senzaDurata = affinity(profilo, candidato({ runtime: null }));
    expect(senzaDurata.punteggio).toBeCloseTo(conDurata.punteggio, 10);
  });

  it("sotto la massa minima la percentuale non esiste, il punteggio sì", () => {
    const povero = toTasteVector(riga({ generi: { "28": 0.5 }, massa: 5 }));
    const a = affinity(povero, candidato());
    expect(a.percentuale).toBeNull();
    expect(a.punteggio).toBeGreaterThan(0);
  });

  it("i contributi arrivano in ordine di peso e dicono quale chiave ha vinto", () => {
    const a = affinity(profilo, candidato({ genreIds: [28], providerIds: [8] }));
    expect(a.contributi[0].dimensione).toBe("generi");
    expect(a.contributi[0].chiave).toBe("28");
  });
});

describe("diversify", () => {
  function item(patch: Partial<RankedItem> & { id: number }): RankedItem {
    return {
      ...candidato({ id: patch.id }),
      punteggio: 0.5,
      percentuale: 50,
      contributi: [],
      motivo: null,
      ...patch,
    };
  }

  it("non mette più di tre titoli dello stesso genere in testa", () => {
    const lista = Array.from({ length: 6 }, (_, i) =>
      item({ id: i + 1, genreIds: [28], providerIds: [], people: [] }),
    );
    const out = diversify(lista, 3);
    expect(out).toHaveLength(3);
  });

  it("gli scartati riempiono la coda se la lista non arriva alla misura", () => {
    const lista = Array.from({ length: 6 }, (_, i) =>
      item({ id: i + 1, genreIds: [28], providerIds: [], people: [] }),
    );
    const out = diversify(lista, 6);
    expect(out).toHaveLength(6);
    // i primi tre restano i migliori, in ordine
    expect(out.slice(0, 3).map((i) => i.id)).toEqual([1, 2, 3]);
  });

  it("il tetto per provider vale anche a generi diversi", () => {
    const lista = Array.from({ length: 6 }, (_, i) =>
      item({ id: i + 1, genreIds: [i], providerIds: [8], people: [] }),
    );
    expect(diversify(lista, 4)).toHaveLength(4);
    const out = diversify(lista, 6);
    expect(out).toHaveLength(6);
  });

  it("una lista già corta resta intera", () => {
    const lista = [item({ id: 1 }), item({ id: 2 })];
    expect(diversify(lista, 20).map((i) => i.id)).toEqual([1, 2]);
  });
});

describe("explain", () => {
  const nomi = {
    generi: new Map([["28", "Azione"]]),
    provider: new Map([["8", "Netflix"]]),
  };
  const c = (patch: Partial<Contributo>): Contributo => ({
    dimensione: "generi",
    chiave: "28",
    valore: 0.3,
    ...patch,
  });

  it("il genere", () => {
    expect(explain([c({})], nomi, 0.5)).toBe("Perché guardi molto Azione");
  });

  it("la regia e il cast si dicono in modo diverso", () => {
    expect(
      explain([c({ dimensione: "persone", chiave: "Regia:Nolan" })], nomi, 0.5),
    ).toBe("Di Nolan");
    expect(
      explain([c({ dimensione: "persone", chiave: "Cast:Pedro Pascal" })], nomi, 0.5),
    ).toBe("Con Pedro Pascal");
  });

  it("il provider e il decennio", () => {
    expect(explain([c({ dimensione: "provider", chiave: "8" })], nomi, 0.5)).toBe(
      "Su Netflix, che guardi spesso",
    );
    expect(explain([c({ dimensione: "decenni", chiave: "1990" })], nomi, 0.5)).toBe(
      "Dagli anni 1990",
    );
  });

  it("le dimensioni banali non si dicono: si ricade sulla qualità o su niente", () => {
    expect(explain([c({ dimensione: "tipo", chiave: "movie" })], nomi, 0.9)).toBe(
      "Molto amato su Zapp",
    );
    expect(explain([c({ dimensione: "tipo", chiave: "movie" })], nomi, 0.5)).toBeNull();
  });

  it("un contributo troppo debole non vale come motivo", () => {
    expect(explain([c({ valore: 0.001 })], nomi, 0.5)).toBeNull();
  });

  it("senza contributi e senza qualità alta non si inventa niente", () => {
    expect(explain([], nomi, 0.4)).toBeNull();
  });
});

describe("filtri", () => {
  it("scarta i titoli che non sappiamo nemmeno scrivere in caratteri latini", () => {
    expect(nomeLeggibile("멀리서 보면 푸른 봄")).toBe(false);
    expect(nomeLeggibile("監獄風雲")).toBe(false);
    expect(nomeLeggibile("Индиана")).toBe(false);
    expect(nomeLeggibile("")).toBe(false);
  });

  it("tiene i titoli italiani, accentati e con segni", () => {
    expect(nomeLeggibile("Una battaglia dopo l’altra")).toBe(true);
    expect(nomeLeggibile("Città di Dio")).toBe(true);
    expect(nomeLeggibile("Amélie")).toBe(true);
    // un drama coreano con titolo italiano resta: non è la lingua a decidere
    expect(nomeLeggibile("Il gioco del calamaro")).toBe(true);
  });

  it("le serie di notizie, reality e talk non sono consigli", () => {
    expect(
      consigliabile({ mediaType: "tv", title: "The Daily Show", genreIds: [10767] }),
    ).toBe(false);
    expect(
      consigliabile({ mediaType: "tv", title: "Un reality", genreIds: [10764] }),
    ).toBe(false);
    // l'animazione invece è un genere come gli altri
    expect(consigliabile({ mediaType: "tv", title: "Arcane", genreIds: [16] })).toBe(
      true,
    );
    // e per i film il filtro dei generi non si applica
    expect(
      consigliabile({ mediaType: "movie", title: "Un film", genreIds: [10767] }),
    ).toBe(true);
  });
});

describe("variaMotivi", () => {
  const nomiVar = {
    generi: new Map([
      ["18", "Dramma"],
      ["28", "Azione"],
    ]),
    provider: new Map([["8", "Netflix"]]),
  };

  function conMotivo(motivo: string | null, contributi: Contributo[] = []) {
    return { motivo, contributi };
  }

  it("dopo due volte lo stesso motivo prova il contributo successivo", () => {
    const items = [
      conMotivo("Perché guardi molto Dramma", [
        { dimensione: "generi", chiave: "18", valore: 0.3 },
        { dimensione: "provider", chiave: "8", valore: 0.1 },
      ]),
      conMotivo("Perché guardi molto Dramma", [
        { dimensione: "generi", chiave: "18", valore: 0.3 },
        { dimensione: "provider", chiave: "8", valore: 0.1 },
      ]),
      conMotivo("Perché guardi molto Dramma", [
        { dimensione: "generi", chiave: "18", valore: 0.3 },
        { dimensione: "provider", chiave: "8", valore: 0.1 },
      ]),
    ];
    const out = variaMotivi(items, nomiVar, () => 0.5);
    expect(out[0].motivo).toBe("Perché guardi molto Dramma");
    expect(out[1].motivo).toBe("Perché guardi molto Dramma");
    expect(out[2].motivo).toBe("Su Netflix, che guardi spesso");
  });

  it("senza alternative tace, invece di ripetersi", () => {
    const items = Array.from({ length: 4 }, () =>
      conMotivo("Perché guardi molto Dramma", [
        { dimensione: "generi", chiave: "18", valore: 0.3 },
      ]),
    );
    const out = variaMotivi(items, nomiVar, () => 0.5);
    expect(out[3].motivo).toBeNull();
  });

  it("chi non aveva motivo resta senza", () => {
    const out = variaMotivi([conMotivo(null)], nomiVar, () => 0.5);
    expect(out[0].motivo).toBeNull();
  });
});

describe("nomi dei generi", () => {
  it("i generi che TMDB lascia in inglese si dicono in italiano", () => {
    expect(nomeGenere("10759", "Action & Adventure")).toBe("Azione e avventura");
    expect(nomeGenere("10765", "Sci-Fi & Fantasy")).toBe("Fantascienza e fantasy");
    expect(nomeGenere("10768", "War & Politics")).toBe("Guerra e politica");
  });

  it("gli altri restano quelli di TMDB, che sono già tradotti", () => {
    expect(nomeGenere("18", "Dramma")).toBe("Dramma");
    expect(nomeGenere("999", undefined)).toBeUndefined();
  });
});

describe("buildRails", () => {
  const nomiRail = {
    generi: new Map([
      ["18", "Dramma"],
      ["878", "Fantascienza"],
    ]),
    provider: new Map([["8", "Netflix"]]),
  };

  function vettore(patch: Partial<Record<string, Record<string, number>>> = {}) {
    return toTasteVector(riga(patch as never));
  }

  it("preferisce le persone ai generi e i generi ai decenni", () => {
    const v = vettore({
      persone: { "Cast:Pedro Pascal": 0.9 },
      generi: { "878": 0.9 },
      decenni: { "2000": 0.9 },
    });
    const rails = buildRails(v, nomiRail);
    expect(rails.map((r) => r.dimensione)).toEqual(["persone", "generi", "decenni"]);
    expect(rails[0].titolo).toBe("Ancora con Pedro Pascal");
    expect(rails[1].titolo).toBe("Perché ami fantascienza");
    expect(rails[2].titolo).toBe("Il meglio degli anni 2000");
  });

  it("la regia si dice in modo diverso dal cast", () => {
    const rails = buildRails(vettore({ persone: { "Regia:Nolan": 0.9 } }), nomiRail);
    expect(rails[0].titolo).toBe("Ancora di Nolan");
  });

  it("una dimensione dà un rail solo, non uno per chiave", () => {
    const rails = buildRails(vettore({ generi: { "18": 1, "878": 0.9 } }), nomiRail);
    expect(rails).toHaveLength(1);
    expect(rails[0].chiave).toBe("18");
  });

  it("un legame debole non merita uno scaffale", () => {
    // 0.3 sul massimo: sotto SOGLIA_RAIL
    const rails = buildRails(vettore({ generi: { "18": 1, "878": 0.3 } }), nomiRail);
    expect(rails.every((r) => r.chiave !== "878")).toBe(true);
  });

  it("un profilo vuoto non produce rail, invece di riempirli a caso", () => {
    expect(buildRails(toTasteVector(null), nomiRail)).toEqual([]);
  });

  it("un genere senza nome italiano non diventa un titolo a metà", () => {
    const rails = buildRails(vettore({ generi: { "9999": 1 } }), nomiRail);
    expect(rails).toEqual([]);
  });
});

describe("appartiene", () => {
  const spec = (patch: Partial<RailSpec>): RailSpec => ({
    key: "generi|18",
    dimensione: "generi",
    chiave: "18",
    titolo: "Perché ami dramma",
    peso: 1,
    ...patch,
  });

  it("il genere", () => {
    expect(appartiene(spec({}), candidato({ genreIds: [18, 28] }))).toBe(true);
    expect(appartiene(spec({}), candidato({ genreIds: [28] }))).toBe(false);
  });

  it("la persona vale solo se è fra regia e primi interpreti", () => {
    const s = spec({ dimensione: "persone", chiave: "Cast:Pedro Pascal" });
    expect(appartiene(s, candidato({ people: ["Cast:Pedro Pascal"] }))).toBe(true);
    expect(appartiene(s, candidato({ people: ["Cast:Altro"] }))).toBe(false);
    expect(appartiene(s, candidato({ people: [] }))).toBe(false);
  });

  it("il decennio", () => {
    const s = spec({ dimensione: "decenni", chiave: "2000" });
    expect(appartiene(s, candidato({ year: "2007" }))).toBe(true);
    expect(appartiene(s, candidato({ year: "2011" }))).toBe(false);
    expect(appartiene(s, candidato({ year: null }))).toBe(false);
  });
});
