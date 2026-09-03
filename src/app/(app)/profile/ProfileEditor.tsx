"use client";

import Image from "next/image";
import { useRef, useState, useTransition } from "react";
import { Sheet } from "@/components/ui/Sheet";
import { useToast } from "@/components/ui/Toaster";
import { createClient } from "@/lib/supabase/client";
import { saveAvatarUrl, setProfilePrivacy, updateProfile } from "./actions";

interface Props {
  userId: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  isPrivate: boolean;
}

/** Ridimensiona un'immagine a 512px (lato lungo) e la converte in webp. */
async function resizeImage(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = 512 / Math.max(bitmap.width, bitmap.height);
  const w = Math.round(bitmap.width * Math.min(1, scale));
  const h = Math.round(bitmap.height * Math.min(1, scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, w, h);
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("toBlob fallito"))),
      "image/webp",
      0.85,
    );
  });
}

export function ProfileEditor({ userId, username, displayName, avatarUrl, isPrivate }: Props) {
  const { show } = useToast();
  const [pending, startTransition] = useTransition();
  const [editOpen, setEditOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [currentAvatar, setCurrentAvatar] = useState(avatarUrl);
  const [privacy, setPrivacy] = useState(isPrivate);
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleAvatar(file: File) {
    if (file.size > 2 * 1024 * 1024) {
      show("L'immagine supera i 2MB.");
      return;
    }
    setUploading(true);
    try {
      const blob = await resizeImage(file);
      const supabase = createClient();
      const path = `${userId}/avatar-${Date.now()}.webp`;
      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(path, blob, { contentType: "image/webp", upsert: true });
      if (uploadError) throw uploadError;
      const { data } = supabase.storage.from("avatars").getPublicUrl(path);
      const result = await saveAvatarUrl(data.publicUrl);
      if (!result.ok) throw new Error(result.error);
      setCurrentAvatar(data.publicUrl);
      show("Avatar aggiornato");
    } catch {
      show("Upload non riuscito. Riprova.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <>
      <div className="flex items-center gap-4 rounded-2xl border border-border bg-surface p-5">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="relative size-16 shrink-0 overflow-hidden rounded-full bg-surface-2"
          aria-label="Cambia avatar"
        >
          {currentAvatar ? (
            <Image src={currentAvatar} alt="" fill sizes="64px" className="object-cover" />
          ) : (
            <span className="flex h-full items-center justify-center text-2xl font-bold text-accent">
              {(displayName || username).charAt(0).toUpperCase()}
            </span>
          )}
          {uploading && (
            <span className="absolute inset-0 flex items-center justify-center bg-black/50 text-[10px] text-white">
              …
            </span>
          )}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void handleAvatar(f);
            e.target.value = "";
          }}
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-lg font-semibold">{displayName || username}</p>
          <p className="truncate text-sm text-muted">@{username}</p>
        </div>
        <button
          type="button"
          onClick={() => setEditOpen(true)}
          className="shrink-0 rounded-xl border border-border bg-surface-2 px-3.5 py-2 text-xs font-semibold"
        >
          Modifica
        </button>
      </div>

      <label className="mt-4 flex items-center justify-between rounded-2xl border border-border bg-surface p-4">
        <div>
          <p className="text-sm font-semibold">Profilo privato</p>
          <p className="text-xs text-muted">
            Solo gli amici vedranno le tue liste (dalla Fase social).
          </p>
        </div>
        <input
          type="checkbox"
          checked={privacy}
          disabled={pending}
          onChange={(e) => {
            const next = e.target.checked;
            setPrivacy(next);
            startTransition(async () => {
              const result = await setProfilePrivacy(next);
              if (!result.ok) {
                setPrivacy(!next);
                show("Errore di salvataggio.");
              }
            });
          }}
          className="size-5 accent-[var(--color-accent)]"
        />
      </label>

      <Sheet open={editOpen} onClose={() => setEditOpen(false)} title="Modifica profilo">
        <form
          action={(formData) => {
            startTransition(async () => {
              setError(null);
              const result = await updateProfile(formData);
              if (!result.ok) {
                setError(result.error ?? "Errore");
                return;
              }
              setEditOpen(false);
              show("Profilo aggiornato");
            });
          }}
          className="space-y-4"
        >
          <div>
            <label htmlFor="p-username" className="mb-1 block text-sm font-medium">
              Username
            </label>
            <input
              id="p-username"
              name="username"
              defaultValue={username}
              required
              pattern="[a-z0-9_]{3,20}"
              autoCapitalize="none"
              className="w-full rounded-xl border border-border bg-surface-2 px-4 py-3 text-base outline-none focus:border-accent"
            />
          </div>
          <div>
            <label htmlFor="p-display" className="mb-1 block text-sm font-medium">
              Nome visualizzato
            </label>
            <input
              id="p-display"
              name="display_name"
              defaultValue={displayName}
              maxLength={50}
              className="w-full rounded-xl border border-border bg-surface-2 px-4 py-3 text-base outline-none focus:border-accent"
            />
          </div>
          {error && <p className="text-sm text-danger">{error}</p>}
          <button
            type="submit"
            disabled={pending}
            className="w-full rounded-xl bg-accent py-3 text-base font-bold text-white disabled:opacity-50"
          >
            Salva
          </button>
        </form>
      </Sheet>
    </>
  );
}
