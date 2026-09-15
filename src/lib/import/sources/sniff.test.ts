import { describe, expect, it } from "vitest";
import { durataSec, profilaColonne, sembraData } from "./sniff";

describe("durataSec", () => {
  it("legge hh:mm:ss e mm:ss", () => {
    expect(durataSec("01:02:03")).toBe(3723);
    expect(durataSec("42:10")).toBe(2530);
  });

  it("legge i secondi interi e i millisecondi", () => {
    expect(durataSec("2530")).toBe(2530);
    // oltre un giorno in "secondi" non e' una puntata: sono millisecondi
    expect(durataSec("2530000")).toBe(2530);
  });

  it("scarta quello che non e' una durata", () => {
    expect(durataSec("")).toBeNull();
    expect(durataSec("Stranger Things")).toBeNull();
  });
});

describe("sembraData", () => {
  it("accetta le forme che gli export usano davvero", () => {
    expect(sembraData("2026-09-15")).toBe(true);
    expect(sembraData("15/09/2026")).toBe(true);
    expect(sembraData("2026-09-15T21:04:00Z")).toBe(true);
  });

  it("rifiuta numeri e titoli", () => {
    expect(sembraData("3")).toBe(false);
    expect(sembraData("Il Signore degli Anelli")).toBe(false);
  });
});

describe("profilaColonne", () => {
  it("riconosce le colonne dai nomi italiani e inglesi", () => {
    const ruoli = profilaColonne([
      { Titolo: "Dune", Data: "2026-09-15", Voto: "8", Durata: "02:35:00" },
    ]);
    expect(ruoli.get("Titolo")).toBe("titolo");
    expect(ruoli.get("Data")).toBe("data");
    expect(ruoli.get("Voto")).toBe("voto");
    expect(ruoli.get("Durata")).toBe("durata");
  });

  it("ignora le colonne di contorno", () => {
    const ruoli = profilaColonne([
      { Title: "Dune", Device: "iPhone", "IP Address": "1.2.3.4" },
    ]);
    expect(ruoli.get("Device")).toBeUndefined();
    expect(ruoli.get("IP Address")).toBeUndefined();
  });

  it("riconosce per contenuto quando i nomi non dicono niente", () => {
    // forma osservabile negli export Apple: intestazioni opache
    const righe = [
      { c1: "Stranger Things", c2: "2026-09-10", c3: "3", c4: "2530" },
      { c1: "The Bear", c2: "2026-09-11", c3: "2", c4: "1800" },
      { c1: "Il trono di spade", c2: "2026-09-12", c3: "1", c4: "3300" },
    ];
    const ruoli = profilaColonne(righe);
    expect(ruoli.get("c1")).toBe("titolo");
    expect(ruoli.get("c2")).toBe("data");
    expect(ruoli.get("c4")).toBe("durata");
  });

  it("assegna un ruolo solo una volta: vince il punteggio piu' alto", () => {
    const ruoli = profilaColonne([
      { "Series Title": "The Bear", "Episode Title": "Ceres" },
    ]);
    const titoli = [...ruoli.values()].filter((r) => r === "titolo");
    expect(titoli).toHaveLength(1);
    expect(ruoli.get("Series Title")).toBe("titolo");
  });

  it("riconosce il nome dell'episodio separato dal titolo della serie", () => {
    const ruoli = profilaColonne([
      { "Series Title": "The Bear", "Episode Title": "Ceres" },
    ]);
    expect(ruoli.get("Series Title")).toBe("titolo");
    expect(ruoli.get("Episode Title")).toBe("episodio_nome");
  });

  it("riconosce l'intestazione italiana invertita per il nome dell'episodio", () => {
    const ruoli = profilaColonne([
      { "Titolo serie": "The Bear", "Titolo episodio": "Ceres" },
    ]);
    expect(ruoli.get("Titolo serie")).toBe("titolo");
    expect(ruoli.get("Titolo episodio")).toBe("episodio_nome");
  });

  it("riconosce per contenuto una colonna di durate in minuti anche con intestazione opaca", () => {
    // senza pavimento assoluto: 22/45/58 "secondi" letti da durataSec restano
    // un segnale di durata valido, non vengono scartati come i numeri piccoli
    // di stagione/episodio del test precedente (li distingue la mediana).
    const righe = [
      { c1: "Chernobyl", c2: "2026-09-01", c3: "22" },
      { c1: "Dark", c2: "2026-09-02", c3: "45" },
      { c1: "The Wire", c2: "2026-09-03", c3: "58" },
    ];
    const ruoli = profilaColonne(righe);
    expect(ruoli.get("c3")).toBe("durata");
  });

  it("non marca 'durata' una colonna opaca di numeri di episodio senza vera durata", () => {
    // senza una colonna di durata vera a fare concorrenza, la mediana non
    // entra mai in gioco: senza un pavimento sulla mediana, questa colonna
    // vincerebbe "durata" per assenza di alternative — e al filtro
    // anti-anteprima del task successivo (< 120s) si perderebbe l'intero
    // import in silenzio.
    const righe = [
      { c1: "Stranger Things", c2: "2026-09-10", c3: "1" },
      { c1: "The Bear", c2: "2026-09-11", c3: "12" },
      { c1: "Il trono di spade", c2: "2026-09-12", c3: "24" },
    ];
    const ruoli = profilaColonne(righe);
    expect(ruoli.get("c1")).toBe("titolo");
    expect(ruoli.get("c2")).toBe("data");
    expect(ruoli.get("c3")).toBeUndefined();
  });

  it("si fida del nome anche con valori piccoli: il nome vince sul contenuto", () => {
    const ruoli = profilaColonne([
      { Titolo: "Dune", Duration: "5" },
      { Titolo: "Dune Part Two", Duration: "8" },
    ]);
    expect(ruoli.get("Duration")).toBe("durata");
  });
});
