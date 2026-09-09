import { describe, expect, it } from "vitest";
import { parseMedia } from "@/lib/scrobble/parse";
// `scoreCandidate` vive in rank.ts, non in match.ts: match.ts importa il client
// Supabase e quello TMDB (entrambi `server-only`) per `matchTitle`, che qui non
// si testa, e un modulo con quell'import in cima non si puo' caricare da Vitest.
import { scoreCandidate } from "@/lib/scrobble/rank";

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
