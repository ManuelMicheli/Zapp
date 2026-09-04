import type { ReactNode } from "react";

interface Props {
  children: ReactNode;
  /** Gap verticale in px fra gli elementi diretti (default 20, come nel mockup login/signup). */
  gap?: number;
  /**
   * Da `lg` in su: `card` = card centrata senza maniglia (layout 55/45, non più usata);
   * `plain` = solo il blocco del form, è il genitore a fare da pannello (auth 75/25).
   */
  desktop?: "card" | "plain";
}

const DESKTOP = {
  card: "lg:mt-0 lg:max-w-[440px] lg:rounded-[32px] lg:border-0 lg:bg-sheet lg:p-10 lg:shadow-none lg:backdrop-blur-none",
  plain:
    "lg:mt-0 lg:rounded-none lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none lg:backdrop-blur-none",
} as const;

/**
 * Foglio inferiore per auth e onboarding. Su mobile è un pannello in vetro
 * ancorato in basso: il muro di locandine continua a scorrere dietro, sfocato,
 * con un filo di luce sul bordo superiore e un bagliore viola nell'angolo.
 * Da `lg` in su perde maniglia e vetro e diventa card o blocco piatto.
 */
export function BottomSheetStatic({ children, gap = 20, desktop = "card" }: Props) {
  return (
    <div
      className={`relative mt-auto flex w-full flex-col overflow-hidden rounded-t-[32px] border-t border-white/[0.1] bg-[rgba(8,8,10,0.74)] px-6 pb-9 pt-3.5 shadow-[0_-30px_80px_rgba(0,0,0,0.55)] backdrop-blur-2xl backdrop-saturate-150 ${DESKTOP[desktop]}`}
      style={{ gap }}
    >
      {/* Filo di luce sul bordo superiore: il vetro "prende" la luce del muro */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-white/[0.28] to-transparent lg:hidden"
      />
      {/* Bagliore viola nell'angolo in alto a destra, dietro i campi */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-20 -top-24 h-64 w-64 rounded-full blur-[60px] lg:hidden"
        style={{
          background:
            "radial-gradient(circle,rgba(139,92,246,.28) 0%,rgba(139,92,246,.08) 45%,transparent 70%)",
        }}
      />
      <div className="relative h-[5px] w-9 shrink-0 self-center rounded-full bg-white/[0.2] lg:hidden" />
      {children}
    </div>
  );
}
