import { describe, expect, it } from "vitest";
import { affinity, MISS, PESI_BASE, valoreDimensione } from "./affinity";
import {
  fama,
  famaDaVoti,
  FAMA_IN_CLASSIFICA,
  freschezzaDi,
  passaIlPavimento,
  qualitaDi,
  qualitaTirata,
} from "./fame";
import { toTasteVector } from "./vector";
import type { RankCandidate } from "./types";
import type { Tables } from "@/types/database";

/**
 * I casi che hanno motivato tutto il lavoro del 2026-09-15, misurati sui candidati veri
 * del motore (TMDB, genere 28, `vote_count.gte=300`, `popularity.desc`) e non inventati
 * per il test. Se uno di questi si rompe, in home tornano i film sconosciuti.
 */

function candidato(patch: Partial<RankCandidate> = {}): RankCandidate {
  return {
    id: 1,
    mediaType: "movie",
    title: "Titolo",
    posterPath: "/p.jpg",
    backdropPath: null,
    overview: null,
    year: "2020",
    genreIds: [28],
    runtime: 120,
    originalLanguage: "en",
    providerIds: [8],
    people: [],
    zappScore: null,
    voteAverage: null,
    voteCount: null,
    inChart: null,
    freschezza: 1,
    friends: null,
    ...patch,
  };
}

function profilo(patch: Partial<Tables<"user_taste">> = {}): Tables<"user_taste"> {
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
    massa: 600,
    eventi_contati: 0,
    updated_at: "2026-09-15T00:00:00Z",
    ...patch,
  } as Tables<"user_taste">;
}

describe("famaDaVoti", () => {
  it("cresce col logaritmo: Il Padrino sta molto sopra un film da 300 voti", () => {
    const padrino = famaDaVoti(23559, "movie");
    const ignoto = famaDaVoti(307, "movie");
    expect(padrino).toBeGreaterThan(0.9);
    expect(ignoto).toBeLessThan(0.6);
  });

  it("le serie hanno una scala loro: su TMDB votano dieci volte meno", () => {
    // Con la scala dei film nessuna serie arriverebbe mai in cima.
    expect(famaDaVoti(15000, "tv")).toBeGreaterThan(famaDaVoti(15000, "movie"));
  });

  it("senza voti è neutra, non zero", () => {
    expect(famaDaVoti(null, "movie")).toBe(0.5);
    expect(famaDaVoti(0, "movie")).toBe(0.5);
  });
});

describe("fama", () => {
  it("la classifica di oggi vale più dei voti di una novità", () => {
    // Una serie uscita martedì che mezza Italia sta guardando ha 200 voti su TMDB.
    const novita = candidato({
      mediaType: "tv",
      voteCount: 200,
      inChart: { providerId: 8, rank: 1, official: true },
    });
    expect(fama(novita)).toBe(FAMA_IN_CLASSIFICA);
    expect(fama({ ...novita, inChart: null })).toBeLessThan(FAMA_IN_CLASSIFICA);
  });

  it("ma un classico da trentamila voti resta sopra la Top 10 di questa settimana", () => {
    const classico = candidato({ voteCount: 30_000 });
    expect(fama(classico)).toBeGreaterThan(FAMA_IN_CLASSIFICA);
  });
});

describe("qualitaTirata", () => {
  it("un 9,17 con 307 voti non vale 0,92", () => {
    // È il difetto che si leggeva in home: Batman: Knightfall Part 1 (2026) scavalcava
    // Il Padrino perché il voto TMDB entrava crudo.
    const tirata = qualitaTirata(9.171, 307);
    expect(tirata).not.toBeNull();
    expect(tirata!).toBeLessThan(0.8);
    expect(tirata!).toBeGreaterThan(0.7);
  });

  it("con molti voti il tiraggio quasi non si sente", () => {
    expect(qualitaTirata(8.7, 100_000)!).toBeCloseTo(0.869, 3);
  });
});

