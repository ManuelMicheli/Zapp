import { describe, expect, it } from "vitest";
import { parseMedia } from "@/lib/scrobble/parse";
// `scoreCandidate` vive in rank.ts, non in match.ts: match.ts importa il client
// Supabase e quello TMDB (entrambi `server-only`) per `matchTitle`, che qui non
// si testa, e un modulo con quell'import in cima non si puo' caricare da Vitest.
import {
  MATCH_THRESHOLD,
  playerTitleSimilarity,
  scoreCandidate,
} from "@/lib/scrobble/rank";

const dark = parseMedia("Dark", "S1:E2 Bugie");

describe("scoreCandidate", () => {
  it("premia il titolo identico", () => {
    const s = scoreCandidate(dark, {
      name: "Dark",
      year: 2017,
      hasProvider: false,
      popularity: 40,
    });
    expect(s).toBeGreaterThan(0.9);
  });

  it("premia chi e' offerto dalla piattaforma su cui stiamo guardando", () => {
    const con = scoreCandidate(dark, {
      name: "Dark",
      year: 2017,
      hasProvider: true,
      popularity: 10,
    });
    const senza = scoreCandidate(dark, {
      name: "Dark",
      year: 2017,
      hasProvider: false,
      popularity: 10,
    });
    expect(con).toBeGreaterThan(senza);
  });

  it("punisce un titolo diverso", () => {
    const s = scoreCandidate(dark, {
      name: "Darkness",
      year: 2017,
      hasProvider: true,
      popularity: 90,
    });
    expect(s).toBeLessThan(0.9);
  });

  it("la popolarita' non ribalta la somiglianza", () => {
    const giusto = scoreCandidate(dark, {
      name: "Dark",
      year: 2017,
      hasProvider: false,
      popularity: 1,
    });
    const sbagliato = scoreCandidate(dark, {
      name: "The Dark Knight",
      year: 2008,
      hasProvider: true,
      popularity: 99,
    });
    expect(giusto).toBeGreaterThan(sbagliato);
  });

  it("riconosce un vero sottotitolo, che normalizzare prima romperebbe", () => {
    const jumanji = parseMedia("Jumanji", null);
    const s = scoreCandidate(jumanji, {
      name: "Jumanji - Benvenuti nella giungla",
      year: 2017,
      hasProvider: false,
      popularity: 0,
    });
    expect(s).toBeGreaterThanOrEqual(0.9);
  });

  it("senza l'anno dal parsato (il caso normale) il punteggio non cambia", () => {
    // `parseMedia` non valorizza mai `year` (il DOM non lo dice): `dark.year` e'
    // gia' `null` qui, ma lo confrontiamo esplicitamente contro un candidato
    // con e senza anno per essere sicuri che la penalita' non scatti mai.
    expect(dark.year).toBeNull();
    const conAnno = scoreCandidate(dark, {
      name: "Dark",
      year: 2017,
      hasProvider: true,
      popularity: 20,
    });
    const senzaAnno = scoreCandidate(dark, {
      name: "Dark",
      year: null,
      hasProvider: true,
      popularity: 20,
    });
    expect(conAnno).toBe(senzaAnno);
  });

  it("penalizza un omonimo con un anno lontano, non uno vicino di un anno", () => {
    const parsed2017 = { ...dark, year: 2017 };
    const stessoAnno = scoreCandidate(parsed2017, {
      name: "Dark",
      year: 2017,
      hasProvider: false,
      popularity: 0,
    });
    // le date di uscita italiane slittano spesso di un anno: non e' un errore.
    const unAnnoDopo = scoreCandidate(parsed2017, {
      name: "Dark",
      year: 2018,
      hasProvider: false,
      popularity: 0,
    });
    const moltoLontano = scoreCandidate(parsed2017, {
      name: "Dark",
      year: 2005,
      hasProvider: false,
      popularity: 0,
    });
    expect(unAnnoDopo).toBe(stessoAnno);
    expect(moltoLontano).toBeLessThan(stessoAnno);
    // la penalita' da sola (0,2) supera le due spinte sommate (0,1): un
    // omonimo con l'anno sbagliato non puo' vincere su un candidato giusto
    // anche se quello sbagliato e' offerto dalla piattaforma ed e' popolare.
    const omonimoSpinto = scoreCandidate(parsed2017, {
      name: "Dark",
      year: 2005,
      hasProvider: true,
      popularity: 100,
    });
    expect(stessoAnno).toBeGreaterThan(omonimoSpinto);
  });
});

describe("scoreCandidate: nome originale", () => {
  // Netflix scrive il titolo con cui distribuisce l'opera in Italia, che a
  // volte e' quello originale mentre TMDB porta la traduzione italiana (o
  // viceversa). Confrontarne uno solo faceva fallire quei casi in silenzio.
  const squid = parseMedia("Squid Game", "S1:E1", "tv");

  it("riconosce un titolo che combacia col nome originale, non con quello italiano", () => {
    const s = scoreCandidate(squid, {
      name: "Squid Game - La sfida",
      originalName: "Squid Game",
      year: 2021,
      hasProvider: true,
      popularity: 80,
    });
    expect(s).toBeGreaterThanOrEqual(MATCH_THRESHOLD);
  });

  it("un nome originale che non c'entra non alza il punteggio", () => {
    const s = scoreCandidate(squid, {
      name: "Tutto un altro film",
      originalName: "Something Else Entirely",
      year: 2019,
      hasProvider: false,
      popularity: 0,
    });
    expect(s).toBeLessThan(MATCH_THRESHOLD);
  });
});

describe("playerTitleSimilarity: il sottotitolo del distributore", () => {
  // Il caso vero: l'h4 di Netflix dice "Hajime no Ippo: The Fighting!", TMDB ha
  // solo "Hajime no Ippo" (un unico risultato, verificato contro TMDB). Con la
  // sola `titleSimilarity` la somiglianza e' 0,667 e la serie non entrava mai in
  // libreria.
  it("accetta il titolo che combacia a meno del sottotitolo", () => {
    expect(playerTitleSimilarity("Hajime no Ippo: The Fighting!", "Hajime no Ippo")).toBeGreaterThanOrEqual(
      MATCH_THRESHOLD,
    );
  });

  it("un seguito resta un'opera diversa", () => {
    for (const [player, tmdb] of [
      ["Ritorno al futuro - Parte II", "Ritorno al futuro"],
      ["John Wick: Capitolo 4", "John Wick"],
      ["Kill Bill: Volume 2", "Kill Bill"],
      ["Rocky II", "Rocky"],
    ] as const) {
      expect(playerTitleSimilarity(player, tmdb)).toBeLessThan(MATCH_THRESHOLD);
    }
  });

  it("l'uguaglianza esatta vale piu' della corrispondenza sul solo nome principale", () => {
    // Dove TMDB ha entrambi, deve vincere quello giusto: "Squid Game: La sfida"
    // e' il reality, "Squid Game" la serie.
    const esatto = playerTitleSimilarity("Squid Game: La sfida", "Squid Game: La sfida");
    const principale = playerTitleSimilarity("Squid Game: La sfida", "Squid Game");
    expect(esatto).toBeGreaterThan(principale);
    expect(esatto).toBe(1);
  });

  it("non accetta un nome che non c'entra col principale", () => {
    expect(playerTitleSimilarity("Dark: Segreti", "Tenebre")).toBeLessThan(MATCH_THRESHOLD);
  });
});
