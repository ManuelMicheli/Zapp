import type { ReactNode } from "react";

export function TopBar({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <header className="sticky top-0 z-20 flex items-center justify-between bg-bg/80 px-5 pb-4 pt-[calc(env(safe-area-inset-top,0px)+40px)] backdrop-blur-xl lg:static lg:bg-transparent lg:px-10 lg:pt-[104px] lg:backdrop-blur-none">
      <h1 className="text-[34px] font-bold leading-none tracking-[-0.045em]">{title}</h1>
      {action}
    </header>
  );
}
