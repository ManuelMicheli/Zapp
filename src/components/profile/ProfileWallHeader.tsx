import type { ReactNode } from "react";
import { PosterWall } from "@/components/marketing/PosterWall";

/**
 * Sfumatura verso il nero sotto il muro di locandine: resta leggera a lungo
 * (il muro si vede fin quasi al fondo della testata) e chiude sul nero solo
 * negli ultimi 12%, dove comincia il contenuto.
 */
const HEADER_SCRIM =
  "linear-gradient(180deg,rgba(0,0,0,0.5) 0%,rgba(0,0,0,0.18) 26%,rgba(0,0,0,0.32) 55%,rgba(0,0,0,0.62) 74%,rgba(0,0,0,0.9) 88%,#000 100%)";

/**
 * Testata del profilo (proprio e altrui): muro di locandine personale, velo
 * verso il nero e, sopra, l'identità passata come `children`.
 */
export function ProfileWallHeader({
  posters,
  className = "",
  children,
}: {
  posters: string[];
  className?: string;
  children: ReactNode;
}) {
  return (
    <header
      className={`relative h-[480px] shrink-0 overflow-hidden lg:h-[620px] ${className}`}
    >
      <PosterWall
        posters={posters}
        height={560}
        opacity={0.75}
        speed="slow"
        className="md:hidden"
      />
      {/* Desktop: il muro copre tutta la larghezza del contenuto e scende
          fin sotto l'immagine profilo (il velo lo lascia leggere a lungo) */}
      <PosterWall
        posters={posters}
        columns={20}
        width="calc(100% + 140px)"
        height={740}
        opacity={0.75}
        speed="slow"
        className="hidden md:block"
      />
      <div
        aria-hidden="true"
        className="absolute inset-0"
        style={{ background: HEADER_SCRIM }}
      />
      {children}
    </header>
  );
}
