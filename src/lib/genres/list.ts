import "server-only";

import { cache } from "react";
import { getViewer } from "@/lib/auth/viewer";
import { genreIdsFor } from "@/lib/home/hero-rank";
import type { ShelfItem } from "@/lib/home/shelves-rank";
import { ordinaPerFama } from "@/lib/moment/mood-rank";
import { affinity } from "@/lib/rank/affinity";
import { arricchisci, candidatiDaTmdb } from "@/lib/rank/candidates";
import { diversify } from "@/lib/rank/diversity";
import { rankContext } from "@/lib/rank/engine";
import { consigliabile } from "@/lib/rank/filters";
import type { RankCandidate, RankContext, RankedItem } from "@/lib/rank/types";
import type { TasteVector } from "@/lib/rank/vector";
import { getPersonalContext } from "@/lib/similar/personal";
import { createClient } from "@/lib/supabase/server";
import { discoverForGenre, type DiscoverGenre } from "@/lib/tmdb/client";
import { recipeFor, type GenreEntry, type MediaType } from "./catalog";
import { genrePicks, type GenrePick } from "./picks";

/**
 * La lista di una pillola: **testa curata, poi il gusto**.
 *
 * 1. In cima i titoli scelti a mano per quel genere (`genre-picks.json`), dal più visto
 *    al meno, con l'affinità che ritocca l'ordine fra vicini (`ordinaPerFama`, la stessa
 *    dei mood): chi apre "Horror" vuole trovarci l'horror che conosce.
 * 2. Sotto, la coda da TMDB per la ricetta della voce, ordinata per **affinità** (fase
 *    C): stesse regole dei consigli della home, stesso profilo, stesse esclusioni.
 *
 * Niente di personale entra nelle `fetch`: `discoverForGenre` ha `revalidate: 3600` e
 * parametri uguali per tutti, quindi la cache di Next è condivisa. Il gusto lavora dopo,
 * in memoria, su ciò che è già arrivato.
 */

/** Quanti titoli riempiono la pagina di un genere. */
export const GENRE_SIZE = 40;
/** Quante pagine di `discover` si chiedono: 20 risultati l'una. */
const PAGINE = 3;
/**
 * Dentro un genere il tetto di tre titoli per genere non ha senso — il genere è il
 * motivo per cui si è lì. Restano i tetti su registi e piattaforme.
 */
const MAX_PER_GENERE = GENRE_SIZE;

function chiave(c: { id: number; mediaType: MediaType }): string {
  return `${c.mediaType}-${c.id}`;
}

/** Un titolo curato nella forma che il motore sa pesare. */
function daPick(p: GenrePick): RankCandidate {
  return {
    id: p.id,
    mediaType: p.mediaType,
    title: p.title,
    posterPath: p.posterPath,
    backdropPath: p.backdropPath ?? null,
    overview: p.overview ?? null,
    year: p.year,
    genreIds: p.genreIds,
    runtime: null,
    originalLanguage: null,
    providerIds: [],
    people: [],
    zappScore: null,
    voteAverage: p.voto,
    voteCount: p.voti,
    friends: null,
  };
}

export function toShelfItem(i: RankedItem): ShelfItem {
  return {
    id: i.id,
    mediaType: i.mediaType,
    title: i.title,
    posterPath: i.posterPath,
    year: i.year,
    // `rating` non è decorativo: `PosterCard` disegna "per te N%" dentro la riga del
    // voto, quindi senza voto l'affinità non comparirebbe affatto.
    rating: i.zappScore ?? i.voteAverage,
    affinity: i.percentuale,
    reason: i.motivo,
  };
}

/** La ricetta della voce tradotta per il tipo, pronta per `discoverForGenre`. */
function filtriDi(entry: GenreEntry, type: MediaType): DiscoverGenre | null {
  const recipe = recipeFor(entry, type);
  if (!recipe) return null;
  // I generi del catalogo sono quelli dei film: si traducono, a meno che la voce non
  // abbia dichiarato i suoi per le serie (Thriller → mistero e crime).
  const suoi = type === "tv" && entry.tv?.generi ? entry.tv.generi : null;
  const senza = recipe.senzaGeneri ? genreIdsFor(type, recipe.senzaGeneri) : [];
  // Le telenovelas (10766) stanno fuori da **tutte** le liste di genere: TMDB ne ha
  // centinaia con migliaia di voti e, non essendo escluse come reality e talk show
  // (`GENERI_TV_ESCLUSI`), si prendevano mezza coda di "Romantico" e di "Dramma".
  const senzaTv = type === "tv" && !recipe.generi.includes(10766) ? [10766] : [];
  const tutteEsclusioni = [...new Set([...senza, ...senzaTv])];
  return {
    ...recipe,
    generi: suoi ?? genreIdsFor(type, recipe.generi),
    senzaGeneri: tutteEsclusioni.length > 0 ? tutteEsclusioni : undefined,
  };
}

function valuta(c: RankCandidate, vettore: TasteVector): RankedItem {
  const a = affinity(vettore, c);
  return {
    ...c,
    punteggio: a.punteggio,
    percentuale: a.percentuale,
    contributi: a.contributi,
    // Il motivo qui sarebbe rumore: il titolo della pagina dice già perché è lì.
    motivo: null,
  };
}

/**
 * La testa: i curati che l'utente non ha già in libreria, per fama, col gusto che
 * ritocca soltanto. Nessuna chiamata esterna — la lista è un file.
 */
