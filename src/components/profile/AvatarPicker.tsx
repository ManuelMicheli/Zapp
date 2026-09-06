"use client";

import Image from "next/image";
import { useRef, useState, useTransition } from "react";
import { createClient } from "@/lib/supabase/client";
import { saveAvatarPreset, saveAvatarUrl } from "@/app/(app)/profile/actions";
import { Sheet } from "@/components/ui/Sheet";
import {
  AVATAR_COLOR_SWATCHES,
  AVATAR_GRADIENT_SWATCHES,
  DEFAULT_AVATAR_BACKGROUND,
  PRESET_AVATARS,
  avatarBackgroundCss,
  parsePresetAvatar,
  presetAvatarSrc,
  presetAvatarUrl,
  type AvatarBackground,
} from "@/lib/avatars";

interface Props {
  userId: string;
  initialUrl: string | null;
  name: string;
  size?: number;
  /** Mostra il link testuale "Cambia foto" sotto l'avatar. */
  showLabel?: boolean;
  onChange?: (url: string) => void;
}

/** Secondo colore proposto quando si passa a "Sfumatura" da un colore pieno. */
const GRADIENT_COMPANION = "#7c3aed";
const GRADIENT_COMPANION_ALT = "#db2777";

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

function sameBackground(a: AvatarBackground, b: AvatarBackground): boolean {
  return a.from === b.from && (a.to ?? null) === (b.to ?? null);
}

/** Cerchio di anteprima di uno sfondo (pieno o sfumato). */
function BackgroundSwatch({
  bg,
  selected,
  disabled,
  onClick,
  label,
}: {
  bg: AvatarBackground;
  selected: boolean;
  disabled?: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      aria-label={label}
      aria-pressed={selected}
      className={`size-9 shrink-0 rounded-full transition-transform disabled:opacity-60 ${
        selected
          ? "ring-2 ring-accent ring-offset-2 ring-offset-sheet"
          : "ring-1 ring-white/15 active:scale-95"
      }`}
      style={{ background: avatarBackgroundCss(bg) }}
    />
  );
}

/**
 * Selettore di colore libero: cerchio col colore corrente, il `<input
 * type="color">` nativo sta sopra, invisibile, così il tocco apre il picker
 * del sistema. `onInput` aggiorna l'anteprima mentre si trascina, `onChange`
 * (alla chiusura del picker) salva.
 */
function ColorInput({
  value,
  label,
  disabled,
  onInput,
  onCommit,
}: {
  value: string;
  label: string;
  disabled?: boolean;
  onInput: (hex: string) => void;
  onCommit: (hex: string) => void;
}) {
  return (
    <label
      className="relative flex min-h-11 items-center gap-2.5 rounded-full bg-surface-2 py-1 pl-1 pr-4"
      aria-label={label}
    >
      <span
        aria-hidden="true"
        className="size-9 rounded-full ring-1 ring-white/15"
        style={{ background: value }}
      />
      <span className="text-[13px] font-semibold text-text">{label}</span>
      <span className="font-mono text-[11px] uppercase text-muted">{value.slice(1)}</span>
      <input
        type="color"
        value={value}
        disabled={disabled}
        onInput={(e) => onInput(e.currentTarget.value)}
        onChange={(e) => onCommit(e.currentTarget.value)}
        className="absolute inset-0 cursor-pointer opacity-0 disabled:cursor-default"
      />
    </label>
  );
}

