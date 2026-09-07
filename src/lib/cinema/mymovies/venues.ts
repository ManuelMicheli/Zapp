import "server-only";

import { MYMOVIES_MAPPA_TTL_S } from "@/lib/config";
import { createServiceClient } from "@/lib/supabase/server";
import type { Tables } from "@/types/database";
import { geocodeQuery } from "../geocode";
import { prettyVenueName, venueGeocodeQueries } from "../rank";
import type { Cinema } from "../types";
import { mymovies } from "./client";
import { parseMappa, parseProvinceIndex, slugify, type MmCinemaRef } from "./parse";

type VenueRow = Tables<"cinema_venues">;

function isFresh(row: VenueRow): boolean {
  return Date.now() - new Date(row.fetched_at).getTime() < MYMOVIES_MAPPA_TTL_S * 1000;
}

function toCinema(row: VenueRow): Cinema | null {
  if (row.lat == null || row.lng == null) return null;
  return {
    id: row.mymovies_id,
    name: prettyVenueName(row.name, row.town),
    address: row.address ?? "",
    city: row.town,
    lat: row.lat,
    lng: row.lng,
    distanceKm: 0,
    logoUrl: null,
    path: row.path,
  };
}

// Al massimo 10 coordinate nuove per richiesta: le altre arrivano alle richieste
// successive, così la pagina risponde entro il limite di Vercel.
const MAX_COLD_VENUE_FETCHES = 10;
// Nominatim (1 richiesta/s): al massimo 3 sale geocodificate per richiesta.
const MAX_GEOCODES = 3;

/**
 * Coordinate da mappa.asp, salvate in `cinema_venues` (30 giorni). Se la mappa non le
 * ha (Notorious Merlata Bloom, Multisala Troisi: 2026-09-07) si chiede a Nominatim col
 * nome della sala e il comune (`venueGeocodeQueries`), altrimenti la sala sparirebbe
 * dalle liste per sempre. `budget` limita le chiamate a Nominatim per richiesta.
 */
async function fetchVenue(
  prov: string,
  ref: MmCinemaRef,
  budget: { geocodes: number },
): Promise<VenueRow> {
  const html = await mymovies.mappa(ref.id);
  const m = html ? parseMappa(html) : null;
  let lat = m?.lat ?? null;
  let lng = m?.lng ?? null;
  const town = m?.town || ref.town;
  if (lat == null || lng == null) {
    for (const q of venueGeocodeQueries(ref.name, town)) {
      if (budget.geocodes >= MAX_GEOCODES) break;
      budget.geocodes += 1;
      const hit = await geocodeQuery(q);
      if (hit) {
        lat = hit.lat;
        lng = hit.lng;
        console.log(`[mymovies] coordinate da Nominatim per "${ref.name}" (${q})`);
        break;
      }
    }
  }
  return {
    mymovies_id: ref.id,
    province_slug: prov,
    path: ref.path,
    name: ref.name,
    town,
    address: m?.address ?? null,
    lat,
    lng,
    fetched_at: new Date().toISOString(),
  };
}

/** Cinema noti per una lista di riferimenti: cache DB, altrimenti mappa.asp + upsert. */
export async function venuesFor(prov: string, refs: MmCinemaRef[]): Promise<Cinema[]> {
  if (refs.length === 0) return [];
  const db = createServiceClient();
  const { data: rows } = await db
    .from("cinema_venues")
    .select("*")
    .in(
      "mymovies_id",
      refs.map((r) => r.id),
    );
  const known = new Map((rows ?? []).map((r) => [r.mymovies_id, r]));

  // Priorità ai cinema senza coordinate: quelli con una riga scaduta ma
  // già utilizzabile passano in coda e vengono rinfrescati solo se avanza budget.
  const missing: MmCinemaRef[] = [];
  const stale: { ref: MmCinemaRef; row: VenueRow }[] = [];
  const result: VenueRow[] = [];
  for (const ref of refs) {
    const row = known.get(ref.id);
    if (row && isFresh(row) && row.lat != null) {
      result.push(row);
    } else if (row && row.lat != null) {
      stale.push({ ref, row });
    } else {
      missing.push(ref);
    }
  }

  const upserts: VenueRow[] = [];
  const budget = { geocodes: 0 };
  let n = 0;
  for (const ref of missing) {
    if (upserts.length >= MAX_COLD_VENUE_FETCHES) {
      n += 1;
      continue;
    }
    const fresh = await fetchVenue(prov, ref, budget);
    upserts.push(fresh);
    result.push(fresh);
  }
  for (const { ref, row } of stale) {
    if (upserts.length >= MAX_COLD_VENUE_FETCHES) {
      result.push(row);
      continue;
    }
    const fresh = await fetchVenue(prov, ref, budget);
    upserts.push(fresh);
    result.push(fresh);
  }
  if (n > 0) console.log(`[mymovies] coordinate rimandate per ${n} cinema`);

  if (upserts.length > 0) {
    const { error } = await db
      .from("cinema_venues")
      .upsert(upserts, { onConflict: "mymovies_id" });
    if (error) console.error("[cinema] errore upsert cinema_venues:", error);
  }
  return result.map(toCinema).filter((c): c is Cinema => c !== null);
}

/**
 * I cinema della provincia con coordinate: quelli dell'indice MyMovies (che elenca
 * solo le sale con programmazione **oggi**: di notte, finché il programma non è
 * pubblicato, è vuoto) uniti a quelli già noti in `cinema_venues` (30 giorni), così le
 * sale ci sono sempre e i giorni futuri non dipendono dal programma di oggi.
 */
export async function getProvinceVenues(prov: string): Promise<Cinema[]> {
  const db = createServiceClient();
  const [html, { data: rows }] = await Promise.all([
    mymovies.provinceIndex(prov),
    db.from("cinema_venues").select("*").eq("province_slug", prov).not("lat", "is", null),
  ]);
  const fromIndex = html ? await venuesFor(prov, parseProvinceIndex(html)) : [];
  const seen = new Set(fromIndex.map((c) => c.id));
  const known = (rows ?? [])
    .filter((r) => !seen.has(r.mymovies_id) && isFresh(r))
    .map(toCinema)
    .filter((c): c is Cinema => c !== null);
  return [...fromIndex, ...known];
}

/**
 * Slug provincia MyMovies da Nominatim: "Monza e Brianza" → prova "monzaebrianza",
 * "monza", poi la città. Gli slug sbagliati rispondono 200 con zero cinema: conta.
 */
export async function resolveProvinceSlug(
  county: string | null,
  city: string | null,
): Promise<string | null> {
  const candidates = [
    county ? slugify(county) : "",
    county ? slugify(county.split(/\s+/)[0]) : "",
    city ? slugify(city) : "",
  ].filter((s, i, a) => s.length > 1 && a.indexOf(s) === i);
  for (const slug of candidates) {
    const html = await mymovies.provinceIndex(slug);
    if (html && parseProvinceIndex(html).length > 0) return slug;
  }
  return null;
}
