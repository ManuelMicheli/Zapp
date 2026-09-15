import {
  genreByKey,
  recipeFor,
  type GenreEntry,
  type MediaType,
} from "@/lib/genres/catalog";
import { PLATFORMS, platformByKey, type PlatformEntry } from "@/lib/platforms/catalog";
import { genreIdsFor } from "./hero-rank";

/**
 * L'**ambito** della home: la stessa pagina, ristretta a un genere, a una o più
 * piattaforme (in **or**: "Netflix, Prime e Disney+" mostra ciò che sta su una
 * qualunque delle tre) o a tutti e due ("Storie vere su Netflix"). Le pillole "Per
 * genere" e "Per piattaforma" non aprono più una pagina di Scopri: cambiano l'ambito e
 * la home resta quella, con ogni sezione — carosello, "Per te", i rail, "Perché hai
 * visto X", Top 10, amici, "Da vedere", i meglio votati, "In arrivo" — che mostra solo
 * ciò che sta nell'ambito (richiesta utente 2026-09-15). Il motore di ranking gira
 * uguale: cambiano i candidati, non l'affinità.
 *
 * L'ambito sta **nel percorso** (`/home/storie-vere/netflix/prime-video`), non nella
 * query: su uno stesso pathname con la sola query diversa l'App Router non naviga (vedi
 * `docs/architecture/genres.md`). Un solo oggetto per richiesta: le funzioni in
 * `cache()` lo usano come chiave, e due oggetti uguali ma distinti farebbero girare il
 * motore due volte.
 */
export interface HomeScope {
  genre: GenreEntry | null;
  /** Zero, una o più piattaforme, in **or**. Richiesta utente 2026-09-15. */
  platforms: readonly PlatformEntry[];
}

/** La home senza filtri. Un solo oggetto, così la chiave di `cache()` è stabile. */
export const HOME_SCOPE_VUOTO: HomeScope = Object.freeze({
  genre: null,
  platforms: Object.freeze([]),
});

export function scopeVuoto(s: HomeScope): boolean {
  return s.genre === null && s.platforms.length === 0;
}

/** Tutti gli id TMDB delle piattaforme scelte, senza doppioni: l'unione, non la somma. */
export function platformIds(s: HomeScope): number[] {
  return [...new Set(s.platforms.flatMap((p) => p.ids))];
}

/** Il primo segmento del percorso della home filtrata. */
export const HOME_SCOPE_BASE = "/home";

/**
 * I segmenti dopo `/home/`: al più una chiave di genere e quante chiavi di piattaforma
 * si vuole (in **or**), ognuna una volta sola. Qualunque altra forma è `null`, cioè 404.
 * L'ordine nel percorso non conta per leggerlo; per scriverlo vale `scopePath` (genere
 * prima, piattaforme poi nell'ordine del catalogo).
 */
export function parseScope(segments: readonly string[]): HomeScope | null {
  if (segments.length === 0) return null;
  let genre: GenreEntry | null = null;
  const platforms: PlatformEntry[] = [];
  const chiaviPiattaforma = new Set<string>();
  for (const s of segments) {
    const g = genreByKey(s);
    const p = platformByKey(s);
    if (g && !genre) genre = g;
    else if (p && !chiaviPiattaforma.has(p.key)) {
      chiaviPiattaforma.add(p.key);
      platforms.push(p);
    } else return null;
  }
  if (!genre && platforms.length === 0) return null;
  return { genre, platforms };
}

/** Il percorso canonico di un ambito: `/`, `/home/thriller`, `/home/thriller/netflix`. */
export function scopePath(s: HomeScope): string {
  const chiaviScelte = new Set(s.platforms.map((p) => p.key));
  const piattaforme = PLATFORMS.filter((p) => chiaviScelte.has(p.key)).map((p) => p.key);
  const parti = [s.genre?.key, ...piattaforme].filter((k): k is string => Boolean(k));
  return parti.length === 0 ? "/" : `${HOME_SCOPE_BASE}/${parti.join("/")}`;
}

