import { rgba, type Palette } from "@/lib/colors/palette";

/**
 * Sfondo "ambient" della scheda: sfumature dei colori dominanti della locandina, dietro
 * tutta la pagina (nav, riga comandi, banda, contenuto), che si spengono nel nero verso
 * il basso. Sopra ci sta la testata con banda/fondale mascherati in dissolvenza, così il
 * trailer non finisce su un nero piatto ma si scioglie nel colore del titolo. Server
 * component, nessun JS: quattro gradienti in un `div` assoluto.
 */
export function AmbientBackdrop({ palette }: { palette: Palette }) {
  const { primary, secondary } = palette;
  const background = [
    // alone principale, alto a sinistra: dietro nav, comandi e banda
    `radial-gradient(120% 70% at 18% 0%, ${rgba(primary, 0.62)} 0%, ${rgba(primary, 0)} 72%)`,
    // seconda tinta, a destra un po' più in basso
    `radial-gradient(90% 55% at 88% 28%, ${rgba(secondary, 0.5)} 0%, ${rgba(secondary, 0)} 70%)`,
    // bagliore alla quota dove banda/fondale si dissolvono (`--glow-y`: fine della banda
    // 16:9 su telefono, ~53% da md; il fondale desktop finisce lì): il trailer si scioglie
    // nel colore, non nel nero
    `radial-gradient(80% 26% at 40% var(--glow-y), ${rgba(primary, 0.55)} 0%, ${rgba(primary, 0)} 100%)`,
    // velo generale che tinge il primo schermo e si spegne nel nero
    `linear-gradient(180deg, ${rgba(primary, 0.34)} 0%, ${rgba(primary, 0.16)} 55%, rgba(0,0,0,0) 100%)`,
  ].join(", ");

  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[1100px] [--glow-y:31%] md:[--glow-y:53%] lg:h-[1500px]"
      style={{ background }}
    />
  );
}
