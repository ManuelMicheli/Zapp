import "server-only";

import { genreIdsFor } from "@/lib/home/hero-rank";
import { mixShelf } from "@/lib/home/shelves";
import type { ShelfItem } from "@/lib/home/shelves-rank";
import { getViewer } from "@/lib/auth/viewer";
import { affinity } from "@/lib/rank/affinity";
import { candidatiDaTmdb } from "@/lib/rank/candidates";
import { diversify } from "@/lib/rank/diversity";
import { rankContext } from "@/lib/rank/engine";
import { consigliabile } from "@/lib/rank/filters";
import type { MediaType, RankCandidate, RankContext, RankedItem } from "@/lib/rank/types";
import { toTasteVector, type TasteVector } from "@/lib/rank/vector";
import { createClient } from "@/lib/supabase/server";
import { getTasteProfile } from "@/lib/taste/queries";
import { discoverForRecipe } from "@/lib/tmdb/client";
import { picksFor, type MoodPick } from "./mood-picks";
import { ordinaPerFama } from "./mood-rank";
import { titoloPerTipo, type Recipe } from "./recipes";

/**
 * I titoli della fila del momento.
 *
 * Il **tema** lo sceglie il contesto (che ore sono, che giorno è, se piove); l'**ordine
 * dentro il tema** lo sceglie il gusto, con la stessa `affinity` della fase C. Nessuna
 * fonte nuova: `discoverForRecipe` ha `revalidate: 3600` e nessun parametro personale,
 * quindi la sua cache è condivisa fra tutti gli utenti.
 */

/** Dodici: su desktop cinque copertine finiscono a metà schermo. */
export const MOMENT_SIZE = 12;

export interface MomentShelfData {
  movie: ShelfItem[];
  tv: ShelfItem[];
  all: ShelfItem[];
}

/**
 * La risposta di `/api/moment`. Sta qui e non nel file della rotta: Next controlla gli
 * export dei `route.ts`, e il tipo serve identico alla rotta e al componente client.
 */
export interface MomentTitoli {
  movie: string;
  tv: string;
  all: string;
}

export interface MomentResponse {
  /** Un titolo per scheda: "Film per il pomeriggio", "Serie per il pomeriggio", "Per il pomeriggio". */
  titoli: MomentTitoli;
  data: MomentShelfData;
}

const VUOTA: MomentShelfData = { movie: [], tv: [], all: [] };

function chiave(c: { id: number; mediaType: MediaType }): string {
  return `${c.mediaType}-${c.id}`;
}

function toShelfItem(i: RankedItem): ShelfItem {
  return {
    id: i.id,
    mediaType: i.mediaType,
    title: i.title,
    posterPath: i.posterPath,
    // la fila del momento è un banner: il fondale e la trama servono a disegnarlo
    backdropPath: i.backdropPath,
    overview: i.overview,
    year: i.year,
    // `rating` non è decorativo: `PosterCard` disegna "per te N%" dentro la riga del
    // voto, quindi senza voto l'affinità non compare affatto.
    rating: i.zappScore ?? i.voteAverage,
    affinity: i.percentuale,
    reason: i.motivo,
  };
}

