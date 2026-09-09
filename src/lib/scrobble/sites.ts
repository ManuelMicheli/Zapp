import { parseMedia } from "./parse";
import type { ParsedMedia, RawEvent, Site } from "./types";

// Dominio -> sito -> provider TMDB, e da un evento grezzo a cosa significa.
// Puro: nessuna rete, nessuno stato. Netflix è l'unico sito confermato da una
// sonda vera (2026-09-09, `__fixtures__/netflix.json`): Netflix non popola
// `navigator.mediaSession` (title/artist/album nulli, playbackState sempre
// "none"), quindi il titolo viene dal DOM. Prime/Disney+/NOW non hanno ancora
// una sonda: restano sulla mediaSession standard finché una fixture non dice
// il contrario (fasi 2-3 della spec).

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
    host = new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
  return HOSTS[host] ?? null;
}

/**
 * Il percorso della pagina "si sta guardando", per sito. Solo quello di
 * Netflix è confermato dalla sonda: fuori da `/watch/` ci sono `<video>` veri
 * (le anteprime che partono da sole sfogliando il catalogo, che arrivano al
 * 100% da sole) e vanno sempre ignorati. Gli altri tre sono provvisori — come
 * i package NOW in `platforms.ts` — e vanno confermati con una sonda quando
 * tocca a quei siti (fasi 2-3 della spec).
 */
const WATCH_PATH: Record<Site, RegExp> = {
  netflix: /^\/watch\/(\d+)/,
  prime: /^\/(?:region\/[a-z-]+\/)?detail\/([A-Za-z0-9]+)/i,
  disney: /^\/play\/([A-Za-z0-9-]+)/i,
  now: /^\/watch\/([A-Za-z0-9-]+)/i,
};

/** L'id stabile dell'episodio o del film dentro l'url di riproduzione, o null. */
export function watchIdFromUrl(site: Site, url: string): string | null {
  let pathname: string;
  try {
    pathname = new URL(url).pathname;
  } catch {
    return null;
  }
  return pathname.match(WATCH_PATH[site])?.[1] ?? null;
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

  const { show, detail, kind } = FIELDS[event.site](event);
  if (!show || !show.trim()) return null;

  const parsed = parseMedia(show, detail, kind);
  return parsed.kind === "unknown" ? null : parsed;
}
