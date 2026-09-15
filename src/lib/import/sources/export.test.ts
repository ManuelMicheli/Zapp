import { describe, expect, it } from "vitest";
import { righeACandidati } from "./export";

describe("righeACandidati", () => {
  it("fa un film visto da una riga con titolo e data", () => {
    const [c] = righeACandidati([{ Title: "Dune", Date: "2026-09-15" }]);
    expect(c).toMatchObject({
      netflixTitle: "Dune",
      kind: "movie",
      lastDate: "2026-09-15",
      status: "watched",
    });
  });

  it("scarta le riproduzioni sotto i due minuti (trailer)", () => {
    const out = righeACandidati([
      { Title: "Dune", Date: "2026-09-15", Duration: "45" },
      { Title: "Arrival", Date: "2026-09-15", Duration: "7200" },
    ]);
    expect(out.map((c) => c.netflixTitle)).toEqual(["Arrival"]);
  });

  it("manda a 'watching' quello che e' rimasto a meta'", () => {
    const [c] = righeACandidati([
      { Title: "Dune", Date: "2026-09-15", Duration: "3600", Progress: "40%" },
    ]);
    expect(c.status).toBe("watching");
  });

  it("tiene 'watched' sopra l'85%", () => {
    const [c] = righeACandidati([
      { Title: "Dune", Date: "2026-09-15", Duration: "3600", Progress: "0.92" },
    ]);
    expect(c.status).toBe("watched");
  });

  it("riporta la scala del voto su dieci", () => {
    const [cinque] = righeACandidati([{ Title: "Dune", Rating: "4" }]);
    expect(cinque.rating).toBe(8);
    const [cento] = righeACandidati([{ Title: "Dune", Rating: "90" }]);
    expect(cento.rating).toBe(9);
  });

  it("riconosce la serie dal titolo e porta il nome dell'episodio", () => {
    const [c] = righeACandidati([
      { Title: "The Bear: Stagione 2: Episodio 5 - Pollo", Date: "2026-09-15" },
    ]);
    expect(c).toMatchObject({
      netflixTitle: "The Bear",
      kind: "tv",
      season: 2,
      episode: 5,
      episodeTitles: ["Pollo"],
    });
  });

  it("prende il nome dell'episodio dalla colonna dedicata quando c'e'", () => {
    // colonne separate (Apple TV, NOW): il titolo non porta il nome della
    // puntata, c'e' una colonna a parte per quello.
    const [c] = righeACandidati([
      {
        Show: "The Bear",
        Season: "2",
        Episode: "5",
        "Episode Name": "Pollo",
        Date: "2026-09-15",
      },
    ]);
    expect(c).toMatchObject({
      netflixTitle: "The Bear",
      kind: "tv",
      season: 2,
      episode: 5,
      episodeTitles: ["Pollo"],
    });
  });

  it("decide giorno/mese sull'intero file, non riga per riga", () => {
    // 13 non puo' essere un mese: tutto il file e' giorno/mese
    const out = righeACandidati([
      { Title: "A", Date: "13/09/2026" },
      { Title: "B", Date: "05/09/2026" },
    ]);
    expect(out[1].lastDate).toBe("2026-09-05");
  });

  it("senza titolo non produce niente", () => {
    expect(righeACandidati([{ Title: "", Date: "2026-09-15" }])).toEqual([]);
  });

  it("tiene le righe di una piattaforma che conta i minuti", () => {
    // il difetto: 22/45/58 letti come secondi finivano tutti sotto i 120s e
    // l'import restava vuoto, con un errore che diceva il contrario
    const out = righeACandidati([
      { Title: "Chernobyl", Date: "2026-09-01", "Minutes watched": "22" },
      { Title: "Dark", Date: "2026-09-02", "Minutes watched": "45" },
      { Title: "The Wire", Date: "2026-09-03", "Minutes watched": "58" },
    ]);
    expect(out.map((c) => c.netflixTitle)).toEqual(["Chernobyl", "Dark", "The Wire"]);
  });

  it("deduce i minuti dalla mediana quando l'intestazione non dice niente", () => {
    const out = righeACandidati([
      { c1: "Chernobyl", c2: "2026-09-01", c3: "22" },
      { c1: "Dark", c2: "2026-09-02", c3: "45" },
      { c1: "The Wire", c2: "2026-09-03", c3: "58" },
    ]);
    expect(out).toHaveLength(3);
  });

  it("continua a scartare le anteprime quando la colonna e' in secondi", () => {
    const out = righeACandidati([
      { Title: "Dune", Date: "2026-09-15", "Seconds watched": "45" },
      { Title: "Arrival", Date: "2026-09-15", "Seconds watched": "7200" },
    ]);
    expect(out.map((c) => c.netflixTitle)).toEqual(["Arrival"]);
  });

  it("non inventa un voto da una colonna che non sta su una scala plausibile", () => {
    // classificazioni per eta' finite nella colonna del voto: massimo 18, che
    // non e' il massimo di nessuna scala. Meglio nessun voto di un voto falso.
    const out = righeACandidati([
      { Title: "Dune", Rating: "14" },
      { Title: "Up", Rating: "6" },
      { Title: "Saw", Rating: "18" },
    ]);
    expect(out.map((c) => c.rating)).toEqual([null, null, null]);
  });

  it("usa la scala dichiarata dall'intestazione invece del massimo osservato", () => {
    // su dieci un 4 resta 4: senza il nome, il massimo osservato (4) lo
    // farebbe leggere come quattro stelle su cinque e diventerebbe 8
    const [c] = righeACandidati([{ Title: "Dune", "Voto /10": "4" }]);
    expect(c.rating).toBe(4);
  });

  it("legge stagione ed episodio anche se la prima riga non ha quelle chiavi", () => {
    // forma normale di un JSON: i campi vuoti si omettono
    const out = righeACandidati([
      { title: "Dune", date: "2026-09-01" },
      { title: "The Bear", date: "2026-09-02", season: "2", episode: "5" },
    ]);
    expect(out[1]).toMatchObject({ kind: "tv", season: 2, episode: 5 });
  });

  it("un tipo che non riconosce non diventa 'film' e non cancella la stagione", () => {
    const [c] = righeACandidati([
      {
        Title: "The Bear",
        "Content Type": "SVOD",
        Season: "2",
        Episode: "5",
        Date: "2026-09-02",
      },
    ]);
    expect(c).toMatchObject({ kind: "tv", season: 2, episode: 5 });
  });

  it("TVOD e' un noleggio, cioe' un film: non una serie", () => {
    // `tv` senza confini di parola pescava dentro "TVOD" e il film finiva in
    // libreria come serie a S1E1
    const [c] = righeACandidati([
      { Title: "Dune", "Content Type": "TVOD", Date: "2026-09-02" },
    ]);
    expect(c.kind).toBe("movie");
  });

  it("un tipo riconosciuto continua a decidere", () => {
    const [film] = righeACandidati([
      { Title: "Dune", "Content Type": "Movie", Date: "2026-09-02" },
    ]);
    expect(film.kind).toBe("movie");
    const [serie] = righeACandidati([
      { Title: "The Bear", "Content Type": "Episode", Date: "2026-09-02" },
    ]);
    expect(serie.kind).toBe("tv");
  });

  it("legge le ISO con i millisecondi e gli epoch", () => {
    const iso = righeACandidati([{ Title: "Dune", Date: "2026-09-15T21:14:00.000Z" }]);
    expect(iso[0].lastDate).toBe("2026-09-15");
    const secondi = righeACandidati([{ Title: "Dune", Date: "1789506840" }]);
    expect(secondi[0].lastDate).toBe("2026-09-15");
    const milli = righeACandidati([{ Title: "Dune", Date: "1789506840000" }]);
    expect(milli[0].lastDate).toBe("2026-09-15");
  });

  it("non prende per anno del titolo l'anno in cui e' stato visto", () => {
    const [c] = righeACandidati([{ Title: "Dune", "Watch Year": "2026" }]);
    expect(c.year).toBeNull();
  });

  it("una colonna di anni non spegne il filtro anti-anteprima", () => {
    // la mediana di "Watch Year" (2026) vinceva il ruolo `durata` sulla
    // colonna dei minuti veri, e i trailer entravano come visti
    const out = righeACandidati([
      { Title: "Chernobyl", "Watch Year": "2026", c3: "22" },
      { Title: "Dark", "Watch Year": "2025", c3: "45" },
      { Title: "Trailer", "Watch Year": "2024", c3: "1" },
    ]);
    expect(out.map((c) => c.netflixTitle)).toEqual(["Chernobyl", "Dark"]);
  });

  it("scarta le anteprime anche quando la colonna conta in millisecondi", () => {
    const out = righeACandidati([
      { Title: "Dune", Date: "2026-09-15", "Playback (ms)": "45000" },
      { Title: "Arrival", Date: "2026-09-15", "Playback (ms)": "7200000" },
    ]);
    expect(out.map((c) => c.netflixTitle)).toEqual(["Arrival"]);
  });

  it("una colonna di identificativi non diventa la data di visione", () => {
    const out = righeACandidati([
      { Nome: "Dune", Identificativo: "1789506840", Quando: "2026-09-15" },
      { Nome: "Arrival", Identificativo: "1789506841", Quando: "2026-09-14" },
      { Nome: "Sicario", Identificativo: "1789506842", Quando: "2026-09-13" },
    ]);
    expect(out.map((c) => c.lastDate)).toEqual([
      "2026-09-15",
      "2026-09-14",
      "2026-09-13",
    ]);
  });

  it("ignora un anno che non e' un anno", () => {
    const [c] = righeACandidati([{ Title: "Dune", Anno: "n/d" }]);
    expect(c.year).toBeNull();
  });
});

