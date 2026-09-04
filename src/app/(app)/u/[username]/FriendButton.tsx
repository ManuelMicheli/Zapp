"use client";

import { useState, useTransition } from "react";
import { GlassIconButton } from "@/components/layout/GlassIconButton";
import { Sheet } from "@/components/ui/Sheet";
import { useToast } from "@/components/ui/Toaster";
import {
  acceptFriendRequest,
  blockUser,
  removeFriend,
  sendFriendRequest,
} from "@/lib/social/actions";

export type FriendState = "none" | "outgoing" | "incoming" | "friends" | "blocked";

const PILL =
  "flex h-10 items-center gap-2 rounded-full px-[18px] text-sm font-semibold disabled:opacity-50";

function CheckIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M5 12l4.5 4.5L19 7" />
    </svg>
  );
}

/**
 * Pillola stato amicizia + menu "…" in alto a destra della testata.
 * Il menu è posizionato in assoluto rispetto alla testata del profilo pubblico
 * (che è l'antenato `relative`) per condividere lo stato con la pillola.
 */
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

  return (
    <>
      {state !== "blocked" && (
        <GlassIconButton
          label="Altre azioni"
          onClick={() => setMenuOpen(true)}
          className="absolute right-5 top-[calc(env(safe-area-inset-top,0px)+104px)] z-20 lg:right-10"
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="currentColor"
            aria-hidden="true"
          >
            <circle cx="5" cy="12" r="2" />
            <circle cx="12" cy="12" r="2" />
            <circle cx="19" cy="12" r="2" />
          </svg>
        </GlassIconButton>
      )}

      <div className="flex items-center gap-2.5">
        {state === "none" && (
          <button
            type="button"
            disabled={pending}
            className={`${PILL} bg-accent text-white shadow-[var(--shadow-accent)]`}
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
          <span className={`${PILL} glass text-white`}>Richiesta inviata</span>
        )}
        {state === "incoming" && (
          <button
            type="button"
            disabled={pending}
            className={`${PILL} bg-accent text-white shadow-[var(--shadow-accent)]`}
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
          <span
            className={`${PILL} border border-accent/45 bg-accent/[0.18] text-accent-pale`}
          >
            <CheckIcon />
            Amici
          </span>
        )}
        {state === "blocked" && (
          <span className={`${PILL} border border-border bg-surface text-muted`}>
            Bloccato
          </span>
        )}
      </div>

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
    </>
  );
}
