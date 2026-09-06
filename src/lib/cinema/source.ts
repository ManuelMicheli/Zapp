// Sorgente dei dati cinema: MyMovies (gratis, default), mock, MovieGlu (chiave), off.

export type CinemaSource = "mymovies" | "movieglu" | "mock" | "off";

export function getCinemaSource(): CinemaSource {
  const s = process.env.CINEMA_SOURCE;
  if (s === "off" || s === "movieglu" || s === "mock" || s === "mymovies") return s;
  if (process.env.MOVIEGLU_MOCK === "1") return "mock";
  return "mymovies";
}

/** La UI cinema esiste solo se una sorgente è attiva. */
export function isCinemaEnabled(): boolean {
  return getCinemaSource() !== "off";
}
