"use server";

import { revalidatePath } from "next/cache";
import { randomUUID } from "node:crypto";
import { rateLimit } from "@/lib/rate-limit";
import { getOrFetchTitle } from "@/lib/tmdb/cache";
import { isMediaType, isTmdbId, isUuid } from "@/lib/validate";
import { createClient } from "@/lib/supabase/server";
import {
  createRecommendationToken,
  hashRecommendationToken,
  isRecommendationToken,
} from "./link";
import type { ListDefaultRole, ListRole } from "./queries";

export interface ListActionResult {
  ok: boolean;
  error?: string;
}
const INVALID: ListActionResult = { ok: false, error: "Richiesta non valida." };
const GENERIC: ListActionResult = { ok: false, error: "Non è riuscito, riprova." };

async function requireUser() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  const user = auth.user;
  if (!user) throw new Error("Non autenticato");
  return { supabase, user };
}

function refreshLists(listId?: string) {
  revalidatePath("/library");
  revalidatePath("/lists");
  if (listId) revalidatePath(`/lists/${listId}`);
}

export async function createList(
  name: string,
  description: string,
  defaultRole: ListDefaultRole,
): Promise<ListActionResult & { id?: string }> {
  if (
    typeof name !== "string" ||
    typeof description !== "string" ||
    !["viewer", "editor"].includes(defaultRole)
  )
    return INVALID;
  const trimmedName = name.trim();
  const trimmedDescription = description.trim();
  if (
    trimmedName.length < 1 ||
    trimmedName.length > 80 ||
    trimmedDescription.length > 280
  )
    return INVALID;
  try {
    const { supabase, user } = await requireUser();
    if (!(await rateLimit(`list:create:${user.id}`, 20, 3600)))
      return { ok: false, error: "Troppe richieste, riprova più tardi." };
    const listId = randomUUID();
    const { error } = await supabase.from("title_lists").insert({
      id: listId,
      owner_id: user.id,
      name: trimmedName,
      description: trimmedDescription || null,
      default_role: defaultRole,
    });
    if (error) return GENERIC;
    const { error: memberError } = await supabase
      .from("title_list_members")
      .insert({ list_id: listId, user_id: user.id, role: "owner" });
    if (memberError) return GENERIC;
    refreshLists(listId);
    return { ok: true, id: listId };
  } catch {
    return GENERIC;
  }
}

/**
 * Rinomina la lista e ne riscrive descrizione e permesso predefinito.
 *
 * La policy `title_lists_update_owner` c'era dal primo giorno, ma nessuna
 * azione la usava: una lista creata con un nome sbagliato restava cosi' per
 * sempre. Il controllo di proprieta' si ripete qui (`.eq("owner_id", ...)`) e
 * non si delega alla sola RLS, che altrimenti restituirebbe "zero righe" invece
 * di un errore.
 */
export async function updateList(
  listId: string,
  name: string,
  description: string,
  defaultRole: ListDefaultRole,
): Promise<ListActionResult> {
  if (
    !isUuid(listId) ||
    typeof name !== "string" ||
    typeof description !== "string" ||
    !["viewer", "editor"].includes(defaultRole)
  )
    return INVALID;
  const trimmedName = name.trim();
  const trimmedDescription = description.trim();
  if (
    trimmedName.length < 1 ||
    trimmedName.length > 80 ||
    trimmedDescription.length > 280
  )
    return INVALID;
  try {
    const { supabase, user } = await requireUser();
    if (!(await rateLimit(`list:update:${user.id}`, 60, 3600)))
      return { ok: false, error: "Troppe richieste, riprova più tardi." };
    const { error } = await supabase
      .from("title_lists")
      .update({
        name: trimmedName,
        description: trimmedDescription || null,
        default_role: defaultRole,
      })
      .eq("id", listId)
      .eq("owner_id", user.id);
    if (error) return GENERIC;
    refreshLists(listId);
    return { ok: true };
  } catch {
    return GENERIC;
  }
}

/**
 * Cancella la lista. Membri e titoli se ne vanno con lei (`on delete cascade`),
 * i titoli restano ovviamente in libreria: una lista e' una raccolta, non un
 * contenitore esclusivo. Solo il proprietario: chi e' stato invitato esce dalla
 * lista togliendo se stesso dai membri, non cancellandola a tutti.
 */
export async function deleteList(listId: string): Promise<ListActionResult> {
  if (!isUuid(listId)) return INVALID;
  try {
    const { supabase, user } = await requireUser();
    const { error } = await supabase
      .from("title_lists")
      .delete()
      .eq("id", listId)
      .eq("owner_id", user.id);
    if (error) return GENERIC;
    refreshLists(listId);
    return { ok: true };
  } catch {
    return GENERIC;
  }
}

export async function addTitleToList(
  listId: string,
  titleId: number,
  mediaType: "movie" | "tv",
): Promise<ListActionResult> {
  if (!isUuid(listId) || !isTmdbId(titleId) || !isMediaType(mediaType)) return INVALID;
  try {
    const { supabase, user } = await requireUser();
    if (!(await rateLimit(`list:add:${user.id}`, 120, 3600)))
      return { ok: false, error: "Troppe richieste, riprova più tardi." };
    await getOrFetchTitle(titleId, mediaType);
    const { error } = await supabase.from("title_list_items").insert({
      list_id: listId,
      title_id: titleId,
      media_type: mediaType,
      added_by: user.id,
    });
    if (error && error.code !== "23505") return GENERIC;
    refreshLists(listId);
    return { ok: true };
  } catch {
    return GENERIC;
  }
}

