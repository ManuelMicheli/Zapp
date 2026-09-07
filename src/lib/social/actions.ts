"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { rateLimit } from "@/lib/rate-limit";
import { getOrFetchTitle } from "@/lib/tmdb/cache";
import { escapeLike, isMediaType, isTmdbId, isUuid } from "@/lib/validate";
import { getFeed, type FeedPage } from "./queries";

/** Paginazione del feed dal client (bottone "Carica altri"). */
export async function fetchFeedPage(cursor: string | null): Promise<FeedPage> {
  // `getFeed` legge il viewer e ritorna vuoto senza sessione.
  return getFeed(typeof cursor === "string" ? cursor.slice(0, 64) : null);
}

export interface SocialResult {
  ok: boolean;
  error?: string;
}

/** Messaggio unico verso il client: gli errori veri restano nei log del server. */
const GENERIC_ERROR = "Non è riuscito, riprova.";
const INVALID = { ok: false as const, error: "Richiesta non valida." };
const TOO_MANY = "Troppe richieste, riprova più tardi.";

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Non autenticato");
  return { supabase, user };
}

function refreshSocial() {
  revalidatePath("/friends");
  revalidatePath("/notifications");
  revalidatePath("/");
}

// ============ ricerca utenti (rate limit 20/min) ============

export interface UserSearchResult {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
}

export async function searchUsers(query: string): Promise<UserSearchResult[]> {
  const { supabase, user } = await requireUser();
  if (typeof query !== "string") return [];
  const q = query.trim().toLowerCase().slice(0, 40);
  if (q.length < 2) return [];
  if (!(await rateLimit(`usersearch:${user.id}`, 20, 60))) return [];

  const { data } = await supabase
    .from("user_search")
    .select("*")
    // `%`, `_` e `*` sono jolly per PostgREST: senza escape la ricerca per
    // prefisso diventava una ricerca "contiene" e apriva l'enumerazione.
    .ilike("username", `${escapeLike(q)}%`)
    .neq("id", user.id)
    .limit(10);
  return (data ?? []).filter(
    (r): r is UserSearchResult => r.id != null && r.username != null,
  );
}

// ============ amicizie ============

export async function sendFriendRequest(addresseeId: string): Promise<SocialResult> {
  if (!isUuid(addresseeId)) return INVALID;
  try {
    const { supabase, user } = await requireUser();
    if (addresseeId === user.id) return INVALID;
    if (!(await rateLimit(`friendreq:${user.id}`, 30, 3600))) {
      return { ok: false, error: TOO_MANY };
    }
    const { error } = await supabase.from("friendships").insert({
      requester_id: user.id,
      addressee_id: addresseeId,
      status: "pending",
    });
    if (error) {
      if (error.code === "23505") return { ok: false, error: "Richiesta già inviata." };
      return { ok: false, error: "Impossibile inviare la richiesta." };
    }
    refreshSocial();
    return { ok: true };
  } catch {
    return { ok: false, error: GENERIC_ERROR };
  }
}

export async function acceptFriendRequest(requesterId: string): Promise<SocialResult> {
  if (!isUuid(requesterId)) return INVALID;
  try {
    const { supabase, user } = await requireUser();
    if (!(await rateLimit(`friendreply:${user.id}`, 120, 3600))) {
      return { ok: false, error: TOO_MANY };
    }
    const { error } = await supabase
      .from("friendships")
      .update({ status: "accepted" })
      .eq("requester_id", requesterId)
      .eq("addressee_id", user.id)
      .eq("status", "pending");
    if (error) return { ok: false, error: GENERIC_ERROR };
    refreshSocial();
    return { ok: true };
  } catch {
    return { ok: false, error: GENERIC_ERROR };
  }
}

export async function declineFriendRequest(requesterId: string): Promise<SocialResult> {
  if (!isUuid(requesterId)) return INVALID;
  try {
    const { supabase, user } = await requireUser();
    if (!(await rateLimit(`friendreply:${user.id}`, 120, 3600))) {
      return { ok: false, error: TOO_MANY };
    }
    await supabase
      .from("friendships")
      .delete()
      .eq("requester_id", requesterId)
      .eq("addressee_id", user.id)
      .eq("status", "pending");
    refreshSocial();
    return { ok: true };
  } catch {
    return { ok: false, error: GENERIC_ERROR };
  }
}

/**
 * Cancella la riga in entrambi i versi. Sono due `delete` con filtri separati e
 * non un `.or()` costruito a stringa: dentro `.or()` il valore fa parte della
 * grammatica dei filtri PostgREST, quindi un id con virgole o parentesi
 * riscriveva la condizione.
 */
