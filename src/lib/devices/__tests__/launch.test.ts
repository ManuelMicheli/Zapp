import { describe, expect, it } from "vitest";
import { formaDiLancio } from "../launch";

describe("forma di lancio per piattaforma", () => {
  it("Netflix: l'id finisce nell'extra, non nell'URL", () => {
    // La sonda del 12/09: https://www.netflix.com/watch/<id> apre l'app e si
    // ferma alla home. Avvia solo l'extra `amzn_deeplink_data`.
    expect(formaDiLancio(8, "https://www.netflix.com/title/81234567")).toEqual({
      packages: ["com.netflix.ninja", "com.netflix.mediaclient"],
      dataUri: null,
      extraDeeplink: "81234567",
      esito: "avvia",
    });
  });

  it("Netflix: accetta anche la forma /watch/", () => {
    expect(
      formaDiLancio(8, "https://www.netflix.com/watch/70242311")?.extraDeeplink,
    ).toBe("70242311");
  });

  it("Disney+: play avvia, browse no, stesso uuid", () => {
    const uuid = "a3f1c2d4-0e5b-4a6c-8d9e-1f2a3b4c5d6e";
    expect(
      formaDiLancio(337, `https://www.disneyplus.com/browse/entity-${uuid}`),
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
      formaDiLancio(337, `https://www.disneyplus.com/legal/play/${uuid}`),
    ).toBeNull();
    // Verifica che i casi legittimi continuino a funzionare
    expect(formaDiLancio(337, `https://www.disneyplus.com/play/${uuid}`)?.dataUri).toBe(
      `https://www.disneyplus.com/play/${uuid}`,
    );
  });

  it("Prime Video: apre la scheda, e lo dichiara", () => {
    const gti = "amzn1.dv.gti.abcdef12-3456-7890-abcd-ef1234567890";
    const forma = formaDiLancio(119, `https://app.primevideo.com/detail?gti=${gti}`);
    expect(forma?.esito).toBe("scheda");
    expect(forma?.dataUri).toBe(`https://app.primevideo.com/detail?gti=${gti}`);
    expect(forma?.packages).toContain("com.amazon.firebat");
  });

  it("NOW: apre l'app e basta, anche senza id", () => {
    expect(formaDiLancio(39, null)).toEqual({
      packages: ["com.nowtv.it"],
      dataUri: null,
      extraDeeplink: null,
      esito: "app",
    });
  });

  it("una piattaforma che non sappiamo lanciare non si inventa", () => {
    expect(formaDiLancio(350, "https://tv.apple.com/it/movie/x/umc.cmc.1")).toBeNull();
    expect(formaDiLancio(1899, "https://example.com")).toBeNull();
  });

  it("un URL di un'altra piattaforma non passa per buono", () => {
    // Il link viene dal database, ma un dato sbagliato non deve produrre un
    // intent verso il pacchetto sbagliato.
    expect(formaDiLancio(8, "https://www.disneyplus.com/play/abc")).toBeNull();
    expect(formaDiLancio(337, "http://www.disneyplus.com/play/abc")).toBeNull();
  });

  it("Netflix senza id non parte: meglio niente che la home", () => {
    expect(formaDiLancio(8, "https://www.netflix.com/browse")).toBeNull();
  });
});
