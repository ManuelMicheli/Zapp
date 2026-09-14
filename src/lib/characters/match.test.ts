import { describe, expect, it } from "vitest";
import type { TmdbCastMember } from "@/lib/tmdb/types";
import { matchPortraits, normalizeName, type PortraitSourceEntry } from "./match";

function member(id: number, name: string, character: string): TmdbCastMember {
  return { id, name, character, profile_path: null, order: id };
}

const cast: TmdbCastMember[] = [
  member(1, "Bryan Cranston", "Walter White"),
  member(2, "Millie Bobby Brown", "Eleven / Jane Hopper"),
  member(3, "José García", "Il Capo"),
  member(4, "Sconosciuto", "Nessuno"),
  member(5, "Alex Rossi", "Marco"),
  member(6, "Alex Rossi", "Luca"),
];

const tvmaze: PortraitSourceEntry[] = [
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
    expect(normalizeName("Shidō Nakamura")).toBe("shido nakamura");
  });
});

describe("matchPortraits", () => {
  const m = matchPortraits(cast, tvmaze);

  it("abbina per nome dell'interprete", () => {
    expect(m.get(1)).toEqual({ personId: 1, image: "/w.jpg" });
  });

  it("ricade sul nome del personaggio, anche fra più forme con la barra", () => {
    expect(m.get(2)?.image).toBe("/e.jpg");
  });

  it("gli accenti non contano", () => {
    expect(m.get(3)?.image).toBe("/j.jpg");
  });

  it("senza immagine non c'è ritratto", () => {
    expect(m.has(4)).toBe(false);
  });

  it("due interpreti omonimi prendono ritratti diversi", () => {
    expect(m.get(5)?.image).toBe("/m.jpg");
    expect(m.get(6)?.image).toBe("/l.jpg");
  });

  it("con una fonte vuota ritorna ciò che c'era già", () => {
    expect(matchPortraits(cast, []).size).toBe(0);
    const prima = new Map([[1, { personId: 1, image: "/gia.jpg" }]]);
    expect(matchPortraits(cast, [], prima).get(1)?.image).toBe("/gia.jpg");
  });

  it("una fonte successiva riempie solo i buchi, non sovrascrive", () => {
    const prima = new Map([[1, { personId: 1, image: "/gia.jpg" }]]);
    const dopo = matchPortraits(cast, tvmaze, prima);
    expect(dopo.get(1)?.image).toBe("/gia.jpg");
    expect(dopo.get(2)?.image).toBe("/e.jpg");
  });
});

describe("matchPortraits con gli anime (AniList)", () => {
  const deathNote: TmdbCastMember[] = [
    member(10, "Mamoru Miyano", "Light Yagami"),
    member(11, "Shido Nakamura", "Ryuk"),
    member(12, "Kappei Yamaguchi", "L"),
    member(13, "Noriko Hidaka", "Near"),
    member(14, "Nozomu Sasaki", "Mello"),
    member(15, "Ai Satou", "Sachiko Yagami"),
  ];
  const anilist: PortraitSourceEntry[] = [
    { personName: "Miyano Mamoru", characterName: "Light Yagami", image: "/light.jpg" },
    { personName: "Shidou Nakamura", characterName: "Ryuk", image: "/ryuk.jpg" },
    { personName: "Kappei Yamaguchi", characterName: "L Lawliet", image: "/l.jpg" },
    { personName: "", characterName: "Nate River", image: "/near.jpg" },
    { personName: "Nozomu Sasaki", characterName: "Mihael Keehl", image: "/mello.jpg" },
    { personName: "Ai Satou", characterName: "Sachiko Yagami", image: "/sachiko.jpg" },
    { personName: "Akeno Watanabe", characterName: "Halle Bullook", image: "/halle.jpg" },
  ];
  const m = matchPortraits(deathNote, anilist);

  it("l'ordine delle parole del nome non conta", () => {
    expect(m.get(10)?.image).toBe("/light.jpg");
  });

  it("le vocali lunghe romanizzate non contano (Shidou = Shido)", () => {
    expect(m.get(11)?.image).toBe("/ryuk.jpg");
  });

  it("il doppiatore vince anche se il personaggio ha un altro nome (Mello / Mihael Keehl)", () => {
    expect(m.get(14)?.image).toBe("/mello.jpg");
    expect(m.get(12)?.image).toBe("/l.jpg");
  });

  it("senza doppiatore e con nome diverso resta senza ritratto (Near / Nate River)", () => {
    expect(m.has(13)).toBe(false);
  });

  it("un personaggio in più della fonte non finisce su nessuno", () => {
    expect([...m.values()].some((p) => p.image === "/halle.jpg")).toBe(false);
  });

  it("un doppiatore scritto in kanji da TMDB si abbina al nome nativo di AniList", () => {
    // con language=it-IT TMDB scrive "佐々木望"; AniList ha full "Nozomu Sasaki" e native "佐々木 望"
    const c = [
      member(20, "佐々木望", "Mello"),
      member(21, "内田直哉", "Soichiro Yagami"),
    ];
    const s: PortraitSourceEntry[] = [
      {
        personName: "Nozomu Sasaki",
        personNames: ["佐々木 望"],
        characterName: "Mihael Keehl",
        image: "/mello.jpg",
      },
      {
        personName: "Naoya Uchida",
        personNames: ["内田 直哉"],
        characterName: "Souichirou Yagami",
        image: "/soichiro.jpg",
      },
    ];
    const r = matchPortraits(c, s);
    expect(r.get(20)?.image).toBe("/mello.jpg");
    expect(r.get(21)?.image).toBe("/soichiro.jpg");
  });

  it("senza alias nativo, 'Souichirou Yagami' si abbina comunque per personaggio", () => {
    const c = [member(21, "内田直哉", "Soichiro Yagami")];
    const s: PortraitSourceEntry[] = [
      { personName: "Naoya Uchida", characterName: "Souichirou Yagami", image: "/s.jpg" },
    ];
    expect(matchPortraits(c, s).get(21)?.image).toBe("/s.jpg");
  });
});

describe("matchPortraits per inclusione del nome", () => {
  it("'Walter White' prende 'Walter Hartwell White', ma 'L' da solo non prende chiunque", () => {
    const c = [member(1, "Chi", "Walter White"), member(2, "Sa", "L")];
    const s: PortraitSourceEntry[] = [
      { personName: "", characterName: "Walter Hartwell White", image: "/w.jpg" },
      { personName: "", characterName: "L Lawliet", image: "/l.jpg" },
      { personName: "", characterName: "Lucille", image: "/lu.jpg" },
    ];
    const m = matchPortraits(c, s);
    expect(m.get(1)?.image).toBe("/w.jpg");
    // "l" non ha parole di peso: si abbina solo per uguaglianza, e "l lawliet" non è uguale
    expect(m.has(2)).toBe(false);
  });

  it("l'inclusione non scambia due personaggi con lo stesso cognome", () => {
    const c = [member(1, "A", "Skyler White"), member(2, "B", "Walter White")];
    const s: PortraitSourceEntry[] = [
      { personName: "", characterName: "Walter Hartwell White", image: "/w.jpg" },
      { personName: "", characterName: "Skyler White", image: "/s.jpg" },
    ];
    const m = matchPortraits(c, s);
    expect(m.get(1)?.image).toBe("/s.jpg");
    expect(m.get(2)?.image).toBe("/w.jpg");
  });
});
