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
  // Con `rgb` si passa alla tinta del livello, letta dalla variabile che la testata
  // porta (`--aura-rgb`): cosi' l'anello cambia insieme allo sfondo quando sfogli i
  // livelli, senza che questo componente sappia niente del percorso. Il valore del
  // prop resta come ripiego per chi non sta dentro la testata.
  const tinta = rgb ? `var(--aura-rgb, ${rgb})` : null;
  const glow = tinta
    ? `radial-gradient(circle,rgb(${tinta} / 0.55) 0%,rgb(${tinta} / 0.16) 45%,rgb(0 0 0 / 0) 70%)`
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
          background: tinta
            ? `conic-gradient(from 200deg, rgb(${tinta}), rgb(${tinta} / .35), #17151f, rgb(${tinta} / .7), rgb(${tinta}))`
            : "conic-gradient(from 200deg,#c4b5fd,#7c3aed,#2e1065,#8b5cf6,#c4b5fd)",
        }}
      />
      <span aria-hidden="true" className="absolute -inset-0.5 rounded-full bg-bg" />
      {children}
    </div>
  );
}
