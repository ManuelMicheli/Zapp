import type { CSSProperties, ReactNode } from "react";
import { PosterWall } from "@/components/marketing/PosterWall";
import type { Aura } from "@/lib/profile/aura";

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
  aura = null,
  className = "",
  children,
}: {
  posters: string[];
  /**
   * Aura del livello: quando c'e', la testata la usa **al posto** del muro di
   * locandine. Il muro resta per chi il percorso non ce l'ha (profilo altrui senza
   * amicizia, o funzione non disponibile): meglio il muro che una testata vuota.
   */
  aura?: Aura | null;
  className?: string;
  children: ReactNode;
}) {
  if (aura) {
    const { rgb, alpha } = aura;
    return (
      <header
        data-profile-aura
        className={`relative h-[480px] shrink-0 overflow-hidden lg:h-[620px] ${className}`}
        style={
          {
            // Le due variabili stanno sull'header e non in una regola CSS: da qui le
            // leggono sia lo sfondo sia l'anello attorno all'immagine profilo, e il
            // percorso piu' in basso le riscrive mentre sfogli i livelli.
            "--aura-rgb": rgb,
            "--aura-alpha": `${alpha}`,
          } as CSSProperties
        }
      >
        <div
          aria-hidden="true"
          className="absolute inset-0"
          style={
            {
              transition: "background 520ms ease",
              // I layer di `background` si impilano dal primo: i veli stanno in
              // cima, i due radiali dell'aura sotto. Invertirli li rende invisibili.
              background: [
                // Giunzione: gli ultimi 100px si spengono nel nero, che e' da dove
                // parte la parete di locandine della fascia sotto. Senza, fra le due
                // resta una riga netta.
                "linear-gradient(0deg, #000 0px, rgb(0 0 0 / 0.72) 46px, transparent 104px)",
                "linear-gradient(180deg, rgb(0 0 0 / 0.55) 0%, transparent 38%)",
                "radial-gradient(118% 82% at 50% 86%, rgb(var(--aura-rgb) / var(--aura-alpha)) 0%, rgb(var(--aura-rgb) / calc(var(--aura-alpha) * 0.42)) 34%, rgb(var(--aura-rgb) / calc(var(--aura-alpha) * 0.12)) 58%, transparent 76%)",
                "radial-gradient(70% 46% at 50% 100%, rgb(var(--aura-rgb) / calc(var(--aura-alpha) * 0.6)) 0%, transparent 68%)",
              ].join(","),
            } as CSSProperties
          }
        />
        {children}
      </header>
    );
  }
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
