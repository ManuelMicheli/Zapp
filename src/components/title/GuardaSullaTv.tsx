"use client";

import { useState } from "react";
import { esitoComando, lanciaSullaTv } from "@/app/(app)/devices/actions";
import { Sheet } from "@/components/ui/Sheet";

interface Tv {
  id: string;
  name: string;
}

/**
 * Apre questo titolo su una TV collegata.
 *
 * Il lancio non scrive niente in libreria: quello arriva dalla riproduzione
 * vera, oltre i due minuti. Qui si dice soltanto cosa sta succedendo — e si dice
 * anche quando **non** succede, perche' un bottone che gira per sempre e' il
 * guasto peggiore: sembra che funzioni.
 */
export function GuardaSullaTv({
  tv,
  titleId,
  mediaType,
  providerId,
}: {
  tv: Tv[];
  titleId: number;
  mediaType: "movie" | "tv";
  providerId: number;
}) {
  const [sceltaFoglio, setSceltaFoglio] = useState(false);
  const [statiFoglio, setStatiFoglio] = useState(false);
  const [stato, setStato] = useState<string | null>(null);

  if (tv.length === 0) return null;

  async function lancia(scelta: Tv) {
    setSceltaFoglio(false);
    setStatiFoglio(true);
    setStato(`Apro su ${scelta.name}…`);
    const esito = await lanciaSullaTv({
      deviceId: scelta.id,
      titleId,
      mediaType,
      providerId,
    });
    if (!esito.ok) {
      setStato(esito.error);
      return;
    }
    // Venti secondi: oltre, la TV o e' spenta o non sta ascoltando.
    for (let giro = 0; giro < 10; giro += 1) {
      await new Promise((r) => setTimeout(r, 2000));
      const { delivered, result } = await esitoComando(esito.commandId);
      if (result === "assente") {
        setStato("Su quella TV l'app non e' installata");
        return;
      }
      if (result === "errore") {
        setStato("La TV non e' riuscita ad aprirlo");
        return;
      }
      if (delivered) {
        setStato(
          esito.esito === "avvia"
            ? "Aperto sulla TV"
            : esito.esito === "scheda"
              ? "Aperta la scheda: premi Play"
              : "Aperta l'app sulla TV",
        );
        return;
      }
    }
    setStato("La TV non ha risposto — e' accesa?");
  }

  return (
    <>
      <button
        type="button"
        className="flex size-14 shrink-0 items-center justify-center rounded-full border border-white/[0.12] bg-surface-2/85 backdrop-blur-xl"
        aria-label="Guarda sulla TV"
        onClick={() => (tv.length === 1 ? lancia(tv[0]) : setSceltaFoglio(true))}
      >
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <rect x="2" y="3" width="20" height="14" rx="2" />
          <path d="M7 21h10" />
        </svg>
      </button>

      <Sheet
        open={sceltaFoglio}
        onClose={() => setSceltaFoglio(false)}
        title="Su quale TV?"
      >
        <ul className="flex flex-col gap-1">
          {tv.map((t) => (
            <li key={t.id}>
              <button
                type="button"
                className="block w-full rounded-2xl px-4 py-3 text-left text-base font-medium hover:bg-surface-2"
                onClick={() => lancia(t)}
              >
                {t.name}
              </button>
            </li>
          ))}
        </ul>
      </Sheet>

      <Sheet
        open={statiFoglio}
        onClose={() => setStatiFoglio(false)}
        title="Lancio sulla TV"
      >
        <div className="p-4 text-center">
          <p className="text-base font-medium">{stato}</p>
        </div>
      </Sheet>
    </>
  );
}