async function deleteFriendshipBothWays(
  supabase: Awaited<ReturnType<typeof requireUser>>["supabase"],
  a: string,
  b: string,
) {
  await supabase
    .from("friendships")
    .delete()
    .eq("requester_id", a)
    .eq("addressee_id", b);
  await supabase
    .from("friendships")
    .delete()
    .eq("requester_id", b)
    .eq("addressee_id", a);
}

export async function removeFriend(otherId: string): Promise<SocialResult> {
  if (!isUuid(otherId)) return INVALID;
  try {
    const { supabase, user } = await requireUser();
    if (otherId === user.id) return INVALID;
    if (!(await rateLimit(`friendedit:${user.id}`, 60, 3600))) {
      return { ok: false, error: TOO_MANY };
    }
    await deleteFriendshipBothWays(supabase, user.id, otherId);
    refreshSocial();
    return { ok: true };
  } catch {
    return { ok: false, error: GENERIC_ERROR };
  }
}

/** Blocca: elimina ogni relazione esistente e inserisce una riga blocked. */
export async function blockUser(otherId: string): Promise<SocialResult> {
  if (!isUuid(otherId)) return INVALID;
  try {
    const { supabase, user } = await requireUser();
    if (otherId === user.id) return INVALID;
    if (!(await rateLimit(`friendedit:${user.id}`, 60, 3600))) {
      return { ok: false, error: TOO_MANY };
    }
    await deleteFriendshipBothWays(supabase, user.id, otherId);
    const { error } = await supabase.from("friendships").insert({
      requester_id: user.id,
      addressee_id: otherId,
      status: "blocked",
    });
    if (error) return { ok: false, error: GENERIC_ERROR };
    refreshSocial();
    return { ok: true };
  } catch {
    return { ok: false, error: GENERIC_ERROR };
  }
}

// ============ consigli ============

export async function recommendTitle(
  toUserId: string,
  titleId: number,
  mediaType: "movie" | "tv",
  message: string,
): Promise<SocialResult> {
  if (!isUuid(toUserId) || !isTmdbId(titleId) || !isMediaType(mediaType)) return INVALID;
  if (typeof message !== "string") return INVALID;
  try {
    const { supabase, user } = await requireUser();
    if (toUserId === user.id) return INVALID;
    const text = message.trim();
    if (text.length > 280) return { ok: false, error: "Messaggio troppo lungo." };
    if (!(await rateLimit(`recommend:${user.id}`, 30, 3600))) {
      return { ok: false, error: TOO_MANY };
    }
    // La FK esige che il titolo sia in cache.
    await getOrFetchTitle(titleId, mediaType);
    const { error } = await supabase.from("recommendations").insert({
      from_user: user.id,
      to_user: toUserId,
      title_id: titleId,
      media_type: mediaType,
      message: text || null,
    });
    if (error) {
      if (error.code === "23505") return { ok: false, error: "Già consigliato." };
      return { ok: false, error: "Puoi consigliare solo agli amici." };
    }
    return { ok: true };
  } catch {
    return { ok: false, error: GENERIC_ERROR };
  }
}

export async function markRecommendationSeen(id: string): Promise<SocialResult> {
  if (!isUuid(id)) return INVALID;
  try {
    const { supabase, user } = await requireUser();
    await supabase
      .from("recommendations")
      .update({ seen_at: new Date().toISOString() })
      .eq("id", id)
      .eq("to_user", user.id);
    revalidatePath("/");
    return { ok: true };
  } catch {
    return { ok: false, error: GENERIC_ERROR };
  }
}

// ============ recensioni ============

export async function upsertReview(
  titleId: number,
  mediaType: "movie" | "tv",
  body: string,
  hasSpoilers: boolean,
): Promise<SocialResult> {
  if (!isTmdbId(titleId) || !isMediaType(mediaType) || typeof body !== "string") {
    return INVALID;
  }
  try {
    const { supabase, user } = await requireUser();
    const text = body.trim();
    if (text.length < 1 || text.length > 5000) {
      return { ok: false, error: "La recensione deve avere tra 1 e 5000 caratteri." };
    }
    if (!(await rateLimit(`review:${user.id}`, 10, 3600))) {
      return { ok: false, error: "Massimo 10 recensioni all'ora." };
    }
    await getOrFetchTitle(titleId, mediaType);
    const { error } = await supabase.from("reviews").upsert(
      {
        user_id: user.id,
        title_id: titleId,
        media_type: mediaType,
        body: text,
        has_spoilers: hasSpoilers === true,
      },
      { onConflict: "user_id,title_id,media_type" },
    );
    if (error) return { ok: false, error: "Errore di salvataggio." };
    revalidatePath(`/title/${mediaType}/${titleId}`);
    return { ok: true };
  } catch {
    return { ok: false, error: GENERIC_ERROR };
  }
}

