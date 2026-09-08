import type { ReactNode } from "react";

/**
 * Sotto `lg` le azioni fisse (domanda del giorno + campanella) stanno nell'angolo in
 * alto a destra (`TopNav`): la testata lascia libera quella fascia con `--nav-actions`
 * e il titolo è alto 40px come i due tondi, così sta sulla loro stessa riga senza
 * toccarli (vale anche per la home). `action` (la pillola della posizione in /cinema)
 * va **a capo**, su una riga sua: in linea non ci starebbe senza finire sotto le
 * icone. Da `lg` le azioni tornano nella barra, `--nav-actions` è 0 e `action` torna
 * in linea a destra.
 */
export function TopBar({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <header className="flex flex-col gap-3 pb-4 pl-5 pr-[calc(var(--nav-actions)+12px)] pt-[calc(env(safe-area-inset-top,0px)+var(--nav-top)+20px)] lg:flex-row lg:items-center lg:justify-between lg:pl-10 lg:pr-10 lg:pt-[calc(env(safe-area-inset-top,0px)+var(--nav-top)+32px)]">
      <h1 className="flex h-10 items-center truncate text-[34px] font-bold leading-none tracking-[-0.045em]">
        {title}
      </h1>
      {/* sotto lg l'azione sta su una riga sua: il wrapper `flex` le lascia la sua
          larghezza naturale (in colonna si allargherebbe a tutta la riga); da lg
          sparisce (`contents`) e torna in linea a destra */}
      {action && <div className="flex lg:contents">{action}</div>}
    </header>
  );
}
