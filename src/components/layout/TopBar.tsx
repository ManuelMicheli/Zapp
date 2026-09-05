import type { ReactNode } from "react";

export function TopBar({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <header className="flex items-center justify-between px-5 pb-4 pt-[calc(env(safe-area-inset-top,0px)+var(--nav-top)+32px)] lg:px-10">
      <h1 className="text-[34px] font-bold leading-none tracking-[-0.045em]">{title}</h1>
      {action}
    </header>
  );
}
