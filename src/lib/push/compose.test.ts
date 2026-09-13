import { describe, expect, it } from "vitest";
import { composePush } from "./compose";

/** Payload minimo di una notifica che cita un titolo. */
const TITOLO = { title_id: 603, media_type: "movie" };

describe("composePush", () => {
  it("richiesta di amicizia: titolo, testo e destinazione", () => {
    expect(
      composePush("friend_request", { from_user: "u1" }, { fromUser: "Ada" }),
    ).toEqual({
      title: "Nuova richiesta di amicizia",
      body: "Ada ti ha inviato una richiesta di amicizia",
      path: "/friends",
    });
  });

  it("senza nome del mittente scrive «Qualcuno»", () => {
    expect(composePush("friend_request", {}, {})?.body).toBe(
      "Qualcuno ti ha inviato una richiesta di amicizia",
    );
  });

  it("amicizia accettata porta agli amici (il push non ha lo username)", () => {
    expect(
      composePush("friend_accepted", { from_user: "u1" }, { fromUser: "Ada" }),
    ).toEqual({
      title: "Amicizia accettata",
      body: "Ada ha accettato la tua richiesta",
      path: "/friends",
    });
  });

  it("consiglio col titolo apre la scheda", () => {
    expect(
      composePush("recommendation", TITOLO, { fromUser: "Ada", titolo: "Matrix" }),
    ).toEqual({
      title: "Un consiglio per te",
      body: "Ada ti ha consigliato Matrix",
      path: "/title/movie/603",
    });
  });

  it("consiglio senza titolo noto resta generico e apre la home", () => {
    expect(composePush("recommendation", {}, { fromUser: "Ada" })).toEqual({
      title: "Un consiglio per te",
      body: "Ada ti ha consigliato un titolo",
      path: "/",
    });
  });

  it("mi piace col titolo e senza", () => {
    expect(composePush("like", TITOLO, { fromUser: "Ada", titolo: "Matrix" })).toEqual({
      title: "Mi piace",
      body: "Ada ha messo mi piace alla tua attività su Matrix",
      path: "/title/movie/603",
    });
    expect(composePush("like", {}, { fromUser: "Ada" })).toEqual({
      title: "Mi piace",
      body: "Ada ha messo mi piace a una tua attività",
      path: "/friends",
    });
  });

  it("commento: la pagina delle recensioni non esiste, si apre la home", () => {
    expect(composePush("comment", TITOLO, { fromUser: "Ada", titolo: "Matrix" })).toEqual(
      {
        title: "Nuovo commento",
        body: "Ada ha commentato la tua recensione di Matrix",
        path: "/",
      },
    );
    expect(composePush("comment", {}, {})?.body).toBe(
      "Qualcuno ha commentato la tua recensione",
    );
  });

  it("contenuto nascosto: il nome del contenuto viene da target_type", () => {
    expect(
      composePush(
        "content_hidden",
        { ...TITOLO, target_type: "review" },
        { titolo: "Matrix" },
      ),
    ).toEqual({
      title: "Contenuto non più visibile",
      body: "La tua recensione su Matrix non è più visibile: ha ricevuto tre segnalazioni.",
      path: "/title/movie/603",
    });
  });

  it("contenuto nascosto di tipo ignoto: «Un tuo contenuto»", () => {
    expect(composePush("content_hidden", { target_type: "boh" }, {})).toEqual({
      title: "Contenuto non più visibile",
      body: "Un tuo contenuto non è più visibile: ha ricevuto tre segnalazioni.",
      path: "/",
    });
  });

  it("segnalazione accolta, con e senza titolo", () => {
    expect(composePush("report_outcome", TITOLO, { titolo: "Matrix" })).toEqual({
      title: "Segnalazione accolta",
      body: "Abbiamo accolto la tua segnalazione: il contenuto su Matrix non è più visibile.",
      path: "/title/movie/603",
    });
    expect(composePush("report_outcome", {}, {})).toEqual({
      title: "Segnalazione accolta",
      body: "Abbiamo accolto la tua segnalazione: il contenuto non è più visibile.",
      path: "/",
    });
  });

  it("un title_id che non è un intero positivo non finisce mai nel percorso", () => {
    // "12" compreso: il payload viene dal database, dove l'id è un numero; una
    // stringa qui vuol dire dato sporco, e la si tratta come mancante.
    for (const brutto of ["../admin", "12", null, 0, -3, 1.5]) {
      const messaggio = composePush(
        "recommendation",
        { title_id: brutto, media_type: "movie" },
        { fromUser: "Ada", titolo: "Matrix" },
      );
      expect(messaggio?.path).toBe("/");
    }
  });

  it("un media_type diverso da movie/tv non finisce nel percorso", () => {
    expect(
      composePush(
        "recommendation",
        { title_id: 603, media_type: "person" },
        { fromUser: "Ada" },
      )?.path,
    ).toBe("/");
  });

  it("un kind sconosciuto non diventa un push", () => {
    expect(composePush("qualcosa_di_nuovo", {}, {})).toBeNull();
    expect(composePush("", {}, {})).toBeNull();
  });
});
