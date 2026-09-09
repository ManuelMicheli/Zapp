"use client";

import { useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ConnectButton } from "./ConnectButton";
import { disconnectDevice, pauseDevice } from "./actions";

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
  const [pending, start] = useTransition();

  return (
    <div className="flex flex-col gap-4">
      <ConnectButton />

      {devices.map((d) => {
        const paused = isPaused(d.pausedUntil);
        return (
          <Card key={d.id} className="flex items-center gap-4 p-4">
            <span className="flex flex-col gap-1">
              <span className="text-[15px] font-semibold">{d.name}</span>
              <span className="text-[13px] text-muted">
                {paused ? "In pausa" : "In ascolto"}
              </span>
            </span>
            <span className="ml-auto flex gap-2">
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
