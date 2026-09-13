/**
 * Da quel che arriva dal foglio "Condividi" (un URL, un testo, o tutti e due) a
 * un bersaglio che il risolutore sa cercare. Funzioni pure: nessuna rete,
 * nessun `server-only`, nessun accesso al DB — qui si decide solo *cosa* cercare.
 *
 * Le forme d'URL sono quelle che le app mettono davvero negli appunti: la
 * scheda, il player, oppure un testo promozionale col link in coda ("Guarda
 * Dark su Netflix https://…"). Dove la piattaforma ha un URL "di scheda" — lo
 * stesso che sta in `title_provider_links` — si torna a quella forma canonica
 * (per Netflix/Prime/Disney+ e' la scheda vera; per NOW e' la pagina di
 * riproduzione, l'unica forma che il catalogo abbia mai visto), perche' e' la
 * chiave con cui il risolutore trova il titolo senza chiamare TMDB; dove non
 * c'e' (gli slug Disney+ senza entity, JustWatch) o il link non risolve, si
 * ricade sul nome leggibile e la ricerca fa il resto.
 */
import { PROVIDER_ID_BY_SITE, siteFromUrl } from "@/lib/scrobble/sites";
import type { Site } from "@/lib/scrobble/types";

/** I provider per cui esiste un URL di scheda riconoscibile (id TMDB). */
export type ShareProviderId = 8 | 119 | 337 | 39;

export type SharedTarget =
  /**
   * Uno o due URL canonici "di scheda", nella stessa forma di
   * `title_provider_links`: quando la piattaforma ha piu' forme valide (Prime
   * col `gti` e con l'ASIN) si tengono entrambe, cosi' il risolutore prova
   * tutte e due invece di sceglierne una a caso. `fallback` c'e' solo dove
   * l'URL portava anche un nome leggibile (oggi solo NOW, dal suo slug): se
   * il link non risolve, il risolutore lo prova prima di arrendersi.
   */
  | {
      kind: "provider";
      providerId: ShareProviderId;
      urls: string[];
      fallback?: { query: string; year: number | null };
    }
  | { kind: "imdb"; imdbId: string }
  | { kind: "tmdb"; mediaType: "movie" | "tv"; id: number }
  | { kind: "text"; query: string; year: number | null };

/** Oltre questa lunghezza una query non e' piu' il nome di un titolo. */
const MAX_QUERY = 120;

// ============ URL ============

