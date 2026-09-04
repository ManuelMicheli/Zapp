import type { ReactNode } from "react";

interface Props {
  children: ReactNode;
  /** Gap verticale in px fra gli elementi diretti (default 20, come nel mockup login/signup). */
  gap?: number;
  /**
   * Da `lg` in su: `card` = card centrata senza maniglia (onboarding, layout 55/45);
   * `plain` = solo il blocco del form, è il genitore a fare da pannello (auth 75/25).
   */
  desktop?: "card" | "plain";
}

const DESKTOP = {
  card: "lg:mt-0 lg:max-w-[440px] lg:rounded-[32px] lg:border-0 lg:p-10 lg:shadow-none",
  plain: "lg:mt-0 lg:rounded-none lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none",
} as const;

/**
 * Wrapper del foglio inferiore per auth e onboarding: pannello ancorato in
 * basso con maniglia su mobile; da `lg` in su perde la maniglia e diventa
 * card o blocco piatto a seconda di `desktop`.
 */
export function BottomSheetStatic({ children, gap = 20, desktop = "card" }: Props) {
  return (
    <div
      className={`relative mt-auto flex w-full flex-col rounded-t-[32px] border-t border-white/[0.08] bg-sheet px-6 pb-9 pt-3.5 shadow-[0_-20px_60px_rgba(0,0,0,0.7)] ${DESKTOP[desktop]}`}
      style={{ gap }}
    >
      <div className="h-[5px] w-9 shrink-0 self-center rounded-full bg-white/[0.18] lg:hidden" />
      {children}
    </div>
  );
}
