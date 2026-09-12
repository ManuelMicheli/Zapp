"use client";

import { useState } from "react";
import { useReducedMotion } from "framer-motion";
import { decodeComment, type CommentMedia } from "@/lib/comments/content";

export function CommentMediaImage({
  media,
  thumbnail = false,
}: {
  media: CommentMedia;
  thumbnail?: boolean;
}) {
  const reducedMotion = useReducedMotion();
  const [play, setPlay] = useState<boolean | null>(null);
  const [failed, setFailed] = useState(false);
  const animated = media.kind !== "meme";
  const playing = play ?? reducedMotion === false;
  // Nella griglia del selettore vince la resa piccola: le tessere sono larghe
  // poche decine di pixel e sono ventiquattro per pagina. Nel commento, dove
  // l'immagine si guarda davvero, si usa sempre l'originale.
  const full = thumbnail ? (media.thumbnailUrl ?? media.url) : media.url;
  const src = animated && !playing ? media.previewUrl : full;
  if (failed)
    return (
      <span className="block p-3 text-xs text-muted">Immagine non più disponibile</span>
    );
  const picture = src ? (
    // URL diretto obbligatorio per KLIPY: niente ottimizzatore né copia nel nostro storage.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={media.title || (media.kind === "meme" ? "Meme" : "GIF")}
      width={media.width}
      height={media.height}
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
      className={
        thumbnail
          ? "h-28 w-full object-contain"
          : "max-h-64 w-auto max-w-full rounded-xl object-contain"
      }
    />
  ) : (
    <span className="flex h-24 items-center justify-center text-sm">
      {media.title || "GIF"}
    </span>
  );
  if (thumbnail || !animated) return picture;
  return (
    <button
      type="button"
      onClick={() => setPlay(!playing)}
      aria-label={playing ? "Ferma animazione" : "Riproduci animazione"}
      className="block max-w-full text-left focus-visible:outline-2 focus-visible:outline-accent"
    >
      {picture}
      <span className="mt-1 block text-[10px] text-muted">
        {playing ? "Ferma GIF" : "Riproduci GIF"}
      </span>
    </button>
  );
}

export function CommentContent({
  body,
  hasSpoilers = false,
  initiallyRevealed = false,
}: {
  body: string;
  hasSpoilers?: boolean;
  initiallyRevealed?: boolean;
}) {
  const [revealed, setRevealed] = useState(initiallyRevealed);
  if (hasSpoilers && !revealed)
    return (
      <button
        type="button"
        onClick={() => setRevealed(true)}
        className="text-muted underline"
      >
        Spoiler — mostra
      </button>
    );
  const content = decodeComment(body);
  return (
    <span className="text-white/80">
      {content.text && (
        <span className="whitespace-pre-wrap break-words">{content.text}</span>
      )}
      {content.media && (
        <span className="mt-2 block max-w-80">
          <CommentMediaImage key={content.media.url} media={content.media} />
          <span className="mt-1 block text-[10px] text-muted">via KLIPY</span>
        </span>
      )}
    </span>
  );
}
