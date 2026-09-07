"use client";

import { useEffect, useState } from "react";
import { Sheet } from "@/components/ui/Sheet";
import { Avatar } from "@/components/social/Avatar";
import { recommendTitle } from "@/lib/social/actions";
import { useMirroredValue, withAppended } from "@/lib/ui/optimistic";
import type { MiniProfile } from "@/lib/social/queries";

export function RecommendSheet({
  open,
  onClose,
  titleId,
  mediaType,
  friends,
  initialMessage,
}: {
  open: boolean;
  onClose: () => void;
  titleId: number;
  mediaType: "movie" | "tv";
  friends: MiniProfile[];
  initialMessage?: string;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const { value: sent, pending, run } = useMirroredValue<string[]>([]);

  // messaggio proposto dal chiamante (es. invito al cinema): ricaricato a ogni apertura
  useEffect(() => {
    if (open) setMessage((initialMessage ?? "").slice(0, 280));
  }, [open, initialMessage]);

  return (
    <Sheet open={open} onClose={onClose} title="Consiglia a un amico">
      {friends.length === 0 ? (
        <p className="py-4 text-center text-sm text-muted">
          Aggiungi qualche amico per poter consigliare i titoli.
        </p>
      ) : (
        <>
          <div className="max-h-52 space-y-1 overflow-y-auto">
            {friends.map((f) => {
              const wasSent = sent.includes(f.id);
              return (
                <button
                  key={f.id}
                  type="button"
                  disabled={wasSent}
                  onClick={() => setSelected(f.id === selected ? null : f.id)}
                  className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left ${
                    selected === f.id ? "bg-accent/20" : "hover:bg-surface-2"
                  } ${wasSent ? "opacity-60" : ""}`}
                >
                  <Avatar
                    url={f.avatar_url}
                    name={f.display_name ?? f.username}
                    size={32}
                  />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">
                    {f.display_name ?? f.username}
                  </span>
                  {wasSent ? (
                    <span className="text-[13px] font-medium text-accent-soft">
                      Inviato ✓
                    </span>
                  ) : (
                    selected === f.id && <span className="text-accent">✓</span>
                  )}
                </button>
              );
            })}
          </div>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value.slice(0, 280))}
            placeholder="Messaggio (opzionale, max 280)"
            rows={2}
            className="mt-3 w-full rounded-xl border border-border bg-surface-2 px-3 py-2 text-sm outline-none focus:border-accent"
          />
          <button
            type="button"
            disabled={pending || !selected}
            onClick={() => {
              if (!selected) return;
              const friendId = selected;
              const text = message;
              setSelected(null);
              setMessage("");
              run(
                withAppended(sent, (id) => id, friendId),
                () => recommendTitle(friendId, titleId, mediaType, text),
                { message: "Consiglio inviato!" },
              );
            }}
            className="mt-3 w-full rounded-xl glass-accent py-3 text-base font-bold text-white disabled:opacity-50"
          >
            {pending ? "Invio…" : "Invia consiglio"}
          </button>
        </>
      )}
    </Sheet>
  );
}
