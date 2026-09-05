import "server-only";

import { MYMOVIES_MAPPA_TTL_S } from "@/lib/config";
import { createServiceClient } from "@/lib/supabase/server";
import type { Tables } from "@/types/database";
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
    name: row.name,
    address: row.address ?? "",
    city: row.town,
    lat: row.lat,
    lng: row.lng,
    distanceKm: 0,
    logoUrl: null,
    path: row.path,
  };
}

/** Coordinate da mappa.asp, salvate in `cinema_venues` (30 giorni). */
async function fetchVenue(prov: string, ref: MmCinemaRef): Promise<VenueRow> {
  const html = await mymovies.mappa(ref.id);
  const m = html ? parseMappa(html) : null;
  return {
    mymovies_id: ref.id,
    province_slug: prov,
    path: ref.path,
    name: ref.name,
    town: m?.town || ref.town,
    address: m?.address ?? null,
    lat: m?.lat ?? null,
    lng: m?.lng ?? null,
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

  const upserts: VenueRow[] = [];
  const result: VenueRow[] = [];
  for (const ref of refs) {
    const row = known.get(ref.id);
    if (row && isFresh(row) && row.lat != null) {
      result.push(row);
      continue;
    }
    const fresh = await fetchVenue(prov, ref);
    upserts.push(fresh);
    result.push(fresh);
  }
  if (upserts.length > 0) {
    const { error } = await db
      .from("cinema_venues")
      .upsert(upserts, { onConflict: "mymovies_id" });
    if (error) console.error("[cinema] errore upsert cinema_venues:", error);
  }
  return result.map(toCinema).filter((c): c is Cinema => c !== null);
}

/** Tutti i cinema con programmazione oggi nella provincia, con coordinate. */
export async function getProvinceVenues(prov: string): Promise<Cinema[]> {
  const html = await mymovies.provinceIndex(prov);
  if (!html) return [];
  return venuesFor(prov, parseProvinceIndex(html));
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
