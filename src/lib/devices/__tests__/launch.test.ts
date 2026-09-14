import { describe, expect, it } from "vitest";
import { formaDiLancio } from "../launch";

describe("forma di lancio per piattaforma", () => {
  it("Netflix: l'id finisce nell'extra, non nell'URL", () => {
    // La sonda del 12/09, confermata sul televisore il 13/09: l'URL apre
    // l'app e si ferma (home o scheda). Avvia solo l'extra
    // `amzn_deeplink_data` con l'id nudo.
    expect(formaDiLancio(8, "https://www.netflix.com/title/81234567", "movie")).toEqual({
      packages: ["com.netflix.ninja", "com.netflix.mediaclient"],
      dataUri: null,
      extraDeeplink: "81234567",
      esito: "avvia",
    });
  });

  it("Netflix: accetta anche la forma /watch/", () => {
    expect(
      formaDiLancio(8, "https://www.netflix.com/watch/70242311", "movie")?.extraDeeplink,
    ).toBe("70242311");
  });

  it("Disney+: play avvia, browse no, stesso uuid", () => {
    const uuid = "a3f1c2d4-0e5b-4a6c-8d9e-1f2a3b4c5d6e";
    expect(
      formaDiLancio(337, `https://www.disneyplus.com/browse/entity-${uuid}`, "movie"),
    ).toEqual({
      packages: ["com.disney.disneyplus"],
      dataUri: `https://www.disneyplus.com/play/${uuid}`,
      extraDeeplink: null,
      esito: "avvia",
    });
  });

  it("Disney+: il percorso deve essere ancorato a /play o /browse/entity esatto, non in un punto qualsiasi", () => {
    // La forma misurata è /play/<uuid> esatto o /browse/entity-<uuid> esatto.
    // Un percorso come /legal/play/<uuid> non deve passare, anche se contiene play.
    const uuid = "a3f1c2d4-0e5b-4a6c-8d9e-1f2a3b4c5d6e";
    expect(
      formaDiLancio(337, `https://www.disneyplus.com/legal/play/${uuid}`, "movie"),
    ).toBeNull();
    // Verifica che i casi legittimi continuino a funzionare
    expect(formaDiLancio(337, `https://www.disneyplus.com/play/${uuid}`, "movie")?.dataUri).toBe(
      `https://www.disneyplus.com/play/${uuid}`,
    );
  });

  it("Disney+: una serie apre la scheda, non /play (errore 41)", () => {
    // Misurato sulla Fire TV il 14/09/2026 con Doctor Who: l'uuid del link di
    // JustWatch e' l'entita' della serie, e `play/<uuid>` non e' un contenuto
    // riproducibile — Disney+ risponde "Il supporto richiesto non e'
    // disponibile (codice errore 41)" e non apre niente.
    const uuid = "29965333-8179-4002-9228-b356a21b636a";
    expect(
      formaDiLancio(337, `https://www.disneyplus.com/play/${uuid}`, "tv"),
    ).toEqual({
      packages: ["com.disney.disneyplus"],
      dataUri: `https://www.disneyplus.com/browse/entity-${uuid}`,
      extraDeeplink: null,
      esito: "scheda",
    });
  });

  it("Netflix: per una serie la forma non cambia (l'id serie avvia lo stesso)", () => {
    // Misurato sulla Fire TV il 14/09/2026: con l'id della serie nell'extra
    // Netflix parte (schermo nero da DRM, sessione in riproduzione).
    expect(
      formaDiLancio(8, "https://www.netflix.com/title/81640730", "tv")?.esito,
    ).toBe("avvia");
  });

  it("Prime Video: apre la scheda, e lo dichiara", () => {
    const gti = "amzn1.dv.gti.abcdef12-3456-7890-abcd-ef1234567890";
    const forma = formaDiLancio(119, `https://app.primevideo.com/detail?gti=${gti}`, "movie");
    expect(forma?.esito).toBe("scheda");
    expect(forma?.dataUri).toBe(`https://app.primevideo.com/detail?gti=${gti}`);
    expect(forma?.packages).toContain("com.amazon.firebat");
  });

  it("NOW non si lancia, nemmeno col suo link vero", () => {
    // Misurato sul televisore il 13/09: l'app NOW espone due sole activity e
    // nessun filtro `VIEW`, quindi non c'e' modo di arrivare a un titolo.
    // Prima si apriva l'app e basta, ma sullo schermo compariva la pagina di
    // un altro titolo — sembrava un guasto. NOW si riconosce da sola mentre
    // riproduce, quindi il lancio non serviva nemmeno all'identita'.
    expect(formaDiLancio(39, null, "movie")).toBeNull();
    expect(
      formaDiLancio(39, "https://www.nowtv.it/watch/asset/inception/R_618980_HD", "movie"),
    ).toBeNull();
  });

  it("una piattaforma che non sappiamo lanciare non si inventa", () => {
    expect(formaDiLancio(350, "https://tv.apple.com/it/movie/x/umc.cmc.1", "movie")).toBeNull();
    expect(formaDiLancio(1899, "https://example.com", "movie")).toBeNull();
  });

  it("un URL di un'altra piattaforma non passa per buono", () => {
    // Il link viene dal database, ma un dato sbagliato non deve produrre un
    // intent verso il pacchetto sbagliato.
    expect(formaDiLancio(8, "https://www.disneyplus.com/play/abc", "movie")).toBeNull();
    expect(formaDiLancio(337, "http://www.disneyplus.com/play/abc", "movie")).toBeNull();
  });

  it("Netflix senza id non parte: meglio niente che la home", () => {
    expect(formaDiLancio(8, "https://www.netflix.com/browse", "movie")).toBeNull();
  });
});
