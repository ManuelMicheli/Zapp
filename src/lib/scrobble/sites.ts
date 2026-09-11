import { parsePrimeMedia } from "./providers/prime";
import { parseDisneyMedia } from "./providers/disney";
import { parseNowMedia } from "./providers/now";
import { parseMedia } from "./parse";
import type { ParsedMedia, RawEvent, Site } from "./types";

// Dominio -> sito -> provider TMDB, e da un evento grezzo a cosa significa.
// Netflix e Prime usano il DOM osservato nelle fixture. Prime round 2 separa
// titolo e dettaglio episodio; i numeri vengono verificati su TMDB nell'ingest.
// NOW usa le fixture 0.2.2 (VOD, clock contenuto, annunci esclusi). Disney+ usa slot e countdown osservati nelle sonde.

/** Dominio (senza www) -> sito. */
const HOSTS: Record<string, Site> = {
  "netflix.com": "netflix",
  "primevideo.com": "prime",
  "amazon.it": "prime",
  "disneyplus.com": "disney",
  "nowtv.it": "now",
};

/** id TMDB dei provider, gli stessi di PROVIDERS in src/lib/config.ts. */
export const PROVIDER_ID_BY_SITE: Record<Site, number> = {
  netflix: 8,
  prime: 119,
  disney: 337,
  now: 39,
};

export function siteFromUrl(url: string): Site | null {
  let host: string;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.port)
      return null;
    host = parsed.hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
  return HOSTS[host] ?? null;
}

/**
 * Solo i percorsi osservati nei player: /watch/ Netflix e /detail/ Prime.
 * Il catalogo contiene video di anteprima e viene sempre ignorato.
 * Il dettaglio Prime puo' restare uguale fra episodi: l'identita include il DOM.
 */
const WATCH_PATH: Partial<Record<Site, RegExp>> = {
  netflix: /^\/watch\/(\d+)/,
  prime: /^\/detail\/([A-Z0-9]+)(?:\/|$)/,
  now: /^\/watch\/playback\/vod\/(?:_|R_\d+(?:_HD)?)\/(R_\d+_HD)\/?$/,
  disney: /^\/it-it\/play\/([a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12})\/?$/,
};

/** Id della pagina player, o null. Su Prime non identifica il singolo episodio. */
export function watchIdFromUrl(site: Site, url: string): string | null {
  if (siteFromUrl(url) !== site) return null;
  if (
    site === "prime" &&
    !["primevideo.com", "www.primevideo.com"].includes(new URL(url).hostname)
  )
    return null;
  const pattern = WATCH_PATH[site];
  if (!pattern) return null;
  let pathname: string;
  try {
    pathname = new URL(url).pathname;
  } catch {
    return null;
  }
  return pathname.match(pattern)?.[1] ?? null;
}

export function isWatchUrl(site: Site, url: string): boolean {
  return watchIdFromUrl(site, url) !== null;
}

/**
 * `show`/`detail` da un evento Netflix. Tre fonti, in ordine di fiducia:
 *
 * 1. `pauseText` (pannello di pausa `pause-ad-title-display`): porta stagione,
 *    episodio e nome espliciti insieme (`S1:E23 "Episodio 23"\n20 minuti
 *    restanti`) — si tiene solo la prima riga, la seconda è il tempo restante.
 *    Presente o no, non dipende da `event.state`: nella fixture compare anche
 *    in un evento non in pausa (l'autoplay del prossimo episodio).
 * 2. `showText` da solo (niente pausa): `[data-uia="video-title"]` intero
 *    incolla senza separatori l'h4 (il nome, che è anche `showText`) e lo span
 *    dell'episodio ("...Fighting!E23Episodio 23"); togliendo il prefisso noto
 *    resta "E23Episodio 23", che `parseMedia` sa leggere.
 * 3. Né l'uno né l'altro, solo `titleText`: è un film (l'h4 dentro
 *    `[data-uia="video-title"]` esiste **solo** nelle serie) — oppure il
 *    battito in cui i comandi del player sono nascosti e l'estensione ha
 *    rimandato l'ultimo titolo noto per quell'id `/watch/`: in entrambi i
 *    casi non c'è un "dettaglio" da leggere.
 */
