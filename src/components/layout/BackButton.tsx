"use client";

import { useRouter } from "next/navigation";
import { GlassIconButton } from "./GlassIconButton";

/**
 * Cerchio "indietro" in vetro.
 * `inline`: niente posizionamento assoluto, per le testate a riga (back + titolo).
 */
export function BackButton({ inline = false }: { inline?: boolean }) {
  const router = useRouter();
  return (
    <GlassIconButton
      label="Indietro"
      onClick={() => router.back()}
      className={
        inline
          ? "shrink-0"
          : "absolute left-5 top-[calc(env(safe-area-inset-top,0px)+92px)] z-20 lg:left-10"
      }
    >
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M15 5l-7 7 7 7" />
      </svg>
    </GlassIconButton>
  );
}