/** Un titolo curato nella forma che il motore sa pesare. */
function daPick(p: MoodPick): RankCandidate {
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

/**
 * La testa della fila di un mood: i titoli curati, **dal più visto al meno**, col gusto
 * che ritocca soltanto (vedi `mood-rank.ts`). Nessuna chiamata esterna: la lista è un
 * file, generato una volta da `scripts/build-mood-picks.ts`.
 */
function testaCurata(
  recipe: Recipe,
  type: MediaType,
  ctx: RankContext,
  vettore: TasteVector,
): RankedItem[] {
  const picks = picksFor(recipe.key).filter((p) => p.mediaType === type);
  if (picks.length === 0) return [];
  const valutati = picks
    .filter((p) => !ctx.inLibreria.has(`${p.mediaType}-${p.id}`))
    .map((p) => {
      const c = daPick(p);
      const a = affinity(vettore, c);
      return {
        voti: p.voti,
        punteggio: a.punteggio,
        item: {
          ...c,
          punteggio: a.punteggio,
          percentuale: a.percentuale,
          contributi: a.contributi,
          motivo: null as string | null,
        },
      };
    });
  // niente `diversify` qui: raggrupperebbe per genere e romperebbe l'ordine di fama,
  // che in un mood e' proprio quello che l'utente ha chiesto
  return ordinaPerFama(valutati).map((v) => v.item);
}

async function perTipo(
  recipe: Recipe,
  type: MediaType,
  ctx: RankContext,
  vettore: TasteVector,
): Promise<RankedItem[]> {
  // Gli id delle ricette sono quelli dei film: per le serie vanno tradotti.
  const filtri = {
    generi: genreIdsFor(type, recipe.generi),
    senzaGeneri: recipe.senzaGeneri ? genreIdsFor(type, recipe.senzaGeneri) : undefined,
    keyword: recipe.keyword,
    runtimeMax: recipe.runtimeMax,
    runtimeMin: recipe.runtimeMin,
  };

  const [conKeyword, base] = await Promise.all([
    recipe.keyword?.length
      ? discoverForRecipe(type, filtri, { conKeyword: true }).catch(() => null)
      : Promise.resolve(null),
    discoverForRecipe(type, filtri).catch(() => null),
  ]);

  const testa = testaCurata(recipe, type, ctx, vettore);
  const daKeyword = new Set<string>();
  const candidati: RankCandidate[] = [];
  // i curati non tornano una seconda volta nella coda generata
  const visti = new Set<string>(testa.map(chiave));
  for (const [i, page] of [conKeyword, base].entries()) {
    for (const c of candidatiDaTmdb(page?.results, type)) {
      const k = chiave(c);
      // Stesso filtro del motore (`getCandidates`, subito dopo la stessa
      // `candidatiDaTmdb`): senza, un nome non tradotto o un genere TV escluso
      // arriva qui perché questa fila salta mezza pipeline, non perché non serva.
      if (visti.has(k) || ctx.inLibreria.has(k) || !consigliabile(c)) continue;
      visti.add(k);
      if (i === 0) daKeyword.add(k);
      candidati.push(c);
    }
  }
  if (candidati.length === 0) return testa.slice(0, MOMENT_SIZE);

  const valutati: RankedItem[] = candidati
    .map((c) => {
      const a = affinity(vettore, c);
      return {
        ...c,
        punteggio: a.punteggio,
        percentuale: a.percentuale,
        contributi: a.contributi,
        // Il motivo qui sarebbe rumore: il titolo della fila dice già perché è lì.
        motivo: null as string | null,
      };
    })
    .sort((a, b) => b.punteggio - a.punteggio);

  // I titoli trovati per keyword sono più a tema: restano davanti, e fra loro
  // conservano l'ordine dell'affinità.
  const inTesta = valutati.filter((c) => daKeyword.has(chiave(c)));
  const resto = valutati.filter((c) => !daKeyword.has(chiave(c)));
  const coda = diversify([...inTesta, ...resto], MOMENT_SIZE);
  // La coda generata riempie la fila solo quando i curati non bastano — perche' li ha
  // gia' visti quasi tutti. In un momento la testa e' vuota e la fila e' tutta coda.
  return [...testa, ...coda].slice(0, MOMENT_SIZE);
}

/**
 * Le tre varianti insieme (film, serie, tutto): la fila segue la pillola Film / Serie
 * TV come gli altri scaffali, e il cambio non deve tornare al server.
 *
 * Niente `cache()` di React: viene chiamata una volta per render della home e una volta
 * per richiesta all'API, e la chiave sarebbe l'identità di un oggetto.
 */
/** I tre titoli di una ricetta, gli stessi che usano la home e l'API. */
export function titoliDi(recipe: Recipe): MomentTitoli {
  return {
    movie: titoloPerTipo(recipe, "movie"),
    tv: titoloPerTipo(recipe, "tv"),
    all: titoloPerTipo(recipe, "all"),
  };
}

export async function getMomentShelf(recipe: Recipe): Promise<MomentShelfData> {
  const user = await getViewer();
  if (!user) return VUOTA;
  const db = await createClient();
  const [ctx, profilo] = await Promise.all([
    rankContext(user.id, db),
    getTasteProfile(user.id).catch(() => null),
  ]);
  const vettore = toTasteVector(profilo);

  const [movie, tv] = await Promise.all([
    perTipo(recipe, "movie", ctx, vettore).catch((): RankedItem[] => []),
    recipe.soloFilm
      ? Promise.resolve<RankedItem[]>([])
      : perTipo(recipe, "tv", ctx, vettore).catch((): RankedItem[] => []),
  ]);

  // Nella scheda "Tutto" un mood **non** alterna film e serie: l'alternanza metteva
  // Fleabag (1.935 voti) sopra Lei (15.601), e in un mood l'ordine e' la fama. I
  // momenti continuano ad alternare, che li' e' il comportamento di tutti gli scaffali.
  const picks = picksFor(recipe.key);
  const curati = new Set(picks.map((p) => `${p.mediaType}-${p.id}`));
  const perFama = (l: RankedItem[]) =>
    ordinaPerFama(
      l.map((i) => ({ voti: i.voteCount ?? 0, punteggio: i.punteggio, item: i })),
    ).map((v) => v.item);
  // I curati restano davanti anche qui. Ordinare tutto insieme per fama faceva salire
  // la coda generata in mezzo alla lista scelta — su "Cuore infranto" comparve The
  // Good Doctor, che ha molti voti e non c'entra niente con quello stato d'animo.
  const misti = [...movie, ...tv];
  const all =
    picks.length > 0
      ? [
          ...perFama(misti.filter((i) => curati.has(chiave(i)))),
          ...perFama(misti.filter((i) => !curati.has(chiave(i)))),
        ].slice(0, MOMENT_SIZE)
      : null;

  return {
    movie: movie.map(toShelfItem),
    tv: tv.map(toShelfItem),
    all: all
      ? all.map(toShelfItem)
      : mixShelf(movie.map(toShelfItem), tv.map(toShelfItem)),
  };
}
