"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { useToast } from "@/components/ui/Toaster";
import { normalizzaCodice } from "@/lib/devices/pairing";
import { claimPairingCode, disconnectDevice, pauseDevice } from "./actions";
import { CercaTv } from "./CercaTv";

export interface Device {
  id: string;
  name: string;
  platform: string;
  lastSeenAt: string | null;
  pausedUntil: string | null;
}

/** `pausedUntil` valorizzato ma nel passato non è più una pausa attiva. */
function isPaused(pausedUntil: string | null): boolean {
  return pausedUntil !== null && new Date(pausedUntil).getTime() > Date.now();
}

export function DevicesClient({ devices }: { devices: Device[] }) {
  const router = useRouter();
  const { show } = useToast();
  const [pending, start] = useTransition();
  const [codice, setCodice] = useState("");
  const [inCorso, setInCorso] = useState(false);

  // Il QR porta a "/devices?code=NNNNNN": il campo nasce già compilato. Letto
  // dopo il montaggio (non con `useSearchParams`) perché questa pagina non ha
  // un boundary Suspense sopra, e aggiungerne uno solo per questo non serve.
  useEffect(() => {
    const daUrl = new URLSearchParams(window.location.search).get("code");
    if (daUrl) setCodice(normalizzaCodice(daUrl));
  }, []);

  async function collega() {
    setInCorso(true);
    const esito = await claimPairingCode(codice);
    setInCorso(false);
    if (esito.ok) {
      show(`${esito.name} collegata`);
      setCodice("");
      router.refresh();
    } else {
      show(esito.error);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <CercaTv />

      <Card className="flex flex-col gap-3 p-4">
        <span className="text-[15px] font-semibold">Collega una TV</span>
        <span className="text-[13px] text-muted">
          Inserisci il codice a sei cifre mostrato sullo schermo della TV.
        </span>
        <span className="flex flex-wrap gap-2">
          <input
            inputMode="numeric"
            maxLength={7}
            value={codice}
            onChange={(e) => setCodice(e.target.value)}
            placeholder="123456"
            aria-label="Codice della TV"
            className="h-12 w-44 rounded-full border border-white/10 bg-white/[0.08] px-4 text-center text-[15px] tracking-[0.25em] text-white outline-none placeholder:text-muted placeholder:tracking-normal focus:border-accent focus:ring-4 focus:ring-accent/[0.16]"
          />
          <Button disabled={inCorso} className="h-12 px-5 text-[15px]" onClick={collega}>
            Collega
          </Button>
        </span>
      </Card>

      {devices.length === 0 && (
        <p className="text-sm leading-relaxed text-muted">
          Nessun dispositivo collegato. Segui la guida qui sopra per iniziare con questo
          browser.
        </p>
      )}

      {devices.map((d) => {
        const paused = isPaused(d.pausedUntil);
        return (
          <Card key={d.id} className="flex flex-wrap items-center gap-4 p-4">
            <span className="flex flex-col gap-1">
              <span className="text-[15px] font-semibold">{d.name}</span>
              <span className="text-[13px] text-muted">
                {paused ? "In pausa" : "In ascolto"}
              </span>
            </span>
            <span className="flex flex-wrap gap-2 sm:ml-auto">
              <Button
                variant="secondary"
                disabled={pending}
                className="h-10 px-4 text-[13px]"
                onClick={() =>
                  start(async () => {
                    await pauseDevice(d.id, paused ? 0 : 1);
                  })
                }
              >
                {paused ? "Riprendi" : "Pausa 1 ora"}
              </Button>
              <Button
                variant="danger"
                disabled={pending}
                className="h-10 px-4 text-[13px]"
                onClick={() =>
                  start(async () => {
                    await disconnectDevice(d.id);
                  })
                }
              >
                Scollega
              </Button>
            </span>
          </Card>
        );
      })}
    </div>
  );
}
