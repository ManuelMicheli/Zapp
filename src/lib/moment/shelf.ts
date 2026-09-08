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
import type { Recipe } from "./recipes";

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
export interface MomentResponse {
  titolo: string;
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
    year: i.year,
    // `rating` non è decorativo: `PosterCard` disegna "per te N%" dentro la riga del
    // voto, quindi senza voto l'affinità non compare affatto.
    rating: i.zappScore ?? i.voteAverage,
    affinity: i.percentuale,
    reason: i.motivo,
  };
}

async function perTipo(
  recipe: Recipe,
  type: MediaType,
  ctx: RankContext,
  vettore: TasteVector,
): Promise<ShelfItem[]> {
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

  const daKeyword = new Set<string>();
  const candidati: RankCandidate[] = [];
  const visti = new Set<string>();
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
  if (candidati.length === 0) return [];

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
  return diversify([...inTesta, ...resto], MOMENT_SIZE).map(toShelfItem);
}

/**
 * Le tre varianti insieme (film, serie, tutto): la fila segue la pillola Film / Serie
 * TV come gli altri scaffali, e il cambio non deve tornare al server.
 *
 * Niente `cache()` di React: viene chiamata una volta per render della home e una volta
 * per richiesta all'API, e la chiave sarebbe l'identità di un oggetto.
 */
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
    perTipo(recipe, "movie", ctx, vettore).catch(() => []),
    recipe.soloFilm
      ? Promise.resolve<ShelfItem[]>([])
      : perTipo(recipe, "tv", ctx, vettore).catch(() => []),
  ]);
  return { movie, tv, all: mixShelf(movie, tv) };
}
