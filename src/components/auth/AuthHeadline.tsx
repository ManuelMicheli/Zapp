import type { ReactNode } from "react";

interface Props {
  /** Titolo (senza il punto accento finale, aggiunto automaticamente). */
  title: string;
  subtitle: string;
  /** Variante wordmark "Zapp." della schermata di login (56px). */
  wordmark?: boolean;
  /** Icona sopra il titolo (es. busta email per "Controlla la tua email"). */
  icon?: ReactNode;
  /**
   * Da `lg` in su il titolo vive nel pannello destro, sopra il form: il wordmark
   * grande sta già sul muro, quindi il login passa qui un saluto al posto di "Zapp".
   */
  desktop?: { title: string; subtitle: string };
}

/**
 * Blocco titolo sopra il foglio, in stile mockup mobile. Vive nel flusso
 * normale (non assoluto): occupa lo spazio residuo sopra `BottomSheetStatic`
 * (flex-1 + justify-end) così il testo resta sempre appena sopra il foglio,
 * anche su viewport bassi (es. iPhone SE con barra del browser), senza mai
 * sovrapporlo. Da `lg` in su diventa l'intestazione del pannello destro:
 * allineata a sinistra, sopra il form, con testo `desktop` se fornito.
 */
export function AuthHeadline({
  title,
  subtitle,
  wordmark = false,
  icon,
  desktop,
}: Props) {
  const titleClass = wordmark
    ? "text-[56px] font-bold leading-none tracking-[-0.05em] text-text"
    : icon
      ? "text-[36px] font-bold leading-[1.05] tracking-[-0.045em] text-text"
      : "max-w-[320px] text-[40px] font-bold leading-[1.02] tracking-[-0.045em] text-text";
  const subtitleClass = wordmark ? "text-[17px]" : "text-[16px]";

  return (
    <>
      {/* Mobile */}
      <div className="relative flex flex-1 flex-col justify-end gap-[22px] px-6 pb-6 lg:hidden">
        {/* Bagliore nero dietro il blocco titolo: le locandine non devono trasparire dal testo */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 -top-16 bottom-0 bg-[radial-gradient(ellipse_at_left,rgba(0,0,0,.85),transparent_70%)]"
        />
        {icon && <div className="relative">{icon}</div>}
        <div className={`relative flex flex-col ${icon ? "gap-2.5" : "gap-2"}`}>
          <div className={titleClass}>
            {title}
            <span className="text-accent">.</span>
          </div>
          <p className={`max-w-[300px] leading-[1.4] text-white/[0.72] ${subtitleClass}`}>
            {subtitle}
          </p>
        </div>
      </div>

      {/* Desktop: intestazione del pannello */}
      <div className="hidden flex-col gap-5 lg:flex">
        {icon && <div>{icon}</div>}
        <div className="flex flex-col gap-2.5">
          <h1 className="text-[36px] font-bold leading-[1.05] tracking-[-0.045em] text-text 2xl:text-[44px]">
            {desktop?.title ?? title}
            <span className="text-accent">.</span>
          </h1>
          <p className="max-w-[340px] text-[16px] leading-[1.45] text-muted 2xl:max-w-[400px] 2xl:text-[18px]">
            {desktop?.subtitle ?? subtitle}
          </p>
        </div>
      </div>
    </>
  );
}