function netflixFields(e: RawEvent): Fields {
  // `showText` è l'h4 dentro `[data-uia="video-title"]`, che su Netflix esiste
  // **solo nelle serie**: la sua presenza è una prova, non un indizio, e vale
  // anche nei battiti in cui il codice dell'episodio non è leggibile. Senza
  // dirlo qui, `parseMedia` deduceva il tipo dal solo dettaglio e una serie
  // senza dettaglio passava per film: la ricerca partiva su `search/movie`,
  // dove quella serie non poteva esserci, e non si riconosceva mai.
  if (e.showText && e.pauseText) {
    const firstLine = e.pauseText.split("\n")[0] ?? null;
    return { show: e.showText, detail: firstLine, kind: "tv" };
  }
  if (e.showText) {
    const residual =
      e.titleText && e.titleText.startsWith(e.showText)
        ? e.titleText.slice(e.showText.length)
        : null;
    return { show: e.showText, detail: residual, kind: "tv" };
  }
  // Nessun h4: quasi sempre un film. "Quasi", perché è anche il primissimo
  // battito di una serie, prima che i comandi del player siano mai comparsi.
  // Perciò è un'ipotesi e non una certezza: `matchTitle` prova comunque
  // l'altro tipo se su questo non trova niente.
  return { show: e.titleText, detail: null, kind: "movie" };
}

/**
 * Su Prime/Disney+/NOW, in assenza di una sonda, si legge `navigator.
 * mediaSession` nella sua forma standard: `artist` è l'opera, `title` il
 * dettaglio (episodio o niente per un film).
 */
function mediaSessionFields(e: RawEvent): Fields {
  // Qui il tipo non lo sappiamo: `artist` valorizzato di solito è una serie, ma
  // nessuna sonda l'ha confermato per questi siti. Nessun suggerimento: decide
  // il dettaglio, come prima.
  return e.artist
    ? { show: e.artist, detail: e.title, kind: null }
    : { show: e.title, detail: null, kind: null };
}

/** Cosa il sito sa dire di un evento: l'opera, il dettaglio e — se lo sa — il tipo. */
type Fields = {
  show: string | null;
  detail: string | null;
  kind: "movie" | "tv" | null;
};

const FIELDS: Record<Site, (e: RawEvent) => Fields> = {
  netflix: netflixFields,
  prime: mediaSessionFields,
  disney: mediaSessionFields,
  now: mediaSessionFields,
};

/**
 * Da un evento grezzo a cosa significa, o `null` quando non c'è niente da
 * riferire: fuori da `/watch/` (anteprime del catalogo, sempre ignorate),
 * oppure dentro `/watch/` ma senza ancora un titolo noto per quell'id (il
 * battito in cui l'autoplay ha già cambiato id ma il `<video>` non è arrivato
 * — vedi fixture). Puro e senza stato: non ricorda niente fra una chiamata e
 * l'altra. È l'estensione, che osserva di continuo, a rimandare sempre le
 * ultime stringhe note per quell'id `/watch/` quando i selettori spariscono
 * (i comandi del player nascosti fanno sparire anche il titolo).
 */
export function parseEvent(event: RawEvent): ParsedMedia | null {
  if (!event.url || !isWatchUrl(event.site, event.url)) return null;

  if (event.site === "prime")
    return parsePrimeMedia({ titleText: event.titleText, detailText: event.pauseText });
  if (event.site === "disney")
    return parseDisneyMedia({ titleText: event.titleText, detailText: event.pauseText });
  if (event.site === "now")
    return parseNowMedia({ titleText: event.titleText, detailText: event.pauseText });
  const { show, detail, kind } = FIELDS[event.site](event);
  if (!show || !show.trim()) return null;

  const parsed = parseMedia(show, detail, kind);
  return parsed.kind === "unknown" ? null : parsed;
}
