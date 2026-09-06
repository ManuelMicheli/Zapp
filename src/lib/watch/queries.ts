import "server-only";

import { createClient } from "@/lib/supabase/server";
import { getViewer } from "@/lib/auth/viewer";
import type { Tables } from "@/types/database";

/**
 * Colonne di `titles` per le liste: tutto tranne `raw` (~27 KB a riga, il JSON
 * TMDB completo) ed `external_ids`. Il progresso serie legge `seasons`, colonna
 * generata da `raw->'seasons'` (migration 0010).
 */
export const TITLE_LIST_COLUMNS =
  "id, media_type, title, original_title, overview, poster_path, backdrop_path, release_date, vote_average, vote_count, genres, runtime, number_of_seasons, number_of_episodes, seasons, fetched_at";

export type TitleListRow = Omit<Tables<"titles">, "raw" | "external_ids">;

export type EntryWithTitle = Tables<"watch_entries"> & {
  title:
    | (TitleListRow & {
        title_providers: Tables<"title_providers">[];
        title_provider_links: Tables<"title_provider_links">[];
      })
    | null;
};

const ENTRY_SELECT = `*, title:titles!watch_entries_title_id_media_type_fkey(${TITLE_LIST_COLUMNS}, title_providers(*), title_provider_links(*))`;

/** Quante "in corso" mostra la home (hero + scaffale). */
const HOME_WATCHING_LIMIT = 20;

/**
 * Colonna d'ordine per stato: "in corso" e "visti" per ultima visione effettiva
 * (`last_watched_at`: data del CSV per l'import, momento dell'azione altrimenti);
 * "da vedere" per data di aggiunta; "abbandonati" per ultimo aggiornamento.
 */
export function orderColumn(status: Tables<"watch_entries">["status"]) {
  if (status === "watching" || status === "watched") return "last_watched_at";
  if (status === "want") return "created_at";
  return "updated_at";
}

/** Le tre sezioni della home, una query per sezione, zero chiamate TMDB. */
export async function getHomeData() {
  const user = await getViewer();
  if (!user) return { watching: [], want: [], watched: [] };
  const supabase = await createClient();

  const [watching, want, watched] = await Promise.all([
    supabase
      .from("watch_entries")
      .select(ENTRY_SELECT)
      .eq("user_id", user.id)
      .eq("status", "watching")
      .order("last_watched_at", { ascending: false })
      .limit(HOME_WATCHING_LIMIT),
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
      .order("last_watched_at", { ascending: false })
      .limit(10),
  ]);

  return {
    watching: (watching.data ?? []) as EntryWithTitle[],
    want: (want.data ?? []) as EntryWithTitle[],
    watched: (watched.data ?? []) as EntryWithTitle[],
  };
}

/** Riga di libreria: solo ciò che la griglia mostra. */
export interface LibraryItem {
  titleId: number;
  mediaType: Tables<"watch_entries">["media_type"];
  status: Tables<"watch_entries">["status"];
  rating: number | null;
  name: string;
  posterPath: string | null;
  year: string | null;
}

export interface LibraryPage {
  items: LibraryItem[];
  /** Totale delle entry con questo stato (e tipo), per "N titoli". */
  total: number;
}

const LIBRARY_SELECT =
  "title_id, media_type, status, rating, title:titles!watch_entries_title_id_media_type_fkey(title, poster_path, release_date)";

/**
 * Pagina di libreria: `limit` entry a partire da `offset`, ordinate per `orderColumn`.
 * Filtro per tipo lato DB. Una libreria da 1000+ titoli non viene mai scaricata intera.
 */
export async function getLibraryPage(
  status: Tables<"watch_entries">["status"],
  mediaType: "movie" | "tv" | null,
  offset: number,
  limit: number,
): Promise<LibraryPage> {
  const user = await getViewer();
  if (!user) return { items: [], total: 0 };
  const supabase = await createClient();

  let query = supabase
    .from("watch_entries")
    .select(LIBRARY_SELECT, { count: "exact" })
    .eq("user_id", user.id)
    .eq("status", status);
  if (mediaType) query = query.eq("media_type", mediaType);
  const { data, count } = await query
    .order(orderColumn(status), { ascending: false })
    .range(offset, offset + limit - 1);

  return {
    items: (data ?? []).map((e) => ({
      titleId: e.title_id,
      mediaType: e.media_type,
      status: e.status,
      rating: e.rating,
      name: e.title?.title ?? "",
      posterPath: e.title?.poster_path ?? null,
      year: e.title?.release_date?.slice(0, 4) ?? null,
    })),
    total: count ?? 0,
  };
}
