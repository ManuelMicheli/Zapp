"use client";

import { useState, useTransition } from "react";
import { AUTH_FIELD_CLASS } from "@/components/auth/field";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toaster";
import { setLocation, setLocationByQuery } from "@/lib/cinema/location";
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
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);

  function useGps() {
    if (!("geolocation" in navigator)) {
      setManual(true);
      setError("Il browser non supporta la posizione: scrivi la città.");
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
        setError("Posizione non disponibile: scrivi la città.");
      },
      { maximumAge: 600_000, timeout: 8_000 },
    );
  }

  function submitQuery() {
    startTransition(async () => {
      const r = await setLocationByQuery(query);
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
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            submitQuery();
          }}
        >
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Città o quartiere"
            autoFocus
            className={`${AUTH_FIELD_CLASS} flex-1`}
          />
          <Button
            type="submit"
            variant="secondary"
            disabled={pending || query.length < 2}
          >
            Vai
          </Button>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setManual(true)}
          className="text-sm font-medium text-accent-soft"
        >
          Oppure scrivi la città
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
        Dimmi dove sei e ti mostro sale, orari e biglietti. La posizione resta nel tuo
        profilo e puoi cambiarla quando vuoi.
      </p>
      {body}
    </div>
  );
}
