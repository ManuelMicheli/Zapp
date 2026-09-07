/**
 * Controlli sugli argomenti che arrivano dal client.
 *
 * Ogni Server Action e' un endpoint HTTP: gli argomenti li puo' scrivere
 * chiunque abbia una sessione valida, non solo il nostro componente. Le RLS
 * fermano la lettura e la scrittura dei dati altrui, ma non fermano un id
 * malformato che entra dentro un filtro PostgREST o un URL che poi apriamo.
 * Qui stanno i controlli comuni, funzioni pure (test in `validate.test.ts`).
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Un UUID vero e proprio: e' quello che finisce nei filtri e nelle FK. */
export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

/** Id TMDB: intero positivo, entro il range che TMDB usa davvero. */
export function isTmdbId(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0 && value < 1e10;
}

export function isMediaType(value: unknown): value is "movie" | "tv" {
  return value === "movie" || value === "tv";
}

/** Intero dentro un intervallo chiuso. */
export function isIntInRange(value: unknown, min: number, max: number): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= min && value <= max;
}

/**
 * PostgREST interpreta `%`, `_` e `*` dentro `ilike` come jolly. Senza questo,
 * cercare `%a` cambiava la ricerca per prefisso in una ricerca "contiene", cioe'
 * apriva l'elenco utenti a un'enumerazione molto piu' larga di quella prevista.
 */
export function escapeLike(input: string): string {
  return input.replace(/[\\%_*]/g, (c) => `\\${c}`);
}

/**
 * Un URL esterno che l'app salva o apre. Solo https, niente credenziali
 * nell'URL (`https://utente:password@…`, che i browser mostrano come se il
 * dominio fosse un altro) e niente host locali.
 */
export function isSafeExternalUrl(raw: unknown): raw is string {
  if (typeof raw !== "string" || raw.length > 2048) return false;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol !== "https:") return false;
  if (url.username || url.password) return false;
  const host = url.hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost")) return false;
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host) || host.includes(":")) return false;
  return host.includes(".");
}

/**
 * Percorso di ritorno dopo il login. Deve restare dentro l'app: un solo `/`
 * iniziale (`//evil.com` e `/\evil.com` sono protocol-relative per il browser),
 * niente schema, niente `\`.
 */
export function safeNextPath(raw: string | null | undefined, fallback = "/"): string {
  if (!raw || typeof raw !== "string") return fallback;
  if (raw.length > 512) return fallback;
  if (!raw.startsWith("/")) return fallback;
  if (raw.startsWith("//")) return fallback;
  if (raw.includes("\\")) return fallback;
  if (raw.includes("://")) return fallback;
  return raw;
}