describe("passaIlPavimento", () => {
  it("sotto gli 800 voti un film non si consiglia", () => {
    expect(passaIlPavimento(candidato({ voteCount: 399 }))).toBe(false);
    expect(passaIlPavimento(candidato({ voteCount: 2000 }))).toBe(true);
  });

  it("le tre esenzioni: classifica, amici, persone preferite", () => {
    const ignoto = candidato({ voteCount: 120 });
    expect(
      passaIlPavimento({
        ...ignoto,
        inChart: { providerId: 8, rank: 4, official: true },
      }),
    ).toBe(true);
    expect(
      passaIlPavimento({
        ...ignoto,
        friends: { amici: 1, votoMedio: 8, nomi: ["Marco"] },
      }),
    ).toBe(true);
    expect(
      passaIlPavimento(
        { ...ignoto, people: ["Regia:Denis Villeneuve"] },
        new Set(["Regia:Denis Villeneuve"]),
      ),
    ).toBe(true);
    expect(passaIlPavimento(ignoto)).toBe(false);
  });
});

describe("freschezzaDi", () => {
  it("una copertina ignorata in tre sessioni scende, in sei sparisce", () => {
    expect(freschezzaDi(undefined)).toBe(1);
    expect(freschezzaDi(2)).toBe(1);
    expect(freschezzaDi(3)).toBeLessThan(1);
    expect(freschezzaDi(6)).toBe(0);
  });
});

describe("valoreDimensione: l'assenza è informazione, ma non ovunque", () => {
  const v = toTasteVector(
    profilo({ generi: { "18": 1 }, persone: { "Regia:Nolan": 1 } }),
  );

  it("un genere che non sta nel profilo vale MISS, non 'non lo so'", () => {
    // Prima la dimensione usciva dal conto e i pesi si rinormalizzavano sulle altre:
    // "non c'entra niente con te" valeva quanto "non lo so", ed è metà del difetto che
    // l'utente ha descritto come "film che non c'entrano nulla con me".
    const fuori = candidato({ genreIds: [27] });
    expect(valoreDimensione(v, fuori, "generi")).toEqual({
      valore: MISS,
      chiave: "27",
    });
  });

  it("un cast sconosciuto non punisce: nessun profilo contiene tutti gli attori", () => {
    const ignoto = candidato({ people: ["Cast:Chi Sarà Mai"] });
    expect(valoreDimensione(v, ignoto, "persone")).toBeNull();
  });

  it("i generi si mediano su tutti quelli del titolo, non solo su quelli che tornano", () => {
    // Dramma+Horror per chi ama il dramma: l'horror deve diluire, non sparire.
    const misto = candidato({ genreIds: [18, 27] });
    const puro = candidato({ genreIds: [18] });
    const a = valoreDimensione(v, misto, "generi")!.valore;
    const b = valoreDimensione(v, puro, "generi")!.valore;
    expect(a).toBeLessThan(b);
    expect(a).toBeCloseTo((1 + MISS) / 2, 5);
  });

  it("e un genere rifiutato affonda il titolo", () => {
    const conRifiuto = toTasteVector(profilo({ generi: { "18": 1, "27": -1 } }));
    const misto = candidato({ genreIds: [18, 27] });
    expect(valoreDimensione(conRifiuto, misto, "generi")!.valore).toBeCloseTo(0, 5);
  });
});

