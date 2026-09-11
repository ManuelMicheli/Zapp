import "server-only";
import { getViewer } from "@/lib/auth/viewer";
import { createClient } from "@/lib/supabase/server";

export interface WatchedPlatform {
  titleId: number;
  mediaType: "movie" | "tv";
  providerId: number;
}

/** Un'unica query: una sola sessione per titolo, anche conclusa, filtrata sul proprietario. */
export async function getWatchedPlatforms(
  entries: { title_id: number }[],
): Promise<WatchedPlatform[]> {
  if (!entries.length) return [];
  const viewer = await getViewer();
  if (!viewer) return [];
  const client = await createClient();
  const ids = [...new Set(entries.map((e) => e.title_id))];
  const { data, error } = await client
    .from("titles")
    .select("id,media_type,watch_sessions(provider_id,last_heartbeat_at)")
    .in("id", ids)
    .eq("watch_sessions.user_id", viewer.id)
    .order("last_heartbeat_at", { referencedTable: "watch_sessions", ascending: false })
    .limit(1, { referencedTable: "watch_sessions" })
    .limit(ids.length * 2);
  if (error) {
    console.error("[home] piattaforme visione non disponibili", error);
    return [];
  }
  return (data ?? []).flatMap((row) => {
    const latest = row.watch_sessions[0];
    return latest
      ? [{ titleId: row.id, mediaType: row.media_type, providerId: latest.provider_id }]
      : [];
  });
}
