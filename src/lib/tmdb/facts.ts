import type { TmdbMovieDetails, TmdbTvDetails } from "./types";

/** `titles.raw` di una scheda titolo: film e serie condividono lo stesso campo. */
export type TitleRaw = (TmdbMovieDetails & TmdbTvDetails) | null | undefined;

export interface TitleFact {
  label: string;
  value: string;
}

const lingue = new Intl.DisplayNames(["it"], { type: "language" });
const paesi = new Intl.DisplayNames(["it"], { type: "region" });

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function dataEstesa(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("it-IT", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

/** "225 mln $", "2,41 mld $": cifre da locandina, non contabili. */
export function soldi(n: number | null | undefined): string | null {
  if (!n || n <= 0) return null;
  if (n >= 1e9) {
    return `${(n / 1e9).toLocaleString("it-IT", { maximumFractionDigits: 2 })} mld $`;
  }
  return `${Math.round(n / 1e6).toLocaleString("it-IT")} mln $`;
}

export function taglineOf(raw: TitleRaw): string | null {
  const t = raw?.tagline?.trim();
  return t ? t : null;
}

export function titoloOriginale(
  raw: TitleRaw,
  mediaType: "movie" | "tv",
  titolo: string,
): string | null {
  const originale = mediaType === "movie" ? raw?.original_title : raw?.original_name;
  if (!originale || originale.trim() === titolo.trim()) return null;
  return originale;
}

/** Uscita in sala italiana (`type: 3`), se TMDB la conosce. */
export function uscitaItaliana(raw: TitleRaw): string | null {
  const it = raw?.release_dates?.results?.find((r) => r.iso_3166_1 === "IT");
  const sala = it?.release_dates.find((r) => r.type === 3) ?? it?.release_dates[0];
  return sala?.release_date ?? null;
}

/** Età consigliata italiana: `release_dates` per i film, `content_ratings` per le serie. */
export function etaConsigliata(raw: TitleRaw): string | null {
  const it = raw?.release_dates?.results?.find((r) => r.iso_3166_1 === "IT");
  const cert = it?.release_dates.find((r) => r.certification)?.certification;
  if (cert) return cert === "T" ? "Per tutti" : cert;
  const tv = raw?.content_ratings?.results?.find((r) => r.iso_3166_1 === "IT")?.rating;
  return tv || null;
}

export function regiaDi(raw: TitleRaw, mediaType: "movie" | "tv"): string | null {
  if (mediaType === "tv") {
    const creatori = (raw?.created_by ?? []).map((c) => c.name);
    return creatori.length > 0 ? creatori.join(", ") : null;
  }
  const registi = (raw?.credits?.crew ?? [])
    .filter((c) => c.job === "Director")
    .map((c) => c.name);
  return registi.length > 0 ? [...new Set(registi)].slice(0, 3).join(", ") : null;
}

export function sceneggiaturaDi(raw: TitleRaw): string | null {
  const scrittori = (raw?.credits?.crew ?? [])
    .filter((c) => c.job === "Screenplay" || c.job === "Writer" || c.job === "Story")
    .map((c) => c.name);
  return scrittori.length > 0 ? [...new Set(scrittori)].slice(0, 3).join(", ") : null;
}

/**
 * I quattro dati che stanno sotto la trama: chi l'ha fatto e quando è uscito.
 * Il resto (lingua, paese, produzione, incassi) sta nella scheda tecnica, che è
 * un'altra sezione: mai gli stessi dati due volte nella stessa pagina.
 */
export function fattiTrama(
  raw: TitleRaw,
  mediaType: "movie" | "tv",
  titolo: string,
  uscita: string | null,
): TitleFact[] {
  const fatti: TitleFact[] = [];
  const regia = regiaDi(raw, mediaType);
  if (regia)
    fatti.push({ label: mediaType === "tv" ? "Creata da" : "Regia", value: regia });
  const scritto = sceneggiaturaDi(raw);
  if (scritto && mediaType === "movie")
    fatti.push({ label: "Sceneggiatura", value: scritto });

  const originale = titoloOriginale(raw, mediaType, titolo);
  if (originale) fatti.push({ label: "Titolo originale", value: originale });

  if (mediaType === "movie") {
    const it = dataEstesa(uscitaItaliana(raw));
    const data = it ?? dataEstesa(uscita);
    if (data) fatti.push({ label: it ? "Uscita in Italia" : "Uscita", value: data });
  } else {
    const data = dataEstesa(uscita);
    if (data) fatti.push({ label: "In onda dal", value: data });
    if (raw?.number_of_episodes && raw.number_of_seasons) {
      fatti.push({
        label: "Episodi",
        value: `${raw.number_of_episodes} in ${raw.number_of_seasons} stagion${raw.number_of_seasons === 1 ? "e" : "i"}`,
      });
    }
  }
  return fatti;
}

/** Scheda tecnica: i dati che non stanno sotto la trama. */
export function fattiTecnici(
  raw: TitleRaw,
  mediaType: "movie" | "tv",
  runtime: number | null,
): TitleFact[] {
  const fatti: TitleFact[] = [];

  const lingua = raw?.original_language;
  if (lingua) {
    fatti.push({
      label: "Lingua originale",
      value: capitalize(lingue.of(lingua) ?? lingua),
    });
  }

  const paesiRaw = raw?.production_countries ?? [];
  const nomiPaesi =
    paesiRaw.length > 0
      ? paesiRaw.map((p) => paesi.of(p.iso_3166_1) ?? p.name)
      : (raw?.origin_country ?? []).map((c) => paesi.of(c) ?? c);
  if (nomiPaesi.length > 0) {
    fatti.push({ label: "Paese", value: nomiPaesi.slice(0, 3).join(", ") });
  }

  if (mediaType === "movie") {
    const case_ = (raw?.production_companies ?? []).slice(0, 2).map((c) => c.name);
    if (case_.length > 0) fatti.push({ label: "Produzione", value: case_.join(", ") });
    if (runtime) {
      const h = Math.floor(runtime / 60);
      const m = runtime % 60;
      fatti.push({ label: "Durata", value: h > 0 ? `${h}h ${m}m` : `${m}m` });
    }
    const budget = soldi(raw?.budget);
    if (budget) fatti.push({ label: "Budget", value: budget });
    const incassi = soldi(raw?.revenue);
    if (incassi) fatti.push({ label: "Incassi nel mondo", value: incassi });
  } else {
    const reti = (raw?.networks ?? []).slice(0, 2).map((n) => n.name);
    if (reti.length > 0) fatti.push({ label: "Rete", value: reti.join(", ") });
    const ultima = dataEstesa(raw?.last_air_date);
    if (ultima) fatti.push({ label: "Ultimo episodio", value: ultima });
    if (raw?.status) {
      fatti.push({
        label: "Stato",
        value: raw.status === "Returning Series" ? "In corso" : "Conclusa",
      });
    }
  }

  const eta = etaConsigliata(raw);
  if (eta) fatti.push({ label: "Età consigliata", value: eta });

  return fatti;
}

/**
 * Fotogrammi per la galleria: i backdrop di `append_to_response=images` meno quello
 * già usato come fondale della banda.
 */
export function fotogrammi(
  raw: TitleRaw,
  backdropPath: string | null,
  max = 8,
): string[] {
  return (raw?.images?.backdrops ?? [])
    .filter((b) => b.file_path && b.file_path !== backdropPath)
    .slice(0, max)
    .map((b) => b.file_path);
}
