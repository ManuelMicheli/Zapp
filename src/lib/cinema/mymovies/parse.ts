// Parser puri delle pagine pubbliche di MyMovies (nessun fetch, nessun import di runtime).
// Le forme HTML sono quelle verificate il 2026-09-05 (fixture in __fixtures__/):
// se MyMovies cambia layout i parser tornano vuoti e la UI degrada.

export interface MmCinemaRef {
  id: number;
  name: string;
  town: string;
  /** "/cinema/milano/melzo/5452/" */
  path: string;
}
export interface MmFilmRef {
  filmId: number;
  title: string;
}
export interface MmShowing {
  /** "standard" | "vos" | "3d" | "imax" | … */
  format: string;
  /** "HH:MM" */
  time: string;
}
export interface MmFilmProgramme {
  filmId: number;
  title: string;
  year: number | null;
  slug: string;
  showings: MmShowing[];
}
export interface MmCinemaProgramme {
  cinemaId: number;
  name: string;
  town: string;
  path: string;
  showings: MmShowing[];
}
export interface MmMappa {
  /** MyMovies pubblica `lat=&lng=` vuoti per alcune sale: coordinate da geocodificare. */
  lat: number | null;
  lng: number | null;
  name: string;
  address: string;
  town: string;
}

const ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&#39;": "'",
  "&quot;": '"',
  "&nbsp;": " ",
};
function decodeEntities(s: string): string {
  return s
    .replace(/&#(\d+);|&[a-z]+;/g, (m, code) =>
      code ? String.fromCharCode(Number(code)) : (ENTITIES[m] ?? m),
    )
    .trim();
}

/** "Sesto San Giovanni" → "sestosangiovanni" (slug MyMovies: solo a-z0-9). */
export function slugify(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

/** Titoli confrontabili: minuscolo, senza accenti, punteggiatura né spazi. */
export function normalizeTitle(s: string): string {
  return slugify(s);
}

/** Etichetta MyMovies ("Versione originale con sottotitoli") → formato dell'app. */
export function formatFromLabel(label: string): string {
  const l = label.toLowerCase();
  if (l.includes("originale") || l.includes("sottotitol")) return "vos";
  const compact = slugify(label);
  if (compact === "3d") return "3d";
  if (compact === "imax3d") return "imax3d";
  if (compact === "imax") return "imax";
  return compact || "standard";
}

const CINEMA_LINK =
  /<a class="link-19"[^>]*href="(?:https?:)?\/\/www\.mymovies\.it(\/cinema\/[a-z0-9]+(?:\/[a-z0-9]+)?\/(\d+)\/)"[^>]*>[\s\S]*?font-weight:600;">([^<]+)<\/div>[\s\S]*?<span class="mm-small">([^<]+)<\/span>/g;

/** Voci cinema (indice provincia e pagina film-in-provincia hanno la stessa forma). */
function cinemaEntries(html: string): { ref: MmCinemaRef; end: number; start: number }[] {
  const out: { ref: MmCinemaRef; end: number; start: number }[] = [];
  const seen = new Set<number>();
  for (const m of html.matchAll(CINEMA_LINK)) {
    const id = Number(m[2]);
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({
      ref: { id, name: decodeEntities(m[3]), town: decodeEntities(m[4]), path: m[1] },
      start: m.index ?? 0,
      end: (m.index ?? 0) + m[0].length,
    });
  }
  return out;
}

export function parseProvinceIndex(html: string): MmCinemaRef[] {
  return cinemaEntries(html).map((e) => e.ref);
}

const CITY_LINK =
  /<a href="(?:https?:)?\/\/www\.mymovies\.it(\/cinema\/[a-z0-9]+\/(\d+)\/)"[^>]*title="Programmazione del cinema ([^"]+)"/g;

/**
 * Pagina della città capoluogo (`/cinema/milano/`): MyMovies spezza la provincia in due,
 * `/provincia/` ha solo l'hinterland (21 sale a Milano) e il capoluogo sta qui (27),
 * con un markup diverso: `<a href="//www.mymovies.it/cinema/milano/<id>/"
 * title="Programmazione del cinema <nome> di <comune>">`. L'ultimo " di " separa il
 * comune. Verificato 2026-09-07.
 */
