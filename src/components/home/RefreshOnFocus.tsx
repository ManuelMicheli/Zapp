"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

/**
 * Rilegge la home quando l'utente ci torna sopra.
 *
 * ZConnection scrive in libreria mentre si guarda Netflix, cioe' **fuori da
 * Zapp**: la home e' resa dal server e senza questo resterebbe ferma a com'era
 * quando l'hai lasciata, mostrando "Continua a guardare" senza l'episodio che
 * hai appena cominciato. Il gesto vero e' proprio questo — guardo su Netflix,
 * passo su Zapp — quindi si aggiorna al ritorno, non a intervalli: nessuna
 * richiesta mentre la scheda e' in secondo piano.
 *
 * `router.refresh()` rifa' solo i Server Components, non ricarica la pagina:
 * lo scorrimento e lo stato dei client component (scheda Film/Serie, caroselli)
 * restano dove sono.
 */
export function RefreshOnFocus() {
  const router = useRouter();
  const ultimo = useRef(0);

  useEffect(() => {
    // Sotto questa soglia non si rifa' niente: tornare sulla scheda due volte
    // di fila, o un focus che rimbalza fra finestre, non deve diventare una
    // raffica di render sul server.
    const MINIMO_MS = 10_000;

    function aggiorna() {
      if (document.hidden) return;
      const ora = Date.now();
      if (ora - ultimo.current < MINIMO_MS) return;
      ultimo.current = ora;
      router.refresh();
    }

    document.addEventListener("visibilitychange", aggiorna);
    window.addEventListener("focus", aggiorna);
    return () => {
      document.removeEventListener("visibilitychange", aggiorna);
      window.removeEventListener("focus", aggiorna);
    };
  }, [router]);

  return null;
}
