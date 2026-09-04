import type { ReactNode } from "react";

export function PageShell({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto min-h-dvh w-full max-w-[480px] border-x border-border/40 md:max-w-none md:border-x-0 lg:pl-60">
      {/* Su schermi enormi il contenuto resta centrato entro 1600px (padding: alle pagine) */}
      <div className="lg:mx-auto lg:w-full lg:max-w-[1600px]">{children}</div>
    </div>
  );
}