import { raggruppa } from "./export";

describe("raggruppa", () => {
  it("fonde le righe della stessa serie e tiene la stagione piu' avanti", () => {
    const out = raggruppa(
      righeACandidati([
        { Title: "The Bear: Stagione 1: Episodio 8 - Braciole", Date: "2026-09-01" },
        { Title: "The Bear: Stagione 2: Episodio 3 - Forchette", Date: "2026-09-05" },
      ]),
    );
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ season: 2, episode: 3, rowCount: 2 });
    expect(out[0].lastDate).toBe("2026-09-05");
  });

  it("raccoglie i nomi degli episodi della stagione piu' avanti", () => {
    const out = raggruppa(
      righeACandidati([
        { Title: "The Bear: Stagione 2: Episodio 1 - Beef", Date: "2026-09-02" },
        { Title: "The Bear: Stagione 2: Episodio 3 - Forchette", Date: "2026-09-05" },
        { Title: "The Bear: Stagione 1: Episodio 8 - Braciole", Date: "2026-09-01" },
      ]),
    );
    expect(out[0].episodeTitles).toEqual(["Beef", "Forchette"]);
  });

  it("tiene separati due film diversi", () => {
    const out = raggruppa(
      righeACandidati([
        { Title: "Dune", Date: "2026-09-01" },
        { Title: "Arrival", Date: "2026-09-02" },
      ]),
    );
    expect(out).toHaveLength(2);
  });

  it("non tiene piu' di 60 nomi di episodio", () => {
    const righe = Array.from({ length: 80 }, (_, i) => ({
      Title: `Lost: Stagione 1: Episodio ${i + 1} - Nome ${i + 1}`,
      Date: "2026-09-01",
    }));
    expect(raggruppa(righeACandidati(righe))[0].episodeTitles).toHaveLength(60);
  });

  it("fonde lo stato 'want' e 'watched' in 'watched'", () => {
    const candidati = righeACandidati([
      { Title: "Dune", Date: "2026-09-01", Progress: "0%" },
    ]);
    candidati[0].status = "want";
    const candidati2 = righeACandidati([
      { Title: "Dune", Date: "2026-09-02", Progress: "100%" },
    ]);
    const out = raggruppa([...candidati, ...candidati2]);
    expect(out[0].status).toBe("watched");
  });

  it("fonde lo stato 'want' e 'watching' in 'watching'", () => {
    const candidati = righeACandidati([
      {
        Title: "The Bear: Stagione 1: Episodio 1 - Parte",
        Date: "2026-09-01",
        Progress: "0%",
      },
    ]);
    candidati[0].status = "want";
    const candidati2 = righeACandidati([
      {
        Title: "The Bear: Stagione 1: Episodio 2 - Parte",
        Date: "2026-09-02",
        Progress: "40%",
      },
    ]);
    const out = raggruppa([...candidati, ...candidati2]);
    expect(out[0].status).toBe("watching");
  });

  it("prende il voto piu' alto quando si fondono due candidati", () => {
    const candidati = righeACandidati([
      { Title: "Dune", Date: "2026-09-01", Rating: "3" },
    ]);
    const candidati2 = righeACandidati([
      { Title: "Dune", Date: "2026-09-02", Rating: "8" },
    ]);
    const out = raggruppa([...candidati, ...candidati2]);
    expect(out[0].rating).toBe(8);
  });
});

