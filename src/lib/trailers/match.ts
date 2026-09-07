/**
 * Un video YouTube è di questo titolo? Unico punto in cui Zapp lo decide.
 *
 * Serve perché la ricerca su YouTube restituisce, dallo stesso canale ufficiale e con
 * la stessa parola "trailer" nel nome, il trailer di un'altra opera: il fondale di
 * "Prison Break" era il trailer di "Scappa - Get Out", quello di "Breaking Bad" il
 * trailer di "El Camino". Il confronto è per **uguaglianza** del nome dell'opera, mai
 * per contenimento, e nel dubbio si scarta: un trailer perso costa il ripiego inglese,
 * un trailer sbagliato costa la fiducia nell'app.
 *
 * Funzioni pure (Vitest): nessuna rete, nessun `server-only`.
 */
import { normalizeTitle, titleSimilarity } from "@/lib/text/similarity";
import { OFFICIAL_CHANNELS } from "./channels";

export interface TitleIdentity {
  title: string;
  /** Titolo originale TMDB: il video può usare quello invece dell'italiano. */
  originalTitle?: string | null;
  mediaType: "movie" | "tv";
  /** > 0 sulla pagina di una stagione: il video deve nominare quella stagione. */
  season?: number;
}

/** Somiglianza minima per accettare un video trovato con la ricerca YouTube. */
export const MATCH_MIN = 0.9;
/** Sotto questa somiglianza un nome d'opera riconoscibile smentisce un video TMDB. */
export const CONTRADICTION_MAX = 0.45;
/** Sotto questa lunghezza (dopo normalizzazione) il nome non basta per giudicare. */
const SUBSTANTIAL_CHARS = 6;

/** Separatori con cui un nome YouTube divide opera, sottotitolo, etichette e canale. */
const SEPARATOR = /\s*\|\s*|\s+[-–—]\s+|:\s+/;

/** Frammenti che dentro una parte non fanno parte del nome dell'opera. */
const NOISE = [
  /\[[^\]]*\]/g,
  /\([^)]*\)/g,
  /#\d+/g,
  /\b\d+\s*°?\s*anniversari\w*/gi,
  /\bversione\s+restaurata\b/gi,
  /\bremaster\w*/gi,
  /\bdirector'?s\s+cut\b/gi,
  /\b(hd|4k|uhd|imax)\b/gi,
];

/** Parole che segnalano un'etichetta del trailer, non il nome dell'opera. */
const LABEL_SOURCE =
  "\\b(trailer|teaser|clip|featurette|spot|promo|anteprima|first\\s+look|sneak\\s+peek|official|ufficiale|italiano|italiana|english|ita|sub\\s*ita|sottotitolat\\w*|doppiat\\w*|esteso|extended|final|nuovo|primo|secondo|internazionale|red\\s+band)\\b";
const LABEL = new RegExp(LABEL_SOURCE, "i");
const LABEL_ALL = new RegExp(LABEL_SOURCE, "gi");

/** Coda promozionale: data d'uscita, "al cinema", "su Netflix", "streaming". */
const PROMO =
  /\b(in\s+cinemas?|in\s+theat(er|re)s|al\s+cinema|nei\s+cinema|solo\s+al\s+cinema|only\s+in|dal\s+\d|from\s+\w+\s+\d|coming\s+soon|prossimamente|disponibile|guarda\s+ora|watch\s+now|now\s+playing|streaming|su\s+netflix|su\s+prime\s+video|su\s+disney)\b/i;

/** Nomi di piattaforma che chiudono un nome YouTube ("| Apple TV+", "| Sky Italia"). */
const PLATFORM =
  /^(netflix|prime\s*video|amazon(\s+prime\s+video)?|apple\s*tv\+?|sky|now|disney\+?|paramount\+?|infinity|mediaset\s*infinity|crunchyroll|mubi|rai(\s*play)?|hbo(\s*max)?|max|discovery\+?)(\s+italia)?$/i;

/** Marcatore di stagione: sempre da buttare ("Stagione 3", "Season 3"). */
const SEASON_MARKER = /^(stagione|season)\s+\d+$/i;
/** Marcatore di parte: da buttare solo per le serie; in un film è parte del titolo. */
const PART_MARKER = /^(parte|part|volume|vol\.?|capitolo|chapter)\s+[\divx]+$/i;

/** Numero finale del nome (cifra o numero romano): distingue un seguito dall'originale. */
const TRAILING_NUMBER = /\s(\d{1,2}|[ivx]{1,4})$/i;

/** Firme dei canali ufficiali: "| Eagle Pictures" non fa parte del nome dell'opera. */
const CHANNEL_NAMES = new Set(OFFICIAL_CHANNELS.map((c) => normalizeTitle(c.name)));

function scrub(part: string): string {
  let out = part;
  for (const re of NOISE) out = out.replace(re, " ");
  return out.replace(/\s+/g, " ").trim();
}

