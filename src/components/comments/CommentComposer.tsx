"use client";

import { useRef, useState } from "react";
import {
  COMMENT_LIMIT,
  encodeComment,
  isCommentBody,
  type CommentMedia,
  type MediaKind,
} from "@/lib/comments/content";
import { registerMediaShare } from "@/lib/comments/klipy";
import { CommentMediaImage } from "./CommentContent";
import { MediaPicker } from "./MediaPicker";

export function CommentComposer({
  onSubmit,
  placeholder = "Commenta…",
  submitLabel = "Invia",
}: {
  onSubmit: (body: string) => Promise<{ ok: boolean; error?: string }>;
  placeholder?: string;
  submitLabel?: string;
}) {
  const [text, setText] = useState("");
  const [media, setMedia] = useState<CommentMedia | null>(null);
  const [tab, setTab] = useState<"emoji" | MediaKind | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const input = useRef<HTMLTextAreaElement>(null);
  const busy = useRef(false);
  const selection = useRef({ start: 0, end: 0 });
  const encoded = encodeComment(text.trim(), media);
  const valid = isCommentBody(encoded);

  function close() {
    setTab(null);
    input.current?.focus();
  }
  function addEmoji(emoji: string) {
    const { start, end } = selection.current;
    const next = text.slice(0, start) + emoji + text.slice(end);
    if (next.length > COMMENT_LIMIT) return;
    setText(next);
    selection.current = { start: start + emoji.length, end: start + emoji.length };
    requestAnimationFrame(() =>
      input.current?.setSelectionRange(selection.current.start, selection.current.end),
    );
  }
  async function submit() {
    if (busy.current || !valid) return;
    busy.current = true;
    setPending(true);
    setError("");
    setTab(null);
    try {
      const result = await onSubmit(encoded);
      if (result.ok) {
        setText("");
        setMedia(null);
        selection.current = { start: 0, end: 0 };
        if (media) void registerMediaShare(media);
      } else setError(result.error ?? "Commento non inviato. Riprova.");
    } catch {
      setError("Commento non inviato. Controlla la connessione e riprova.");
    } finally {
      busy.current = false;
      setPending(false);
    }
  }
  return (
    <div className="mt-3">
      <fieldset disabled={pending} className="min-w-0">
        <textarea
          ref={input}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            selection.current = { start: e.target.selectionStart, end: e.target.selectionEnd };
          }}
          onSelect={(e) => {
            const el = e.currentTarget;
            selection.current = { start: el.selectionStart, end: el.selectionEnd };
          }}
          maxLength={COMMENT_LIMIT}
          rows={2}
          placeholder={placeholder}
          aria-label={placeholder}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              void submit();
            }
          }}
          className="w-full resize-none rounded-2xl border border-border bg-surface-2 px-4 py-3 text-sm outline-none focus:border-accent disabled:opacity-60"
        />
        {media && (
          <div className="mt-2 flex items-start gap-3">
            <div className="max-w-48">
              <CommentMediaImage key={media.url} media={media} />
            </div>
            <button
              type="button"
              onClick={() => setMedia(null)}
              aria-label="Rimuovi allegato"
              className="min-h-11 rounded-full px-3 text-xs text-muted"
            >
              Rimuovi
            </button>
          </div>
        )}
        <div className="mt-1 flex items-center gap-1">
          {(
            [
              ["emoji", "☺", "Aggiungi emoji"],
              ["gif", "GIF", "Aggiungi GIF"],
              ["meme", "Meme", "Aggiungi meme"],
            ] as const
          ).map(([id, label, aria]) => (
            <button
              key={id}
              type="button"
              aria-label={aria}
              aria-expanded={tab === id}
              onClick={() => setTab(tab === id ? null : id)}
              className={`min-h-11 min-w-11 rounded-full px-3 text-xs font-semibold focus-visible:outline-2 focus-visible:outline-accent ${tab === id ? "glass-accent" : "text-muted hover:bg-white/5"}`}
            >
              {label}
            </button>
          ))}
          <button
            type="button"
            disabled={pending || !valid}
            onClick={() => void submit()}
            className="ml-auto h-11 rounded-full glass-accent px-4 text-xs font-semibold text-white disabled:opacity-50"
          >
            {pending ? "Invio…" : submitLabel}
          </button>
        </div>
        {tab && (
          <MediaPicker
            key={tab}
            initialTab={tab}
            onEmoji={addEmoji}
            onMedia={(item) => {
              setMedia(item);
              close();
            }}
            onClose={close}
          />
        )}
      </fieldset>
      {encoded.length > COMMENT_LIMIT && (
        <p role="status" className="mt-1 text-xs text-muted">
          Commento troppo lungo{media ? " con questo allegato" : ""}. Riduci il testo.
        </p>
      )}
      {error && (
        <p role="alert" className="mt-2 text-sm text-red-300">
          {error}
        </p>
      )}
    </div>
  );
}
