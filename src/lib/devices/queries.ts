import "server-only";

import { createClient } from "@/lib/supabase/server";

/**
 * Le TV che questo utente puo' comandare: collegate, non revocate.
 *
 * Legge col client dell'utente, quindi la RLS fa il filtro — e il codice non ha
 * bisogno di ripetere "solo le mie", che e' la parte che si dimentica.
 */
export async function tvCollegate(): Promise<{ id: string; name: string }[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("devices")
    .select("id, name, platform, revoked_at, device_members!inner(user_id)")
    .is("revoked_at", null)
    .in("platform", ["fire_tv", "android_tv"])
    .order("created_at");
  return (data ?? []).map((d) => ({ id: d.id, name: d.name }));
}
