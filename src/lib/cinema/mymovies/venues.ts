import "server-only";

import { MYMOVIES_MAPPA_TTL_S } from "@/lib/config";
import { createServiceClient } from "@/lib/supabase/server";
import type { Tables } from "@/types/database";
import { geocodeQuery } from "../geocode";
import { prettyVenueName, venueGeocodeQueries } from "../rank";
import { boundingBox, type LatLng } from "../geo";
import type { Cinema } from "../types";
import { mymovies } from "./client";
import {
  capitalSlug,
  matchProvinceSlug,
  parseCityIndex,
  parseMappa,
  parseProvinceIndex,
  parseProvinceList,
  provinceExists,
  provinceFromPath,
  slugify,
  type MmCinemaRef,
  type MmProvince,
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
      province_slug: provinceFromPath(ref.path) ?? prov,
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
  const capital = capitalSlug(prov);
  const [provHtml, cityHtml, { data: rows }] = await Promise.all([
    mymovies.provinceIndex(prov),
    mymovies.cityIndex(prov),
    db.from("cinema_venues").select("*").eq("province_slug", prov).not("lat", "is", null),
  ]);
  // `/cinema/monzabrianza/provincia/` è vuota sempre: gli spettacoli della provincia
  // stanno sotto il nome del comune capoluogo (verificato 2026-09-08).
  let fromProvince = provHtml ? parseProvinceIndex(provHtml) : [];
  if (fromProvince.length === 0 && capital !== prov) {
    const altHtml = await mymovies.provinceIndex(capital);
    fromProvince = altHtml ? parseProvinceIndex(altHtml) : [];
  }
  const refs = [...fromProvince, ...(cityHtml ? parseCityIndex(cityHtml) : [])];
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
 * Sale già note nel DB dentro il riquadro, **di qualunque provincia**. Il raggio di
 * 25 km scavalca quasi sempre un confine (da Monza il multiplex più vicino è a
 * Milano, da Prato quelli di Firenze): gli elenchi MyMovies sono per provincia e da
 * soli quei cinema non li vedono mai. Le righe arrivano da `cinema_venues`, che si
 * riempie con l'uso e con `scripts/warm-cinema-venues.ts`.
 */
export async function nearbyKnownVenues(
  geo: LatLng,
  radiusKm: number,
): Promise<Cinema[]> {
  const box = boundingBox(geo, radiusKm);
  const db = createServiceClient();
  const { data, error } = await db
    .from("cinema_venues")
    .select("*")
    .gte("lat", box.minLat)
    .lte("lat", box.maxLat)
    .gte("lng", box.minLng)
    .lte("lng", box.maxLng)
    .limit(200);
  if (error) {
    console.error("[cinema] errore lettura cinema_venues:", error);
    return [];
  }
  return (data ?? []).map(toCinema).filter((c): c is Cinema => c !== null);
}

/**
 * Province delle sale note entro il raggio (la propria esclusa): sono quelle da
 * interrogare per gli orari di un film quando il confine cade dentro i 25 km.
 */
export async function nearbyProvinceSlugs(
  geo: LatLng,
  radiusKm: number,
  own: string,
): Promise<string[]> {
  const box = boundingBox(geo, radiusKm);
  const db = createServiceClient();
  const { data } = await db
    .from("cinema_venues")
    .select("province_slug")
    .gte("lat", box.minLat)
    .lte("lat", box.maxLat)
    .gte("lng", box.minLng)
    .lte("lng", box.maxLng)
    .limit(200);
  const slugs = new Set<string>();
  for (const row of data ?? []) {
    if (row.province_slug && row.province_slug !== own) slugs.add(row.province_slug);
  }
  return [...slugs];
}

export interface ProvinceLookup {
  /** Slug MyMovies, presente solo con `status: "found"`. */
  slug: string | null;
  /**
   * `found` provincia riconosciuta · `none` MyMovies risponde e nessun candidato è
   * una sua provincia · `unknown` MyMovies non risponde: chi salva **non deve**
   * cancellare la provincia che ha già.
   */
  status: "found" | "none" | "unknown";
  /** Nome MyMovies della provincia ("Monza Brianza"), per etichette e ricerche. */
  name: string | null;
}

/** Elenco province MyMovies (una lettura al mese), vuoto se il sito non risponde. */
export async function getProvinceList(): Promise<MmProvince[]> {
  const html = await mymovies.provinceList();
  return html ? parseProvinceList(html) : [];
}

/**
 * Slug provincia MyMovies dai nomi amministrativi di Nominatim.
 *
 * Prima si confronta con l'elenco ufficiale delle province ("Monza e Brianza" →
 * `monzabrianza`), che non dipende dal palinsesto; solo se l'elenco non arriva si
 * ripiega sul tentativo per URL, e lì una provincia vera si riconosce dall'`<h1>`,
 * **non** dai cinema in pagina: l'indice elenca solo le sale con spettacoli oggi e di
 * notte è vuoto anche per Milano. Prima bastava quello a far salvare
 * `province_slug = null`, e la sezione cinema restava "Zona non coperta" per sempre.
 */
export async function resolveProvince(
  county: string | null,
  city: string | null,
): Promise<ProvinceLookup> {
  const names = [county, city].filter((n): n is string => !!n && n.trim().length > 1);
  const list = await getProvinceList();
  if (list.length > 0) {
    for (const name of names) {
      const slug = matchProvinceSlug(list, name);
      if (slug) {
        const hit = list.find((p) => p.slug === slug) ?? null;
        return { slug, status: "found", name: hit?.name ?? null };
      }
    }
    return { slug: null, status: "none", name: null };
  }

  // Elenco non disponibile: si provano gli slug più probabili.
  const candidates = [
    county ? slugify(county) : "",
    county ? slugify(county.split(/\s+/)[0]) : "",
    city ? slugify(city) : "",
  ].filter((s, i, a) => s.length > 1 && a.indexOf(s) === i);
  let reached = false;
  for (const slug of candidates) {
    const html = await mymovies.provinceIndex(slug);
    if (!html) continue;
    reached = true;
    if (provinceExists(html)) return { slug, status: "found", name: null };
  }
  return { slug: null, status: reached ? "none" : "unknown", name: null };
}

/** Solo lo slug: comodo dove un `null` non deve essere distinto da "non lo so". */
export async function resolveProvinceSlug(
  county: string | null,
  city: string | null,
): Promise<string | null> {
  return (await resolveProvince(county, city)).slug;
}
