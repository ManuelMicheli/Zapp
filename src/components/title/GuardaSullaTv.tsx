"use client";

import { useEffect, useRef, useState } from "react";
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

  // Bandiera di annullamento: previene che il ciclo di attesa continui dopo lo
  // smontaggio o la chiusura del foglio. Senza questa, i timer restano in piedi
  // e chiamano setStato() su un componente ormai smontato (React warning) e
  // continuano a interrogare il server per un lancio che nessuno sta più guardando.
  const isCancelledRef = useRef(false);

  // Annulla il lancio quando il foglio di stato si chiude o il componente smonta.
  useEffect(() => {
    return () => {
      isCancelledRef.current = true;
    };
  }, []);

  if (tv.length === 0) return null;

  async function lancia(scelta: Tv) {
    setSceltaFoglio(false);
    setStatiFoglio(true);
    isCancelledRef.current = false;
    setStato(`Apro su ${scelta.name}…`);
    const esito = await lanciaSullaTv({
      deviceId: scelta.id,
      titleId,
      mediaType,
      providerId,
    });
    if (!esito.ok) {
      if (!isCancelledRef.current) setStato(esito.error);
      return;
    }
    // Trenta secondi: oltre, la TV o e' spenta o non sta ascoltando.
    //
    // "Consegnato" e "andato a buon fine" sono due cose diverse, e all'inizio
    // qui erano la stessa: bastava `delivered` per annunciare il successo. Ma
    // la TV ritira il comando in un sondaggio e riferisce com'e' andata nel
    // **successivo**, cinque secondi dopo: nell'istante in cui `delivered`
    // diventa vero, `result` e' ancora nullo per forza. Il 13/09 il telefono
    // ha detto "Aperta l'app sulla TV" mentre sul televisore l'apertura era
    // fallita. Si aspetta l'esito vero, e se non arriva lo si dice.
    let consegnato = false;
    for (let giro = 0; giro < 30; giro += 1) {
      if (isCancelledRef.current) return;
      // Un secondo, non due: la TV sonda ogni due secondi e riferisce l'esito
      // subito dopo aver eseguito, quindi il caso normale si chiude in tre o
      // quattro secondi. Guardare piu' spesso di cosi' non anticipa nulla.
      await new Promise((r) => setTimeout(r, 1000));
      if (isCancelledRef.current) return;
      const { delivered, result } = await esitoComando(esito.commandId);
      if (result === "assente") {
        if (!isCancelledRef.current) setStato("Su quella TV l'app non e' installata");
        return;
      }
      if (result === "errore") {
        if (!isCancelledRef.current) setStato("La TV non e' riuscita ad aprirlo");
        return;
      }
      if (result === "ok") {
        if (!isCancelledRef.current)
          setStato(
            esito.esito === "avvia"
              ? // Netflix mostra la scheda del titolo per una decina di secondi
                // e poi parte da sola (misurato il 13/09: posizione ferma, poi
                // in crescita a 40-60 secondi dal comando). Senza questa mezza
                // frase sembra che il lancio si sia fermato li'.
                "Aperto sulla TV — parte fra qualche secondo"
              : esito.esito === "scheda"
                ? "Aperta la scheda: premi Play"
                : "Aperta l'app sulla TV",
          );
        return;
      }
      if (delivered && !consegnato) {
        consegnato = true;
        if (!isCancelledRef.current) setStato("La TV ha preso il comando…");
      }
    }
    if (!isCancelledRef.current) {
      setStato(
        consegnato
          ? "La TV ha preso il comando ma non ha riferito com'e' andata"
          : "La TV non ha risposto — e' accesa?",
      );
    }
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
        <ul className="flex flex-col gap-2">
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
        onClose={() => {
          isCancelledRef.current = true;
          setStatiFoglio(false);
        }}
        title="Lancio sulla TV"
      >
        <div className="p-4 text-center">
          <p className="text-base font-medium">{stato}</p>
        </div>
      </Sheet>
    </>
  );
}
