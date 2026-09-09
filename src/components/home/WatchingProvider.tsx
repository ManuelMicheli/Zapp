"use client";

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import type { LiveSession } from "@/lib/watch/live";

/**
 * Cosa i dispositivi collegati stanno riproducendo adesso, tenuto aggiornato
 * mentre la home è aperta.
 *
 * ZConnection scrive in libreria mentre si guarda su Netflix, cioè fuori da
 * Zapp: senza questo, il minutaggio resta quello del momento in cui la pagina è
 * stata resa e "Continua a guardare" mostra l'ordine di allora. Due meccanismi,
 * di costo molto diverso:
 *
 * - **il minutaggio lo interpola il client** (`LiveProgress`), quindi scorre
 *   liscio fra un sondaggio e l'altro senza chiedere niente a nessuno;
 * - **la pagina si rifà solo quando cambia cosa si sta guardando** — un altro
 *   episodio, un altro titolo, o un titolo che prima non era nella fila. Rifare
 *   la home a intervalli vorrebbe dire rirenderizzare carosello, scaffali e
 *   sezioni cinema per aggiornare due numeri.
 */
const WatchingContext = createContext<LiveSession[]>([]);

export function useWatching(): LiveSession[] {
  return useContext(WatchingContext);
}

/** Ogni quanto si chiede cosa sta andando, mentre la scheda è in primo piano. */
const POLL_MS = 10_000;

/** Identità di ciò che si sta guardando: se cambia, la pagina va rifatta. */
function impronta(sessions: LiveSession[]): string {
  return sessions
    .map((s) => `${s.mediaType}:${s.titleId}:${s.seasonNumber ?? ""}:${s.episodeNumber ?? ""}`)
    .join("|");
}

export function WatchingProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [sessions, setSessions] = useState<LiveSession[]>([]);
  // Impronta dell'ultimo stato per cui la pagina è stata rifatta: serve a non
  // rifarla a ogni sondaggio quando non è cambiato niente.
  const resa = useRef<string | null>(null);

  useEffect(() => {
    let vivo = true;
    let timer: ReturnType<typeof setTimeout> | null = null;

    async function chiedi() {
      if (!vivo) return;
      // In secondo piano non si chiede niente: la fila la si guarda quando la
      // si guarda, e il primo sondaggio al ritorno la rimette a posto.
      if (document.hidden) return pianifica();
      try {
        const res = await fetch("/api/watching", { cache: "no-store" });
        if (!res.ok) return pianifica();
        const dati = (await res.json()) as { sessions: LiveSession[] };
        if (!vivo) return;
        const nuove = dati.sessions ?? [];
        setSessions(nuove);

        const ora = impronta(nuove);
        // Alla prima risposta si prende nota e basta: la pagina è appena stata
        // resa dal server, rifarla subito sarebbe una richiesta buttata.
        if (resa.current === null) resa.current = ora;
        else if (ora !== resa.current) {
          resa.current = ora;
          router.refresh();
        }
      } catch {
        // rete ballerina: si riprova al giro dopo, senza dire niente
      }
      pianifica();
    }

    function pianifica() {
      if (!vivo) return;
      timer = setTimeout(chiedi, POLL_MS);
    }

    // Al ritorno sulla scheda si chiede subito, senza aspettare il giro.
    function alRitorno() {
      if (!document.hidden) chiedi();
    }

    chiedi();
    document.addEventListener("visibilitychange", alRitorno);
    return () => {
      vivo = false;
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", alRitorno);
    };
  }, [router]);

  return <WatchingContext.Provider value={sessions}>{children}</WatchingContext.Provider>;
}
