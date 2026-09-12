/**
 * Come si apre un titolo su una TV, per piattaforma.
 *
 * Pura: prende l'id della piattaforma e il link che sta in
 * `title_provider_links` (fonte `justwatch`) e restituisce cosa mandare alla TV.
 * Le forme sono **misurate**, non dedotte — sonda del 12/09/2026, §3:
 *
 * - **Netflix**: l'URL non basta. `netflix.com/watch/<id>`, `netflix://` e
 *   `nflx://` aprono l'app e si fermano alla home. Avvia solo l'extra
 *   `amzn_deeplink_data` con l'id nudo.
 * - **Disney+**: conta il percorso. `play/<uuid>` avvia, `browse/entity-<uuid>`
 *   apre la scheda. Stesso uuid: si riscrive.
 * - **Prime Video**: apre la scheda, e da li' serve un Play col telecomando.
 * - **NOW**: apre la home e non centra il titolo. Si lancia lo stesso perche'
 *   NOW poi si identifica da sola (pubblica il titolo dell'episodio).
 *
 * `packages` e' in ordine di preferenza: la stessa piattaforma ha nomi diversi
 * su Fire OS e su Android TV, e quale sia installato lo sa solo il dispositivo.
 */
export interface FormaLancio {
  packages: string[];
  dataUri: string | null;
  extraDeeplink: string | null;
  /** Cosa succedera' davvero: serve al testo del bottone. */
  esito: "avvia" | "scheda" | "app";
}

/** Le piattaforme che sappiamo lanciare **e** le cui sessioni l'ingest riceve. */
export const PROVIDER_LANCIABILI = [8, 39, 119, 337];

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function urlSicuro(raw: string | null, hostAtteso: string): URL | null {
  if (!raw) return null;
  try {
    const u = new URL(raw);
    // Solo https e solo il dominio giusto: il link viene dal database, ma un
    // dato sbagliato non deve produrre un intent verso il pacchetto sbagliato.
    if (u.protocol !== "https:" || u.hostname !== hostAtteso) return null;
    return u;
  } catch {
    return null;
  }
}

export function formaDiLancio(
  providerId: number,
  url: string | null,
): FormaLancio | null {
  if (providerId === 8) {
    const u = urlSicuro(url, "www.netflix.com");
    const id = u?.pathname.match(/^\/(?:title|watch)\/(\d{1,12})\/?$/)?.[1];
    // Senza id l'app si apre sulla home: meglio non offrire il lancio affatto.
    if (!id) return null;
    return {
      packages: ["com.netflix.ninja", "com.netflix.mediaclient"],
      dataUri: null,
      extraDeeplink: id,
      esito: "avvia",
    };
  }

  if (providerId === 337) {
    const u = urlSicuro(url, "www.disneyplus.com");
    const uuid = u?.pathname.match(
      /\/(?:play|browse\/entity)-?\/?([0-9a-f-]{36})\/?$/i,
    )?.[1];
    if (!uuid || !UUID.test(uuid)) return null;
    return {
      packages: ["com.disney.disneyplus"],
      dataUri: `https://www.disneyplus.com/play/${uuid}`,
      extraDeeplink: null,
      esito: "avvia",
    };
  }

  if (providerId === 119) {
    const u = urlSicuro(url, "app.primevideo.com");
    const gti = u?.searchParams.get("gti");
    if (!gti || !/^amzn1\.dv\.gti\.[a-z0-9-]{10,100}$/i.test(gti)) return null;
    return {
      packages: [
        "com.amazon.firebat",
        "com.amazon.avod",
        "com.amazon.avod.thirdpartyclient",
      ],
      dataUri: `https://app.primevideo.com/detail?gti=${gti}`,
      extraDeeplink: null,
      esito: "scheda",
    };
  }

  if (providerId === 39) {
    // NOW non centra il titolo comunque: si apre l'app, il resto lo fa lei.
    return {
      packages: ["com.nowtv.it"],
      dataUri: null,
      extraDeeplink: null,
      esito: "app",
    };
  }

  return null;
}
