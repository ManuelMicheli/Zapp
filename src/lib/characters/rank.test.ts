import { describe, expect, it } from "vitest";
import type { TmdbCastMember } from "@/lib/tmdb/types";
import { applyVote, buildCharacterChart, type CharacterVoteCount } from "./rank";

const cast: TmdbCastMember[] = [
  {
    id: 1,
    name: "Bryan Cranston",
    character: "Walter White",
    profile_path: "/w.jpg",
    order: 0,
  },
  {
    id: 2,
    name: "Aaron Paul",
    character: "Jesse Pinkman",
    profile_path: "/j.jpg",
    order: 1,
  },
  { id: 3, name: "Anna Gunn", character: "Skyler White", profile_path: null, order: 2 },
  {
    id: 4,
    name: "Dean Norris",
    character: "Hank Schrader",
    profile_path: null,
    order: 3,
  },
  {
    id: 5,
    name: "Betsy Brandt",
    character: "Marie Schrader",
    profile_path: null,
    order: 4,
  },
  {
    id: 6,
    name: "RJ Mitte",
    character: "Walter White Jr. / Flynn",
    profile_path: null,
    order: 5,
  },
  {
    id: 7,
    name: "Bob Odenkirk",
    character: "Saul Goodman",
    profile_path: null,
    order: 6,
  },
];

function counts(...rows: [number, number][]): CharacterVoteCount[] {
  return rows.map(([personId, votes]) => ({
    personId,
    character: cast.find((c) => c.id === personId)?.character ?? `#${personId}`,
    votes,
  }));
}

describe("buildCharacterChart", () => {
  it("senza voti ritorna un grafico vuoto", () => {
    const chart = buildCharacterChart([], cast, null);
    expect(chart.total).toBe(0);
    expect(chart.bars).toEqual([]);
    expect(chart.others).toBeNull();
  });

  it("ordina per voti e calcola le percentuali sul totale", () => {
    const chart = buildCharacterChart(counts([2, 3], [1, 6], [3, 1]), cast, null);
    expect(chart.total).toBe(10);
    expect(chart.bars.map((b) => [b.personId, b.votes, b.share])).toEqual([
      [1, 6, 60],
      [2, 3, 30],
      [3, 1, 10],
    ]);
  });

  it("prende nome e foto dal cast, il personaggio dal cast se c'è", () => {
    const chart = buildCharacterChart(counts([6, 2]), cast, null);
    expect(chart.bars[0]).toMatchObject({
      personId: 6,
      name: "RJ Mitte",
      character: "Walter White Jr.",
      profilePath: null,
    });
    expect(chart.bars[0].mine).toBe(false);
  });

  it("chi non è più nel cast tiene il personaggio salvato e resta senza foto", () => {
    const chart = buildCharacterChart(
      [{ personId: 99, character: "Gus Fring", votes: 4 }],
      cast,
      null,
    );
    expect(chart.bars[0]).toMatchObject({
      personId: 99,
      name: null,
      character: "Gus Fring",
      profilePath: null,
      votes: 4,
    });
  });

  it("a parità di voti vince l'ordine del cast", () => {
    const chart = buildCharacterChart(counts([7, 2], [2, 2], [99, 2]), cast, null);
    expect(chart.bars.map((b) => b.personId)).toEqual([2, 7, 99]);
  });

  it("scarta i conteggi a zero", () => {
    const chart = buildCharacterChart(counts([1, 0], [2, 1]), cast, null);
    expect(chart.bars.map((b) => b.personId)).toEqual([2]);
    expect(chart.total).toBe(1);
  });

  it("oltre i primi cinque somma il resto in 'altri'", () => {
    const chart = buildCharacterChart(
      counts([1, 10], [2, 8], [3, 6], [4, 4], [5, 2], [6, 1], [7, 1]),
      cast,
      null,
    );
    expect(chart.bars).toHaveLength(5);
    expect(chart.others).toEqual({ votes: 2, share: 6 });
    expect(chart.total).toBe(32);
  });

  it("il mio voto si vede sempre, anche fuori dai primi cinque", () => {
    const chart = buildCharacterChart(
      counts([1, 10], [2, 8], [3, 6], [4, 4], [5, 2], [6, 1], [7, 1]),
      cast,
      7,
    );
    expect(chart.bars).toHaveLength(6);
    expect(chart.bars[5]).toMatchObject({ personId: 7, mine: true, votes: 1 });
    expect(chart.others).toEqual({ votes: 1, share: 3 });
  });

  it("segna il mio voto quando sta nei primi", () => {
    const chart = buildCharacterChart(counts([1, 3], [2, 1]), cast, 2);
    expect(chart.bars.map((b) => b.mine)).toEqual([false, true]);
  });

  it("le percentuali sono intere e mai sopra 100", () => {
    const chart = buildCharacterChart(counts([1, 1], [2, 1], [3, 1]), cast, null);
    for (const b of chart.bars) {
      expect(Number.isInteger(b.share)).toBe(true);
      expect(b.share).toBeLessThanOrEqual(100);
    }
  });
});

describe("applyVote", () => {
  it("aggiunge un voto nuovo", () => {
    const next = applyVote(counts([1, 2]), null, 2, "Jesse Pinkman");
    expect(next).toEqual([
      { personId: 1, character: "Walter White", votes: 2 },
      { personId: 2, character: "Jesse Pinkman", votes: 1 },
    ]);
  });

  it("sposta il voto da un personaggio all'altro", () => {
    const next = applyVote(counts([1, 2], [2, 1]), 1, 2, "Jesse Pinkman");
    expect(next).toEqual([
      { personId: 1, character: "Walter White", votes: 1 },
      { personId: 2, character: "Jesse Pinkman", votes: 2 },
    ]);
  });

  it("toglie il voto e non lascia righe a zero", () => {
    const next = applyVote(counts([1, 1], [2, 3]), 1, null, null);
    expect(next).toEqual([{ personId: 2, character: "Jesse Pinkman", votes: 3 }]);
  });

  it("stesso personaggio: non cambia niente", () => {
    const base = counts([1, 2]);
    expect(applyVote(base, 1, 1, "Walter White")).toEqual(base);
  });

  it("non muta l'elenco di partenza", () => {
    const base = counts([1, 2]);
    applyVote(base, null, 2, "Jesse Pinkman");
    expect(base).toEqual(counts([1, 2]));
  });
});
