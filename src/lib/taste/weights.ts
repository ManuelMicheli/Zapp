/**
 * Quanto vale ogni segnale, e quanto invecchia.
 *
 * Funzioni pure senza `server-only`: sono la parte del calcolo che si può provare
 * senza database, ed è dove stanno tutte le scelte discutibili — i numeri qui sotto
 * sono l'algoritmo, il resto è idraulica.
 */

/** Una riga di `taste_input`, in camelCase. */
export interface TasteRow {
  titleId: number;
  mediaType: "movie" | "tv";
  status: "want" | "watching" | "watched" | "dropped" | null;
  rating: number | null;
  lastWatchedAt: string | null;
  isSeed: boolean;
  /** Sessioni distinte in cui la copertina è stata vista. */
  impressionSessions: number;
  opens: number;
  providerOpens: number;
  trailers: number;
  dismisses: number;
  lastEventAt: string | null;
}

export const WEIGHTS = {
  ratingHigh: 10,
  watched: 6,
  seed: 5,
  watching: 3,
  providerOpen: 3,
  want: 2,
  trailer: 1.5,
  open: 1,
  /** Per sessione in cui è stato mostrato e ignorato. */
  skipPerSession: -0.5,
  /** Tetto dello skip: l'indifferenza non deve mai pesare come un rifiuto esplicito. */
  skipFloor: -2,
  ratingLow: -3,
  dropped: -3,
  dismiss: -4,
} as const;

/** Un gusto vecchio di sei mesi vale metà; di due anni, un quarto. Non sparisce mai. */
export const HALF_LIFE_DAYS = 180;

/** Oltre questo numero, riaprire la stessa scheda non aggiunge informazione. */
const MAX_OPENS = 3;

/** Voti da qui in su valgono `ratingHigh`; da `RATING_LOW` in giù, `ratingLow`. */
const RATING_HIGH = 8;
const RATING_LOW = 4;

export function decay(at: string | null, now: Date): number {
  if (!at) return 1;
  const t = Date.parse(at);
  if (Number.isNaN(t)) return 1;
  const giorni = (now.getTime() - t) / 86_400_000;
  // Date future (orologio del telefono avanti, fuso sbagliato) non devono premiare.
  if (giorni <= 0) return 1;
  return Math.pow(0.5, giorni / HALF_LIFE_DAYS);
}

/** La data più recente fra ultima visione ed ultimo evento. */
export function signalAt(row: TasteRow): string | null {
  if (!row.lastWatchedAt) return row.lastEventAt;
  if (!row.lastEventAt) return row.lastWatchedAt;
  return Date.parse(row.lastEventAt) > Date.parse(row.lastWatchedAt)
    ? row.lastEventAt
    : row.lastWatchedAt;
}

export function rawWeight(row: TasteRow): number {
  let w = 0;

  const votoBasso = row.rating !== null && row.rating <= RATING_LOW;

  if (row.rating !== null) {
    if (row.rating >= RATING_HIGH) w += WEIGHTS.ratingHigh;
    else if (votoBasso) w += WEIGHTS.ratingLow;
  }

  // Con un voto basso lo stato non conta: un voto è una dichiarazione, finire una
  // serie è un'abitudine. Sommandoli, "l'ho visto tutto e gli do 3" restava positivo
  // (+6 − 3) e il profilo imparava a proporre altra roba come quella.
  if (!votoBasso) {
    if (row.status === "watched") w += WEIGHTS.watched;
    else if (row.status === "watching") w += WEIGHTS.watching;
    else if (row.status === "want") w += WEIGHTS.want;
  }
  if (row.status === "dropped") w += WEIGHTS.dropped;

  if (row.isSeed) w += WEIGHTS.seed;
  if (row.providerOpens > 0) w += WEIGHTS.providerOpen;
  if (row.trailers > 0) w += WEIGHTS.trailer;

  w += Math.min(row.opens, MAX_OPENS) * WEIGHTS.open;

  // Lo skip esiste solo se la copertina è stata vista e mai aperta.
  if (row.opens === 0 && row.impressionSessions > 0) {
    w += Math.max(WEIGHTS.skipFloor, row.impressionSessions * WEIGHTS.skipPerSession);
  }

  if (row.dismisses > 0) w += WEIGHTS.dismiss;

  return w;
}

export function weightOf(row: TasteRow, now: Date): number {
  return rawWeight(row) * decay(signalAt(row), now);
}
