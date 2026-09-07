import { isSurface, type Surface } from "./surfaces";

/**
 * Il corpo che il browser manda a `/api/events`, validato prima di toccare il database.
 *
 * Sta qui, puro e testato, perché la rotta possa restare corta e perché la regola più
 * importante sia verificabile: **il client non può dichiarare `library_add` né
 * `rate`**. Quei due li scrive il server dentro le Server Action che aggiornano
 * davvero la libreria; accettarli da fuori vorrebbe dire lasciare che chiunque si
 * costruisca il proprio profilo di gusto con un `curl`.
 */

export const CLIENT_KINDS = [
  "impression",
  "open",
  "provider_open",
  "trailer_play",
  "dismiss",
] as const;

export type ClientKind = (typeof CLIENT_KINDS)[number];

/** Oltre questo, il lotto viene rifiutato: nessuna schermata ha 100 copertine nuove. */
export const MAX_EVENTS_PER_BATCH = 100;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface IncomingEvent {
  kind: ClientKind;
  titleId: number;
  mediaType: "movie" | "tv";
  surface: Surface;
  position: number | null;
  at: string;
}

export interface EventsBody {
  sessionId: string;
  events: IncomingEvent[];
}

function parseEvent(raw: unknown): IncomingEvent | null {
  if (!raw || typeof raw !== "object") return null;
  const e = raw as Record<string, unknown>;

  const kind = e.kind;
  if (typeof kind !== "string" || !CLIENT_KINDS.includes(kind as ClientKind)) return null;

  const titleId = e.titleId;
  if (typeof titleId !== "number" || !Number.isInteger(titleId) || titleId <= 0) {
    return null;
  }

  const mediaType = e.mediaType;
  if (mediaType !== "movie" && mediaType !== "tv") return null;

  const surface = e.surface;
  if (typeof surface !== "string" || !isSurface(surface)) return null;

  const position = e.position;
  if (
    position !== null &&
    position !== undefined &&
    (typeof position !== "number" || !Number.isInteger(position))
  ) {
    return null;
  }

  const at = e.at;
  if (typeof at !== "string" || Number.isNaN(Date.parse(at))) return null;

  return {
    kind: kind as ClientKind,
    titleId,
    mediaType,
    surface,
    position: typeof position === "number" ? position : null,
    at,
  };
}

export function parseEventsBody(raw: unknown): EventsBody | null {
  if (!raw || typeof raw !== "object") return null;
  const body = raw as Record<string, unknown>;

  const sessionId = body.sessionId;
  if (typeof sessionId !== "string" || !UUID_RE.test(sessionId)) return null;

  const events = body.events;
  if (!Array.isArray(events)) return null;
  if (events.length === 0 || events.length > MAX_EVENTS_PER_BATCH) return null;

  const out: IncomingEvent[] = [];
  for (const evento of events) {
    const parsed = parseEvent(evento);
    // Un evento storto invalida il lotto: se il client sbaglia forma voglio
    // accorgermene in collaudo, non raccogliere metà dei segnali per sempre.
    if (!parsed) return null;
    out.push(parsed);
  }
  return { sessionId, events: out };
}
