/**
 * Come si apre un titolo su una TV, per piattaforma.
 *
 * Pura: prende l'id della piattaforma e il link che sta in
 * `title_provider_links` (fonte `justwatch`) e restituisce cosa mandare alla TV.
 * Le forme sono **misurate**, non dedotte — sonda del 12/09/2026, §3:
 *
 * - **Netflix**: l'URL non basta. `netflix.com/watch/<id>`, `netflix://` e
 *   `nflx://` aprono l'app e si fermano alla home. Avvia solo l'extra
 *   `amzn_deeplink_data` con l'id nudo — verificato due volte, il 12/09 dalla
 *   sonda e il 13/09 sul televisore (Fight Club partito e arrivato a 5:16).
 *   Il 13/09 questa forma e' stata cambiata per sbaglio in `watch/<id>`
 *   fidandosi di un `state=3` che era **l'anteprima della home**, non il film:
 *   non ricascarci, la sessione di Netflix suona anche quando sei fermo sulla
 *   home, e non distingue un film da un trailer.
 * - **Disney+**: conta il percorso. `play/<uuid>` avvia, `browse/entity-<uuid>`
 *   apre la scheda. Stesso uuid: si riscrive.
 * - **Prime Video**: apre la scheda, e da li' serve un Play col telecomando.
 * - **NOW**: non si lancia affatto — non espone nessun modo di arrivare a un
 *   titolo (il perche', misurato, sta sul ritorno `null` in fondo).
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
export const PROVIDER_LANCIABILI = [8, 119, 337];

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
      /^\/(?:play|browse\/entity)-?\/?([0-9a-f-]{36})\/?$/i,
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

  // NOW (39) non si lancia, e non e' una taratura: misurato sul televisore il
  // 13/09, l'app espone due sole activity (quella di avvio e quella del tv
  // input) e nessun filtro `VIEW` — un ACTION_VIEW sul link vero di NOW
  // risponde "unable to resolve Intent", e il protocollo Amazon delle
  // capacita' (`com.amazon.device.REQUEST_CAPABILITIES`) risponde al launcher
  // di Amazon, non a noi. L'unica cosa possibile era aprire l'app dove si
  // trovava: sullo schermo compariva la pagina di un altro titolo, che sembra
  // un guasto. E non serviva nemmeno all'identita': NOW pubblica il titolo di
  // cio' che riproduce, quindi si riconosce da sola senza essere lanciata.
  return null;
}
