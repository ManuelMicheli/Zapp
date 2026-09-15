import type { ReactNode } from "react";

/** Bagliore viola dietro l'immagine profilo, sopra il muro di locandine. */
const AVATAR_GLOW =
  "radial-gradient(circle,rgba(139,92,246,0.5) 0%,rgba(139,92,246,0.14) 45%,rgba(0,0,0,0) 70%)";

/** Anello conico + bagliore attorno all'avatar della testata profilo. */
export function AvatarHalo({
  children,
  rgb = null,
}: {
  children: ReactNode;
  /** Tinta del livello (`Aura.rgb`); senza, resta il viola fisso del marchio. */
  rgb?: string | null;
}) {
  const glow = rgb
    ? `radial-gradient(circle,rgb(${rgb} / 0.55) 0%,rgb(${rgb} / 0.16) 45%,rgb(0 0 0 / 0) 70%)`
    : AVATAR_GLOW;
  return (
    <div className="relative">
      <span
        aria-hidden="true"
        className="absolute -inset-16 rounded-full blur-[36px]"
        style={{ background: glow }}
      />
      <span
        aria-hidden="true"
        className="absolute -inset-1.5 rounded-full opacity-90"
        style={{
          background: rgb
            ? `conic-gradient(from 200deg, rgb(${rgb}), rgb(${rgb} / .35), #17151f, rgb(${rgb} / .7), rgb(${rgb}))`
            : "conic-gradient(from 200deg,#c4b5fd,#7c3aed,#2e1065,#8b5cf6,#c4b5fd)",
        }}
      />
      <span aria-hidden="true" className="absolute -inset-0.5 rounded-full bg-bg" />
      {children}
    </div>
  );
}
