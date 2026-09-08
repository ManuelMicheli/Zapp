/**
 * La classifica della domanda del giorno. Funzioni pure: nessuna lettura dal DB,
 * nessun `server-only`, così stanno sotto test e girano anche nel componente client.
 */

/** Quanti hanno scelto quel titolo, e quando l'ha scelto il primo. */
export interface PodiumCount {
  titleId: number;
  mediaType: "movie" | "tv";
  votes: number;
  /** ISO della prima risposta su quel titolo: è il criterio di pareggio. */
  firstAt: string;
}

export interface PodiumTitle {
  titleId: number;
  mediaType: "movie" | "tv";
  title: string;
  posterPath: string | null;
  backdropPath: string | null;
}

export interface PodiumEntry extends PodiumCount, PodiumTitle {
  /** 1, 2, 3. */
  position: number;
}

export interface ReasonSource {
  titleId: number;
  mediaType: "movie" | "tv";
  reason: string | null;
  createdAt: string;
  authorName: string | null;
  /** Serve al link verso `/u/<username>`: da una risposta si arriva al profilo. */
  authorUsername: string | null;
  authorAvatar: string | null;
}

export const REASON_MAX_LENGTH = 140;

const key = (t: { titleId: number; mediaType: "movie" | "tv" }) =>
  `${t.mediaType}:${t.titleId}`;

/**
 * Ordina i conteggi e li unisce ai titoli in cache. A parità di voti vince chi è
 * stato scelto per primo: un criterio deterministico, altrimenti la classifica
 * cambia fra due render.
 */
export function buildPodium(counts: PodiumCount[], titles: PodiumTitle[]): PodiumEntry[] {
  const byKey = new Map(titles.map((t) => [key(t), t]));
  return [...counts]
    .sort((a, b) => b.votes - a.votes || a.firstAt.localeCompare(b.firstAt))
    .flatMap((count) => {
      const title = byKey.get(key(count));
      // titolo non ancora in cache: si scarta invece di mostrare un buco
      return title ? [{ ...count, ...title }] : [];
    })
    .slice(0, 3)
    .map((entry, i) => ({ ...entry, position: i + 1 }));
}

/** Il motivo da mostrare sotto il vincitore: il primo scritto su quel titolo. */
export function topReason(
  answers: ReasonSource[],
  winner: { titleId: number; mediaType: "movie" | "tv" } | undefined,
): ReasonSource | null {
  if (!winner) return null;
  const wanted = key(winner);
  return (
    answers
      .filter((a) => key(a) === wanted && cleanReason(a.reason) !== null)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0] ?? null
  );
}

/** Motivo scritto dall'utente: spazi normalizzati, vuoto → null, taglio a 140. */
export function cleanReason(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const text = raw.replace(/\s+/g, " ").trim();
  if (!text) return null;
  return text.slice(0, REASON_MAX_LENGTH);
}
