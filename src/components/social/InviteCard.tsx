"use client";

import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toaster";

/** Card vuota "nessun amico su Zapp": link invito da copiare o condividere. */
export function InviteCard({
  inviteUrl,
  username,
}: {
  inviteUrl: string;
  username: string;
}) {
  const { show } = useToast();

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(inviteUrl);
      show("Link copiato");
    } catch {
      // clipboard non disponibile: nessuna azione
    }
  }

  async function invite() {
    if (navigator.share) {
      try {
        await navigator.share({ url: inviteUrl, title: "Zapp" });
        return;
      } catch {
        // condivisione annullata dall'utente: nessuna azione
        return;
      }
    }
    await copyLink();
  }

  return (
    <div className="flex flex-col items-center gap-4 rounded-[20px] border border-border bg-surface px-[22px] pb-[22px] pt-7 text-center">
      <div className="flex items-center">
        <span className="flex size-12 items-center justify-center rounded-full bg-gradient-to-br from-accent-soft to-accent-strong text-lg font-bold text-white">
          {username ? username.charAt(0).toUpperCase() : "?"}
        </span>
        <span className="-ml-3 flex size-12 items-center justify-center rounded-full border-2 border-surface bg-gradient-to-br from-accent-pale to-accent">
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-white/80"
            aria-hidden="true"
          >
            <circle cx="12" cy="8" r="4" />
            <path d="M4 21c0-4 3.6-7 8-7s8 3 8 7" />
          </svg>
        </span>
        <span className="-ml-3 flex size-12 items-center justify-center rounded-full border-2 border-surface bg-gradient-to-br from-accent to-accent-strong">
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-white/80"
            aria-hidden="true"
          >
            <circle cx="12" cy="8" r="4" />
            <path d="M4 21c0-4 3.6-7 8-7s8 3 8 7" />
          </svg>
        </span>
      </div>
      <div className="flex flex-col gap-1.5">
        <p className="text-lg font-bold tracking-[-0.02em] text-white">
          Non hai ancora amici su Zapp
        </p>
        <p className="text-pretty text-sm leading-[1.45] text-muted">
          Cerca i tuoi amici per username qui sopra, o invitali con il tuo link.
        </p>
      </div>
      <div className="flex w-full flex-col gap-2.5">
        <div className="flex h-12 items-center justify-between gap-3 rounded-[14px] bg-surface-2 px-3.5">
          <span className="truncate text-[13px] text-accent-soft">{inviteUrl}</span>
          <button
            type="button"
            aria-label="Copia link"
            onClick={copyLink}
            className="shrink-0 text-white"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <rect x="9" y="9" width="11" height="11" rx="2.5" />
              <path d="M5 15V6.5A1.5 1.5 0 0 1 6.5 5H15" />
            </svg>
          </button>
        </div>
        <Button type="button" onClick={invite} className="w-full">
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7" />
            <path d="M16 6l-4-4-4 4" />
            <path d="M12 2v13" />
          </svg>
          Invita un amico
        </Button>
      </div>
    </div>
  );
}
