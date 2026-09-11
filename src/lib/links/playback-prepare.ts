import "server-only";

import { unstable_cache } from "next/cache";
import { createServiceClient } from "@/lib/supabase/server";
import { isSafeExternalUrl } from "@/lib/validate";
import { resolvePlayback } from "./playback-resolve";
import { createPlaybackCache, playbackKey, type PlaybackTarget } from "./playback-cache";

const memory = createPlaybackCache({ max: 256, ttlMs: 24 * 60 * 60 * 1000 });

class PlaybackNotFound extends Error {}

async function loadPlayback(target: PlaybackTarget): Promise<string> {
  const db = createServiceClient();
  const { data: title } = await db
    .from("titles")
    .select("id,media_type,title,original_title")
    .eq("id", target.titleId)
    .eq("media_type", target.mediaType)
    .maybeSingle();
  if (!title) throw new PlaybackNotFound();

  const exact = await resolvePlayback(
    title,
    target.providerId,
    target.season,
    target.episode,
  );
  if (exact && isSafeExternalUrl(exact)) return exact;
  throw new PlaybackNotFound();
}

async function persistent(target: PlaybackTarget): Promise<string> {
  const key = playbackKey(target);
  return unstable_cache(() => loadPlayback(target), ["playback", key], {
    revalidate: 24 * 60 * 60,
  })();
}

/** Errori e risultati nulli lanciano: Next non li conserva come cache positiva. */
export async function getPreparedPlayback(target: PlaybackTarget): Promise<string | null> {
  try {
    return await memory.get(target, persistent);
  } catch {
    return null;
  }
}
