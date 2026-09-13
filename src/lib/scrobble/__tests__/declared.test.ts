import { describe, expect, it } from "vitest";
import { dichiarazioneValida, type Dichiarazione } from "../declared";

const BASE: Dichiarazione = {
  titleId: 603,
  mediaType: "movie",
  deliveredAt: "2026-09-12T20:00:00.000Z",
  lastPositionMs: null,
  lastSeenAt: null,
};

const fra = (min: number) =>
  new Date(Date.parse(BASE.deliveredAt) + min * 60_000).toISOString();

describe("quando un lancio da' ancora il nome a cio' che la TV riferisce", () => {
  it("la prima sessione dopo il lancio vale", () => {
    expect(dichiarazioneValida(BASE, 130_000, fra(3))).toBe(true);
  });

  it("lanci e vai a cena: dopo mezz'ora senza riprodurre nulla, cade", () => {
    expect(dichiarazioneValida(BASE, 130_000, fra(31))).toBe(false);
  });

  it("mentre guardi resta valida, un battito dopo l'altro", () => {
    const d = { ...BASE, lastPositionMs: 1_200_000, lastSeenAt: fra(20) };
    expect(dichiarazioneValida(d, 1_230_000, fra(20.5))).toBe(true);
  });

  it("ti alzi e torni dopo venti minuti: e' ancora quel film", () => {
    const d = { ...BASE, lastPositionMs: 1_200_000, lastSeenAt: fra(20) };
    expect(dichiarazioneValida(d, 1_260_000, fra(40))).toBe(true);
  });

  it("torni dopo un'ora: non sappiamo piu' cosa stai guardando", () => {
    const d = { ...BASE, lastPositionMs: 1_200_000, lastSeenAt: fra(20) };
    expect(dichiarazioneValida(d, 1_260_000, fra(85))).toBe(false);
  });

  it("un riavvolgimento resta legittimo", () => {
    // Dieci minuti indietro per rivedere una scena: succede.
    const d = { ...BASE, lastPositionMs: 1_800_000, lastSeenAt: fra(30) };
    expect(dichiarazioneValida(d, 1_200_000, fra(31))).toBe(true);
  });

  it("da un'ora a trenta secondi hai cambiato titolo", () => {
    const d = { ...BASE, lastPositionMs: 3_600_000, lastSeenAt: fra(60) };
    expect(dichiarazioneValida(d, 30_000, fra(61))).toBe(false);
  });

  it("da 5 minuti a 2:30: e' un cambio, non un riavvolgimento", () => {
    // Sostituisce un test che usava una posizione nuova di 30 secondi: quella
    // posizione non puo' mai arrivare a dichiarazioneValida, perche'
    // riproduzioneVera (android.ts) scarta ogni evento sotto i due minuti
    // (SOGLIA_ANTEPRIMA_MS) prima che la rotta chiami questa funzione.
    // Proteggeva uno stato irraggiungibile in produzione. Con un valore che
    // puo' davvero arrivare (2:30, sopra la soglia anti-anteprima), il salto
    // indietro (2:30) supera la tolleranza di 60s: e' il cambio di film.
    const d = { ...BASE, lastPositionMs: 300_000, lastSeenAt: fra(5) };
    expect(dichiarazioneValida(d, 150_000, fra(6))).toBe(false);
  });

  it("da 5 minuti a 4:30: riavvolgimento breve, resta valido", () => {
    // Stesso punto di partenza del test precedente, ma con un riavvolgimento
    // di soli 30 secondi (sotto la tolleranza): non e' un cambio di film.
    const d = { ...BASE, lastPositionMs: 300_000, lastSeenAt: fra(5) };
    expect(dichiarazioneValida(d, 270_000, fra(6))).toBe(true);
  });

  it("uno solo fra lastSeenAt e lastPositionMs valorizzato tratta come sospetto", () => {
    // lastPositionMs valorizzato, lastSeenAt null: sospetto, false
    const d1 = { ...BASE, lastPositionMs: 1_800_000, lastSeenAt: null };
    expect(dichiarazioneValida(d1, 900_000, fra(10))).toBe(false);

    // lastSeenAt valorizzato, lastPositionMs null: sospetto, false
    const d2 = { ...BASE, lastPositionMs: null, lastSeenAt: fra(10) };
    expect(dichiarazioneValida(d2, 900_000, fra(15))).toBe(false);
  });
});

describe("valori non parsabili come date", () => {
  it("adesso non parsabile ritorna false", () => {
    expect(dichiarazioneValida(BASE, 130_000, "non-una-data")).toBe(false);
  });

  it("deliveredAt non parsabile ritorna false", () => {
    const d = { ...BASE, deliveredAt: "non-una-data" };
    expect(dichiarazioneValida(d, 130_000, fra(3))).toBe(false);
  });

  it("lastSeenAt non parsabile ritorna false", () => {
    const d = { ...BASE, lastSeenAt: "non-una-data", lastPositionMs: 1_200_000 };
    expect(dichiarazioneValida(d, 900_000, fra(10))).toBe(false);
  });
});

