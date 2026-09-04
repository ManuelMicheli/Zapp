import type { ReactNode } from "react";

export function PageShell({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto min-h-dvh w-full max-w-[480px] border-x border-border/40 md:max-w-none md:border-x-0 lg:pl-60">
      {/* Desktop: tutta la larghezza disponibile, nessun cap (padding: alle pagine) */}
      <div className="w-full">{children}</div>
    </div>
  );
}
