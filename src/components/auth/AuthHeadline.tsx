import type { ReactNode } from "react";

interface Props {
  /** Titolo (senza il punto accento finale, aggiunto automaticamente). */
  title: string;
  subtitle: string;
  /** Variante wordmark "Zapp." della schermata di login (56px). */
  wordmark?: boolean;
  /** Icona sopra il titolo (es. busta email per "Controlla la tua email"). */
  icon?: ReactNode;
  /** Offset verticale in px; default in base alla variante. */
  top?: number;
}

/**
 * Blocco titolo assoluto sopra il muro di locandine, in stile mockup mobile.
 * Nascosto da `lg` in su: a schermi larghi il layout a due colonne mostra
 * solo il wordmark generico nel pannello sinistro.
 */
export function AuthHeadline({ title, subtitle, wordmark = false, icon, top }: Props) {
  const topPx = top ?? (icon ? 228 : wordmark ? 318 : 262);

  const titleClass = wordmark
    ? "text-[56px] font-bold leading-none tracking-[-0.05em] text-text"
    : icon
      ? "text-[36px] font-bold leading-[1.05] tracking-[-0.045em] text-text"
      : "max-w-[320px] text-[40px] font-bold leading-[1.02] tracking-[-0.045em] text-text";
  const subtitleClass = wordmark ? "text-[17px]" : "text-[16px]";

  const textBlock = (
    <div className={`flex flex-col ${icon ? "gap-2.5" : "gap-2"}`}>
      <div className={titleClass}>
        {title}
        <span className="text-accent">.</span>
      </div>
      <p className={`max-w-[300px] leading-[1.4] text-white/[0.72] ${subtitleClass}`}>
        {subtitle}
      </p>
    </div>
  );

  if (!icon) {
    return (
      <div className="absolute left-6 flex flex-col lg:hidden" style={{ top: topPx }}>
        {textBlock}
      </div>
    );
  }

  return (
    <div
      className="absolute left-6 flex w-[342px] flex-col gap-[22px] lg:hidden"
      style={{ top: topPx }}
    >
      {icon}
      {textBlock}
    </div>
  );
}
