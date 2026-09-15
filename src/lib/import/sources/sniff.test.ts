import { describe, expect, it } from "vitest";
import {
  dataLeggibile,
  durataSec,
  profilaColonne,
  scalaVotoDalNome,
  sembraData,
  unitaDurata,
} from "./sniff";

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

describe("unitaDurata", () => {
  it("prende l'unita' dal nome quando il nome la dichiara", () => {
    expect(unitaDurata("Minutes watched", ["22", "45", "58"])).toBe("minuti");
    expect(unitaDurata("Ore di visione", ["1", "2"])).toBe("ore");
    expect(unitaDurata("Seconds played", ["1800", "2400"])).toBe("secondi");
  });

  it("senza nome che parla, decide la mediana", () => {
    // 22/45/58 non possono essere secondi di visione: sono minuti
    expect(unitaDurata("c3", ["22", "45", "58"])).toBe("minuti");
    expect(unitaDurata("c3", ["1800", "2400", "3600"])).toBe("secondi");
  });

  it("l'unita' moltiplica solo i numeri nudi, mai un orologio", () => {
    expect(durataSec("45", "minuti")).toBe(2700);
    expect(durataSec("2", "ore")).toBe(7200);
    // "00:45:00" e' gia' in secondi per costruzione
    expect(durataSec("00:45:00", "minuti")).toBe(2700);
  });

  it("legge i millisecondi quando il nome li dichiara", () => {
    // senza l'unita', 45000 "secondi" sono mezza giornata e passano il filtro
    // anti-anteprima: sono invece 45 secondi, cioe' un trailer
    expect(unitaDurata("Playback duration (ms)", ["45000"])).toBe("millisecondi");
    expect(durataSec("45000", "millisecondi")).toBe(45);
    expect(durataSec("3600000", "millisecondi")).toBe(3600);
  });
});

describe("scalaVotoDalNome", () => {
  it("legge la scala quando l'intestazione la scrive", () => {
    expect(scalaVotoDalNome("Voto /10")).toBe(10);
    expect(scalaVotoDalNome("Stars")).toBe(5);
    expect(scalaVotoDalNome("Valutazione su 100")).toBe(100);
    expect(scalaVotoDalNome("Rating")).toBeNull();
  });
});

