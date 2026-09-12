"use client";

import { useEffect, useState } from "react";
import { type CommentMedia, type MediaKind } from "@/lib/comments/content";
import { EMOJI_GROUPS } from "@/lib/comments/emojis";
import { klipyUrl, parseKlipyPage } from "@/lib/comments/klipy";
import { CommentMediaImage } from "./CommentContent";

type Tab = "emoji" | MediaKind;
const TABS: { id: Tab; label: string }[] = [
  { id: "emoji", label: "Emoji" },
  { id: "gif", label: "GIF" },
  { id: "meme", label: "Meme" },
  { id: "sticker", label: "Sticker" },
];

export function MediaPicker({
  initialTab,
  onEmoji,
  onMedia,
  onClose,
}: {
  initialTab: Tab;
  onEmoji: (emoji: string) => void;
  onMedia: (media: CommentMedia) => void;
  onClose: () => void;
}) {
  const [tab, setTab] = useState(initialTab);
  const [query, setQuery] = useState("");
  return (
    <div
      role="region"
      aria-label="Emoji, GIF e meme"
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          onClose();
        }
      }}
      className="mt-3 rounded-2xl border border-border bg-surface-2 p-3"
    >
      <div className="mb-3 flex items-center gap-1">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            aria-pressed={tab === t.id}
            onClick={() => {
              setTab(t.id);
              setQuery("");
            }}
            className={`min-h-11 rounded-full px-3 text-xs font-semibold focus-visible:outline-2 focus-visible:outline-accent ${tab === t.id ? "glass-accent text-white" : "text-muted"}`}
          >
            {t.label}
          </button>
        ))}
        <button
          type="button"
          onClick={onClose}
          aria-label="Chiudi selettore"
          className="ml-auto min-h-11 min-w-9 text-muted"
        >
          ✕
        </button>
      </div>
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value.slice(0, 100))}
        aria-label={tab === "emoji" ? "Cerca emoji" : "Cerca nel catalogo KLIPY"}
        placeholder={tab === "emoji" ? "Cerca emoji…" : "Search KLIPY"}
        className="mb-3 h-11 w-full rounded-xl border border-border bg-surface px-3 text-sm outline-none focus:border-accent"
      />
      {tab === "emoji" ? (
        <div className="max-h-64 overflow-y-auto overscroll-contain">
          {EMOJI_GROUPS.map((group) => {
            const items = group.items.filter(([emoji, name]) =>
              `${emoji} ${name}`
                .toLocaleLowerCase("it")
                .includes(query.trim().toLocaleLowerCase("it")),
            );
            return items.length ? (
              <div key={group.name} className="mb-3">
                <p className="mb-1 text-xs text-muted">{group.name}</p>
                <div className="grid grid-cols-[repeat(auto-fill,minmax(44px,1fr))]">
                  {items.map(([emoji, name]) => (
                    <button
                      type="button"
                      key={emoji}
                      title={name}
                      aria-label={name}
                      onClick={() => onEmoji(emoji)}
                      className="h-11 rounded-lg text-2xl hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-accent"
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              </div>
            ) : null;
          })}
          {query &&
            !EMOJI_GROUPS.some((g) =>
              g.items.some(([emoji, name]) =>
                `${emoji} ${name}`
                  .toLocaleLowerCase("it")
                  .includes(query.trim().toLocaleLowerCase("it")),
              ),
            ) && (
              <p className="py-4 text-sm text-muted">
                Nessuna emoji trovata. Prova un’altra parola.
              </p>
            )}
        </div>
      ) : (
        <Catalog key={`${tab}:${query}`} kind={tab} query={query} onMedia={onMedia} />
      )}
    </div>
  );
}

function Catalog({
  kind,
  query,
  onMedia,
}: {
  kind: MediaKind;
  query: string;
  onMedia: (media: CommentMedia) => void;
}) {
  const [items, setItems] = useState<CommentMedia[]>([]);
  const [page, setPage] = useState(1);
  const [hasNext, setHasNext] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const key = process.env.NEXT_PUBLIC_KLIPY_API_KEY?.trim();

  useEffect(() => {
    if (!key) return;
    const controller = new AbortController();
    // Smonta/annulla quando cambia la ricerca: nessuna risposta vecchia sovrascrive la nuova.
    const timer = setTimeout(
      async () => {
        setLoading(true);
        setError("");
        const timeout = setTimeout(() => controller.abort(), 10000);
        try {
          const response = await fetch(klipyUrl(key, kind, query, page), {
            signal: controller.signal,
            cache: "no-store",
            credentials: "omit",
          });
          if (!response.ok)
            throw new Error(
              response.status === 429
                ? "Troppe ricerche. Riprova tra poco."
                : "Catalogo non disponibile. Riprova.",
            );
          const result = parseKlipyPage(await response.json(), kind);
          if (!controller.signal.aborted) {
            setItems((prev) => (page === 1 ? result.items : [...prev, ...result.items]));
            setHasNext(result.hasNext);
          }
        } catch (e) {
          if (!disposed)
            setError(
              e instanceof Error && e.message.startsWith("Troppe ricerche")
                ? e.message
                : "Impossibile caricare il catalogo. Controlla la connessione e riprova.",
            );
        } finally {
          clearTimeout(timeout);
          if (!disposed) setLoading(false);
        }
      },
      query ? 400 : 0,
    );
    let disposed = false;
    return () => {
      disposed = true;
      clearTimeout(timer);
      controller.abort();
    };
  }, [key, kind, query, page, attempt]);

  if (!key)
    return (
      <p role="status" className="py-4 text-sm text-muted">
        GIF e meme non sono ancora disponibili. Nel frattempo puoi usare le emoji.
      </p>
    );
  return (
    <div>
      <p className="mb-2 text-xs text-muted">
        {query.trim() ? `Risultati per “${query.trim()}”` : "Di tendenza"}
      </p>
      <div className="max-h-72 overflow-y-auto overscroll-contain" aria-busy={loading}>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {items.map((item, i) => (
            <button
              key={`${item.slug}:${i}`}
              type="button"
              aria-label={`Aggiungi ${item.title || kind}`}
              onClick={() => onMedia(item)}
              className="overflow-hidden rounded-xl bg-surface p-1 focus-visible:outline-2 focus-visible:outline-accent hover:bg-white/10"
            >
              <CommentMediaImage media={item} thumbnail />
            </button>
          ))}
        </div>
        {loading && (
          <p role="status" className="py-4 text-center text-sm text-muted">
            Caricamento…
          </p>
        )}
        {error && (
          <div role="alert" className="py-3 text-sm text-muted">
            {error}
            <button
              type="button"
              onClick={() => {
                setLoading(true);
                setAttempt((v) => v + 1);
              }}
              className="ml-2 min-h-11 text-accent-soft underline"
            >
              Riprova
            </button>
          </div>
        )}
        {!loading && !error && items.length === 0 && (
          <p className="py-4 text-sm text-muted">
            Nessun risultato. Prova un’altra parola.
          </p>
        )}
        {!loading && !error && hasNext && (
          <button
            type="button"
            onClick={() => {
              setLoading(true);
              setPage((p) => p + 1);
            }}
            className="mt-2 min-h-11 w-full rounded-xl glass text-xs font-semibold"
          >
            Carica altri
          </button>
        )}
      </div>
      <a
        href="https://klipy.com"
        target="_blank"
        rel="noopener noreferrer"
        className="mt-3 block text-right text-[10px] text-muted"
      >
        Powered by KLIPY
      </a>
    </div>
  );
}