describe("confini esatti delle soglie", () => {
  it("a esattamente 30 minuti dalla consegna e' ancora valido", () => {
    expect(dichiarazioneValida(BASE, 130_000, fra(30))).toBe(true);
  });

  it("a 30 minuti e un secondo dalla consegna non e' piu' valido", () => {
    expect(dichiarazioneValida(BASE, 130_000, fra(30.0167))).toBe(false);
  });

  it("ultima sessione a esattamente 30 minuti fa e' ancora valido", () => {
    const d = { ...BASE, lastPositionMs: 1_200_000, lastSeenAt: fra(20) };
    expect(dichiarazioneValida(d, 1_220_000, fra(50))).toBe(true);
  });

  it("ultima sessione a 30 minuti e un secondo fa non e' piu' valido", () => {
    const d = { ...BASE, lastPositionMs: 1_200_000, lastSeenAt: fra(20) };
    expect(dichiarazioneValida(d, 1_220_000, fra(50.0167))).toBe(false);
  });

  it("posizione esattamente a 5 minuti (INIZIO_MS) non scatta il cambio", () => {
    const d = {
      ...BASE,
      lastPositionMs: 600_000, // 10 minuti (dentro)
      lastSeenAt: fra(10),
    };
    // Esattamente al confine INIZIO_MS: ancora dentro, riavvolgimento legittimo
    expect(dichiarazioneValida(d, 300_000, fra(11))).toBe(true);
    // Sotto il confine: all'inizio, e' un cambio
    expect(dichiarazioneValida(d, 299_999, fra(11))).toBe(false);
  });

  it("piccolo disallineamento orologio (anticipo) resta valido entro la finestra", () => {
    // adesso è 3 secondi prima della consegna: tollerare (la TV ha orologio indietro)
    // Questo è il caso più frequente: due macchine diverse hanno orologi leggermente sfasati
    const adessoPrima = new Date(Date.parse(BASE.deliveredAt) - 3_000).toISOString();
    expect(dichiarazioneValida(BASE, 130_000, adessoPrima)).toBe(true);

    // Viene comunque rigettato se l'anticipo è assurdo (p.e. due ore nel passato)
    const adessoFarPast = new Date(
      Date.parse(BASE.deliveredAt) - 2 * 60 * 60 * 1_000,
    ).toISOString();
    expect(dichiarazioneValida(BASE, 130_000, adessoFarPast)).toBe(false);

    // Uguale con storico: piccolo anticipo resta valido
    const d = { ...BASE, lastPositionMs: 1_200_000, lastSeenAt: fra(59) };
    const adesso2 = new Date(Date.parse(fra(59)) - 5_000).toISOString();
    expect(dichiarazioneValida(d, 1_200_000, adesso2)).toBe(true);

    // Anticipo oltre la finestra: cade
    const adesso3 = new Date(Date.parse(fra(59)) - 35 * 60 * 1_000).toISOString();
    expect(dichiarazioneValida(d, 1_200_000, adesso3)).toBe(false);
  });
});

describe("autoplay: il titolo cambia senza che la posizione torni vicino a zero", () => {
  it("Netflix fa partire il film successivo: primo evento a 2 minuti dopo 45 non vale", () => {
    // E' lo scenario del bug del 13/09: `riproduzioneVera` in `android.ts`
    // scarta tutto sotto i 2 minuti (SOGLIA_ANTEPRIMA_MS), quindi il primo
    // evento del film nuovo che arriva a `titoloDichiarato` puo' avere
    // posizione esattamente 120.000 — mai sotto. Se INIZIO_MS coincidesse con
    // quella soglia (come prima), `positionMs < INIZIO_MS` sarebbe sempre
    // falsa qui e la dichiarazione del primo film si terrebbe il secondo.
    const d = { ...BASE, lastPositionMs: 2_700_000, lastSeenAt: fra(45) }; // 45 min
    expect(dichiarazioneValida(d, 120_000, fra(47))).toBe(false); // 2 min
  });

  it("salto all'indietro oltre venti minuti: e' un altro titolo anche lontano da zero", () => {
    // La TV non ha riferito per un po': si era a 45 minuti, si ricompare a 6.
    // Non e' vicino a zero (INIZIO_MS da solo non lo vedrebbe), ma il salto e'
    // troppo grande per essere un riavvolgimento.
    const d = { ...BASE, lastPositionMs: 2_700_000, lastSeenAt: fra(45) }; // 45 min
    expect(dichiarazioneValida(d, 360_000, fra(47))).toBe(false); // 6 min
  });

  it("un riavvolgimento normale di cinque minuti resta valido", () => {
    const d = { ...BASE, lastPositionMs: 2_700_000, lastSeenAt: fra(45) }; // 45 min
    expect(dichiarazioneValida(d, 2_400_000, fra(47))).toBe(true); // 40 min
  });
});

