import type { ReactNode } from "react";

interface Props {
  /** Titolo (senza il punto accento finale, aggiunto automaticamente). */
  title: string;
  subtitle: string;
  /** Variante wordmark "Zapp." della schermata di login (56px). */
  wordmark?: boolean;
  /** Icona sopra il titolo (es. busta email per "Controlla la tua email"). */
  icon?: ReactNode;
}

/**
 * Blocco titolo sopra il foglio, in stile mockup mobile. Vive nel flusso
 * normale (non assoluto): occupa lo spazio residuo sopra `BottomSheetStatic`
 * (flex-1 + justify-end) così il testo resta sempre appena sopra il foglio,
 * anche su viewport bassi (es. iPhone SE con barra del browser), senza mai
 * sovrapporlo. Nascosto da `lg` in su: a schermi larghi il layout a due
 * colonne mostra solo il wordmark generico nel pannello sinistro.
 */
export function AuthHeadline({ title, subtitle, wordmark = false, icon }: Props) {
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

  return (
    <div className="flex flex-1 flex-col justify-end gap-[22px] px-6 pb-6 lg:hidden">
      {icon}
      {textBlock}
    </div>
  );
}