export function parseCityIndex(html: string): MmCinemaRef[] {
  const out: MmCinemaRef[] = [];
  const seen = new Set<number>();
  for (const m of html.matchAll(CITY_LINK)) {
    const id = Number(m[2]);
    if (seen.has(id)) continue;
    seen.add(id);
    const label = decodeEntities(m[3]);
    const cut = label.lastIndexOf(" di ");
    out.push({
      id,
      name: cut > 0 ? label.slice(0, cut) : label,
      town: cut > 0 ? label.slice(cut + 4) : "",
      path: m[1],
    });
  }
  return out;
}

const FILM_LINK = /provincia\/\?f=(\d+)"[^>]*title="([^"]+)"/g;

/** Film in programmazione (link "Titolo a Città"): l'ultimo " a " separa la città. */
export function parseNowShowing(html: string): MmFilmRef[] {
  const out: MmFilmRef[] = [];
  const seen = new Set<number>();
  for (const m of html.matchAll(FILM_LINK)) {
    const filmId = Number(m[1]);
    if (seen.has(filmId)) continue;
    seen.add(filmId);
    const raw = decodeEntities(m[2]);
    const cut = raw.lastIndexOf(" a ");
    out.push({ filmId, title: cut > 0 ? raw.slice(0, cut) : raw });
  }
  return out;
}

const TOKEN = /font-weight:400;">([^<]+):<\/div>|mm-weight-700">(\d{2}:\d{2})</g;

/** Orari in ordine di pagina; un'etichetta vale per gli orari che la seguono. */
function showingsIn(chunk: string): MmShowing[] {
  const out: MmShowing[] = [];
  let format = "standard";
  for (const m of chunk.matchAll(TOKEN)) {
    if (m[1]) format = formatFromLabel(decodeEntities(m[1]));
    else if (m[2]) out.push({ format, time: m[2] });
  }
  return out;
}

const TITLE_LINK =
  /<a href="https:\/\/www\.mymovies\.it\/film\/(\d{4})\/([a-z0-9-]+)\/" title="([^"]+)">/;

export function parseCinemaPage(html: string): MmFilmProgramme[] {
  const parts = html.split('<div class="schedine-titolo">').slice(1);
  const out: MmFilmProgramme[] = [];
  for (const chunk of parts) {
    const t = TITLE_LINK.exec(chunk);
    const id = /id="mappa_\d+_(\d+)"/.exec(chunk);
    if (!t || !id) continue;
    out.push({
      filmId: Number(id[1]),
      title: decodeEntities(t[3]),
      year: Number(t[1]) || null,
      slug: t[2],
      showings: showingsIn(chunk),
    });
  }
  return out;
}

export function parseFilmProvincePage(html: string): MmCinemaProgramme[] {
  const entries = cinemaEntries(html);
  return entries.map((e, i) => {
    const next = entries[i + 1]?.start ?? html.length;
    const { id, name, town, path } = e.ref;
    return {
      cinemaId: id,
      name,
      town,
      path,
      showings: showingsIn(html.slice(e.end, next)),
    };
  });
}

