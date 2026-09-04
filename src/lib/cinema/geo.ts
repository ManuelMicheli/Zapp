// Helper geografici puri (nessun fetch): usabili sia lato server sia lato client.

export interface LatLng {
  lat: number;
  lng: number;
}

export function isValidLatLng(lat: number, lng: number): boolean {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    Math.abs(lat) <= 90 &&
    Math.abs(lng) <= 180
  );
}

/** Cella di ~110 m: chiave di cache condivisa da chi sta nello stesso isolato. */
export function roundToCell(p: LatLng): LatLng {
  return {
    lat: Math.round(p.lat * 1000) / 1000,
    lng: Math.round(p.lng * 1000) / 1000,
  };
}

export function cellKey(p: LatLng): string {
  const c = roundToCell(p);
  return `${c.lat},${c.lng}`;
}

export function milesToKm(miles: number): number {
  return miles * 1.609344;
}

/** Distanza in km sulla sfera terrestre (haversine). */
export function distanceKm(a: LatLng, b: LatLng): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) *
      Math.cos(toRad(b.lat)) *
      Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** "850 m" sotto il km, "1,2 km" fino a 10, poi "13 km". */
export function formatDistance(km: number): string {
  if (km < 1) return `${Math.round(km * 100) * 10} m`;
  if (km < 10) return `${km.toFixed(1).replace(".", ",")} km`;
  return `${Math.round(km)} km`;
}

/** Minuti a piedi a 5 km/h, minimo 1. */
export function walkingMinutes(km: number): number {
  return Math.max(1, Math.round((km / 5) * 60));
}

export function directionsUrl(p: LatLng, ios: boolean): string {
  return ios
    ? `https://maps.apple.com/?daddr=${p.lat},${p.lng}`
    : `https://maps.google.com/?q=${p.lat},${p.lng}`;
}

/** Sottoinsieme dell'oggetto `address` di Nominatim. */
export interface NominatimAddress {
  suburb?: string;
  quarter?: string;
  neighbourhood?: string;
  city?: string;
  town?: string;
  village?: string;
  municipality?: string;
}

/** "Quartiere, Città" / "Città" / null se non c'è nulla di utile. */
export function labelFromAddress(a: NominatimAddress): string | null {
  const area = a.suburb ?? a.quarter ?? a.neighbourhood ?? null;
  const city = a.city ?? a.town ?? a.village ?? a.municipality ?? null;
  if (area && city) return `${area}, ${city}`;
  return city ?? area;
}
