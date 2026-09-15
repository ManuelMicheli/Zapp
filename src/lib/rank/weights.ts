import "server-only";

import { toPesi } from "./tune";
import type { Db, PesiGusto } from "./types";

/**
 * I pesi tarati su un utente, letti da `user_rank_weights` (migration 0061).
 *
 * Qualunque cosa vada storta — riga assente, colonna corrotta, errore di lettura —
 * torna ai pesi di partenza: la taratura è un miglioramento, non una dipendenza, e una
 * home che non si apre perché una riga di pesi è illeggibile sarebbe un pessimo affare.
 */
export async function getRankWeights(db: Db, userId: string): Promise<PesiGusto> {
  const { data, error } = await db
    .from("user_rank_weights")
    .select("pesi")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) {
    console.error("[rank] pesi non letti:", error.message);
    return toPesi(null);
  }
  return toPesi(data?.pesi ?? null);
}
