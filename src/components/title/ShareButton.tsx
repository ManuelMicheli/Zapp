"use client";

import { GlassIconButton } from "@/components/layout/GlassIconButton";
import { useToast } from "@/components/ui/Toaster";

/** Condivide la scheda con navigator.share, altrimenti copia il link. */
export function ShareButton({ title }: { title: string }) {
  const { show } = useToast();

  async function share() {
    const url = window.location.href;
    if (navigator.share) {
      try {
        await navigator.share({ title, url });
        return;
      } catch {
        // annullata dall'utente o non permessa: si prova la copia
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      show("Link copiato");
    } catch {
      show("Impossibile condividere");
    }
  }

  return (
    <GlassIconButton
      label="Condividi"
      onClick={() => void share()}
      className="absolute right-5 top-[calc(env(safe-area-inset-top,0px)+40px)] z-20"
    >
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7" />
        <path d="M16 6l-4-4-4 4" />
        <path d="M12 2v13" />
      </svg>
    </GlassIconButton>
  );
}
