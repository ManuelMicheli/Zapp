"use client";

import { useState, useTransition } from "react";
import { Sheet } from "@/components/ui/Sheet";
import { useToast } from "@/components/ui/Toaster";
import {
  acceptFriendRequest,
  blockUser,
  removeFriend,
  sendFriendRequest,
} from "@/lib/social/actions";

export type FriendState = "none" | "outgoing" | "incoming" | "friends" | "blocked";

export function FriendButton({
  targetId,
  initialState,
}: {
  targetId: string;
  initialState: FriendState;
}) {
  const { show } = useToast();
  const [state, setState] = useState(initialState);
  const [pending, startTransition] = useTransition();
  const [menuOpen, setMenuOpen] = useState(false);

  const base =
    "flex-1 rounded-xl py-2.5 text-center text-sm font-bold disabled:opacity-50";

  return (
    <div className="flex items-center gap-2">
      {state === "none" && (
        <button
          type="button"
          disabled={pending}
          className={`${base} bg-accent text-white`}
          onClick={() =>
            startTransition(async () => {
              const r = await sendFriendRequest(targetId);
              if (r.ok) {
                setState("outgoing");
                show("Richiesta inviata");
              } else show(r.error ?? "Errore");
            })
          }
        >
          Aggiungi
        </button>
      )}
      {state === "outgoing" && (
        <span className={`${base} border border-border bg-surface text-muted`}>
          Richiesta inviata
        </span>
      )}
      {state === "incoming" && (
        <button
          type="button"
          disabled={pending}
          className={`${base} bg-accent text-white`}
          onClick={() =>
            startTransition(async () => {
              const r = await acceptFriendRequest(targetId);
              if (r.ok) {
                setState("friends");
                show("Ora siete amici!");
              } else show("Errore");
            })
          }
        >
          Accetta richiesta
        </button>
      )}
      {state === "friends" && (
        <span className={`${base} border border-border bg-surface text-accent`}>
          Amici ✓
        </span>
      )}
      {state === "blocked" && (
        <span className={`${base} border border-border bg-surface text-muted`}>
          Bloccato
        </span>
      )}

      {state !== "blocked" && (
        <button
          type="button"
          aria-label="Altre azioni"
          onClick={() => setMenuOpen(true)}
          className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-border bg-surface"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <circle cx="5" cy="12" r="1.8" />
            <circle cx="12" cy="12" r="1.8" />
            <circle cx="19" cy="12" r="1.8" />
          </svg>
        </button>
      )}

      <Sheet open={menuOpen} onClose={() => setMenuOpen(false)} title="Azioni">
        <div className="space-y-1">
          {state === "friends" && (
            <button
              type="button"
              className="block w-full rounded-xl px-4 py-3 text-left text-base font-medium hover:bg-surface-2"
              onClick={() => {
                setMenuOpen(false);
                startTransition(async () => {
                  const r = await removeFriend(targetId);
                  if (r.ok) {
                    setState("none");
                    show("Amicizia rimossa");
                  }
                });
              }}
            >
              Rimuovi amicizia
            </button>
          )}
          <button
            type="button"
            className="block w-full rounded-xl px-4 py-3 text-left text-base font-medium text-danger hover:bg-surface-2"
            onClick={() => {
              setMenuOpen(false);
              startTransition(async () => {
                const r = await blockUser(targetId);
                if (r.ok) {
                  setState("blocked");
                  show("Utente bloccato");
                }
              });
            }}
          >
            Blocca utente
          </button>
        </div>
      </Sheet>
    </div>
  );
}
