import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getViewer } from "@/lib/auth/viewer";
import { getFriendsData } from "@/lib/social/queries";
import type { LiveSession } from "./live";
import { PRESENCE_TTL_MS } from "./presence";

export interface FriendLiveSession extends LiveSession {
  userId: string;
  name: string;
  posterPath: string | null;
  friend: { username: string; displayName: string | null; avatarUrl: string | null };
}

/** Proiezione protetta dalla RLS: nessun accesso alle sessioni/dispositivi altrui. */
export async function getFriendsLive(friendId?: string): Promise<FriendLiveSession[]> {
  const viewer = await getViewer();
  if (!viewer) return [];
  const ids = friendId ? [friendId] : (await getFriendsData()).friends.map((f) => f.id);
  if (!ids.length) return [];
  const db = await createClient();
  const { data, error } = await db
    .from("watching_now")
    .select(
      "user_id,title_id,media_type,provider_id,season_number,episode_number,state,position_ms,duration_ms,measured_at,user:profiles!watching_now_user_id_fkey(username,display_name,avatar_url),title:titles!watching_now_title_id_media_type_fkey(title,poster_path)",
    )
    .in("user_id", ids)
    .neq("user_id", viewer.id)
    .gt("measured_at", new Date(Date.now() - PRESENCE_TTL_MS).toISOString())
    .order("measured_at", { ascending: false })
    .limit(100);
  if (error) {
    console.error("[watching] lettura amici", error);
    throw new Error("Live non disponibile");
  }
  return (data ?? []).flatMap((r) =>
    r.user && r.title
      ? [
          {
            userId: r.user_id,
            titleId: r.title_id,
            mediaType: r.media_type,
            providerId: r.provider_id,
            seasonNumber: r.season_number,
            episodeNumber: r.episode_number,
            state: r.state as LiveSession["state"],
            positionMs: Number(r.position_ms),
            durationMs: r.duration_ms === null ? null : Number(r.duration_ms),
            at: r.measured_at,
            name: r.title.title,
            posterPath: r.title.poster_path,
            friend: {
              username: r.user.username,
              displayName: r.user.display_name,
              avatarUrl: r.user.avatar_url,
            },
          },
        ]
      : [],
  );
}
