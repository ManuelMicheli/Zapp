// Notorious Cinemas: JSON Webtic pubblici (parte pura, test Vitest).
// Livello 2 = pagina Notorious `seatsframe.php?sc=<cinema>&se=<evento>&sp=<spettacolo>`
// che incapsula il frame Webtic (login Webtic, poi scelta posti); livello 1 = pagina
// evento Webtic con gli orari.

import { NOTORIOUS_BASE } from "@/lib/config";
import { bestByName } from "./match";
import type { BookingQuery, ChainLinks } from "./types";
import { buildWebticLinks, pickWebticEvent, type WebticEvent } from "./webtic";

export interface NotoriousCinema {
  IDWEBTIC: string;
  DESCR: string;
}

/** "NOTORIOUS CINEMAS SESTO SAN GIOVANNI" ↔ "Notorious Cinemas Sesto San Giovanni". */
export function pickNotoriousCinema(
  cinemas: NotoriousCinema[],
  name: string,
): NotoriousCinema | null {
  return bestByName(cinemas, (c) => c.DESCR, name);
}

export const pickNotoriousEvent = pickWebticEvent;

export function buildNotoriousLinks(
  cinemaId: string,
  event: WebticEvent,
  q: BookingQuery,
): ChainLinks {
  const sc = encodeURIComponent(cinemaId);
  return buildWebticLinks(
    cinemaId,
    event,
    q,
    (eventId, performanceId) =>
      `${NOTORIOUS_BASE}/generic/seatsframe.php?sc=${sc}&se=${eventId}&sp=${performanceId}#seatsframe`,
  );
}
