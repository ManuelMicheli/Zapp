"use client";

import { useRouter } from "next/navigation";
import { GlassIconButton } from "./GlassIconButton";

export function BackButton() {
  const router = useRouter();
  return (
    <GlassIconButton
      label="Indietro"
      onClick={() => router.back()}
      className="absolute left-5 top-[calc(env(safe-area-inset-top,0px)+40px)] z-20"
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
