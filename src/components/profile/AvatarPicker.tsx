"use client";

import Image from "next/image";
import { useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { saveAvatarUrl } from "@/app/(app)/profile/actions";

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
 * Avatar (foto o iniziale su sfondo sfumato) con badge fotocamera e link
 * "Cambia foto": gestisce upload, ridimensionamento e salvataggio da sé.
 * Usato in onboarding e nel profilo.
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
  const fileRef = useRef<HTMLInputElement>(null);

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
      onChange?.(data.publicUrl);
    } catch {
      setError("Upload non riuscito. Riprova.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
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
          onClick={() => fileRef.current?.click()}
          className="-mx-2 flex min-h-11 items-center px-2 text-sm font-semibold text-accent-soft"
        >
          Cambia foto
        </button>
      )}
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}
