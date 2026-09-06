import "server-only";

import { CINEMA_LINK_TTL_MS } from "@/lib/config";
import { createServiceClient } from "@/lib/supabase/server";
import type { Tables } from "@/types/database";
import { chainFor, googleTicketsUrl } from "./chains";
import { movieglu } from "./movieglu";
import { getCinemaSource } from "./source";

type LinkRow = Tables<"cinema_links">;

function isFresh(row: LinkRow): boolean {
  if (row.source === "manual") return true;
  return Date.now() - new Date(row.fetched_at).getTime() < CINEMA_LINK_TTL_MS;
}

/** Ultimo gradino: catena conosciuta o ricerca Google "cinema film biglietti". */
export function bookingFallback(cinemaName: string, filmName: string): string {
  return chainFor(cinemaName)?.homeUrl ?? googleTicketsUrl(cinemaName, filmName);
}

/**
 * Parte del link che dipende solo dal cinema: `cinema_links` manual → sito del
 * cinema da MovieGlu (30 gg, anche il "nessun sito"). `null` = nessun sito noto,
 * chi chiama scende al fallback (catena → Google), che dipende dal film.
 * Va chiamata una volta sola per lista di cinema: legge e aggiorna la cache.
 */
export async function resolveCinemaSites(
  cinemas: { id: number; name: string }[],
): Promise<Map<number, string | null>> {
  const result = new Map<number, string | null>();
  if (cinemas.length === 0) return result;

  const db = createServiceClient();
  const { data: rows } = await db
    .from("cinema_links")
    .select("*")
    .in(
      "cinema_id",
      cinemas.map((c) => c.id),
    );

  const pending: { id: number; name: string }[] = [];
  for (const c of cinemas) {
    const row = rows?.find((r) => r.cinema_id === c.id);
    if (row && isFresh(row)) {
      result.set(c.id, row.url);
    } else {
      pending.push(c);
    }
  }
  if (pending.length === 0) return result;

  const now = new Date().toISOString();
  const upserts: LinkRow[] = [];
  await Promise.all(
    pending.map(async (c) => {
      // Il sito da MovieGlu ha senso solo con quella sorgente attiva: per le altre
      // (MyMovies, mock) si scrive comunque la riga `movieglu` con url null, così
      // non si ritenta prima della TTL.
      const details =
        getCinemaSource() === "movieglu" ? await movieglu.cinemaDetails(c.id) : null;
      const site = details?.website;
      const website = site && /^https?:\/\//i.test(site) ? site : null;
      result.set(c.id, website);
      upserts.push({
        cinema_id: c.id,
        url: website,
        source: "movieglu",
        fetched_at: now,
      });
    }),
  );

  const { error } = await db
    .from("cinema_links")
    .upsert(upserts, { onConflict: "cinema_id" });
  if (error) console.error("[cinema] errore upsert cinema_links:", error);
  return result;
}

/**
 * Link biglietteria per ogni cinema. Cascata: `cinema_links` manual →
 * sito del cinema da MovieGlu (30 gg, anche il "nessun sito") → catena → Google.
 * Non è mai vuoto: la CTA "Compra i biglietti" è sempre attiva.
 */
export async function resolveBookingLinks(
  cinemas: { id: number; name: string }[],
  filmName: string,
): Promise<Map<number, string>> {
  const sites = await resolveCinemaSites(cinemas);
  const result = new Map<number, string>();
  for (const c of cinemas) {
    result.set(c.id, sites.get(c.id) ?? bookingFallback(c.name, filmName));
  }
  return result;
}