export async function deleteReview(
  titleId: number,
  mediaType: "movie" | "tv",
): Promise<SocialResult> {
  if (!isTmdbId(titleId) || !isMediaType(mediaType)) return INVALID;
  try {
    const { supabase, user } = await requireUser();
    await supabase
      .from("reviews")
      .delete()
      .eq("user_id", user.id)
      .eq("title_id", titleId)
      .eq("media_type", mediaType);
    revalidatePath(`/title/${mediaType}/${titleId}`);
    return { ok: true };
  } catch {
    return { ok: false, error: GENERIC_ERROR };
  }
}

export async function addComment(
  reviewId: string,
  body: string,
  parentId: string | null,
  hasSpoilers: boolean,
): Promise<SocialResult> {
  if (!isUuid(reviewId) || typeof body !== "string") return INVALID;
  if (parentId !== null && !isUuid(parentId)) return INVALID;
  try {
    const { supabase, user } = await requireUser();
    const text = body.trim();
    if (text.length < 1 || text.length > 2000) {
      return { ok: false, error: "Commento tra 1 e 2000 caratteri." };
    }
    if (!(await rateLimit(`comment:${user.id}`, 30, 3600))) {
      return { ok: false, error: "Massimo 30 commenti all'ora." };
    }
    const { error } = await supabase.from("review_comments").insert({
      review_id: reviewId,
      user_id: user.id,
      parent_id: parentId,
      body: text,
      has_spoilers: hasSpoilers === true,
    });
    if (error) return { ok: false, error: GENERIC_ERROR };
    return { ok: true };
  } catch {
    return { ok: false, error: GENERIC_ERROR };
  }
}

export async function toggleReviewLike(
  reviewId: string,
  like: boolean,
): Promise<SocialResult> {
  if (!isUuid(reviewId)) return INVALID;
  try {
    const { supabase, user } = await requireUser();
    if (!(await rateLimit(`reviewlike:${user.id}`, 120, 3600))) {
      return { ok: false, error: TOO_MANY };
    }
    if (like) {
      const { error } = await supabase
        .from("review_likes")
        .insert({ review_id: reviewId, user_id: user.id });
      if (error && error.code !== "23505") return { ok: false, error: GENERIC_ERROR };
    } else {
      await supabase
        .from("review_likes")
        .delete()
        .eq("review_id", reviewId)
        .eq("user_id", user.id);
    }
    return { ok: true };
  } catch {
    return { ok: false, error: GENERIC_ERROR };
  }
}

/** "Mi piace" su un'attività del feed amici (toggle ottimistico dal client). */
export async function toggleActivityLike(
  activityId: string,
  like: boolean,
): Promise<SocialResult> {
  if (!isUuid(activityId)) return INVALID;
  try {
    const { supabase, user } = await requireUser();
    if (!(await rateLimit(`activitylike:${user.id}`, 120, 3600))) {
      return { ok: false, error: TOO_MANY };
    }
    if (like) {
      const { error } = await supabase
        .from("activity_likes")
        .insert({ activity_id: activityId, user_id: user.id });
      if (error && error.code !== "23505") return { ok: false, error: GENERIC_ERROR };
    } else {
      await supabase
        .from("activity_likes")
        .delete()
        .eq("activity_id", activityId)
        .eq("user_id", user.id);
    }
    return { ok: true };
  } catch {
    return { ok: false, error: GENERIC_ERROR };
  }
}

/**
 * Segnalazione. A tre segnalazioni una recensione sparisce dagli elenchi, quindi
 * il limite orario serve: senza, un pugno di account bastava a far sparire in
 * blocco le recensioni di qualcuno.
 */
export async function reportContent(
  targetType: "review" | "comment",
  targetId: string,
): Promise<SocialResult> {
  if (targetType !== "review" && targetType !== "comment") return INVALID;
  if (!isUuid(targetId)) return INVALID;
  try {
    const { supabase, user } = await requireUser();
    if (!(await rateLimit(`report:${user.id}`, 10, 3600))) {
      return { ok: false, error: "Massimo 10 segnalazioni all'ora." };
    }
    const { error } = await supabase.from("reports").insert({
      target_type: targetType,
      target_id: targetId,
      reporter_id: user.id,
      reason: null,
    });
    if (error && error.code !== "23505") return { ok: false, error: GENERIC_ERROR };
    return { ok: true };
  } catch {
    return { ok: false, error: GENERIC_ERROR };
  }
}

// ============ notifiche ============

export async function markNotificationsRead(): Promise<SocialResult> {
  try {
    const { supabase, user } = await requireUser();
    if (!(await rateLimit(`notifread:${user.id}`, 60, 60))) {
      return { ok: false, error: TOO_MANY };
    }
    await supabase
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("user_id", user.id)
      .is("read_at", null);
    revalidatePath("/notifications");
    revalidatePath("/friends");
    return { ok: true };
  } catch {
    return { ok: false, error: GENERIC_ERROR };
  }
}
