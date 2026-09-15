import {
  genreByKey,
  recipeFor,
  type GenreEntry,
  type MediaType,
} from "@/lib/genres/catalog";
import { platformByKey, type PlatformEntry } from "@/lib/platforms/catalog";
import { genreIdsFor } from "./hero-rank";

/**
 * L'**ambito** della home: la stessa pagina, ristretta a un genere, a una piattaforma o
 * a tutti e due ("Storie vere su Netflix"). Le pillole "Per genere" e "Per piattaforma"
 * non aprono più una pagina di Scopri: cambiano l'ambito e la home resta quella, con
 * ogni sezione — carosello, "Per te", i rail, "Perché hai visto X", Top 10, amici, "Da
 * vedere", i meglio votati, "In arrivo" — che mostra solo ciò che sta nell'ambito
 * (richiesta utente 2026-09-15). Il motore di ranking gira uguale: cambiano i candidati,
 * non l'affinità.
 *
 * L'ambito sta **nel percorso** (`/home/storie-vere/netflix`), non nella query: su uno
 * stesso pathname con la sola query diversa l'App Router non naviga (vedi
 * `docs/architecture/genres.md`). Un solo oggetto per richiesta: le funzioni in
 * `cache()` lo usano come chiave, e due oggetti uguali ma distinti farebbero girare il
 * motore due volte.
 */
export interface HomeScope {
  genre: GenreEntry | null;
  platform: PlatformEntry | null;
}

/** La home senza filtri. Un solo oggetto, così la chiave di `cache()` è stabile. */
export const HOME_SCOPE_VUOTO: HomeScope = Object.freeze({ genre: null, platform: null });

export function scopeVuoto(s: HomeScope): boolean {
  return s.genre === null && s.platform === null;
}

/** Il primo segmento del percorso della home filtrata. */
export const HOME_SCOPE_BASE = "/home";

/**
 * I segmenti dopo `/home/`: uno o due, ognuno una chiave di genere o di piattaforma, al
 * massimo una per tipo. Qualunque altra forma è `null`, cioè 404. L'ordine nel percorso
 * non conta per leggerlo; per scriverlo vale `scopePath` (genere prima, piattaforma poi).
 */
export function parseScope(segments: readonly string[]): HomeScope | null {
  if (segments.length === 0 || segments.length > 2) return null;
  let genre: GenreEntry | null = null;
  let platform: PlatformEntry | null = null;
  for (const s of segments) {
    const g = genreByKey(s);
    const p = platformByKey(s);
    if (g && !genre) genre = g;
    else if (p && !platform) platform = p;
    else return null;
  }
  return { genre, platform };
}

/** Il percorso canonico di un ambito: `/`, `/home/thriller`, `/home/thriller/netflix`. */
export function scopePath(s: HomeScope): string {
  const parti = [s.genre?.key, s.platform?.key].filter((k): k is string => Boolean(k));
  return parti.length === 0 ? "/" : `${HOME_SCOPE_BASE}/${parti.join("/")}`;
}

/** `true` se questi segmenti sono già nell'ordine di `scopePath`. */
export function scopeCanonico(segments: readonly string[], s: HomeScope): boolean {
  return `${HOME_SCOPE_BASE}/${segments.join("/")}` === scopePath(s);
}

/** "Storie vere su Netflix", "Su Netflix", "Storie vere"; `null` senza filtri. */
export function scopeTitle(s: HomeScope): string | null {
  if (s.genre && s.platform) return `${s.genre.pillola} su ${s.platform.pillola}`;
  if (s.genre) return s.genre.pillola;
  if (s.platform) return `Su ${s.platform.pillola}`;
  return null;
}

/** L'ambito con il solo genere: per chi filtra la piattaforma da un altro segnale. */
export function soloGenere(s: HomeScope): HomeScope {
  return s.platform === null ? s : { genre: s.genre, platform: null };
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
