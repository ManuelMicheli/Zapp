import { glow, type Palette } from "@/lib/colors/dominant";

/**
 * Sfumature dei colori dominanti della locandina nello sfondo della scheda. Due strati,
 * entrambi dietro il contenuto (`-z-10`, il `main` è `relative isolate`), nessun JS:
 *
 * - **strato fisso** (`position: fixed`, segue lo scroll): due grandi bagliori ai bordi
 *   del viewport più un velo tenue, con una deriva lenta (`.ambient-drift`, 48 s, ferma
 *   con `prefers-reduced-motion`), così la pagina non è mai nera e anonima, nemmeno in
 *   fondo a una scheda lunga;
 * - **strato assoluto** (alto quanto il `main`): accenno sopra il trailer (dietro nav e
 *   comandi), bagliori sotto il riquadro (`--band-end` + 340px, passato dal chiamante
 *   con `className` = `BAND_END_CLASS`: il bordo basso della banda fissa, a tutte le
 *   larghezze dopo la sfumatura nera `BAND_BLACK_FADE`), ed echi al 55%, 80% e 100%
 *   dell'altezza, alternati fra le due tinte e i due lati.
 *
 * Il trailer resta nudo: gli strati stanno sotto la testata (banda `bg-black`), il colore
 * comincia dopo la sfumatura nera sotto la banda.
 */
export function AmbientBackdrop({
  palette,
  className = "",
}: {
  palette: Palette;
  /** Variabile CSS `--band-end` del bordo basso della banda (`BAND_END_CLASS`). */
  className?: string;
}) {
  const { primary, secondary, secondaryWeight, intensity } = palette;
  // Ogni velo è moltiplicato per quanto colore ha la locandina (`intensity`), e la
  // seconda tinta anche per quanto pesa lì sopra: il dettaglio rosso di un bianco e nero
  // si vede, ma non riempie la pagina come farebbe un colore dominante.
  const tint = (alpha: number) => glow(primary, alpha * intensity);
  const tint2 = (alpha: number) => glow(secondary, alpha * intensity * secondaryWeight);

  const fixedLayer = [
    `radial-gradient(70vw 60vh at 8% 100%, ${tint(0.6)} 0%, ${tint(0)} 100%)`,
    `radial-gradient(60vw 55vh at 100% 55%, ${tint2(0.5)} 0%, ${tint2(0)} 100%)`,
    `linear-gradient(180deg, rgba(0,0,0,0) 0%, ${tint(0.16)} 100%)`,
  ].join(", ");

  const pageLayer = [
    // sopra il trailer: accenno della tinta principale in alto a sinistra
    `radial-gradient(90vw 220px at 15% 0%, ${tint(0.4)} 0%, ${tint(0)} 100%)`,
    // e della seconda in alto a destra
    `radial-gradient(60vw 160px at 92% 40px, ${tint2(0.3)} 0%, ${tint2(0)} 100%)`,
    // bagliore principale dove il trailer si scioglie nella pagina, a sinistra
    `radial-gradient(95vw 380px at 22% calc(var(--band-end) + 340px), ${tint(0.58)} 0%, ${tint(0)} 100%)`,
    // seconda tinta, a destra un po' più in basso
    `radial-gradient(70vw 320px at 88% calc(var(--band-end) + 620px), ${tint2(0.45)} 0%, ${tint2(0)} 100%)`,
    // echi lungo tutta la scheda, alternati
    `radial-gradient(85vw 360px at 30% calc(var(--band-end) + 980px), ${tint(0.3)} 0%, ${tint(0)} 100%)`,
    `radial-gradient(80vw 420px at 90% 55%, ${tint(0.42)} 0%, ${tint(0)} 100%)`,
    `radial-gradient(80vw 420px at 10% 80%, ${tint2(0.42)} 0%, ${tint2(0)} 100%)`,
    `radial-gradient(90vw 380px at 60% 100%, ${tint(0.44)} 0%, ${tint(0)} 100%)`,
  ].join(", ");

  return (
    <>
      <div
        aria-hidden
        className="ambient-drift pointer-events-none fixed inset-0 -z-10"
        style={{ background: fixedLayer }}
      />
      <div
        aria-hidden
        className={`pointer-events-none absolute inset-0 -z-10 ${className}`}
        style={{ background: pageLayer }}
      />
    </>
  );
}
