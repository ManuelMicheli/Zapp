import Link from "next/link";
import type { ReactNode } from "react";
import { BackButton } from "./BackButton";

/**
 * Sotto `lg` le azioni fisse (domanda del giorno + campanella) stanno nell'angolo in
 * alto a destra (`TopNav`): la testata lascia libera quella fascia con
 * `--nav-actions` e il titolo è alto 40px come i due tondi, così sta sulla loro
 * stessa riga senza toccarli (vale anche per la home). `action` (la pillola della
 * posizione in /cinema) va **a capo**, su una riga sua: inline non ci starebbe senza
 * finire sotto le icone. Da `lg` le azioni tornano nella barra, `--nav-actions` è 0 e
 * `action` torna in linea a destra.
 *
 * `back` mette il tondo "indietro" a sinistra del titolo: lo passano le pagine che non
 * sono voci di nav (Scopri, un genere, un film al cinema), dove altrimenti si esce solo
 * dalla barra. `parent` è la briciola: la pagina da cui si scende, cliccabile, sopra il
 * titolo — serve anche a chi arriva da un link condiviso, che non ha cronologia.
 */
export function TopBar({
  title,
  action,
  back = false,
  parent,
}: {
  title: string;
  action?: ReactNode;
  back?: boolean;
  parent?: { label: string; href: string };
}) {
  return (
    <header className="flex flex-col gap-3 pb-4 pl-5 pr-[calc(var(--nav-actions)+12px)] pt-[calc(env(safe-area-inset-top,0px)+var(--nav-top)+20px)] lg:flex-row lg:items-center lg:justify-between lg:pl-10 lg:pr-10 lg:pt-[calc(env(safe-area-inset-top,0px)+var(--nav-top)+32px)]">
      <div className="flex min-h-10 min-w-0 flex-1 items-center gap-3">
        {back && <BackButton inline />}
        <div className="flex min-w-0 flex-col gap-1">
          {parent && (
            <Link
              data-crumb
              href={parent.href}
              className="truncate text-[13px] font-medium text-accent-soft"
            >
              {parent.label}
            </Link>
          )}
          <h1 className="truncate text-[34px] font-bold leading-none tracking-[-0.045em]">
            {title}
          </h1>
        </div>
      </div>
      {/* sotto lg l'azione sta su una riga sua: il wrapper `flex` le lascia la sua
          larghezza naturale (in colonna si allargherebbe a tutta la riga); da lg
          sparisce (`contents`) e torna in linea a destra */}
      {action && <div className="flex lg:contents">{action}</div>}
    </header>
  );
}
