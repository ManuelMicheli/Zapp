import type { ReactNode } from "react";

/**
 * Sotto `lg` la campanella delle notifiche è fissa nell'angolo in alto a destra
 * (`TopNav`): l'header le lascia il posto con `pr-16`, così `action` (es. la pillola
 * della posizione in /cinema) non ci finisce sotto. Da `lg` la campanella torna nella
 * barra e il padding è quello di sempre.
 */
export function TopBar({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <header className="flex items-center justify-between pb-4 pl-5 pr-16 pt-[calc(env(safe-area-inset-top,0px)+var(--nav-top)+32px)] lg:pl-10 lg:pr-10">
      <h1 className="text-[34px] font-bold leading-none tracking-[-0.045em]">{title}</h1>
      {action}
    </header>
  );
}