import { parse } from "./export";

const CSV_CRONOLOGIA = `Title,Date\nDune,2026-09-15\nArrival,2026-09-14\n`;
const CSV_ESTRANEO = `Invoice,Amount\nIT-001,9.99\n`;

describe("parse", () => {
  it("tiene solo i file che sembrano una cronologia e lo dice", () => {
    const out = parse([
      { name: "play-history.csv", text: CSV_CRONOLOGIA },
      { name: "billing.csv", text: CSV_ESTRANEO },
    ]);
    expect(out.candidates).toHaveLength(2);
    expect(out.avvisi?.join(" ")).toContain("billing.csv");
  });

  it("trova l'elenco dentro un JSON annidato", () => {
    const json = JSON.stringify({
      data: { viewing: [{ title: "Dune", date: "2026-09-15" }] },
    });
    const out = parse([{ name: "export.json", text: json }]);
    expect(out.candidates[0]).toMatchObject({ netflixTitle: "Dune" });
  });

  it("non si ferma su un array civetta (devices) e arriva alla cronologia vera", () => {
    // esattamente il caso Apple/Disney+/NOW/Prime: dispositivi prima della
    // cronologia. "name"/"type" bastano a somigliare a un titolo per nome, ma
    // senza data/durata non sono una cronologia: la ricerca deve proseguire.
    const json = JSON.stringify({
      devices: [{ name: "iPhone 12", type: "Mobile" }],
      history: [{ title: "Dune", date: "2026-09-15" }],
    });
    const out = parse([{ name: "export.json", text: json }]);
    expect(out.candidates).toHaveLength(1);
    expect(out.candidates[0]).toMatchObject({ netflixTitle: "Dune" });
  });

  it("nessun array e' una cronologia: errore che spiega cosa cercava", () => {
    const json = JSON.stringify({
      devices: [{ name: "iPhone 12", type: "Mobile" }],
      settings: [{ key: "lang", value: "it" }],
    });
    const out = parse([{ name: "export.json", text: json }]);
    expect(out.candidates).toHaveLength(0);
    expect(out.error).toBeTruthy();
  });

  it("avvisa quando manca la colonna della data", () => {
    // solo titolo + durata (niente data): cronologia valida, ma senza data di
    // visione. Durate sopra i 120s per non essere scartate come anteprima.
    const out = parse([
      { name: "h.csv", text: "Title,Duration\nDune,7200\nArrival,6600\n" },
    ]);
    expect(out.candidates).toHaveLength(2);
    expect(out.avvisi?.join(" ")).toMatch(/data/i);
  });

  it("dice cosa cercava quando non capisce niente", () => {
    const out = parse([{ name: "b.csv", text: CSV_ESTRANEO }]);
    expect(out.candidates).toHaveLength(0);
    expect(out.error).toBeTruthy();
  });

  it("non lascia passare un elenco di dispositivi solo perche' il tipo somiglia a un titolo", () => {
    const out = parse([
      { name: "devices.csv", text: "Device,Type\niPhone 12,Mobile\niPad,Tablet\n" },
    ]);
    expect(out.candidates).toHaveLength(0);
    expect(out.avvisi?.join(" ")).toContain("devices.csv");
  });

  it("avvisa quando la colonna della data c'e' ma non si legge", () => {
    // l'avviso era agganciato al **ruolo**, non al parsing: il ruolo veniva
    // assegnato lo stesso e migliaia di titoli entravano senza data, in
    // silenzio. Qui le date sembrano date ma non sono giorni veri.
    const out = parse([
      { name: "h.csv", text: "Title,Date\nDune,2026-99-99\nArrival,2026-88-88\n" },
    ]);
    expect(out.candidates).toHaveLength(2);
    expect(out.avvisi?.join(" ")).toMatch(/formato/i);
  });

  it("non avvisa quando le date sono ISO con i millisecondi", () => {
    const out = parse([
      {
        name: "h.csv",
        text: "Title,Date\nDune,2026-09-15T21:14:00.000Z\nArrival,2026-09-14T20:00:00.000Z\n",
      },
    ]);
    expect(out.avvisi?.join(" ") ?? "").not.toMatch(/data/i);
    expect(out.candidates[0].lastDate).toBe("2026-09-15");
  });

  it("un file con le date a barre non e' un file da buttare", () => {
    const out = parse([
      { name: "h.csv", text: "Title,Date\nDune,2026/09/15\nArrival,2026/09/14\n" },
    ]);
    expect(out.error).toBeUndefined();
    expect(out.candidates).toHaveLength(2);
    expect(out.candidates[0].lastDate).toBe("2026-09-15");
    expect(out.avvisi?.join(" ") ?? "").not.toMatch(/data/i);
  });

  it("un export che conta in minuti non e' un export vuoto", () => {
    const out = parse([
      {
        name: "history.csv",
        text: "Title,Date,Minutes watched\nChernobyl,2026-09-01,22\nDark,2026-09-02,45\n",
      },
    ]);
    expect(out.error).toBeUndefined();
    expect(out.candidates).toHaveLength(2);
  });

  it("elenca al massimo cinque file scartati e riassume il resto col conteggio", () => {
    const files = Array.from({ length: 7 }, (_, i) => ({
      name: `estraneo-${i}.csv`,
      text: CSV_ESTRANEO,
    }));
    const out = parse(files);
    const avviso = out.avvisi?.find((a) => a.includes("estraneo-0.csv"));
    expect(avviso).toContain("e altri 2");
    expect(avviso).not.toContain("estraneo-6.csv");
  });
});
