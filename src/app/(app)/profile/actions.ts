"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  isPresetAvatarId,
  parseAvatarBackground,
  presetAvatarUrl,
  type AvatarBackground,
} from "@/lib/avatars";

const USERNAME_RE = /^[a-z0-9_]{3,20}$/;

export interface ProfileActionResult {
  ok: boolean;
  error?: string;
}

export async function updateProfile(formData: FormData): Promise<ProfileActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Non autenticato" };

  const username = String(formData.get("username") ?? "")
    .trim()
    .toLowerCase();
  const displayName = String(formData.get("display_name") ?? "").trim();

  if (!USERNAME_RE.test(username)) {
    return { ok: false, error: "Username non valido (3–20: a-z, 0-9, _)." };
  }

  const { error } = await supabase
    .from("profiles")
    .update({ username, display_name: displayName || null })
    .eq("id", user.id);

  if (error) {
    if (error.code === "23505") return { ok: false, error: "Username già in uso." };
    return { ok: false, error: "Errore di salvataggio." };
  }
  revalidatePath("/profile");
  return { ok: true };
}

export async function setProfilePrivacy(
  isPrivate: boolean,
): Promise<ProfileActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Non autenticato" };

  const { error } = await supabase
    .from("profiles")
    .update({ is_private: isPrivate })
    .eq("id", user.id);
  if (error) return { ok: false, error: "Errore di salvataggio." };
  revalidatePath("/profile");
  return { ok: true };
}

export async function saveAvatarUrl(url: string): Promise<ProfileActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Non autenticato" };

  // Solo un file dentro la cartella `avatars/<proprio uid>/` del proprio
  // progetto Supabase. Oltre al prefisso si controlla anche cio' che segue: con
  // il solo `startsWith`, un `…/avatars/<uid>/../../altro` passava e il browser
  // lo normalizzava su un altro percorso dello stesso host.
  if (typeof url !== "string" || url.length > 512) {
    return { ok: false, error: "URL avatar non valido." };
  }
  const expectedPrefix = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/avatars/${user.id}/`;
  if (!url.startsWith(expectedPrefix)) {
    return { ok: false, error: "URL avatar non valido." };
  }
  const fileName = url.slice(expectedPrefix.length);
  if (!/^[A-Za-z0-9._-]{1,120}$/.test(fileName)) {
    return { ok: false, error: "URL avatar non valido." };
  }

  const { error } = await supabase
    .from("profiles")
    .update({ avatar_url: url })
    .eq("id", user.id);
  if (error) return { ok: false, error: "Errore di salvataggio." };
  revalidatePath("/profile");
  return { ok: true };
}

/**
 * Salva uno degli avatar predefiniti con lo sfondo scelto (`/avatars/<id>.png?bg=…`,
 * vedi lib/avatars): colore pieno o sfumatura fra due colori, validati qui.
 */
export async function saveAvatarPreset(
  id: string,
  background: AvatarBackground,
): Promise<ProfileActionResult> {
  if (!isPresetAvatarId(id)) return { ok: false, error: "Avatar non valido." };
  const bg = parseAvatarBackground(background);
  if (!bg) return { ok: false, error: "Colore non valido." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Non autenticato" };

  const { error } = await supabase
    .from("profiles")
    .update({ avatar_url: presetAvatarUrl(id, bg) })
    .eq("id", user.id);
  if (error) return { ok: false, error: "Errore di salvataggio." };
  revalidatePath("/profile");
  return { ok: true };
}
