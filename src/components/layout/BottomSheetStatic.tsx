import type { ReactNode } from "react";

interface Props {
  children: ReactNode;
  /** Gap verticale in px fra gli elementi diretti (default 20, come nel mockup login/signup). */
  gap?: number;
}

/**
 * Wrapper del foglio inferiore per auth e onboarding: pannello ancorato in
 * basso con maniglia su mobile, card centrata senza maniglia da `lg` in su
 * (il layout a due colonne mostra il muro di locandine a sinistra).
 */
export function BottomSheetStatic({ children, gap = 20 }: Props) {
  return (
    <div
      className="relative flex w-full flex-col rounded-t-[32px] border-t border-white/10 bg-sheet px-6 pb-9 pt-3.5 shadow-[0_-20px_60px_rgba(0,0,0,0.7)] lg:max-w-[440px] lg:rounded-[32px] lg:border-0 lg:p-10 lg:shadow-none"
      style={{ gap }}
    >
      <div className="h-[5px] w-9 shrink-0 self-center rounded-full bg-white/[0.18] lg:hidden" />
      {children}
    </div>
  );
}