/** `true` se questi segmenti sono già nell'ordine di `scopePath`. */
export function scopeCanonico(segments: readonly string[], s: HomeScope): boolean {
  return `${HOME_SCOPE_BASE}/${segments.join("/")}` === scopePath(s);
}

/** "Netflix", "Netflix e Prime Video", "Netflix, Prime Video e Disney+". */
function elencoPiattaforme(s: HomeScope): string | null {
  if (s.platforms.length === 0) return null;
  if (s.platforms.length === 1) return s.platforms[0].pillola;
  const nomi = s.platforms.map((p) => p.pillola);
  return `${nomi.slice(0, -1).join(", ")} e ${nomi[nomi.length - 1]}`;
}

/** "Storie vere su Netflix", "Su Netflix e Prime Video", "Storie vere"; `null` senza filtri. */
export function scopeTitle(s: HomeScope): string | null {
  const piattaforme = elencoPiattaforme(s);
  if (s.genre && piattaforme) return `${s.genre.pillola} su ${piattaforme}`;
  if (s.genre) return s.genre.pillola;
  if (piattaforme) return `Su ${piattaforme}`;
  return null;
}

/** L'ambito con il solo genere: per chi filtra la piattaforma da un altro segnale. */
export function soloGenere(s: HomeScope): HomeScope {
  return s.platforms.length === 0 ? s : { genre: s.genre, platforms: [] };
}

/** Quel che serve a dire se un titolo sta in un genere, senza chiedere a TMDB. */
export interface TitoloPerGenere {
  mediaType: MediaType;
  genreIds: readonly number[];
  year: string | number | null;
}

/**
 * Un titolo appartiene a una voce del catalogo dei generi? Si risponde dalla ricetta:
 * generi in **or**, esclusioni, finestra di anni.
 *
 * `null` = **non si può dire**: quando la voce è definita da una keyword (Supereroi,
 * Storie vere) o da una lingua (Anime, Commedia italiana) i dati di un titolo in cache
 * non bastano — non abbiamo keyword né lingua fuori da `titles.raw`. Chi filtra tratta
 * `null` come "fuori": meglio una fila corta che "Storie vere" con dentro un film
 * qualsiasi. I titoli arrivati da un `discover` con la ricetta non passano di qui.
 */
export function inGenre(entry: GenreEntry, t: TitoloPerGenere): boolean | null {
  const recipe = recipeFor(entry, t.mediaType);
  if (!recipe) return false;
  if (recipe.soloConKeyword || recipe.lingua) return null;

  const suoi = t.mediaType === "tv" && entry.tv?.generi ? entry.tv.generi : null;
  const generi = suoi ?? genreIdsFor(t.mediaType, recipe.generi);
  if (generi.length > 0 && !t.genreIds.some((g) => generi.includes(g))) return false;
  const senza = genreIdsFor(t.mediaType, recipe.senzaGeneri ?? []);
  if (senza.length > 0 && t.genreIds.some((g) => senza.includes(g))) return false;

  if (recipe.annoMin !== undefined || recipe.annoMax !== undefined) {
    const anno = t.year === null ? NaN : Number(t.year);
    if (!Number.isFinite(anno)) return false;
    if (recipe.annoMin !== undefined && anno < recipe.annoMin) return false;
    if (recipe.annoMax !== undefined && anno > recipe.annoMax) return false;
  }
  return true;
}

/**
 * Il filtro **puro** dell'ambito, per i titoli che portano già i loro generi (risultati
 * TMDB, simili, curati): solo il genere si verifica qui, la piattaforma la sa solo
 * `title_providers` (`scope-filter.ts`) o il `discover` che li ha portati.
 */
export function passaGenere(s: HomeScope, t: TitoloPerGenere): boolean {
  return s.genre === null || inGenre(s.genre, t) === true;
}
