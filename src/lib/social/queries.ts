import "server-only";

import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { getViewer } from "@/lib/auth/viewer";
import type { Tables } from "@/types/database";

export interface MiniProfile {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
}

export interface FriendsData {
  friends: MiniProfile[];
  incoming: MiniProfile[];
  outgoingIds: string[];
}

/**
 * Amici accettati + richieste in arrivo + richieste inviate.
 *
 * In React `cache()` perche' la stessa richiesta la chiede piu' volte da posti
 * diversi: la scheda titolo da `TitleActions` **e** da `TitleReviews` (due sezioni
 * in Suspense), `/cinema` due volte, e ora anche "Cosa guardano gli amici" in home.
 * Erano query identiche ripetute nello stesso render; adesso e' una sola.
 */
export const getFriendsData = cache(async (): Promise<FriendsData> => {
  const supabase = await createClient();
  const user = await getViewer();
  if (!user) return { friends: [], incoming: [], outgoingIds: [] };

  const { data: rows } = await supabase
    .from("friendships")
    .select(
      "requester_id, addressee_id, status, requester:profiles!friendships_requester_id_fkey(id, username, display_name, avatar_url), addressee:profiles!friendships_addressee_id_fkey(id, username, display_name, avatar_url)",
    )
    .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`);

  const friends: MiniProfile[] = [];
  const incoming: MiniProfile[] = [];
  const outgoingIds: string[] = [];

  for (const row of rows ?? []) {
    if (row.status === "accepted") {
      const other = row.requester_id === user.id ? row.addressee : row.requester;
      if (other) friends.push(other);
    } else if (row.status === "pending") {
      if (row.addressee_id === user.id && row.requester) incoming.push(row.requester);
      else if (row.requester_id === user.id) outgoingIds.push(row.addressee_id);
    }
  }
  return { friends, incoming, outgoingIds };
});

// ============ feed ============

type ActivityRow = Tables<"activities"> & { profile: MiniProfile | null };

export interface FeedItem {
  id: string;
  user: MiniProfile;
  kind: "started" | "finished" | "rated" | "reviewed" | "wanted" | "recommended";
  titleId: number;
  mediaType: "movie" | "tv";
  titleName: string;
  posterPath: string | null;
  backdropPath: string | null;
  createdAt: string;
  /** "mi piace" sull'attività: totale e se l'ho messo io */
  likeCount: number;
  likedByMe: boolean;
  /** episodi aggregati nello stesso giorno */
  episodeCount?: number;
  season?: number;
  episode?: number;
  rating?: number;
  /** "ha finito X e gli ha dato N" */
  finishedAndRated?: boolean;
}

export interface FeedPage {
  items: FeedItem[];
  nextCursor: string | null;
}

/**
 * Feed cronologico delle attività degli amici, aggregato:
 * - più episodi della stessa serie nello stesso giorno → una riga
 * - rated+finished sullo stesso titolo entro 10 minuti → una riga
 * - `wanted` escluso; `recommended` solo se destinato a me
 */
export async function getFeed(cursor: string | null, pageSize = 20): Promise<FeedPage> {
  const supabase = await createClient();
  const user = await getViewer();
  if (!user) return { items: [], nextCursor: null };

  // 3x pageSize di attività grezze per compensare l'aggregazione
  let query = supabase
    .from("activities")
    .select(
      "*, profile:profiles!activities_user_id_fkey(id, username, display_name, avatar_url)",
    )
    .neq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(pageSize * 3);
  if (cursor) query = query.lt("created_at", cursor);

  const { data: raw } = await query;
  const rows = (raw ?? []) as ActivityRow[];
  if (rows.length === 0) return { items: [], nextCursor: null };

  // titoli in una sola query (niente FK per l'embed su activities)
  const titleKeys = new Map<string, { id: number; type: "movie" | "tv" }>();
  for (const row of rows) {
    titleKeys.set(`${row.media_type}:${row.title_id}`, {
      id: row.title_id,
      type: row.media_type,
    });
  }
  const { data: titles } = await supabase
    .from("titles")
    .select("id, media_type, title, poster_path, backdrop_path")
    .in(
      "id",
      [...titleKeys.values()].map((t) => t.id),
    );
  const titleMap = new Map((titles ?? []).map((t) => [`${t.media_type}:${t.id}`, t]));

  const items: FeedItem[] = [];
  const consumed = new Set<string>();

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (consumed.has(row.id) || !row.profile) continue;
    if (row.kind === "wanted") continue;
    if (row.kind === "recommended") {
      const payload = row.payload as { to_user?: string } | null;
      if (payload?.to_user !== user.id) continue;
    }

    const title = titleMap.get(`${row.media_type}:${row.title_id}`);
    if (!title) continue;

    const base: FeedItem = {
      id: row.id,
      user: row.profile,
      kind: row.kind as FeedItem["kind"],
      titleId: row.title_id,
      mediaType: row.media_type,
      titleName: title.title,
      posterPath: title.poster_path,
      backdropPath: title.backdrop_path,
      createdAt: row.created_at,
      likeCount: 0,
      likedByMe: false,
    };

    if (row.kind === "started" && row.media_type === "tv") {
      // aggrega gli episodi dello stesso giorno / stessa serie / stesso utente
      const day = row.created_at.slice(0, 10);
      const group = rows.filter(
        (r) =>
          !consumed.has(r.id) &&
          r.kind === "started" &&
          r.user_id === row.user_id &&
          r.title_id === row.title_id &&
          r.media_type === "tv" &&
          r.created_at.slice(0, 10) === day,
      );
      group.forEach((r) => consumed.add(r.id));
      const payload = row.payload as { season?: number; episode?: number } | null;
      items.push({
        ...base,
        episodeCount: group.length,
        season: payload?.season,
        episode: payload?.episode,
      });
      continue;
    }

    if (row.kind === "finished" || row.kind === "rated") {
      // fondi rated+finished sullo stesso titolo entro 10 minuti
      const twin = rows.find(
        (r) =>
          !consumed.has(r.id) &&
          r.id !== row.id &&
          r.user_id === row.user_id &&
          r.title_id === row.title_id &&
          r.media_type === row.media_type &&
          ((row.kind === "finished" && r.kind === "rated") ||
            (row.kind === "rated" && r.kind === "finished")) &&
          Math.abs(
            new Date(r.created_at).getTime() - new Date(row.created_at).getTime(),
          ) <
            10 * 60 * 1000,
      );
      consumed.add(row.id);
      if (twin) {
        consumed.add(twin.id);
        const ratedRow = row.kind === "rated" ? row : twin;
        const payload = ratedRow.payload as { rating?: number } | null;
        items.push({
          ...base,
          kind: "finished",
          finishedAndRated: true,
          rating: payload?.rating,
        });
        continue;
      }
      if (row.kind === "rated") {
        const payload = row.payload as { rating?: number } | null;
        items.push({ ...base, rating: payload?.rating });
        continue;
      }
      items.push(base);
      continue;
    }

    consumed.add(row.id);
    items.push(base);
  }

  const page = items.slice(0, pageSize);

  // "mi piace" della pagina in una sola query (RLS: solo attività visibili)
  if (page.length > 0) {
    const { data: likes } = await supabase
      .from("activity_likes")
      .select("activity_id, user_id")
      .in(
        "activity_id",
        page.map((i) => i.id),
      );
    const counts = new Map<string, number>();
    const mine = new Set<string>();
    for (const like of likes ?? []) {
      counts.set(like.activity_id, (counts.get(like.activity_id) ?? 0) + 1);
      if (like.user_id === user.id) mine.add(like.activity_id);
    }
    for (const item of page) {
      item.likeCount = counts.get(item.id) ?? 0;
      item.likedByMe = mine.has(item.id);
    }
  }

  const nextCursor =
    rows.length >= pageSize * 3 && page.length > 0
      ? page[page.length - 1].createdAt
      : null;
  return { items: page, nextCursor };
}

// ============ consigli in home ============

export interface HomeRecommendation {
  id: string;
  from: MiniProfile;
  titleId: number;
  mediaType: "movie" | "tv";
  titleName: string;
  posterPath: string | null;
  message: string | null;
}

export async function getHomeRecommendations(): Promise<HomeRecommendation[]> {
  const supabase = await createClient();
  const user = await getViewer();
  if (!user) return [];

  const { data } = await supabase
    .from("recommendations")
    .select(
      "id, title_id, media_type, message, from:profiles!recommendations_from_user_fkey(id, username, display_name, avatar_url), title:titles!recommendations_title_id_media_type_fkey(title, poster_path)",
    )
    .eq("to_user", user.id)
    .is("seen_at", null)
    .order("created_at", { ascending: false })
    .limit(10);

  return (data ?? [])
    .filter((r) => r.from && r.title)
    .map((r) => ({
      id: r.id,
      from: r.from!,
      titleId: r.title_id,
      mediaType: r.media_type,
      titleName: r.title!.title,
      posterPath: r.title!.poster_path,
      message: r.message,
    }));
}

export interface LibraryRecommendation extends HomeRecommendation {
  createdAt: string;
}

/** Tutti i consigli ancora presenti nell'inbox Libreria, non solo i non letti. */
export async function getLibraryRecommendations(): Promise<LibraryRecommendation[]> {
  const supabase = await createClient();
  const user = await getViewer();
  if (!user) return [];
  const { data } = await supabase
    .from("recommendations")
    .select(
      "id, title_id, media_type, message, created_at, from:profiles!recommendations_from_user_fkey(id, username, display_name, avatar_url), title:titles!recommendations_title_id_media_type_fkey(title, poster_path)",
    )
    .eq("to_user", user.id)
    .order("created_at", { ascending: false })
    .limit(60);
  return (data ?? [])
    .filter((r) => r.from && r.title)
    .map((r) => ({
      id: r.id,
      from: r.from!,
      titleId: r.title_id,
      mediaType: r.media_type,
      titleName: r.title!.title,
      posterPath: r.title!.poster_path,
      message: r.message,
      createdAt: r.created_at,
    }));
}

// ============ "Guardato da" sulla scheda ============

export interface FriendWatch {
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  status: "watching" | "watched";
}

export async function getFriendsWatching(
  titleId: number,
  mediaType: "movie" | "tv",
): Promise<FriendWatch[]> {
  const supabase = await createClient();
  const user = await getViewer();
  if (!user) return [];

  // RLS restituisce solo le entry proprie e degli amici (non private)
  const { data } = await supabase
    .from("watch_entries")
    .select(
      "status, user:profiles!watch_entries_user_id_fkey(username, display_name, avatar_url)",
    )
    .eq("title_id", titleId)
    .eq("media_type", mediaType)
    .neq("user_id", user.id)
    .in("status", ["watching", "watched"]);

  return (data ?? [])
    .filter((r) => r.user)
    .map((r) => ({
      username: r.user!.username,
      displayName: r.user!.display_name,
      avatarUrl: r.user!.avatar_url,
      status: r.status as "watching" | "watched",
    }));
}

// ============ "Gli amici stanno guardando" (home) ============

export interface FriendWatchingItem {
  userId: string;
  titleId: number;
  mediaType: "movie" | "tv";
  name: string;
  posterPath: string | null;
  friend: { username: string; displayName: string | null; avatarUrl: string | null };
}

/**
 * Cosa hanno in corso gli amici adesso, il piu' recente per primo.
 * Un titolo compare una volta sola, col primo amico che lo sta guardando.
 *
 * **Gli id degli amici si nominano nella query, non si lasciano dedurre alla RLS.**
 * Prima il filtro era il solo `user_id <> io`: nessuno degli indici di
 * `watch_entries` comincia per qualcosa di diverso da `user_id`, quindi Postgres
 * leggeva l'intera tabella, la ordinava per `last_watched_at` e su ogni riga
 * chiamava `are_friends()` (SECURITY DEFINER) finche' non ne trovava 60 ammesse.
 * In produzione: 262 ms di media e fino a 1,4 s su una sola sezione della home
 * (pg_stat_statements, 2026-09-08). Con `.in("user_id", …)` si torna sull'indice
 * `(user_id, status, last_watched_at desc)` e `are_friends()` non viene chiamata
 * per righe che non passerebbero comunque. Il risultato e' lo stesso: la RLS
 * mostrava esattamente gli amici, e continua a filtrare i profili privati.
 * Senza amici la query non parte nemmeno.
 */
export async function getFriendsWatchingHome(limit = 20): Promise<FriendWatchingItem[]> {
  const supabase = await createClient();
  const user = await getViewer();
  if (!user) return [];

  const { friends } = await getFriendsData();
  if (friends.length === 0) return [];

  const { data } = await supabase
    .from("watch_entries")
    .select(
      "user_id, title_id, media_type, last_watched_at, user:profiles!watch_entries_user_id_fkey(username, display_name, avatar_url), title:titles!watch_entries_title_id_media_type_fkey(title, poster_path)",
    )
    .eq("status", "watching")
    .in(
      "user_id",
      friends.map((f) => f.id),
    )
    .order("last_watched_at", { ascending: false })
    .limit(limit * 3);

  const out: FriendWatchingItem[] = [];
  const seen = new Set<string>();
  for (const row of data ?? []) {
    if (out.length >= limit) break;
    if (!row.user || !row.title?.poster_path) continue;
    const key = `${row.media_type}-${row.title_id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      userId: row.user_id,
      titleId: row.title_id,
      mediaType: row.media_type as "movie" | "tv",
      name: row.title.title,
      posterPath: row.title.poster_path,
      friend: {
        username: row.user.username,
        displayName: row.user.display_name,
        avatarUrl: row.user.avatar_url,
      },
    });
  }
  return out;
}

// ============ notifiche ============

export async function getUnreadNotificationCount(): Promise<number> {
  const supabase = await createClient();
  const user = await getViewer();
  if (!user) return 0;
  const { count } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .is("read_at", null);
  return count ?? 0;
}
