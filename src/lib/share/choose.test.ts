import { describe, expect, it } from "vitest";
import { chooseCandidate, type Candidate } from "./choose";

function c(patch: Partial<Candidate> & { id: number }): Candidate {
  return {
    mediaType: "movie",
    title: "Senza nome",
    originalTitle: null,
    year: null,
    popularity: 0,
    ...patch,
  };
}

describe("chooseCandidate — certezza", () => {
  it("un titolo uguale a meno di accenti e punteggiatura e' certo", () => {
    const giusto = c({ id: 1, title: "Perché", year: 2020, popularity: 5 });
    const altro = c({ id: 2, title: "Perché no, davvero", year: 2020, popularity: 90 });
    const { sure } = chooseCandidate("Perche", null, [altro, giusto]);
    expect(sure?.id).toBe(1);
  });

  it("il confronto vale anche sul titolo originale", () => {
    const giusto = c({ id: 1, title: "La La Land", originalTitle: "La La Land" });
    const altro = c({
      id: 2,
      title: "Il buio oltre la siepe",
      originalTitle: "To Kill a Mockingbird",
    });
    const { sure } = chooseCandidate("To Kill a Mockingbird", null, [altro, giusto]);
    expect(sure?.id).toBe(2);
  });

  it("l'anno distingue due remake anche quando il piu' popolare e' l'altro", () => {
    const vecchio = c({ id: 1, title: "Dune", year: 1984, popularity: 90 });
    const nuovo = c({ id: 2, title: "Dune", year: 2021, popularity: 10 });
    const { sure } = chooseCandidate("Dune", 2021, [vecchio, nuovo]);
    expect(sure?.id).toBe(2);
  });

  it("un anno lontano un anno resta compatibile", () => {
    const uno = c({ id: 1, title: "Dune", year: 2021, popularity: 10 });
    const due = c({ id: 2, title: "Altro", year: 2021, popularity: 90 });
    const { sure } = chooseCandidate("Dune", 2020, [uno, due]);
    expect(sure?.id).toBe(1);
  });

  it("un solo candidato e' sempre la risposta", () => {
    const solo = c({ id: 7, title: "Un titolo qualsiasi", year: 1999 });
    const { sure, shortlist } = chooseCandidate("tutt'altro", null, [solo]);
    expect(sure?.id).toBe(7);
    expect(shortlist).toEqual([solo]);
  });

  it("due omonimi entrambi popolari non danno nessuna certezza", () => {
    const uno = c({ id: 1, title: "Dune", year: 1984, popularity: 80 });
    const due = c({ id: 2, title: "Dune", year: 2021, popularity: 60 });
    const { sure } = chooseCandidate("Dune", null, [uno, due]);
    expect(sure).toBeNull();
  });

  it("fra due omonimi vince chi ha piu' del doppio della popolarita'", () => {
    const uno = c({ id: 1, title: "Dune", year: 1984, popularity: 10 });
    const due = c({ id: 2, title: "Dune", year: 2021, popularity: 80 });
    const { sure } = chooseCandidate("Dune", null, [uno, due]);
    expect(sure?.id).toBe(2);
  });

  it("nessun titolo uguale, nessuna certezza", () => {
    const uno = c({ id: 1, title: "Dune - Parte due", popularity: 80 });
    const due = c({ id: 2, title: "Dune: Prophecy", popularity: 60 });
    const { sure } = chooseCandidate("Dune", null, [uno, due]);
    expect(sure).toBeNull();
  });

  it("lista vuota", () => {
    expect(chooseCandidate("Dune", null, [])).toEqual({ sure: null, shortlist: [] });
  });
});

describe("chooseCandidate — proposte", () => {
  it("prima gli uguali, poi chi contiene la query, poi il resto per popolarita'", () => {
    const candidati = [
      c({ id: 1, title: "Altro film", popularity: 100 }),
      c({ id: 2, title: "Dune - Parte due", popularity: 30 }),
      c({ id: 3, title: "Dune", popularity: 5 }),
      c({ id: 4, title: "Film diverso", popularity: 50 }),
      c({ id: 5, title: "Dune: Prophecy", popularity: 40 }),
    ];
    const { shortlist } = chooseCandidate("Dune", null, candidati);
    expect(shortlist.map((x) => x.id)).toEqual([3, 5, 2, 1, 4]);
  });

  it("non propone piu' di cinque titoli", () => {
    const candidati = Array.from({ length: 8 }, (_, i) =>
      c({ id: i + 1, title: `Titolo ${i + 1}`, popularity: i }),
    );
    const { shortlist } = chooseCandidate("Dune", null, candidati);
    expect(shortlist).toHaveLength(5);
    expect(shortlist[0].id).toBe(8);
  });
});
