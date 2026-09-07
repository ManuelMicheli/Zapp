/**
 * Scelte pure degli scaffali della home: quale titolo fa da sorgente a "Perché hai
 * visto", quale genere tocca oggi, come si ripulisce una lista TMDB prima di
 * mostrarla. Nessun accesso a rete o DB: i dati arrivano già letti (vedi i
 * componenti in `src/components/home/`).
 */

export interface ShelfItem {
  id: number;
  mediaType: "movie" | "tv";
  title: string;
  posterPath: string;
  year: string | null;
}

/** Quanti titoli entrano in uno scaffale della home. */
export const SHELF_SIZE = 20;

/** Riga di libreria come serve qui: id, tipo, nome, stato e voto. */
export interface WatchedLike {
  title_id: number;
  media_type: "movie" | "tv";
  status?: string | null;
  rating?: number | null;
  title: { title: string } | null;
}

export interface BecauseSource {
  titleId: number;
  mediaType: "movie" | "tv";
  name: string;
  /** Voto dell'utente: un titolo amato tira più forte i suoi consigli. */
  rating: number | null;
}

/** Quante pillole si mostrano in "Perché hai visto". */
export const BECAUSE_SOURCES = 5;

/**
 * Sotto questo voto il titolo non genera consigli: se una serata è andata male,
 * riempire la home di cose simili è il contrario di un consiglio.
 */
export const BECAUSE_MIN_RATING = 6;

/**
 * Le sorgenti di "Perché hai visto X": gli ultimi titoli finiti di quel tipo
 * (`type`), o gli ultimi in assoluto per la scheda "Tutto". La prima fa da
 * scaffale, le altre sono le pillole con cui l'utente cambia titolo. Le entry
 * arrivano già ordinate dalla più recente (`last_watched_at desc`); una senza
 * titolo — riga di `titles` non ancora in cache — viene saltata, e lo stesso
 * titolo non torna due volte (rewatch).
 *
 * Non tutti i titoli finiti meritano una pillola: chi è stato **bocciato**
 * (voto sotto `BECAUSE_MIN_RATING`) o non è stato finito davvero resta fuori.
 * Chi chiama può chiedere più sorgenti di quante ne mostrerà, e scartare poi
 * quelle che non producono abbastanza consigli.
 */
export function pickBecauseSources(
  entries: readonly WatchedLike[],
  type: "movie" | "tv" | "all",
  max = BECAUSE_SOURCES,
): BecauseSource[] {
  const out: BecauseSource[] = [];
  const seen = new Set<string>();
  for (const entry of entries) {
    if (out.length >= max) break;
    if (type !== "all" && entry.media_type !== type) continue;
    if (entry.status != null && entry.status !== "watched") continue;
    if (entry.rating != null && entry.rating < BECAUSE_MIN_RATING) continue;
    const name = entry.title?.title?.trim();
    if (!name) continue;
    const key = `${entry.media_type}-${entry.title_id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      titleId: entry.title_id,
      mediaType: entry.media_type,
      name,
      rating: entry.rating ?? null,
    });
  }
  return out;
}

/**
 * Ripulisce una lista TMDB già mappata: via i doppioni, via i titoli già in
 * libreria (`exclude` = `"movie-123"`), taglio a `size`. `exclude` non si applica
 * agli scaffali che *sono* la libreria (Da vedere), che passano un insieme vuoto.
 */
export function cleanShelf(
  items: readonly ShelfItem[],
  exclude: ReadonlySet<string> = new Set(),
  size = SHELF_SIZE,
): ShelfItem[] {
  const out: ShelfItem[] = [];
  const seen = new Set<string>();
  for (const item of items) {
    if (out.length >= size) break;
    const key = `${item.mediaType}-${item.id}`;
    if (seen.has(key) || exclude.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

/**
 * Il genere di "Per te" cambia ogni giorno fra quelli che l'utente guarda di più:
 * uno scaffale solo, non due, e non sempre lo stesso. L'indice viene dal giorno
 * (`daysSinceEpoch`), quindi il server rende la stessa cosa per tutta la giornata.
 */
export function rotatingGenreId(genreIds: readonly number[], day: number): number | null {
  if (genreIds.length === 0) return null;
  const i = ((day % genreIds.length) + genreIds.length) % genreIds.length;
  return genreIds[i];
}

/** Giorni dal 1970: seme della rotazione, stabile per tutta la giornata. */
export function daysSinceEpoch(now: Date = new Date()): number {
  return Math.floor(now.getTime() / 86_400_000);
}

/**
 * Data di uscita leggibile per "In arrivo": "12 marzo" nell'anno in corso, altrimenti
 * "12 marzo 2027". Stringa TMDB `YYYY-MM-DD`; una data illeggibile torna `null`.
 */
export function releaseLabel(
  date: string | null | undefined,
  now = new Date(),
): string | null {
  if (!date) return null;
  const parsed = new Date(`${date}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return null;
  const sameYear = parsed.getFullYear() === now.getFullYear();
  return parsed.toLocaleDateString("it-IT", {
    day: "numeric",
    month: "long",
    ...(sameYear ? {} : { year: "numeric" }),
  });
}