describe("i quattro casi della tabella (spec 2026-09-15)", () => {
  // Un utente che ama il dramma e l'azione, con un regista preferito.
  const amanteDiDramma = toTasteVector(
    profilo({ generi: { "18": 1 }, decenni: { "1970": 0.6, "2010": 0.8 } }),
  );
  const amanteDiAzione = toTasteVector(
    profilo({ generi: { "28": 1 }, decenni: { "2020": 0.9 } }),
  );

  const padrino = candidato({
    title: "Il padrino",
    genreIds: [18],
    year: "1972",
    zappScore: 9,
    voteCount: 23_559,
    providerIds: [],
  });
  /**
   * Il caso vero: 307 voti, media 9,17, uscito questo mese, **in nessuna classifica**.
   * Era il titolo che scavalcava Il Padrino.
   */
  const batman2026 = candidato({
    title: "Batman: Knightfall Part 1",
    genreIds: [28],
    year: "2026",
    zappScore: null,
    voteAverage: 9.171,
    voteCount: 307,
    providerIds: [],
  });

  it("il film del 2026 con 307 voti non arriva nemmeno a essere un candidato", () => {
    // La prima difesa non è il punteggio, è il pavimento: con 307 voti e nessuna delle
    // tre esenzioni, `getCandidates` lo scarta prima di pesarlo.
    expect(passaIlPavimento(batman2026)).toBe(false);
  });

  it("e quello che il pavimento lascia passare perde comunque contro Il Padrino", () => {
    // 900 voti: appena sopra la soglia, media da fan del primo weekend.
    const appenaSopra = { ...batman2026, voteCount: 900 };
    const a = affinity(amanteDiDramma, padrino, PESI_BASE).punteggio;
    const b = affinity(amanteDiAzione, appenaSopra, PESI_BASE).punteggio;
    expect(a).toBeGreaterThan(b);
    // E non è un pareggio di misura: il gusto di chi ama l'azione è perfettamente
    // centrato da questo film (genere 28, decennio 2020) e perde lo stesso.
    expect(a - b).toBeGreaterThan(0.05);
  });

  it("ma se sta in classifica risale: è il 'in voga adesso' che deve funzionare", () => {
    const inVoga = {
      ...batman2026,
      inChart: { providerId: 8, rank: 3, official: true },
    };
    expect(affinity(amanteDiAzione, inVoga, PESI_BASE).punteggio).toBeGreaterThan(
      affinity(amanteDiAzione, batman2026, PESI_BASE).punteggio,
    );
  });

  it("una scoperta nel gusto si guadagna il posto", () => {
    // Film del 2019, 2.000 voti, 7,8, del regista preferito: deve poter stare in home.
    const conRegista = toTasteVector(
      profilo({ generi: { "18": 1 }, persone: { "Regia:Il Preferito": 1 } }),
    );
    const scoperta = candidato({
      genreIds: [18],
      year: "2019",
      zappScore: null,
      voteAverage: 7.8,
      voteCount: 2000,
      people: ["Regia:Il Preferito"],
      providerIds: [],
    });
    const punteggio = affinity(conRegista, scoperta, PESI_BASE).punteggio;
    // Batte l'uscita gonfiata di questo mese che il pavimento ha lasciato passare…
    expect(punteggio).toBeGreaterThan(
      affinity(amanteDiAzione, { ...batman2026, voteCount: 900 }, PESI_BASE).punteggio,
    );
    // …e resta comunque una lunghezza dietro Il Padrino, che è come deve essere: la
    // scoperta si guadagna il posto in home, non la testa della lista.
    expect(punteggio).toBeLessThan(
      affinity(amanteDiDramma, padrino, PESI_BASE).punteggio,
    );
  });

  it("un titolo fuori gusto e senza seguito crolla", () => {
    const fuoriTutto = candidato({
      genreIds: [10749],
      year: "2026",
      zappScore: null,
      voteAverage: 6.4,
      voteCount: 399,
      providerIds: [],
    });
    const punteggio = affinity(amanteDiDramma, fuoriTutto, PESI_BASE).punteggio;
    expect(punteggio).toBeLessThan(0.45);
  });

  it("la stanchezza fa scendere un titolo già scorso davanti", () => {
    const fresco = affinity(amanteDiDramma, padrino, PESI_BASE).punteggio;
    const stanco = affinity(
      amanteDiDramma,
      { ...padrino, freschezza: 0.6 },
      PESI_BASE,
    ).punteggio;
    expect(stanco).toBeLessThan(fresco);
  });

  it("la percentuale mostrata è il gusto, non il punteggio", () => {
    // Col punteggio pieno — che ora contiene la fama — un capolavoro arcinoto avrebbe
    // una percentuale alta per chiunque, e "per te" smetterebbe di voler dire qualcosa.
    const suoi = affinity(amanteDiDramma, padrino, PESI_BASE);
    const altrui = affinity(amanteDiAzione, padrino, PESI_BASE);
    expect(suoi.percentuale).not.toBeNull();
    expect(suoi.percentuale!).toBeGreaterThan(altrui.percentuale!);
  });
});

describe("qualitaDi", () => {
  it("lo ZappScore vince e resta su 0-10", () => {
    expect(qualitaDi(candidato({ zappScore: 9, voteAverage: 5 }))).toBeCloseTo(0.9, 5);
  });
});
