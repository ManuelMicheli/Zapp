import { describe, expect, it } from "vitest";
import {
  groupRows,
  inferDateOrder,
  parseDate,
  parseNetflixCsvText,
  type NetflixRow,
} from "./netflix-rows";

const row = (title: string, date = ""): NetflixRow => ({ title, date });

describe("parseNetflixCsvText", () => {
  it("legge Title/Date e converte la data in ISO (M/D, export Netflix, quando ambiguo)", () => {
    const rows = parseNetflixCsvText(
      'Title,Date\n"Dark: Stagione 1: Segreti","05/12/2023"\n"Interstellar","5/2/23"\n',
    );
    expect(rows).toEqual([
      { title: "Dark: Stagione 1: Segreti", date: "2023-05-12" },
      { title: "Interstellar", date: "2023-05-02" },
    ]);
  });

  it("deduce l'ordine giorno/mese dalle righe non ambigue del file", () => {
    const dm = parseNetflixCsvText(
      'Title,Date\n"A","25/03/2024"\n"B","05/12/2023"\n"C","5/2/23"\n',
    );
    expect(dm.map((r) => r.date)).toEqual(["2024-03-25", "2023-12-05", "2023-02-05"]);
    const md = parseNetflixCsvText('Title,Date\n"A","03/25/2024"\n"B","05/12/2023"\n');
    expect(md.map((r) => r.date)).toEqual(["2024-03-25", "2023-05-12"]);
    expect(inferDateOrder(["25/03/2024", "03/25/2024", "13/01/2024"])).toBe("dm");
    expect(inferDateOrder(["2024-03-25"])).toBe("md");
    expect(parseDate("31/02/2024", "dm")).toBe("2024-02-31");
    expect(parseDate("13/13/2024", "md")).toBeNull();
  });
});

describe("groupRows", () => {
  it("raggruppa gli episodi per serie e prende la stagione più avanzata", () => {
    const c = groupRows([
      row("The Witcher: Stagione 2: Un briciolo di verità", "2023-03-02"),
      row("The Witcher: Stagione 1: L'inizio della fine", "2022-01-01"),
      row("The Witcher: Stagione 1: Quattro marchi", "2022-01-02"),
    ]);
    expect(c).toHaveLength(1);
    expect(c[0]).toMatchObject({
      kind: "tv",
      netflixTitle: "The Witcher",
      season: 2,
      episode: 1,
      rowCount: 3,
      lastDate: "2023-03-02",
      altTitle: null,
      fallbackShow: null,
    });
  });

  it("un episodio rivisto non conta due volte", () => {
    const c = groupRows([
      row("Dark: Stagione 1: Segreti"),
      row("Dark: Stagione 1: Segreti"),
      row("Dark: Stagione 1: Bugie"),
    ]);
    expect(c[0]).toMatchObject({ season: 1, episode: 2, rowCount: 3 });
  });

  it("usa il numero di episodio quando Netflix lo scrive", () => {
    const c = groupRows([
      row("La casa di carta: Parte 1: Episodio 5"),
      row("La casa di carta: Parte 1: Episodio 2"),
    ]);
    expect(c[0]).toMatchObject({
      netflixTitle: "La casa di carta",
      season: 1,
      episode: 5,
    });
  });

  it("stagioni con nome proprio: numero in coda e nome alternativo da provare", () => {
    const c = groupRows([
      row("Stranger Things: Stranger Things 3: Capitolo uno: Suzie, mi ricevi?"),
      row("Stranger Things: Stranger Things 4: Capitolo uno: Il club Hellfire"),
      row("Stranger Things: Stranger Things 4: Capitolo due: La maledizione di Vecna"),
    ]);
    expect(c).toHaveLength(1);
    expect(c[0]).toMatchObject({
      kind: "tv",
      netflixTitle: "Stranger Things",
      altTitle: "Stranger Things: Stranger Things 4",
      season: 4,
      episode: 2,
    });
  });

  it("stagioni senza numero: numerate per data della prima visione", () => {
    const c = groupRows([
      row("Baki: Il grande torneo: Episodio 2", "2023-06-02"),
      row("Baki: Il grande torneo: Episodio 1", "2023-06-01"),
      row("Baki: Il torneo del più forte: Episodio 3", "2023-01-10"),
    ]);
    expect(c[0]).toMatchObject({
      netflixTitle: "Baki",
      altTitle: "Baki: Il grande torneo",
      season: 2,
      episode: 2,
    });
  });

  it("stagioni numerate e non: le senza numero vengono dopo", () => {
    const c = groupRows([
      row("Serie: Stagione 2: A", "2023-01-01"),
      row("Serie: Stagione finale: B", "2024-01-01"),
    ]);
    expect(c[0]).toMatchObject({ season: 3, episode: 1 });
  });

  it("stesso show scritto in modo diverso finisce nello stesso gruppo", () => {
    const c = groupRows([
      row("Marvel's Daredevil: Stagione 1: Nell'arena"),
      row("Marvel’s Daredevil: Stagione 2: Bang"),
    ]);
    expect(c).toHaveLength(1);
    expect(c[0].season).toBe(2);
  });

  it("titolo in due parti: film con prefisso per il ripiego a serie", () => {
    const c = groupRows([row("Our Planet: Un unico pianeta", "2023-01-01")]);
    expect(c[0]).toMatchObject({
      kind: "movie",
      netflixTitle: "Our Planet: Un unico pianeta",
      fallbackShow: "Our Planet",
      altTitle: null,
    });
  });

  it("film visto due volte: un candidato, data più recente", () => {
    const c = groupRows([
      row("Interstellar", "2022-05-01"),
      row("Interstellar", "2023-05-01"),
    ]);
    expect(c).toHaveLength(1);
    expect(c[0]).toMatchObject({ kind: "movie", lastDate: "2023-05-01", rowCount: 2 });
  });

  it("ordina per data più recente, senza data in fondo", () => {
    const c = groupRows([
      row("Vecchio"),
      row("Interstellar", "2022-05-01"),
      row("Dark: Stagione 1: Segreti", "2023-05-01"),
    ]);
    expect(c.map((x) => x.netflixTitle)).toEqual(["Dark", "Interstellar", "Vecchio"]);
  });
});

describe("groupRows: episodi e righe senza stagione", () => {
  it("porta i nomi degli episodi della stagione più avanzata", () => {
    const c = groupRows([
      row("Dark: Stagione 1: Segreti", "2022-01-01"),
      row("Dark: Stagione 2: Ieri e oggi", "2022-02-01"),
      row("Dark: Stagione 2: Il viaggio", "2022-02-02"),
    ]);
    expect(c[0].episodeTitles).toEqual(["Ieri e oggi", "Il viaggio"]);
  });

  it('una riga "Serie: Episodio" di una serie già raggruppata non diventa un film', () => {
    const c = groupRows([
      row("Our Planet: Stagione 1: Mondi ghiacciati", "2022-01-01"),
      row("Our Planet: Le giungle", "2022-01-02"),
    ]);
    expect(c).toHaveLength(1);
    expect(c[0]).toMatchObject({ kind: "tv", netflixTitle: "Our Planet", rowCount: 2 });
    expect(c[0].episodeTitles).toEqual(["Mondi ghiacciati", "Le giungle"]);
  });

  it('una riga "A: B" senza serie omonima resta un film con il ripiego', () => {
    const c = groupRows([row("Star Wars: Una nuova speranza", "2022-01-01")]);
    expect(c[0]).toMatchObject({
      kind: "movie",
      fallbackShow: "Star Wars",
      episodeTitles: [],
    });
  });
});