/** Primo http(s) dentro un testo: Netflix condivide "Guarda X su Netflix https://…". */
const URL_IN_TEXT = /https?:\/\/[^\s<>"']+/i;

/** Amazon vende Prime Video su ogni dominio nazionale, non solo `amazon.it`. */
const AMAZON_HOST = /^amazon\.[a-z]{2,3}(?:\.[a-z]{2})?$/;

const NETFLIX_TITLE =
  /^(?:\/[a-z]{2}(?:-[a-z]{2})?)?\/(?:title|watch)\/(\d{1,12})(?:\/|$)/i;
// L'id di dettaglio Prime sta in qualunque punto del percorso: `/detail/<id>` su
// primevideo.com, `/gp/video/detail/<id>` su amazon.<tld>. Dieci caratteri e' un
// ASIN, ma le schede Prime ne usano anche di piu' lunghi: si accettano entrambi.
const PRIME_DETAIL = /(?:^|\/)detail\/([A-Z0-9]{10,30})(?:\/|$)/;
/**
 * Il `gti` (global title id) e' quel che davvero sta in `title_provider_links`
 * per Prime (`app.primevideo.com/detail?gti=…`, 56 righe su 57): l'ASIN in
 * `/detail/<id>` non ha mai un riscontro li'. Si legge dal parametro di
 * query, non dall'href intera, per non inciampare in tracking che contenga
 * per caso la stessa sottostringa.
 */
const PRIME_GTI = /^amzn1\.dv\.gti\.[0-9a-f-]{10,60}$/i;
const DISNEY_UUID =
  /(?:^|\/)(?:browse\/entity-|play\/)([0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12})(?:\/|$)/i;
/** Le pagine `/movies/<slug>/<id>` non espongono l'entity id: resta il nome. */
const DISNEY_SLUG = /(?:^|\/)(?:movies|series)\/([a-z0-9-]+)\/[A-Za-z0-9]+(?:\/|$)/i;
const NOW_SLUG = /^\/watch\/(?:home\/)?asset\/([a-z0-9-]+)(?:\/|$)/i;
const IMDB_TITLE = /^\/title\/(tt\d{7,8})(?:\/|$)/i;
const TMDB_TITLE =
  /^(?:\/[a-z]{2}(?:-[a-z]{2})?)?\/(movie|tv)\/(\d{1,10})(?:-[^/]*)?(?:\/|$)/i;
const JUSTWATCH_TITLE = /^\/[a-z]{2}\/(?:film|serie-tv)\/([a-z0-9-]+)(?:\/|$)/i;

/** Solo http(s), senza credenziali ne' porta: quel che un'app condivide davvero. */
function safeUrl(raw: string): URL | null {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  if (url.username || url.password || url.port) return null;
  return url;
}

function hostOf(url: URL): string {
  return url.hostname.toLowerCase().replace(/^www\./, "");
}

/**
 * La piattaforma dell'URL. `siteFromUrl` e' la stessa mappa host→sito che usa
 * lo scrobble (un dominio sta scritto in un posto solo); accetta solo https,
 * quindi un link condiviso in http viene confrontato nella sua forma https.
 * `app.primevideo.com` (la scheda vera, quella con `gti=`) non e' nella mappa
 * dello scrobble — li' serve solo l'host del player — quindi si riconosce qui.
 */
function siteOf(url: URL, host: string): Site | null {
  const https = new URL(url.href);
  https.protocol = "https:";
  return (
    siteFromUrl(https.href) ??
    (host === "app.primevideo.com" || AMAZON_HOST.test(host) ? "prime" : null)
  );
}

/** Restringe l'id TMDB del provider senza `as`: la mappa resta l'unica fonte. */
function providerIdOf(site: Site): ShareProviderId | null {
  const id = PROVIDER_ID_BY_SITE[site];
  return id === 8 || id === 119 || id === 337 || id === 39 ? id : null;
}

function providerTarget(
  site: Site,
  urls: string[],
  fallback?: { query: string; year: number | null },
): SharedTarget | null {
  const providerId = providerIdOf(site);
  if (providerId === null || urls.length === 0) return null;
  return fallback
    ? { kind: "provider", providerId, urls, fallback }
    : { kind: "provider", providerId, urls };
}

/**
 * Prime ha due forme viste in giro: il `gti` (quella che sta davvero in
 * `title_provider_links`, va per prima) e l'ASIN di `/detail/<id>` (quella
 * che il resolver non trova ancora, ma costa niente tenerla come ripiego).
 */
function primeUrls(url: URL, path: string): string[] {
  const urls: string[] = [];
  const gti = url.searchParams.get("gti");
  if (gti && PRIME_GTI.test(gti))
    urls.push(`https://app.primevideo.com/detail?gti=${gti}`);
  const asin = path.match(PRIME_DETAIL)?.[1];
  if (asin) urls.push(`https://www.primevideo.com/detail/${asin}`);
  return urls;
}

/** Uno slug (`the-last-of-us`) e' gia' il nome del titolo, a trattini. */
function slugQuery(slug: string): { query: string; year: number | null } | null {
  const query = slug.replace(/-+/g, " ").replace(/\s+/g, " ").trim();
  return query.length === 0 ? null : { query: cut(query), year: null };
}

function slugTarget(slug: string): SharedTarget | null {
  const q = slugQuery(slug);
  return q ? { kind: "text", ...q } : null;
}

function targetFromUrl(raw: string): SharedTarget | null {
  const url = safeUrl(raw);
  if (!url) return null;
  const host = hostOf(url);
  const path = url.pathname;

  const site = siteOf(url, host);
  if (site === "netflix") {
    const id = path.match(NETFLIX_TITLE)?.[1];
    // Un id di `/watch/` puo' essere quello della scheda o di un episodio: si
    // prova comunque nella forma "titolo", sara' la risoluzione a decidere.
    return id ? providerTarget(site, [`https://www.netflix.com/title/${id}`]) : null;
  }
  if (site === "prime") {
    return providerTarget(site, primeUrls(url, path));
  }
  if (site === "disney") {
    const uuid = path.match(DISNEY_UUID)?.[1];
    if (uuid) {
      const canonical = `https://www.disneyplus.com/browse/entity-${uuid.toLowerCase()}`;
      return providerTarget(site, [canonical]);
    }
    const slug = path.match(DISNEY_SLUG)?.[1];
    return slug ? slugTarget(slug) : null;
  }
  if (site === "now") {
    const slug = path.match(NOW_SLUG)?.[1];
    if (!slug) return null;
    // La scheda vera: si tiene l'URL cosi' com'e' (senza query ne' frammento),
    // perche' e' esattamente la forma salvata in `title_provider_links` la
    // prima volta che qualcuno l'ha aperta da Zapp. Il nome ricavato dallo
    // slug viaggia con lei come `fallback`: se il link non risolve ancora
    // (titolo mai aperto da nessuno), il risolutore lo prova prima di
    // arrendersi (`senzaLink`, vedi resolve.ts) — e' lo stesso nome che prima
    // di questa scheda era l'unico bersaglio possibile per NOW.
    const fallback = slugQuery(slug) ?? undefined;
    return providerTarget(site, [`${url.origin}${path}`], fallback) ?? slugTarget(slug);
  }

  if (host === "imdb.com") {
    const imdbId = path.match(IMDB_TITLE)?.[1];
    return imdbId ? { kind: "imdb", imdbId: imdbId.toLowerCase() } : null;
  }
  if (host === "themoviedb.org") {
    const match = path.match(TMDB_TITLE);
    if (!match) return null;
    const id = Number(match[2]);
    if (!Number.isInteger(id) || id <= 0) return null;
    const mediaType = match[1].toLowerCase() === "tv" ? "tv" : "movie";
    return { kind: "tmdb", mediaType, id };
  }
  if (host === "justwatch.com") {
    const slug = path.match(JUSTWATCH_TITLE)?.[1];
    return slug ? slugTarget(slug) : null;
  }
  return null;
}

// ============ testo ============

/** Cornici promozionali che le app antepongono al nome del titolo. */
const PREFIXES: RegExp[] = [/^guarda\s+/i, /^watch\s+/i, /^dai\s+un['’]occhiata\s+a\s+/i];

/** …e quelle che gli mettono in coda. */
const SUFFIXES: RegExp[] = [
  /\s+su\s+netflix$/i,
  /\s+on\s+netflix$/i,
  /\s+su\s+prime\s+video$/i,
  /\s*\|\s*prime\s+video$/i,
  /\s*\|\s*disney\+?$/i,
  /\s*[-–—]\s*imdb$/i,
];

const YEAR_BRACKET = /[([]\s*((?:19|20)\d{2})\s*[)\]]/;
const YEAR_TRAILING = /\s((?:19|20)\d{2})$/;

function collapse(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

/** Taglia a `MAX_QUERY`, preferendo l'ultimo spazio: mai una parola a meta'. */
function cut(s: string): string {
  if (s.length <= MAX_QUERY) return s;
  const head = s.slice(0, MAX_QUERY);
  const space = head.lastIndexOf(" ");
  return (space > MAX_QUERY / 3 ? head.slice(0, space) : head).trim();
}

function stripFrames(s: string): string {
  let out = s;
  let changed = true;
  while (changed) {
    changed = false;
    for (const re of [...PREFIXES, ...SUFFIXES]) {
      const next = out.replace(re, "");
      if (next !== out) {
        out = collapse(next);
        changed = true;
      }
    }
  }
  return out;
}

/**
 * Il nome del titolo dentro un testo condiviso, e l'anno se c'e'.
 *
 * L'anno in coda si accetta solo fino all'anno prossimo: "Blade Runner 2049"
 * deve restare col suo numero, altrimenti la ricerca parte su "Blade Runner"
 * con un anno che non esiste e non trova piu' niente.
 */
export function textQuery(text: string): { query: string; year: number | null } | null {
  let out = collapse(text.replace(new RegExp(URL_IN_TEXT.source, "gi"), " "));
  out = stripFrames(out);

  let year: number | null = null;
  const bracket = out.match(YEAR_BRACKET);
  const trailing = out.match(YEAR_TRAILING);
  if (bracket) {
    year = Number(bracket[1]);
    out = collapse(out.replace(YEAR_BRACKET, " "));
  } else if (trailing && Number(trailing[1]) <= new Date().getUTCFullYear() + 1) {
    year = Number(trailing[1]);
    out = collapse(out.replace(YEAR_TRAILING, ""));
  }
  out = collapse(stripFrames(out));

  // Senza nemmeno una lettera non e' il nome di un titolo (un codice, delle cifre).
  if (!/\p{L}/u.test(out)) return null;
  return { query: cut(out), year };
}

/**
 * Il bersaglio di una condivisione. L'URL vince sempre sul testo: identifica il
 * titolo senza ambiguita'. Se l'URL non porta da nessuna parte (la home di una
 * piattaforma, un host che non conosciamo) si prova il link dentro al testo —
 * spesso e' la stessa cosa, ma a volte solo uno dei due e' una scheda — e per
 * ultimo il testo cosi' com'e'.
 */
export function parseShared(input: { url?: string; text?: string }): SharedTarget | null {
  const text = input.text?.trim() ?? "";
  const inText = text.match(URL_IN_TEXT)?.[0] ?? null;
  for (const candidate of [input.url, inText]) {
    const target = candidate ? targetFromUrl(candidate) : null;
    if (target) return target;
  }
  if (!text) return null;
  const parsed = textQuery(text);
  return parsed ? { kind: "text", query: parsed.query, year: parsed.year } : null;
}
