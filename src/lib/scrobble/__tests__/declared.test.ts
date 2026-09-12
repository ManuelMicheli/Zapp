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

  it("ma ricominciare da capo un film appena iniziato non e' un cambio", () => {
    // Eravamo a 5 minuti: tornare a 30 secondi e' un riavvolgimento, non un
    // titolo nuovo. La regola guarda entrambi i lati, non solo la posizione nuova.
    const d = { ...BASE, lastPositionMs: 300_000, lastSeenAt: fra(5) };
    expect(dichiarazioneValida(d, 30_000, fra(6))).toBe(true);
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
