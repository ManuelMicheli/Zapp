import { describe, expect, it } from "vitest";
import type { TmdbCastMember } from "@/lib/tmdb/types";
import { matchPortraits, normalizeName, type TvmazeCastEntry } from "./match";

const cast: TmdbCastMember[] = [
  {
    id: 1,
    name: "Bryan Cranston",
    character: "Walter White",
    profile_path: null,
    order: 0,
  },
  {
    id: 2,
    name: "Millie Bobby Brown",
    character: "Eleven / Jane Hopper",
    profile_path: null,
    order: 1,
  },
  { id: 3, name: "José García", character: "Il Capo", profile_path: null, order: 2 },
  { id: 4, name: "Sconosciuto", character: "Nessuno", profile_path: null, order: 3 },
  { id: 5, name: "Alex Rossi", character: "Marco", profile_path: null, order: 4 },
  { id: 6, name: "Alex Rossi", character: "Luca", profile_path: null, order: 5 },
];

const tvmaze: TvmazeCastEntry[] = [
  { personName: "Bryan Cranston", characterName: "Walter White", image: "/w.jpg" },
  {
    personName: "Millie Brown",
    characterName: "Jane 'Eleven' Hopper / Eleven",
    image: "/e.jpg",
  },
  { personName: "Jose Garcia", characterName: "El Jefe", image: "/j.jpg" },
  { personName: "Alex Rossi", characterName: "Marco", image: "/m.jpg" },
  { personName: "Alex Rossi", characterName: "Luca", image: "/l.jpg" },
  { personName: "Senza Foto", characterName: "Nessuno", image: null },
];

describe("normalizeName", () => {
  it("toglie accenti, punteggiatura, parentesi e maiuscole", () => {
    expect(normalizeName("José García")).toBe("jose garcia");
    expect(normalizeName("Robert Fischer, Jr.")).toBe("robert fischer jr");
    expect(normalizeName("Roz / Rummage (voice)")).toBe("roz rummage");
    expect(normalizeName("  Dr.  Shaun   Murphy ")).toBe("dr shaun murphy");
  });
});

describe("matchPortraits", () => {
  const m = matchPortraits(cast, tvmaze);

  it("abbina per nome dell'interprete", () => {
    expect(m.get(1)).toEqual({
      personId: 1,
      image: "/w.jpg",
      characterName: "Walter White",
    });
  });

  it("ricade sul nome del personaggio, anche fra più forme con la barra", () => {
    expect(m.get(2)?.image).toBe("/e.jpg");
  });

  it("gli accenti non contano", () => {
    expect(m.get(3)?.image).toBe("/j.jpg");
    // il nome del personaggio è quello di TVmaze, di solito più completo
    expect(m.get(3)?.characterName).toBe("El Jefe");
  });

  it("senza immagine non c'è ritratto", () => {
    expect(m.has(4)).toBe(false);
  });

  it("due interpreti omonimi prendono ritratti diversi", () => {
    expect(m.get(5)?.image).toBe("/m.jpg");
    expect(m.get(6)?.image).toBe("/l.jpg");
  });

  it("con TVmaze vuoto ritorna una mappa vuota", () => {
    expect(matchPortraits(cast, []).size).toBe(0);
  });
});