describe("sembraData", () => {
  it("accetta le forme che gli export usano davvero", () => {
    expect(sembraData("2026-09-15")).toBe(true);
    expect(sembraData("15/09/2026")).toBe(true);
    expect(sembraData("2026-09-15T21:04:00Z")).toBe(true);
  });

  it("da sola non prende per date i numeri: un epoch va dichiarato", () => {
    // `sembraData` e' la forma stretta, quella del punteggio per contenuto:
    // un numero a dieci o tredici cifre e' molto piu' spesso un
    // identificativo. Gli epoch li accetta `dataLeggibile`, dove e'
    // l'intestazione a dire che quella colonna e' una data.
    expect(sembraData("1789506840")).toBe(false);
    expect(dataLeggibile("1789506840")).toBe(true);
    expect(dataLeggibile("1789506840000")).toBe(true);
  });

  it("dataLeggibile copre quello che il parser vero sa leggere", () => {
    expect(dataLeggibile("2026/09/15")).toBe(true);
    expect(dataLeggibile("15.09.2026")).toBe(true);
    expect(dataLeggibile("2026-09-15T21:14:00.000Z")).toBe(true);
    expect(dataLeggibile("ieri sera")).toBe(false);
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

  it("non fa diventare voto una classificazione per eta'", () => {
    const ruoli = profilaColonne([
      { Title: "Dune", "Maturity Rating": "14" },
      { Title: "Up", "Maturity Rating": "6" },
    ]);
    expect(ruoli.get("Maturity Rating")).toBeUndefined();
    expect([...ruoli.values()]).not.toContain("voto");
  });

  it("ignora anche le classificazioni scritte all'italiana", () => {
    const ruoli = profilaColonne([
      { Titolo: "Dune", Classificazione: "VM14", "Eta' consigliata": "14" },
    ]);
    expect([...ruoli.values()]).not.toContain("voto");
  });

  it("profila sull'unione delle chiavi, non sulla prima riga", () => {
    // forma normale di un JSON: i campi vuoti si omettono. Col film in cima,
    // season/episode non esistevano per nessuna riga e le serie entravano
    // come film.
    const ruoli = profilaColonne([
      { title: "Dune", date: "2026-09-01" },
      { title: "The Bear", date: "2026-09-02", season: "2", episode: "5" },
    ]);
    expect(ruoli.get("season")).toBe("stagione");
    expect(ruoli.get("episode")).toBe("episodio");
  });

  it("rilascia una colonna che il nome dava per durata ma che contiene date", () => {
    // "Playback Date" combacia con la regex della durata (contiene `playback`),
    // che viene prima di quella della data: senza il controllo sui valori la
    // colonna della data restava orfana per tutto il file.
    const ruoli = profilaColonne([
      { Title: "Dune", "Playback Date": "2026-09-01" },
      { Title: "Arrival", "Playback Date": "2026-09-02" },
    ]);
    expect(ruoli.get("Playback Date")).toBe("data");
  });

  it("rilascia 'Last Played' alla data e lascia la durata alla sua colonna", () => {
    const ruoli = profilaColonne([
      { Title: "Dune", "Last Played": "2026-09-01", Seconds: "7200" },
      { Title: "Arrival", "Last Played": "2026-09-02", Seconds: "6600" },
    ]);
    expect(ruoli.get("Last Played")).toBe("data");
    expect(ruoli.get("Seconds")).toBe("durata");
  });

  it("tiene la data anche quando e' scritta con le barre", () => {
    // `splitDate` (il parser vero) legge 2026/09/15 benissimo: il gate del
    // passo per nome deve misurare quello, non una forma piu' stretta —
    // rilasciando la colonna il file smetteva di essere una cronologia e
    // veniva scartato tutto.
    const ruoli = profilaColonne([
      { Title: "Dune", Date: "2026/09/15" },
      { Title: "Arrival", Date: "2026/09/14" },
    ]);
    expect(ruoli.get("Date")).toBe("data");
  });

  it("un rilascio non puo' far sparire l'intera tabella", () => {
    // date illeggibili davvero: la colonna resta comunque al suo posto,
    // perche' senza di lei il file non sarebbe piu' una cronologia
    const ruoli = profilaColonne([
      { Title: "Dune", Date: "ieri sera" },
      { Title: "Arrival", Date: "l'altro ieri" },
    ]);
    expect(ruoli.get("Title")).toBe("titolo");
    expect(ruoli.get("Date")).toBe("data");
  });

  it("un numero a dieci cifre non e' una data se nessuno lo dichiara", () => {
    // gli epoch valgono solo dove l'intestazione dice che e' una data: per
    // contenuto, un numero anonimo e' molto piu' spesso un identificativo
    const ruoli = profilaColonne([
      { Nome: "Dune", Identificativo: "1789506840", Quando: "2026-09-15" },
      { Nome: "Arrival", Identificativo: "1789506841", Quando: "2026-09-14" },
      { Nome: "Sicario", Identificativo: "1789506842", Quando: "2026-09-13" },
    ]);
    // e nemmeno una durata: un epoch non e' ne' l'una ne' l'altra cosa
    expect(ruoli.get("Identificativo")).toBeUndefined();
    expect(ruoli.get("Quando")).toBe("data");
  });

  it("non da' il ruolo durata a una colonna che parla di anni", () => {
    // la mediana di "Watch Year" (2026) batte quella dei minuti veri: il ruolo
    // finiva li' e il filtro anti-anteprima smetteva di funzionare
    const ruoli = profilaColonne([
      { Title: "Chernobyl", "Watch Year": "2026", c3: "22" },
      { Title: "Dark", "Watch Year": "2025", c3: "45" },
      { Title: "The Wire", "Watch Year": "2024", c3: "58" },
    ]);
    expect(ruoli.get("Watch Year")).toBeUndefined();
    expect(ruoli.get("c3")).toBe("durata");
  });

  it("non prende per anno del titolo l'anno in cui e' stato visto", () => {
    const ruoli = profilaColonne([
      { Titolo: "Dune", "Watch Year": "2026" },
      { Titolo: "Arrival", "Watch Year": "2025" },
    ]);
    expect(ruoli.get("Watch Year")).not.toBe("anno");
    const italiano = profilaColonne([{ Titolo: "Dune", "Anno visione": "2026" }]);
    expect(italiano.get("Anno visione")).not.toBe("anno");
  });
});