function testaCurata(
  entry: GenreEntry,
  type: MediaType,
  ctx: RankContext,
  vettore: TasteVector,
): RankedItem[] {
  const picks = genrePicks(entry.key)
    .filter((p) => p.mediaType === type)
    .filter((p) => !ctx.inLibreria.has(chiave(p)));
  if (picks.length === 0) return [];
  const valutati = picks.map((p) => {
    const item = valuta(daPick(p), vettore);
    return { voti: p.voti, punteggio: item.punteggio, item };
  });
  return ordinaPerFama(valutati).map((v) => v.item);
}

/**
 * Le pagine di `discover` per una voce. Con `soloConKeyword` la keyword è la
 * definizione della voce (Supereroi, Storie vere) e viaggia su ogni pagina; altrimenti
 * si chiede **anche** una pagina con la keyword, e quei titoli restano più in alto:
 * sono i più a tema.
 */
async function coda(
  filtri: DiscoverGenre,
  type: MediaType,
  soloConKeyword: boolean,
): Promise<{ candidati: RankCandidate[]; aTema: Set<string> }> {
  const conKeyword = soloConKeyword || (filtri.keyword?.length ?? 0) > 0;
  const richieste: Promise<{
    tema: boolean;
    results: RankCandidate[];
  } | null>[] = [];

  for (let page = 1; page <= PAGINE; page++) {
    richieste.push(
      discoverForGenre(type, filtri, { page, conKeyword: soloConKeyword })
        .then((p) => ({
          tema: soloConKeyword,
          results: candidatiDaTmdb(p.results, type),
        }))
        .catch(() => null),
    );
  }
  if (conKeyword && !soloConKeyword) {
    richieste.unshift(
      discoverForGenre(type, filtri, { page: 1, conKeyword: true })
        .then((p) => ({ tema: true, results: candidatiDaTmdb(p.results, type) }))
        .catch(() => null),
    );
  }

  const pagine = await Promise.all(richieste);
  const candidati: RankCandidate[] = [];
  const aTema = new Set<string>();
  for (const p of pagine) {
    if (!p) continue;
    for (const c of p.results) {
      candidati.push(c);
      if (p.tema) aTema.add(chiave(c));
    }
  }
  return { candidati, aTema };
}

async function perTipo(
  entry: GenreEntry,
  type: MediaType,
  ctx: RankContext,
  vettore: TasteVector,
): Promise<RankedItem[]> {
  const filtri = filtriDi(entry, type);
  if (!filtri) return [];

  const testa = testaCurata(entry, type, ctx, vettore);
  const { candidati, aTema } = await coda(
    filtri,
    type,
    recipeFor(entry, type)?.soloConKeyword ?? false,
  );

  const visti = new Set<string>(testa.map(chiave));
  const puliti: RankCandidate[] = [];
  for (const c of candidati) {
    const k = chiave(c);
    // Stessi filtri del motore: un nome che non si può leggere o un reality travestito
    // da commedia non entrano in una lista di consigli solo perché qui la pipeline è
    // più corta.
    if (visti.has(k) || ctx.inLibreria.has(k) || !consigliabile(c)) continue;
    visti.add(k);
    puliti.push(c);
  }
  if (puliti.length === 0) return testa.slice(0, GENRE_SIZE);

  // ZappScore, durata, piattaforme e persone: servono all'affinità e al voto sulla
  // copertina. Una passata sola per l'intera lista, come fanno i simili.
  const arricchiti = await arricchisci(puliti.slice(0, GENRE_SIZE * 2), ctx.db).catch(
    () => puliti.slice(0, GENRE_SIZE * 2),
  );

  const valutati = arricchiti
    .map((c) => valuta(c, vettore))
    .sort((a, b) => b.punteggio - a.punteggio);
  // I titoli trovati per keyword sono più a tema degli altri: restano davanti, e fra
  // loro conservano l'ordine dell'affinità.
  const inTesta = valutati.filter((c) => aTema.has(chiave(c)));
  const resto = valutati.filter((c) => !aTema.has(chiave(c)));
  const ordinata = diversify([...inTesta, ...resto], GENRE_SIZE, {
    perGenere: MAX_PER_GENERE,
  });
  return [...testa, ...ordinata].slice(0, GENRE_SIZE);
}

/**
 * La lista di un genere, senza dipendenze dalla richiesta HTTP: contesto dell'utente e
 * profilo arrivano **come parametri**, così la stessa funzione gira in pagina e da riga
 * di comando (`scripts/genre-dump.ts`), che è l'unico modo di guardare davvero queste
 * liste. Stessa divisione di `rankFor` / `getRankedForYou`.
 */
export async function genreListFor(
  entry: GenreEntry,
  type: MediaType,
  ctx: RankContext,
  vettore: TasteVector,
): Promise<ShelfItem[]> {
  const items = await perTipo(entry, type, ctx, vettore).catch((): RankedItem[] => []);
  return items.map(toShelfItem);
}

/**
 * Quella che usa la pagina. In `cache()` per richiesta: il contesto dell'utente si legge
 * una volta sola anche quando la pagina chiede due tipi.
 */
export const getGenreList = cache(
  async (entry: GenreEntry, type: MediaType): Promise<ShelfItem[]> => {
    const user = await getViewer();
    if (!user) return [];
    const db = await createClient();
    const [ctx, personale] = await Promise.all([
      rankContext(user.id, db),
      getPersonalContext(),
    ]);
    return genreListFor(entry, type, ctx, personale.vector);
  },
);