/**
 * `first` distingue la parte iniziale, che è il nome dell'opera: l'allowlist contiene
 * canali di franchise ("Avatar", "Spider-Man", "Ghostbusters") e la firma del canale
 * sta sempre in coda, mai in testa. Senza questa distinzione il trailer di "Avatar"
 * resterebbe senza nome.
 */
function isDroppable(
  part: string,
  mediaType: "movie" | "tv",
  channel: string,
  first: boolean,
): boolean {
  if (part.length === 0) return true;
  const normalized = normalizeTitle(part);
  if (!first) {
    if (CHANNEL_NAMES.has(normalized)) return true;
    if (channel.length > 0 && normalized === channel) return true;
    if (PLATFORM.test(part)) return true;
  }
  if (PROMO.test(part)) return true;
  if (SEASON_MARKER.test(part)) return true;
  if (mediaType === "tv" && PART_MARKER.test(part)) return true;
  // una parte fatta solo di etichette ("Teaser Trailer Ufficiale Italiano") non è l'opera
  return (
    LABEL.test(part) && part.replace(LABEL_ALL, "").replace(/[^\p{L}\d]/gu, "") === ""
  );
}

/** Le parti di un nome YouTube, ripulite e senza etichette: l'opera, a pezzi. */
function nameParts(
  videoTitle: string,
  mediaType: "movie" | "tv",
  channelName?: string | null,
): string[] {
  const channel = channelName ? normalizeTitle(channelName) : "";
  return videoTitle
    .split(SEPARATOR)
    .map(scrub)
    .filter((part, i) => !isDroppable(part, mediaType, channel, i === 0));
}

/**
 * Il nome YouTube ridotto al nome dell'opera, con i sottotitoli veri uniti da ": ".
 * Stringa vuota se il nome non contiene un'opera ("Trailer ufficiale"). `channelName`,
 * se noto, toglie la firma di un canale che non è nell'allowlist.
 */
export function workName(videoTitle: string, channelName?: string | null): string {
  return nameParts(videoTitle, "movie", channelName).join(": ");
}

/** Le parti di un titolo del catalogo, con lo stesso taglio dei nomi YouTube. */
function titleParts(title: string): string[] {
  return title
    .split(SEPARATOR)
    .map(scrub)
    .filter((part) => part.length > 0);
}

function trailingNumber(part: string): string {
  const match = normalizeTitle(part).match(TRAILING_NUMBER);
  return match ? match[1].toLowerCase() : "";
}

/** Due nomi combaciano: stesso numero finale e somiglianza sopra la soglia, parte per parte. */
function partsMatch(video: string[], title: string[]): boolean {
  if (video.length !== title.length) return false;
  return video.every((part, i) => {
    if (trailingNumber(part) !== trailingNumber(title[i])) return false;
    return titleSimilarity(part, title[i]) >= MATCH_MIN;
  });
}

function mentionsSeason(videoTitle: string, season: number): boolean {
  return new RegExp(`\\b(stagione|season|parte|part)\\s*${season}\\b`, "i").test(
    videoTitle,
  );
}

function namesOf(id: TitleIdentity): string[] {
  return [id.title, id.originalTitle].filter(
    (t): t is string => typeof t === "string" && t.length > 0,
  );
}

/**
 * Il video è di quel titolo? Porta della ricerca YouTube: deve essere certo. Confronta
 * parte per parte il nome dell'opera con il titolo **e** con il titolo originale; un
 * sottotitolo o un numero in più da una sola parte è un'altra opera.
 */
export function videoMatchesTitle(
  videoTitle: string,
  id: TitleIdentity,
  channelName?: string | null,
): boolean {
  if (id.season != null && id.season > 0 && !mentionsSeason(videoTitle, id.season)) {
    return false;
  }
  const video = nameParts(videoTitle, id.mediaType, channelName);
  if (video.length === 0) return false;
  return namesOf(id).some((name) => partsMatch(video, titleParts(name)));
}

/**
 * Il video è palesemente di un'ALTRA opera? Veto usato sui video presi da TMDB, che
 * TMDB associa già al titolo: si scarta solo quando il nome YouTube contiene un nome
 * d'opera sostanziale che non somiglia né al titolo né all'originale. Un nome generico
 * ("Trailer ufficiale") non veta mai.
 */
export function videoContradictsTitle(
  videoTitle: string,
  id: TitleIdentity,
  channelName?: string | null,
): boolean {
  const name = workName(videoTitle, channelName);
  if (normalizeTitle(name).length < SUBSTANTIAL_CHARS) return false;
  const names = namesOf(id);
  if (names.length === 0) return false;
  const best = Math.max(...names.map((candidate) => titleSimilarity(name, candidate)));
  return best < CONTRADICTION_MAX;
}