export async function removeTitleFromList(
  listId: string,
  itemId: string,
): Promise<ListActionResult> {
  if (!isUuid(listId) || !isUuid(itemId)) return INVALID;
  try {
    const { supabase } = await requireUser();
    const { error } = await supabase
      .from("title_list_items")
      .delete()
      .eq("list_id", listId)
      .eq("id", itemId);
    if (error) return GENERIC;
    refreshLists(listId);
    return { ok: true };
  } catch {
    return GENERIC;
  }
}

export async function inviteListMember(
  listId: string,
  userId: string,
  role: "viewer" | "editor" = "viewer",
): Promise<ListActionResult> {
  if (!isUuid(listId) || !isUuid(userId) || !["viewer", "editor"].includes(role))
    return INVALID;
  try {
    const { supabase, user } = await requireUser();
    if (
      user.id === userId ||
      !(await rateLimit(`list:invite:${user.id}`, 60, 3600, { condiviso: true }))
    )
      return INVALID;
    const { data: list } = await supabase
      .from("title_lists")
      .select("owner_id, default_role")
      .eq("id", listId)
      .eq("owner_id", user.id)
      .maybeSingle();
    if (!list) return GENERIC;
    const { data: friendship } = await supabase.rpc("are_friends", {
      a: user.id,
      b: userId,
    });
    if (!friendship) return { ok: false, error: "Puoi invitare solo gli amici." };
    const { error } = await supabase
      .from("title_list_members")
      .upsert({ list_id: listId, user_id: userId, role });
    if (error) return GENERIC;
    refreshLists(listId);
    return { ok: true };
  } catch {
    return GENERIC;
  }
}

export async function setListMemberRole(
  listId: string,
  userId: string,
  role: Exclude<ListRole, "owner">,
): Promise<ListActionResult> {
  if (!isUuid(listId) || !isUuid(userId) || !["viewer", "editor"].includes(role))
    return INVALID;
  try {
    const { supabase, user } = await requireUser();
    if (!(await rateLimit(`list:role:${user.id}`, 120, 3600)))
      return { ok: false, error: "Troppe richieste, riprova più tardi." };
    const { data: list } = await supabase
      .from("title_lists")
      .select("owner_id")
      .eq("id", listId)
      .eq("owner_id", user.id)
      .maybeSingle();
    if (!list || userId === user.id) return GENERIC;
    const { error } = await supabase
      .from("title_list_members")
      .update({ role })
      .eq("list_id", listId)
      .eq("user_id", userId);
    if (error) return GENERIC;
    refreshLists(listId);
    return { ok: true };
  } catch {
    return GENERIC;
  }
}

export async function removeListMember(
  listId: string,
  userId: string,
): Promise<ListActionResult> {
  if (!isUuid(listId) || !isUuid(userId)) return INVALID;
  try {
    const { supabase, user } = await requireUser();
    if (
      user.id !== userId &&
      !(
        await supabase
          .from("title_lists")
          .select("id")
          .eq("id", listId)
          .eq("owner_id", user.id)
          .maybeSingle()
      ).data
    )
      return GENERIC;
    const { error } = await supabase
      .from("title_list_members")
      .delete()
      .eq("list_id", listId)
      .eq("user_id", userId);
    if (error) return GENERIC;
    refreshLists(listId);
    return { ok: true };
  } catch {
    return GENERIC;
  }
}

export async function createRecommendationLink(
  titleId: number,
  mediaType: "movie" | "tv",
  message: string,
): Promise<ListActionResult & { url?: string }> {
  if (!isTmdbId(titleId) || !isMediaType(mediaType) || typeof message !== "string")
    return INVALID;
  const trimmed = message.trim();
  if (trimmed.length > 280) return INVALID;
  try {
    const { supabase, user } = await requireUser();
    if (!(await rateLimit(`recommend-link:${user.id}`, 30, 3600, { condiviso: true })))
      return { ok: false, error: "Troppe richieste, riprova più tardi." };
    await getOrFetchTitle(titleId, mediaType);
    const token = createRecommendationToken();
    const { error } = await supabase.from("recommendation_links").insert({
      token_hash: hashRecommendationToken(token),
      sender_id: user.id,
      title_id: titleId,
      media_type: mediaType,
      message: trimmed || null,
      expires_at: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString(),
    });
    if (error) return GENERIC;
    const base = process.env.NEXT_PUBLIC_APP_URL;
    if (!base) return GENERIC;
    return { ok: true, url: `${base.replace(/\/$/, "")}/share/recommendation/${token}` };
  } catch {
    return GENERIC;
  }
}

export async function consumeRecommendationLink(
  token: string,
  accept: boolean,
): Promise<ListActionResult & { titleId?: number; mediaType?: "movie" | "tv" }> {
  if (!isRecommendationToken(token) || typeof accept !== "boolean") return INVALID;
  try {
    const { supabase } = await requireUser();
    const { data, error } = await supabase.rpc("consume_recommendation_link", {
      p_token_hash: hashRecommendationToken(token),
      p_accept: accept,
    });
    if (error || !data?.[0])
      return { ok: false, error: "Questo consiglio non è più disponibile." };
    refreshLists();
    return { ok: true, titleId: data[0].title_id, mediaType: data[0].media_type };
  } catch {
    return GENERIC;
  }
}

export async function previewRecommendationLink(token: string): Promise<{
  titleId: number;
  mediaType: "movie" | "tv";
  senderId: string;
  message: string | null;
} | null> {
  if (!isRecommendationToken(token)) return null;
  try {
    const { supabase } = await requireUser();
    const { data } = await supabase.rpc("preview_recommendation_link", {
      p_token_hash: hashRecommendationToken(token),
    });
    const row = data?.[0];
    return row
      ? {
          titleId: row.title_id,
          mediaType: row.media_type,
          senderId: row.sender_id,
          message: row.message,
        }
      : null;
  } catch {
    return null;
  }
}
