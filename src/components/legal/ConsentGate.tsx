"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { accettaDocumenti } from "@/lib/legal/actions";
import { ConsentCheckbox } from "./ConsentCheckbox";

/**
 * Mostrato al posto dell'app quando mancano i consensi obbligatori.
 *
 * La casella **non è mai pre-spuntata**: una casella già segnata non è consenso
 * (CGUE C-673/17, Planet49). I due link si aprono in scheda nuova, così chi legge
 * non perde questa schermata.
 */
export function ConsentGate() {
  const [accettato, setAccettato] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const invia = () => {
    setErrore(null);
    startTransition(async () => {
      const esito = await accettaDocumenti();
      if (!esito.ok) {
        setErrore(esito.error ?? "Non è stato possibile salvare. Riprova.");
        return;
      }
      router.refresh();
    });
  };

  return (
    <main className="mx-auto flex min-h-svh w-full max-w-[520px] flex-col justify-center px-5 pb-16">
      <h1 className="text-[26px] font-semibold leading-tight text-text">
        Abbiamo aggiornato i documenti
      </h1>
      <p className="mt-3 text-[15px] leading-relaxed text-muted">
        Prima di continuare ti chiediamo di leggere e accettare le condizioni d&apos;uso e
        l&apos;informativa sulla privacy. Servono a dirti cosa facciamo dei tuoi dati e
        cosa puoi aspettarti da Zapp.
      </p>

      <ConsentCheckbox checked={accettato} onChange={setAccettato} />

      {errore && <p className="mt-4 text-[13px] text-danger">{errore}</p>}

      <Button className="mt-6" disabled={!accettato || pending} onClick={invia}>
        {pending ? "Salvataggio…" : "Continua"}
      </Button>
    </main>
  );
}
