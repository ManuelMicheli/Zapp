import "server-only";

import { MYMOVIES_MAPPA_TTL_S } from "@/lib/config";
import { createServiceClient } from "@/lib/supabase/server";
import type { Tables } from "@/types/database";
import { geocodeQuery } from "../geocode";
import { prettyVenueName, venueGeocodeQueries } from "../rank";
import type { Cinema } from "../types";
import { mymovies } from "./client";
import {
  parseCityIndex,
  parseMappa,
  parseProvinceIndex,
  slugify,
  type MmCinemaRef,
} from "./parse";

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

/** Una sala già scaricata da mappa.asp, con le coordinate ancora da riempire. */
interface FetchedVenue {
  row: VenueRow;
  ref: MmCinemaRef;
}

/**
 * Pagina mappa.asp di una sala (solo rete MyMovies, quindi si può chiedere in
 * parallelo: il limitatore di `client.ts` la mette comunque in coda a 4/s).
 */
async function fetchVenueMap(prov: string, ref: MmCinemaRef): Promise<FetchedVenue> {
  const html = await mymovies.mappa(ref.id);
  const m = html ? parseMappa(html) : null;
  return {
    ref,
    row: {
      mymovies_id: ref.id,
      province_slug: prov,
      path: ref.path,
      name: ref.name,
      town: m?.town || ref.town,
      address: m?.address ?? null,
      lat: m?.lat ?? null,
      lng: m?.lng ?? null,
      fetched_at: new Date().toISOString(),
    },
  };
}

/**
 * Coordinate mancanti da Nominatim (Notorious Merlata Bloom, Multisala Troisi:
 * 2026-09-07), altrimenti la sala sparirebbe dalle liste per sempre. `budget` limita
 * le chiamate per richiesta. **Va chiamata in fila**: Nominatim vuole una richiesta al
 * secondo e non ha un limitatore in `geocode.ts`.
 */
async function fillCoordinates(
  { row, ref }: FetchedVenue,
  budget: { geocodes: number },
): Promise<VenueRow> {
  if (row.lat != null && row.lng != null) return row;
  // prima l'indirizzo, se mappa.asp lo dà ("Via Triboniano, Milano"), poi il nome
  const queries = [
    ...(row.address ? [`${row.address}, ${row.town}`] : []),
    ...venueGeocodeQueries(ref.name, row.town),
  ];
  for (const q of queries) {
    if (budget.geocodes >= MAX_GEOCODES) break;
    budget.geocodes += 1;
    const hit = await geocodeQuery(q);
    if (hit) {
      console.log(`[mymovies] coordinate da Nominatim per "${ref.name}" (${q})`);
      return { ...row, lat: hit.lat, lng: hit.lng };
    }
  }
  return row;
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

  // Le mappe mancanti si chiedono **in parallelo** (il limitatore di `client.ts` le
  // ordina comunque a 4/s): in sequenza dieci pagine da mezzo secondo l'una erano
  // cinque secondi di attesa a freddo, uno dietro l'altro. La geocodifica invece
  // resta in fila: Nominatim vuole una richiesta al secondo.
  const staleBudget = Math.max(0, MAX_COLD_VENUE_FETCHES - missing.length);
  const toFetch = [
    ...missing.slice(0, MAX_COLD_VENUE_FETCHES),
    ...stale.slice(0, staleBudget).map(({ ref }) => ref),
  ];
  const fetched = await Promise.all(toFetch.map((ref) => fetchVenueMap(prov, ref)));
  const budget = { geocodes: 0 };
  const upserts: VenueRow[] = [];
  for (const item of fetched) upserts.push(await fillCoordinates(item, budget));
  result.push(...upserts);
  // gli stale fuori budget restano quelli che si hanno già
  for (const { row } of stale.slice(staleBudget)) result.push(row);
  const rimandati = Math.max(0, missing.length - MAX_COLD_VENUE_FETCHES);
  if (rimandati > 0) {
    console.log(`[mymovies] coordinate rimandate per ${rimandati} cinema`);
  }

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
 * pubblicato, è vuoto) **più** la pagina del capoluogo (MyMovies li separa: a Milano
 * `/provincia/` ha 21 sale di hinterland e `/cinema/milano/` le 27 della città, Merlata
 * Bloom compresa; senza la seconda un utente in città aveva solo le sale già note in
 * `cinema_venues`), uniti a quelli già noti in `cinema_venues` (30 giorni), così le
 * sale ci sono sempre e i giorni futuri non dipendono dal programma di oggi. Dedupe per
 * id: nelle province piccole una sala può stare in entrambe le pagine.
 */
export async function getProvinceVenues(prov: string): Promise<Cinema[]> {
  const db = createServiceClient();
  const [provHtml, cityHtml, { data: rows }] = await Promise.all([
    mymovies.provinceIndex(prov),
    mymovies.cityIndex(prov),
    db.from("cinema_venues").select("*").eq("province_slug", prov).not("lat", "is", null),
  ]);
  const refs = [
    ...(provHtml ? parseProvinceIndex(provHtml) : []),
    ...(cityHtml ? parseCityIndex(cityHtml) : []),
  ];
  const ids = new Set<number>();
  const unique = refs.filter((r) => (ids.has(r.id) ? false : (ids.add(r.id), true)));
  const fromIndex = unique.length > 0 ? await venuesFor(prov, unique) : [];
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
