import "server-only";

import type { Db, MediaType } from "@/lib/rank/types";
import type { PlatformEntry } from "./catalog";

/**
 * La home "su una piattaforma" (`/su/netflix`): ogni sezione mostra solo ciò che quel
 * servizio ha in abbonamento. Questo modulo è il filtro comune per le liste che
 * nascono **dal database** (classifiche, simili, libreria, amici): i titoli arrivati da
 * un `discover` con `with_watch_providers` sono già certi e non passano di qui.
 *
 * `title_providers` è la cache delle offerte IT (`kind = flatrate`): un titolo che non
 * c'è ancora in cache **non passa**, e va bene così — meglio una copertina in meno che
 * una promessa sbagliata ("su NOW" per un film che NOW non ha).
 */

export type PlatformScope = PlatformEntry | null;

export interface TitleKeyLike {
  id: number;
  mediaType: MediaType;
}

export function chiaveTitolo(t: TitleKeyLike): string {
  return `${t.mediaType}-${t.id}`;
}

/** Quante chiavi entrano in una `in()`: oltre, PostgREST fa URL troppo lunghi. */
const BLOCCO = 300;

/**
 * Le chiavi `tipo-id`, fra quelle date, che la piattaforma ha in abbonamento secondo
 * `title_providers`. Una query per blocco di 300 id, tutte in parallelo.
 */
export async function onPlatform(
  db: Db,
  titoli: readonly TitleKeyLike[],
  entry: PlatformEntry,
): Promise<Set<string>> {
  const out = new Set<string>();
  const ids = [...new Set(titoli.map((t) => t.id))];
  if (ids.length === 0) return out;

  const blocchi: number[][] = [];
  for (let i = 0; i < ids.length; i += BLOCCO) blocchi.push(ids.slice(i, i + BLOCCO));

  const risposte = await Promise.all(
    blocchi.map((blocco) =>
      db
        .from("title_providers")
        .select("title_id, media_type")
        .in("title_id", blocco)
        .in("provider_id", entry.ids)
        .eq("kind", "flatrate"),
    ),
  );
  for (const { data, error } of risposte) {
    if (error) {
      // Una lista vuota per un errore è identica a una lista vuota per mancanza di
      // offerte: senza questa riga i due casi non si distinguono più.
      console.error("[piattaforma] offerte non lette:", error.message);
      continue;
    }
    for (const r of (data ?? []) as { title_id: number; media_type: MediaType }[]) {
      out.add(`${r.media_type}-${r.title_id}`);
    }
  }
  return out;
}

/** Tiene solo i titoli che la piattaforma ha; senza piattaforma, tutti. */
export async function soloSuPiattaforma<T extends TitleKeyLike>(
  db: Db,
  items: readonly T[],
  entry: PlatformScope,
): Promise<T[]> {
  if (!entry) return [...items];
  const presenti = await onPlatform(db, items, entry);
  return items.filter((i) => presenti.has(chiaveTitolo(i)));
}

/** `true` se uno degli id del titolo è uno di quelli con cui TMDB pubblica il servizio. */
export function offreLaPiattaforma(
  providerIds: readonly number[],
  entry: PlatformEntry,
): boolean {
  return providerIds.some((id) => entry.ids.includes(id));
}
