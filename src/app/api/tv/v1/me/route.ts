import type { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { tvJson, withBearer } from "@/lib/tv/bearer";

/** Attribuzione TMDB: obbligatoria ovunque si mostrino i suoi dati, TV compresa. */
const TMDB_ATTRIBUTION =
  "This product uses the TMDB API but is not endorsed or certified by TMDB.";

export async function GET(request: NextRequest) {
  return withBearer(request, async (ctx) => {
    const supabase = await createClient();
    const [{ data: profilo }, { data: device }] = await Promise.all([
      supabase
        .from("profiles")
        .select("id, username, display_name, avatar_url")
        .eq("id", ctx.userId)
        .maybeSingle(),
      supabase
        .from("devices")
        .select("id, name, platform, last_seen_at")
        .eq("id", ctx.deviceId)
        .maybeSingle(),
    ]);
    // La TV Android ha il listener: "listening" = il permesso notifiche risulta
    // attivo, e lo sa solo lei. Qui si dice se il server ha visto eventi di recente.
    const visto = device?.last_seen_at ? Date.parse(device.last_seen_at) : null;
    const listening = visto !== null && Date.now() - visto < 15 * 60 * 1000;
    return tvJson({
      user: profilo ?? {
        id: ctx.userId,
        username: null,
        display_name: null,
        avatar_url: null,
      },
      device: device ?? null,
      listening,
      tmdbAttribution: TMDB_ATTRIBUTION,
    });
  });
}

export const dynamic = "force-dynamic";
