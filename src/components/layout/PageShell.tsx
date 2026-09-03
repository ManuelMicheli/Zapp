import type { ReactNode } from "react";

export function PageShell({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto min-h-dvh w-full max-w-[480px] border-x border-border/40 lg:max-w-none lg:border-x-0 lg:pl-60">
      {children}
    </div>
  );
}
