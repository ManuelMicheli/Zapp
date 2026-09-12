"use client";

import { useState, useTransition } from "react";
import { consumeRecommendationLink } from "@/lib/lists/actions";

export function RecommendationLinkPrompt({
  token,
  senderName,
  message,
}: {
  token: string;
  senderName: string;
  message: string | null;
}) {
  const [visible, setVisible] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  function answer(accept: boolean) {
    startTransition(async () => {
      const result = await consumeRecommendationLink(token, accept);
      if (!result.ok) {
        setError(result.error ?? "Questo consiglio non è più disponibile.");
        return;
      }
      setVisible(false);
    });
  }
  if (!visible) return null;
  return (
    <div className="mx-5 mb-5 rounded-[18px] border border-accent/30 bg-accent/10 p-4 lg:mx-10">
      <p className="text-sm font-semibold">{senderName} ti ha condiviso questo titolo</p>
      {message && <p className="mt-1 text-sm text-muted">“{message}”</p>}
      <p className="mt-2 text-sm text-muted">Vuoi inserirlo nei Consigliati?</p>
      {error ? (
        <p className="mt-3 text-sm text-danger">{error}</p>
      ) : (
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            disabled={pending}
            onClick={() => answer(true)}
            className="rounded-full bg-accent px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            Sì, aggiungi
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => answer(false)}
            className="rounded-full border border-white/[0.12] px-4 py-2 text-sm text-muted disabled:opacity-50"
          >
            No, grazie
          </button>
        </div>
      )}
    </div>
  );
}