/**
 * Avatar (foto, icona predefinita o iniziale su sfondo sfumato) con badge
 * fotocamera e link "Cambia foto". Il tocco apre il foglio con le icone
 * predefinite (Batman, Superman, …: silhouette bianche), lo sfondo a scelta
 * (colore pieno o sfumatura fra due colori, nero di default) e il caricamento
 * di una foto: gestisce upload, ridimensionamento e salvataggio da sé. Usato
 * in onboarding e profilo.
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

  const current = parsePresetAvatar(currentUrl);
  const selectedPreset = current?.id ?? null;
  // sfondo in anteprima nel foglio: parte da quello salvato (nero se nessuno)
  const [bg, setBg] = useState<AvatarBackground>(
    current?.bg ?? DEFAULT_AVATAR_BACKGROUND,
  );
  const gradient = Boolean(bg.to);

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

  /** Salva icona + sfondo; `close` chiude il foglio (scelta dell'icona). */
  function savePreset(id: string, background: AvatarBackground, close: boolean) {
    setError(null);
    startTransition(async () => {
      const result = await saveAvatarPreset(id, background);
      if (!result.ok) {
        setError(result.error ?? "Errore di salvataggio.");
        return;
      }
      const url = presetAvatarUrl(id, background);
      setCurrentUrl(url);
      if (close) setOpen(false);
      onChange?.(url);
    });
  }

  /** Nuovo sfondo: anteprima subito; se c'è già un'icona scelta, salva. */
  function commitBackground(next: AvatarBackground) {
    setBg(next);
    if (selectedPreset && current && !sameBackground(current.bg, next)) {
      savePreset(selectedPreset, next, false);
    }
  }

  function setMode(toGradient: boolean) {
    if (toGradient === gradient) return;
    if (toGradient) {
      const to =
        bg.from === GRADIENT_COMPANION ? GRADIENT_COMPANION_ALT : GRADIENT_COMPANION;
      commitBackground({ from: bg.from, to });
    } else {
      commitBackground({ from: bg.from });
    }
  }

  const previewBg = avatarBackgroundCss(bg);
  const swatches: AvatarBackground[] = gradient
    ? AVATAR_GRADIENT_SWATCHES
    : AVATAR_COLOR_SWATCHES.map((from) => ({ from }));

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="relative block overflow-hidden rounded-full"
          style={{
            width: size,
            height: size,
            background: current ? avatarBackgroundCss(current.bg) : undefined,
          }}
          aria-label="Cambia avatar"
        >
          {current ? (
            <Image
              src={presetAvatarSrc(current.id)}
              alt=""
              fill
              sizes={`${size}px`}
              className="object-cover"
            />
          ) : currentUrl ? (
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
          {/* Icone: ogni tile è in anteprima sullo sfondo scelto qui sotto */}
          <ul className="grid max-h-[34vh] grid-cols-4 gap-x-2 gap-y-3 overflow-y-auto pt-1">
            {PRESET_AVATARS.map((preset) => {
              const selected = preset.id === selectedPreset;
              return (
                <li key={preset.id}>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => savePreset(preset.id, bg, true)}
                    aria-pressed={selected}
                    className="flex w-full flex-col items-center gap-1.5 disabled:opacity-60"
                  >
                    <span
                      className={`relative block size-[68px] overflow-hidden rounded-full ${
                        selected
                          ? "ring-2 ring-accent ring-offset-2 ring-offset-sheet"
                          : "ring-1 ring-white/10"
                      }`}
                      style={{ background: previewBg }}
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

          {/* Sfondo: pieno o sfumatura, colori rapidi + selettori liberi */}
          <section className="flex flex-col gap-3 rounded-[20px] border border-border bg-surface p-3">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-[15px] font-semibold">Sfondo</h3>
              <div
                role="radiogroup"
                aria-label="Tipo di sfondo"
                className="flex rounded-full bg-surface-2 p-0.5 text-[13px] font-semibold"
              >
                {[
                  { label: "Pieno", value: false },
                  { label: "Sfumatura", value: true },
                ].map((opt) => (
                  <button
                    key={opt.label}
                    type="button"
                    role="radio"
                    aria-checked={gradient === opt.value}
                    disabled={pending}
                    onClick={() => setMode(opt.value)}
                    className={`min-h-9 rounded-full px-3.5 transition-colors ${
                      gradient === opt.value
                        ? "bg-white text-black"
                        : "text-muted hover:text-text"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <ul className="-mx-3 flex gap-2.5 overflow-x-auto px-3 py-1 [scrollbar-width:none]">
              {swatches.map((s) => (
                <li key={`${s.from}-${s.to ?? ""}`}>
                  <BackgroundSwatch
                    bg={s}
                    selected={sameBackground(s, bg)}
                    disabled={pending}
                    onClick={() => commitBackground(s)}
                    label={s.to ? `Sfumatura ${s.from} ${s.to}` : `Colore ${s.from}`}
                  />
                </li>
              ))}
            </ul>

            <div className="flex flex-wrap gap-2">
              <ColorInput
                value={bg.from}
                label={gradient ? "Primo colore" : "Colore"}
                disabled={pending}
                onInput={(hex) => setBg({ ...bg, from: hex })}
                onCommit={(hex) => commitBackground({ ...bg, from: hex })}
              />
              {gradient && (
                <ColorInput
                  value={bg.to ?? GRADIENT_COMPANION}
                  label="Secondo colore"
                  disabled={pending}
                  onInput={(hex) => setBg({ ...bg, to: hex })}
                  onCommit={(hex) => commitBackground({ ...bg, to: hex })}
                />
              )}
            </div>
          </section>

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
