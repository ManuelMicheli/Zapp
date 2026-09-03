"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { rateLimit } from "@/lib/rate-limit";
import { getOrFetchTitle } from "@/lib/tmdb/cache";
import { getFeed, type FeedPage } from "./queries";

/** Paginazione del feed dal client (bottone "Carica altri"). */
export async function fetchFeedPage(cursor: string | null): Promise<FeedPage> {
  return getFeed(cursor);
}

export interface SocialResult {
  ok: boolean;
  error?: string;
}

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
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];
  if (!(await rateLimit(`usersearch:${user.id}`, 20, 60))) return [];

  const { data } = await supabase
    .from("user_search")
    .select("*")
    .ilike("username", `${q}%`)
    .neq("id", user.id)
    .limit(10);
  return (data ?? []).filter(
    (r): r is UserSearchResult => r.id != null && r.username != null,
  );
}

// ============ amicizie ============

export async function sendFriendRequest(addresseeId: string): Promise<SocialResult> {
  try {
    const { supabase, user } = await requireUser();
    if (!(await rateLimit(`friendreq:${user.id}`, 30, 3600))) {
      return { ok: false, error: "Troppe richieste, riprova più tardi." };
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
    return { ok: false, error: "Errore" };
  }
}

export async function acceptFriendRequest(requesterId: string): Promise<SocialResult> {
  try {
    const { supabase, user } = await requireUser();
    const { error } = await supabase
      .from("friendships")
      .update({ status: "accepted" })
      .eq("requester_id", requesterId)
      .eq("addressee_id", user.id)
      .eq("status", "pending");
    if (error) return { ok: false, error: "Errore" };
    refreshSocial();
    return { ok: true };
  } catch {
    return { ok: false, error: "Errore" };
  }
}

export async function declineFriendRequest(requesterId: string): Promise<SocialResult> {
  try {
    const { supabase, user } = await requireUser();
    await supabase
      .from("friendships")
      .delete()
      .eq("requester_id", requesterId)
      .eq("addressee_id", user.id)
      .eq("status", "pending");
    refreshSocial();
    return { ok: true };
  } catch {
    return { ok: false, error: "Errore" };
  }
}

export async function removeFriend(otherId: string): Promise<SocialResult> {
  try {
    const { supabase, user } = await requireUser();
    await supabase
      .from("friendships")
      .delete()
      .or(
        `and(requester_id.eq.${user.id},addressee_id.eq.${otherId}),and(requester_id.eq.${otherId},addressee_id.eq.${user.id})`,
      );
    refreshSocial();
    return { ok: true };
  } catch {
    return { ok: false, error: "Errore" };
  }
}

/** Blocca: elimina ogni relazione esistente e inserisce una riga blocked. */
export async function blockUser(otherId: string): Promise<SocialResult> {
  try {
    const { supabase, user } = await requireUser();
    await supabase
      .from("friendships")
      .delete()
      .or(
        `and(requester_id.eq.${user.id},addressee_id.eq.${otherId}),and(requester_id.eq.${otherId},addressee_id.eq.${user.id})`,
      );
    const { error } = await supabase.from("friendships").insert({
      requester_id: user.id,
      addressee_id: otherId,
      status: "blocked",
    });
    if (error) return { ok: false, error: "Errore" };
    refreshSocial();
    return { ok: true };
  } catch {
    return { ok: false, error: "Errore" };
  }
}

// ============ consigli ============

export async function recommendTitle(
  toUserId: string,
  titleId: number,
  mediaType: "movie" | "tv",
  message: string,
): Promise<SocialResult> {
  try {
    const { supabase, user } = await requireUser();
    if (message.length > 280) return { ok: false, error: "Messaggio troppo lungo." };
    if (!(await rateLimit(`recommend:${user.id}`, 30, 3600))) {
      return { ok: false, error: "Troppi consigli, riprova più tardi." };
    }
    const { error } = await supabase.from("recommendations").insert({
      from_user: user.id,
      to_user: toUserId,
      title_id: titleId,
      media_type: mediaType,
      message: message || null,
    });
    if (error) {
      if (error.code === "23505") return { ok: false, error: "Già consigliato." };
      return { ok: false, error: "Puoi consigliare solo agli amici." };
    }
    return { ok: true };
  } catch {
    return { ok: false, error: "Errore" };
  }
}

export async function markRecommendationSeen(id: string): Promise<SocialResult> {
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
    return { ok: false, error: "Errore" };
  }
}

// ============ recensioni ============

export async function upsertReview(
  titleId: number,
  mediaType: "movie" | "tv",
  body: string,
  hasSpoilers: boolean,
): Promise<SocialResult> {
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
        has_spoilers: hasSpoilers,
      },
      { onConflict: "user_id,title_id,media_type" },
    );
    if (error) return { ok: false, error: "Errore di salvataggio." };
    revalidatePath(`/title/${mediaType}/${titleId}`);
    return { ok: true };
  } catch {
    return { ok: false, error: "Errore" };
  }
}

export async function deleteReview(
  titleId: number,
  mediaType: "movie" | "tv",
): Promise<SocialResult> {
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
    return { ok: false, error: "Errore" };
  }
}

export async function addComment(
  reviewId: string,
  body: string,
  parentId: string | null,
  hasSpoilers: boolean,
): Promise<SocialResult> {
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
      has_spoilers: hasSpoilers,
    });
    if (error) return { ok: false, error: "Errore" };
    return { ok: true };
  } catch {
    return { ok: false, error: "Errore" };
  }
}

export async function toggleReviewLike(
  reviewId: string,
  like: boolean,
): Promise<SocialResult> {
  try {
    const { supabase, user } = await requireUser();
    if (like) {
      const { error } = await supabase
        .from("review_likes")
        .insert({ review_id: reviewId, user_id: user.id });
      if (error && error.code !== "23505") return { ok: false, error: "Errore" };
    } else {
      await supabase
        .from("review_likes")
        .delete()
        .eq("review_id", reviewId)
        .eq("user_id", user.id);
    }
    return { ok: true };
  } catch {
    return { ok: false, error: "Errore" };
  }
}

export async function reportContent(
  targetType: "review" | "comment",
  targetId: string,
): Promise<SocialResult> {
  try {
    const { supabase, user } = await requireUser();
    const { error } = await supabase.from("reports").insert({
      target_type: targetType,
      target_id: targetId,
      reporter_id: user.id,
      reason: null,
    });
    if (error && error.code !== "23505") return { ok: false, error: "Errore" };
    return { ok: true };
  } catch {
    return { ok: false, error: "Errore" };
  }
}

// ============ notifiche ============

export async function markNotificationsRead(): Promise<SocialResult> {
  try {
    const { supabase, user } = await requireUser();
    await supabase
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("user_id", user.id)
      .is("read_at", null);
    revalidatePath("/notifications");
    revalidatePath("/friends");
    return { ok: true };
  } catch {
    return { ok: false, error: "Errore" };
  }
}
