import "server-only";

import { cache } from "react";
import { getViewer } from "@/lib/auth/viewer";
import { toShelfItem } from "@/lib/genres/list";
import type { ShelfItem } from "@/lib/home/shelves-rank";
import { affinity } from "@/lib/rank/affinity";
import { arricchisci, candidatiDaTmdb } from "@/lib/rank/candidates";
import { diversify } from "@/lib/rank/diversity";
import { rankContext } from "@/lib/rank/engine";
import { consigliabile } from "@/lib/rank/filters";
import type { RankCandidate, RankContext, RankedItem } from "@/lib/rank/types";
import type { TasteVector } from "@/lib/rank/vector";
import { getPersonalContext } from "@/lib/similar/personal";
import { createClient } from "@/lib/supabase/server";
import { discoverForPlatform } from "@/lib/tmdb/client";
import type { MediaType } from "@/lib/genres/catalog";
import type { PlatformEntry } from "./catalog";

/**
 * La lista di una pillola "Per piattaforma".
 *
 * A differenza dei generi **non c'è una testa curata**: il catalogo di Netflix cambia
 * ogni mese, una lista scritta a mano in un file invecchierebbe in silenzio e mostrerebbe
 * titoli che quella piattaforma non ha più. Quindi tutto arriva da `discover` (le prime
 * pagine, cioè i titoli più popolari **di quel catalogo**) e l'ordine è il gusto: stesse
 * regole dei consigli della home, stesso profilo, stesse esclusioni.
 *
 * Niente di personale entra nelle `fetch`: `discoverForPlatform` ha `revalidate: 3600` e
 * parametri uguali per tutti, quindi la cache di Next è condivisa. Il gusto lavora dopo,
 * in memoria, su ciò che è già arrivato.
 */

/** Quanti titoli riempiono la pagina di una piattaforma. */
export const PLATFORM_SIZE = 40;
/** Quante pagine di `discover` si chiedono: 20 risultati l'una. */
const PAGINE = 4;
/**
 * Dentro una piattaforma il tetto di quattro titoli per piattaforma non ha senso — la
 * piattaforma è il motivo per cui si è lì. Restano i tetti su generi e registi: una
 * pagina di Netflix tutta di action non è un catalogo, è un genere.
 */
const MAX_PER_PIATTAFORMA = PLATFORM_SIZE;

function chiave(c: { id: number; mediaType: MediaType }): string {
  return `${c.mediaType}-${c.id}`;
}

/** Sotto questo numero di candidati la pagina sembrerebbe rotta: si riprova senza soglie. */
const TROPPO_POCHI = 20;

async function pagineDi(
  entry: PlatformEntry,
  type: MediaType,
  senzaSoglie: boolean,
): Promise<RankCandidate[]> {
  const pagine = await Promise.all(
    Array.from({ length: PAGINE }, (_, i) =>
      discoverForPlatform(type, entry.ids, { page: i + 1, senzaSoglie })
        .then((p) => candidatiDaTmdb(p.results, type))
        .catch(() => null),
    ),
  );
  return pagine.flatMap((p) => p ?? []);
}

/**
 * I candidati di una piattaforma. Il secondo giro **senza soglie** serve ai cataloghi
 * minuscoli: Discovery+ ha 67 film in abbonamento in Italia e quattro con almeno cento
 * voti, quindi con le sole soglie la sua pagina dei film usciva con quattro copertine.
 * I titoli votati restano davanti, perché arrivano prima e il resto li segue.
 * Esportata per la home filtrata (`src/lib/rank/scoped.ts`): stesso catalogo, poi il
 * motore intero invece di questa pipeline corta.
 */
export async function platformCandidates(
  entry: PlatformEntry,
  type: MediaType,
): Promise<RankCandidate[]> {
  const conSoglie = await pagineDi(entry, type, false);
  const distinti = new Set(conSoglie.map(chiave)).size;
  if (distinti >= TROPPO_POCHI) return conSoglie;
  return [...conSoglie, ...(await pagineDi(entry, type, true))];
}

async function perTipo(
  entry: PlatformEntry,
  type: MediaType,
  ctx: RankContext,
  vettore: TasteVector,
): Promise<RankedItem[]> {
  const visti = new Set<string>();
  const puliti: RankCandidate[] = [];
  for (const c of await platformCandidates(entry, type)) {
    const k = chiave(c);
    // Stessi filtri del motore: un nome che non si può leggere o un reality travestito
    // da commedia non entrano in una lista solo perché qui la pipeline è più corta.
    if (visti.has(k) || ctx.inLibreria.has(k) || !consigliabile(c)) continue;
    visti.add(k);
    puliti.push(c);
  }
  if (puliti.length === 0) return [];

  // ZappScore, durata, piattaforme e persone: servono all'affinità e al voto sulla
  // copertina. Una passata sola per l'intera lista, come fanno i generi.
  const arricchiti = await arricchisci(puliti.slice(0, PLATFORM_SIZE * 2), ctx.db).catch(
    () => puliti.slice(0, PLATFORM_SIZE * 2),
  );

  const valutati = arricchiti
    .map((c): RankedItem => {
      const a = affinity(vettore, c);
      return {
        ...c,
        punteggio: a.punteggio,
        percentuale: a.percentuale,
        contributi: a.contributi,
        // Il motivo qui sarebbe rumore: il titolo della pagina dice già perché è lì.
        motivo: null,
      };
    })
    .sort((a, b) => b.punteggio - a.punteggio);

  return diversify(valutati, PLATFORM_SIZE, { perProvider: MAX_PER_PIATTAFORMA });
}

/**
 * La lista di una piattaforma senza dipendenze dalla richiesta HTTP: contesto e profilo
 * arrivano **come parametri**, così la stessa funzione gira in pagina e da riga di
 * comando. Stessa divisione di `genreListFor`.
 */
export async function platformListFor(
  entry: PlatformEntry,
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
export const getPlatformList = cache(
  async (entry: PlatformEntry, type: MediaType): Promise<ShelfItem[]> => {
    const user = await getViewer();
    if (!user) return [];
    const db = await createClient();
    const [ctx, personale] = await Promise.all([
      rankContext(user.id, db),
      getPersonalContext(),
    ]);
    return platformListFor(entry, type, ctx, personale.vector);
  },
);
