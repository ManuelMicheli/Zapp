import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { CharacterVoteCount } from "./rank";

export interface CharacterVotes {
  counts: CharacterVoteCount[];
  /** La persona che ho scelto io, nulla se non ho votato. */
  myPersonId: number | null;
}

/**
 * Conteggi aggregati (RPC security definer: la policy fa vedere solo la propria
 * riga) e il mio voto, letti con la sessione dell'utente.
 */
export async function getCharacterVotes(
  userId: string,
  titleId: number,
  mediaType: "movie" | "tv",
): Promise<CharacterVotes> {
  const supabase = await createClient();
  const [countsRes, mineRes] = await Promise.all([
    supabase.rpc("character_vote_counts", { t_id: titleId, t_type: mediaType }),
    supabase
      .from("favorite_characters")
      .select("person_id")
      .eq("user_id", userId)
      .eq("title_id", titleId)
      .eq("media_type", mediaType)
      .maybeSingle(),
  ]);
  if (countsRes.error) console.error("getCharacterVotes counts", countsRes.error);
  if (mineRes.error) console.error("getCharacterVotes mine", mineRes.error);

  return {
    counts: (countsRes.data ?? []).map((row) => ({
      personId: Number(row.person_id),
      character: row.character_name,
      votes: Number(row.votes),
    })),
    myPersonId: mineRes.data ? Number(mineRes.data.person_id) : null,
  };
}