/** Query string di googlemaps.asp: Latin-1 con %XX, "+" spazio, "_" spazio nel comune. */
function decodeLatin1(s: string, underscoreIsSpace = false): string {
  const decoded = s
    .replace(/\+/g, " ")
    .replace(/%([0-9A-Fa-f]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
  return (underscoreIsSpace ? decoded.replace(/_/g, " ") : decoded).trim();
}

export function parseMappa(html: string): MmMappa | null {
  const m =
    /lat=(-?[0-9.]*)&lng=(-?[0-9.]*)&nomecinema=([^&"]*)&indirizzo=([^&"]*)&local=([^&"]*)/.exec(
      html,
    );
  if (!m) return null;
  const coord = (s: string): number | null => {
    const n = s === "" ? NaN : Number(s);
    return Number.isFinite(n) ? n : null;
  };
  const lat = coord(m[1]);
  const lng = coord(m[2]);
  // Nome, indirizzo e comune ci sono anche senza coordinate: servono a geocodificare.
  return {
    lat: lng == null ? null : lat,
    lng: lat == null ? null : lng,
    name: decodeLatin1(m[3]),
    address: decodeLatin1(m[4]),
    town: decodeLatin1(m[5], true),
  };
}

// ── Province ──────────────────────────────────────────────────────────────────
// L'indice di provincia elenca solo i cinema **con programmazione oggi**: di notte,
// quando MyMovies non ha ancora caricato il palinsesto, una provincia vera risponde
// 200 con zero cinema. Riconoscerla dalla lista era quindi sbagliato (vedi
// `resolveProvinceSlug`): serve un segno che non dipenda dagli orari.

export interface MmProvince {
  /** "monzabrianza" */
  slug: string;
  /** "Monza Brianza" */
  name: string;
}

// Uno slug inesistente ("/cinema/pincopallino/provincia/") risponde 200 ma **senza
// <h1>**; una provincia vera ce l'ha anche a palinsesto vuoto (verificato 2026-09-08
// alle 02:00: milano, bologna, napoli, firenze e bergamo avevano zero spettacoli).
const PROVINCE_H1 = /<h1[^>]*>\s*Cinema provincia di/i;

/** La pagina di provincia esiste, anche se oggi non c'è nessuno spettacolo. */
export function provinceExists(html: string): boolean {
  return PROVINCE_H1.test(html) || cinemaEntries(html).length > 0;
}

const PROVINCE_LINK =
  /<a href="https:\/\/www\.mymovies\.it\/cinema\/([a-z0-9]+)\/">\s*<div class="mm-left">([^<]+)<\/div>/g;

/**
 * Elenco province ("Elenco dei Cinema raggruppati per regione"): sta in fondo a ogni
 * pagina cinema di MyMovies, 113 voci, e non dipende dal palinsesto del giorno.
 */
export function parseProvinceList(html: string): MmProvince[] {
  const out: MmProvince[] = [];
  const seen = new Set<string>();
  for (const m of html.matchAll(PROVINCE_LINK)) {
    const slug = m[1];
    if (seen.has(slug)) continue;
    seen.add(slug);
    out.push({ slug, name: decodeEntities(m[2]) });
  }
  return out;
}

// Parole che i due lati scrivono in modo diverso: Nominatim dice "Monza e Brianza",
// MyMovies "Monza Brianza"; "Reggio nell'Emilia" contro "Reggio Emilia". Tolte da
// **entrambi** i lati, i nomi coincidono. ("Pesaro e Urbino" è uguale nei due
// elenchi: si confrontano i nomi, non gli slug, che lì tengono la "e".)
const PROVINCE_STOPWORDS = new Set([
  "e",
  "d",
  "l",
  "di",
  "del",
  "della",
  "dell",
  "nel",
  "nell",
  "nella",
  "in",
  "provincia",
  "citta",
  "metropolitana",
]);

/** "Monza e Brianza" / "Reggio nell'Emilia" → ["monza","brianza"] / ["reggio","emilia"]. */
export function provinceTokens(name: string): string[] {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 0 && !PROVINCE_STOPWORDS.has(t));
}

/**
 * Nome amministrativo (`county`/`city` di Nominatim) → slug MyMovies.
 * A scala: nome uguale → slug uguale → unica provincia che condivide un token
 * ("Bolzano/Bozen" → bolzano; "Reggio" resta ambiguo fra Calabria ed Emilia e
 * quindi non decide).
 */
export function matchProvinceSlug(list: MmProvince[], name: string): string | null {
  const tokens = provinceTokens(name);
  if (tokens.length === 0) return null;
  const key = tokens.join("");

  for (const p of list) {
    if (provinceTokens(p.name).join("") === key) return p.slug;
  }
  for (const p of list) {
    if (p.slug === key) return p.slug;
  }

  const wanted = new Set(tokens);
  const shared = list.filter((p) => provinceTokens(p.name).some((t) => wanted.has(t)));
  const slugs = new Set(shared.map((p) => p.slug));
  return slugs.size === 1 ? shared[0].slug : null;
}