describe("cambio titolo subito dopo il lancio (bug del 13/09 su Fire TV)", () => {
  it("il caso vero misurato: da 5:16 a 2:27, cambio film col telecomando", () => {
    // Misurato su Fire TV il 13/09: "Fight Club" lanciato da Zapp, guardato
    // fino a 5:16 (316s), poi un altro film avviato dentro Netflix col
    // telecomando. Il secondo film e' arrivato a 147s e si e' visto
    // attribuire il nome del primo. La vecchia regola non cadeva perche'
    // richiedeva l'ultima posizione sopra DENTRO_MS (10 minuti): 316s e' sotto,
    // quindi la condizione non scattava mai.
    const d = { ...BASE, lastPositionMs: 316_000, lastSeenAt: fra(10) };
    expect(dichiarazioneValida(d, 147_000, fra(10.1))).toBe(false);
  });

  it("un cambio ancora piu' precoce: da 3:20 a 2:10", () => {
    const d = { ...BASE, lastPositionMs: 200_000, lastSeenAt: fra(10) };
    expect(dichiarazioneValida(d, 130_000, fra(10.1))).toBe(false);
  });

  it("un riavvolgimento breve sotto la tolleranza resta valido", () => {
    // Da 3:20 a 2:50: 30 secondi indietro, sotto i 60 di tolleranza. E'
    // ballonzolare della posizione fra un battito e l'altro, non un cambio.
    const d = { ...BASE, lastPositionMs: 200_000, lastSeenAt: fra(10) };
    expect(dichiarazioneValida(d, 170_000, fra(10.1))).toBe(true);
  });

  it("i battiti normali che avanzano restano validi anche vicino all'inizio", () => {
    const d = { ...BASE, lastPositionMs: 130_000, lastSeenAt: fra(2) };
    expect(dichiarazioneValida(d, 140_000, fra(2.2))).toBe(true);
  });
});

describe("continuita': la posizione non puo' correre piu' dell'orologio", () => {
  it("Netflix riprende un altro film piu' avanti: mezzo minuto di orologio, sei di film", () => {
    // Il limite scoperto sulla Fire TV il 13/09: Netflix riprende un titolo
    // gia' iniziato dal punto in cui l'avevi lasciato, quindi il cambio col
    // telecomando non produce nessun salto all'indietro. Qui si va avanti, e
    // troppo: 6 minuti di posizione in 30 secondi di orologio.
    const d = { ...BASE, lastPositionMs: 600_000, lastSeenAt: fra(10) };
    expect(dichiarazioneValida(d, 960_000, fra(10.5))).toBe(false);
  });

  it("salta la sigla: un minuto e mezzo avanti resta legittimo", () => {
    const d = { ...BASE, lastPositionMs: 600_000, lastSeenAt: fra(10) };
    expect(dichiarazioneValida(d, 720_000, fra(10.5))).toBe(true);
  });

  it("pausa lunga: l'orologio corre e la posizione no, e va bene", () => {
    // Gli eventi in pausa non arrivano mai qui (riproduzioneVera passa solo
    // playing): una pausa si vede come orologio avanti e posizione ferma. La
    // regola guarda solo il lato opposto.
    const d = { ...BASE, lastPositionMs: 600_000, lastSeenAt: fra(10) };
    expect(dichiarazioneValida(d, 610_000, fra(25))).toBe(true);
  });

  it("confine esatto della tolleranza in avanti", () => {
    const d = { ...BASE, lastPositionMs: 600_000, lastSeenAt: fra(10) };
    // 30s di orologio + 120s di tolleranza = 150s di avanzamento consentito.
    expect(dichiarazioneValida(d, 750_000, fra(10.5))).toBe(true);
    expect(dichiarazioneValida(d, 750_001, fra(10.5))).toBe(false);
  });

  it("orologio della TV in anticipo: il tempo trascorso non diventa negativo", () => {
    // Cinque secondi di anticipo: il trascorso vale zero, non -5s, quindi il
    // consentito resta la sola tolleranza. Un avanzamento oltre cade.
    const d = { ...BASE, lastPositionMs: 600_000, lastSeenAt: fra(10) };
    const anticipo = new Date(Date.parse(fra(10)) - 5_000).toISOString();
    expect(dichiarazioneValida(d, 720_000, anticipo)).toBe(true);
    expect(dichiarazioneValida(d, 721_000, anticipo)).toBe(false);
  });
});
