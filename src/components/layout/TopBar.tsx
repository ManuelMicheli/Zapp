import type { ReactNode } from "react";

export function TopBar({
  title,
  action,
}: {
  title: string;
  action?: ReactNode;
}) {
  return (
    <header className="sticky top-0 z-20 flex items-center justify-between bg-bg/90 px-4 pb-3 pt-[calc(env(safe-area-inset-top,0px)+16px)] backdrop-blur">
      <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
      {action}
    </header>
  );
}
