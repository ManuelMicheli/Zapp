import { describe, expect, it } from "vitest";
import { regiaConId, regiaDi, type TitleRaw } from "./facts";

/** Un `titles.raw` finto con la sola troupe che serve al test. */
function raw(crew: { id: number; name: string; job: string }[]): TitleRaw {
  return { credits: { cast: [], crew } } as unknown as TitleRaw;
}

describe("regiaConId", () => {
  it("prende solo chi ha job Director, con l'id per il link", () => {
    const r = raw([
      { id: 1, name: "Denis Villeneuve", job: "Director" },
      { id: 2, name: "Greig Fraser", job: "Director of Photography" },
    ]);
    expect(regiaConId(r, "movie")).toEqual([{ id: 1, name: "Denis Villeneuve" }]);
  });

  it("non ripete la stessa persona accreditata due volte", () => {
    const r = raw([
      { id: 7, name: "Joel Coen", job: "Director" },
      { id: 7, name: "Joel Coen", job: "Director" },
      { id: 8, name: "Ethan Coen", job: "Director" },
    ]);
    expect(regiaConId(r, "movie")).toEqual([
      { id: 7, name: "Joel Coen" },
      { id: 8, name: "Ethan Coen" },
    ]);
  });

  it("si ferma a tre nomi: una riga della scheda, non un elenco", () => {
    const r = raw(
      [10, 11, 12, 13].map((id) => ({ id, name: `Regista ${id}`, job: "Director" })),
    );
    expect(regiaConId(r, "movie")).toHaveLength(3);
  });

  it("per le serie usa created_by", () => {
    const serie = {
      created_by: [{ id: 99, name: "Vince Gilligan" }],
    } as unknown as TitleRaw;
    expect(regiaConId(serie, "tv")).toEqual([{ id: 99, name: "Vince Gilligan" }]);
  });

  it("senza troupe non inventa nulla", () => {
    expect(regiaConId(undefined, "movie")).toEqual([]);
    expect(regiaConId(raw([]), "movie")).toEqual([]);
  });
});

describe("regiaDi", () => {
  it("resta la stringa di prima, costruita sugli stessi nomi", () => {
    const r = raw([
      { id: 7, name: "Joel Coen", job: "Director" },
      { id: 8, name: "Ethan Coen", job: "Director" },
    ]);
    expect(regiaDi(r, "movie")).toBe("Joel Coen, Ethan Coen");
    expect(regiaDi(raw([]), "movie")).toBeNull();
  });
});
