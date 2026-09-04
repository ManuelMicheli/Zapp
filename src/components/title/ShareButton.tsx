"use client";

import { GlassIconButton } from "@/components/layout/GlassIconButton";
import { useToast } from "@/components/ui/Toaster";

/** Condivide la pagina corrente con navigator.share, altrimenti copia il link. */
export function useShare(title: string): () => Promise<void> {
  const { show } = useToast();

  return async function share() {
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
  };
}

/**
 * Cerchio "Condividi" in vetro, da solo. In testata della scheda titolo il comando vive
 * nella pillola `HeaderControls` insieme all'audio del trailer.
 */
export function ShareButton({
  title,
  className = "",
}: {
  title: string;
  className?: string;
}) {
  const share = useShare(title);

  return (
    <GlassIconButton label="Condividi" onClick={() => void share()} className={className}>
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
