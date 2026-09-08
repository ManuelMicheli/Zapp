"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toaster";
import { setLocation, setLocationByComune } from "@/lib/cinema/location";
import { ComuneSearch, type ComuneHit } from "./ComuneSearch";
import { Icon } from "./icons";

/**
 * Chiede la posizione: GPS del browser (con spiegazione) o città scritta a mano.
 * `compact` = dentro uno sheet (niente card/titolo). `onDone` chiude lo sheet.
 */
export function LocationPrompt({
  compact = false,
  onDone,
}: {
  compact?: boolean;
  onDone?: () => void;
}) {
  const { show } = useToast();
  const [pending, startTransition] = useTransition();
  const [locating, setLocating] = useState(false);
  const [manual, setManual] = useState(compact);
  const [error, setError] = useState<string | null>(null);

  function useGps() {
    if (!("geolocation" in navigator)) {
      setManual(true);
      setError("Il browser non supporta la posizione: scrivi il tuo comune.");
      return;
    }
    setLocating(true);
    setError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        startTransition(async () => {
          const r = await setLocation({
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
          });
          if (r.ok) {
            show(`Posizione: ${r.label}`);
            onDone?.();
          } else {
            setError(r.error ?? "Errore");
          }
        });
      },
      () => {
        setLocating(false);
        setManual(true);
        setError("Posizione non disponibile: scrivi il tuo comune.");
      },
      { maximumAge: 600_000, timeout: 8_000 },
    );
  }

  function pickComune(c: ComuneHit) {
    setError(null);
    startTransition(async () => {
      const r = await setLocationByComune(c.name, c.sigla);
      if (r.ok) {
        show(`Posizione: ${r.label}`);
        onDone?.();
      } else {
        setError(r.error ?? "Errore");
      }
    });
  }

  const body = (
    <div className="flex flex-col gap-3">
      <Button
        type="button"
        onClick={useGps}
        disabled={locating || pending}
        className="w-full"
      >
        <Icon name="pin" size={18} />
        {locating ? "Cerco la posizione…" : "Usa la mia posizione"}
      </Button>

      {manual ? (
        <ComuneSearch onPick={pickComune} disabled={pending} autoFocus />
      ) : (
        <button
          type="button"
          onClick={() => setManual(true)}
          className="text-sm font-medium text-accent-soft"
        >
          Oppure scrivi il tuo comune
        </button>
      )}

      {error && <p className="text-sm text-danger">{error}</p>}
    </div>
  );

  if (compact) return body;

  return (
    <div className="glass rounded-[20px] p-5">
      <p className="text-lg font-bold tracking-[-0.02em]">Cinema vicino a te</p>
      <p className="mb-4 mt-1 text-sm text-muted">
        Dimmi dove sei e ti mostro sale, orari e biglietti. La posizione resta privata,
        solo tu la vedi, e puoi cambiarla quando vuoi.
      </p>
      {body}
    </div>
  );
}
