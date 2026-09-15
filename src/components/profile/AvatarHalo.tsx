import type { ReactNode } from "react";

/** Bagliore viola dietro l'immagine profilo, sopra il muro di locandine. */
const AVATAR_GLOW =
  "radial-gradient(circle,rgba(139,92,246,0.5) 0%,rgba(139,92,246,0.14) 45%,rgba(0,0,0,0) 70%)";

/** Anello conico + bagliore attorno all'avatar della testata profilo. */
export function AvatarHalo({ children }: { children: ReactNode }) {
  return (
    <div className="relative">
      <span
        aria-hidden="true"
        className="absolute -inset-16 rounded-full blur-[36px]"
        style={{ background: AVATAR_GLOW }}
      />
      <span
        aria-hidden="true"
        className="absolute -inset-1.5 rounded-full bg-[conic-gradient(from_200deg,#c4b5fd,#7c3aed,#2e1065,#8b5cf6,#c4b5fd)] opacity-90"
      />
      <span aria-hidden="true" className="absolute -inset-0.5 rounded-full bg-bg" />
      {children}
    </div>
  );
}
