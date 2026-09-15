"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

/**
 * `/benvenuto` eredita il guscio di `(app)` per intero, campanella della domanda
 * del giorno compresa — ma `DailyQuestion` si apre **da sola** alla prima
 * visita del giorno (`useEffect` su `seen`, vedi `DailyQuestion.tsx`), e su
 * questa rotta la prima visita del giorno è anche la prima visita in assoluto
 * di chi si è appena iscritto: il popup coprirebbe la pagina proprio nel
 * momento peggiore.
 *
 * Non basta un `display:none`: il popup si aprirebbe comunque, solo nascosto
 * dietro qualcos'altro (stato "visto" scritto, coriandoli persi). Qui invece il
 * figlio non monta affatto su `/benvenuto`, quindi l'effetto che apre il popup
 * non parte mai — su ogni altra rotta si comporta come se questo componente
 * non ci fosse.
 */
export function DailyQuestionGate({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  if (pathname === "/benvenuto") return null;
  return <>{children}</>;
}
