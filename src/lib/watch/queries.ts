import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/types/database";

export type EntryWithTitle = Tables<"watch_entries"> & {
  title:
    | (Tables<"titles"> & {
        title_providers: Tables<"title_providers">[];
        title_provider_links: Tables<"title_provider_links">[];
      })
    | null;
};

const ENTRY_SELECT =
  "*, title:titles!watch_entries_title_id_media_type_fkey(*, title_providers(*), title_provider_links(*))";

/** Le tre sezioni della home, una query per sezione, zero chiamate TMDB. */
export async function getHomeData() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { watching: [], want: [], watched: [] };

  const [watching, want, watched] = await Promise.all([
    supabase
      .from("watch_entries")
      .select(ENTRY_SELECT)
      .eq("user_id", user.id)
      .eq("status", "watching")
      .order("updated_at", { ascending: false }),
    supabase
      .from("watch_entries")
      .select(ENTRY_SELECT)
      .eq("user_id", user.id)
      .eq("status", "want")
      .order("created_at", { ascending: false })
      .limit(15),
    supabase
      .from("watch_entries")
      .select(ENTRY_SELECT)
      .eq("user_id", user.id)
      .eq("status", "watched")
      .order("updated_at", { ascending: false })
      .limit(10),
  ]);

  return {
    watching: (watching.data ?? []) as EntryWithTitle[],
    want: (want.data ?? []) as EntryWithTitle[],
    watched: (watched.data ?? []) as EntryWithTitle[],
  };
}

export async function getLibrary(status: Tables<"watch_entries">["status"]) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data } = await supabase
    .from("watch_entries")
    .select(ENTRY_SELECT)
    .eq("user_id", user.id)
    .eq("status", status)
    .order("updated_at", { ascending: false });

  return (data ?? []) as EntryWithTitle[];
}
