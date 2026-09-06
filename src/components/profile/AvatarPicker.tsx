"use client";

import Image from "next/image";
import { useRef, useState, useTransition } from "react";
import { createClient } from "@/lib/supabase/client";
import { saveAvatarPreset, saveAvatarUrl } from "@/app/(app)/profile/actions";
import { Sheet } from "@/components/ui/Sheet";
import { PRESET_AVATARS, presetAvatarId, presetAvatarSrc } from "@/lib/avatars";

interface Props {
  userId: string;
  initialUrl: string | null;
  name: string;
  size?: number;
  /** Mostra il link testuale "Cambia foto" sotto l'avatar. */
  showLabel?: boolean;
  onChange?: (url: string) => void;
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

/**
 * Avatar (foto, icona predefinita o iniziale su sfondo sfumato) con badge
 * fotocamera e link "Cambia foto". Il tocco apre il foglio con le icone
 * predefinite (Batman, Superman, …) e il caricamento di una foto: gestisce
 * upload, ridimensionamento e salvataggio da sé. Usato in onboarding e profilo.
 */
export function AvatarPicker({
  userId,
  initialUrl,
  name,
  size = 92,
  showLabel = true,
  onChange,
}: Props) {
  const [currentUrl, setCurrentUrl] = useState(initialUrl);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  const selectedPreset = presetAvatarId(currentUrl);

  async function handleAvatar(file: File) {
    if (file.size > 2 * 1024 * 1024) {
      setError("L'immagine supera i 2MB.");
      return;
    }
    setError(null);
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
      setCurrentUrl(data.publicUrl);
      setOpen(false);
      onChange?.(data.publicUrl);
    } catch {
      setError("Upload non riuscito. Riprova.");
    } finally {
      setUploading(false);
    }
  }

  function choosePreset(id: string) {
    setError(null);
    startTransition(async () => {
      const result = await saveAvatarPreset(id);
      if (!result.ok) {
        setError(result.error ?? "Errore di salvataggio.");
        return;
      }
      const url = presetAvatarSrc(id);
      setCurrentUrl(url);
      setOpen(false);
      onChange?.(url);
    });
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="relative block overflow-hidden rounded-full"
          style={{ width: size, height: size }}
          aria-label="Cambia avatar"
        >
          {currentUrl ? (
            <Image
              src={currentUrl}
              alt=""
              fill
              sizes={`${size}px`}
              className="object-cover"
            />
          ) : (
            <span
              className="flex h-full items-center justify-center rounded-full bg-gradient-to-br from-accent-soft to-accent-strong font-bold text-white shadow-[0_18px_44px_rgba(139,92,246,0.4)]"
              style={{ fontSize: size * 0.39 }}
            >
              {name.charAt(0).toUpperCase()}
            </span>
          )}
          {uploading && (
            <span className="absolute inset-0 flex items-center justify-center bg-black/50 text-xs text-white">
              …
            </span>
          )}
        </button>
        <span className="pointer-events-none absolute -bottom-1 -right-1 flex size-[34px] items-center justify-center rounded-full border-[3px] border-bg bg-white shadow-[0_6px_16px_rgba(0,0,0,0.5)]">
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-bg"
            aria-hidden="true"
          >
            <path d="M4 8.5A2.5 2.5 0 0 1 6.5 6H8l1.2-2h5.6L16 6h1.5A2.5 2.5 0 0 1 20 8.5V17a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 17z" />
            <circle cx="12" cy="12.5" r="3.2" />
          </svg>
        </span>
      </div>
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
      {showLabel && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="-mx-2 flex min-h-11 items-center px-2 text-sm font-semibold text-accent-soft"
        >
          Cambia foto
        </button>
      )}
      {error && !open && <p className="text-xs text-danger">{error}</p>}

      <Sheet open={open} onClose={() => setOpen(false)} title="Scegli il tuo avatar">
        <div className="flex flex-col gap-4">
          <ul className="grid max-h-[46vh] grid-cols-4 gap-x-2 gap-y-3 overflow-y-auto pt-1">
            {PRESET_AVATARS.map((preset) => {
              const selected = preset.id === selectedPreset;
              return (
                <li key={preset.id}>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => choosePreset(preset.id)}
                    aria-pressed={selected}
                    className="flex w-full flex-col items-center gap-1.5 disabled:opacity-60"
                  >
                    <span
                      className={`relative block size-[68px] overflow-hidden rounded-full ${
                        selected
                          ? "ring-2 ring-accent ring-offset-2 ring-offset-sheet"
                          : "ring-1 ring-white/10"
                      }`}
                    >
                      <Image
                        src={presetAvatarSrc(preset.id)}
                        alt=""
                        fill
                        sizes="68px"
                        className="object-cover"
                      />
                    </span>
                    <span
                      className={`text-center text-[11px] leading-tight ${
                        selected ? "font-semibold text-text" : "text-muted"
                      }`}
                    >
                      {preset.name}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>

          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="flex min-h-12 items-center justify-center gap-2 rounded-[14px] bg-surface-2 px-4 text-sm font-semibold text-text disabled:opacity-60"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.8}
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M4 8.5A2.5 2.5 0 0 1 6.5 6H8l1.2-2h5.6L16 6h1.5A2.5 2.5 0 0 1 20 8.5V17a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 17z" />
              <circle cx="12" cy="12.5" r="3.2" />
            </svg>
            {uploading ? "Caricamento…" : "Carica una foto"}
          </button>
          {error && <p className="px-1 text-center text-xs text-danger">{error}</p>}
        </div>
      </Sheet>
    </div>
  );
}
